require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const db = require('./database');
const gemini = require('./gemini');

const PORT = process.env.PORT || 3001;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(cors());
app.use(express.json());

// Serve static files from parent directory (frontend)
app.use(express.static(path.join(__dirname, '..')));

// Serve generated images
app.use('/images', express.static(path.join(__dirname, 'images')));

// Initialize database and Gemini
db.initDatabase();
gemini.initializeGemini();

// Track connected users
const connectedUsers = new Map(); // socketId -> { userId, color }

// Generation cooldown (30 seconds)
let lastGenerationTime = 0;
const GENERATION_COOLDOWN = 0;
let isGenerating = false;

// --- API Routes ---

app.get('/api/state', (req, res) => {
  res.json({
    nextPosition: db.getNextPosition(),
    currentImage: db.getCurrentImage(),
    wordCount: db.getWordCount(),
    onlineUsers: connectedUsers.size
  });
});

app.get('/api/words', (req, res) => {
  const words = db.getAllWords();
  res.json(words);
});

app.get('/api/history', (req, res) => {
  res.json(db.getImageHistory());
});

app.post('/api/generate', async (req, res) => {
  if (isGenerating) {
    return res.status(429).json({ error: 'Generation already in progress' });
  }

  const now = Date.now();
  const cooldownRemaining = GENERATION_COOLDOWN - (now - lastGenerationTime);
  if (cooldownRemaining > 0) {
    return res.status(429).json({
      error: 'Cooldown active',
      cooldownRemaining: Math.ceil(cooldownRemaining / 1000)
    });
  }

  const wordCount = db.getWordCount();
  if (wordCount === 0) {
    return res.status(400).json({ error: 'No words to generate from' });
  }

  // Start generation
  isGenerating = true;
  lastGenerationTime = now;

  // Respond immediately
  res.json({ status: 'started' });

  // Broadcast generation started
  io.emit('generation-started', { wordCount });

  try {
    const promptText = db.getPromptText(3000);
    const currentImage = db.getCurrentImage();

    // Track in history
    const historyEntry = db.addImageHistory(null, promptText.substring(0, 500), wordCount, 'generating');

    let imagePath;
    if (currentImage) {
      imagePath = await gemini.evolveImage(currentImage, promptText);
    } else {
      imagePath = await gemini.generateFromText(promptText);
    }

    // Update state
    db.setCurrentImage(imagePath);
    db.updateImageHistory(historyEntry.lastInsertRowid, imagePath, 'complete');

    // Broadcast to all clients
    io.emit('generation-complete', {
      imagePath,
      wordCount
    });

    console.log('Generation complete:', imagePath);
  } catch (error) {
    console.error('Generation failed:', error.message);

    io.emit('generation-failed', {
      error: error.message
    });
  } finally {
    isGenerating = false;
  }
});

// --- Socket.IO ---

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial state
  const words = db.getAllWords();
  const wordsWithGrid = words.map(w => ({
    ...w,
    row: Math.floor(w.position / 100),
    col: w.position % 100
  }));

  socket.emit('initial-state', {
    words: wordsWithGrid,
    nextPosition: db.getNextPosition(),
    currentImage: db.getCurrentImage(),
    wordCount: db.getWordCount(),
    onlineUsers: connectedUsers.size + 1
  });

  // Register user
  socket.on('register', (data) => {
    const user = db.getOrCreateUser(data.userId);
    connectedUsers.set(socket.id, { userId: data.userId, color: user.color });

    // Broadcast updated user count
    io.emit('users-update', { count: connectedUsers.size });

    // Send user their color
    socket.emit('user-registered', { color: user.color });
  });

  // Submit a single word
  socket.on('submit-word', (data) => {
    try {
      const result = db.claimNextPosition(data.userId, data.word, data.groupId);

      // Broadcast to ALL clients (including sender for server-confirmed position)
      io.emit('word-placed', result);
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Submit multiple words (paste)
  socket.on('submit-words', (data) => {
    try {
      const results = db.claimMultiplePositions(data.userId, data.words, data.groupId);

      // Broadcast each word placement
      results.forEach(result => {
        io.emit('word-placed', result);
      });
    } catch (error) {
      socket.emit('error', { message: error.message });
    }
  });

  // Request generation via socket
  socket.on('request-generate', async () => {
    if (isGenerating) {
      socket.emit('generation-failed', { error: 'Generation already in progress' });
      return;
    }

    const now = Date.now();
    const cooldownRemaining = GENERATION_COOLDOWN - (now - lastGenerationTime);
    if (cooldownRemaining > 0) {
      socket.emit('generation-failed', {
        error: `Please wait ${Math.ceil(cooldownRemaining / 1000)}s before generating again`
      });
      return;
    }

    const wordCount = db.getWordCount();
    if (wordCount === 0) {
      socket.emit('generation-failed', { error: 'No words to generate from' });
      return;
    }

    isGenerating = true;
    lastGenerationTime = now;

    io.emit('generation-started', { wordCount });

    try {
      const promptText = db.getPromptText(3000);
      const currentImage = db.getCurrentImage();

      const historyEntry = db.addImageHistory(null, promptText.substring(0, 500), wordCount, 'generating');

      let imagePath;
      if (currentImage) {
        imagePath = await gemini.evolveImage(currentImage, promptText);
      } else {
        imagePath = await gemini.generateFromText(promptText);
      }

      db.setCurrentImage(imagePath);
      db.updateImageHistory(historyEntry.lastInsertRowid, imagePath, 'complete');

      io.emit('generation-complete', { imagePath, wordCount });
      console.log('Generation complete:', imagePath);
    } catch (error) {
      console.error('Generation failed:', error.message);
      io.emit('generation-failed', { error: error.message });
    } finally {
      isGenerating = false;
    }
  });

  // Cursor movement for presence
  socket.on('cursor-move', (data) => {
    const user = connectedUsers.get(socket.id);
    if (user) {
      socket.broadcast.emit('cursor-update', {
        id: socket.id,
        x: data.x,
        y: data.y,
        color: user.color
      });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    connectedUsers.delete(socket.id);
    io.emit('users-update', { count: connectedUsers.size });
    io.emit('cursor-leave', { id: socket.id });
  });
});

server.listen(PORT, () => {
  console.log(`Million Token Image server running on http://localhost:${PORT}`);
});
