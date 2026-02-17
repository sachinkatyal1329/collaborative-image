const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'grid.db');
let db;

function initDatabase() {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS words (
      position INTEGER PRIMARY KEY,
      word TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_color TEXT NOT NULL,
      group_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS image_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_path TEXT,
      prompt_snapshot TEXT,
      word_count INTEGER,
      status TEXT DEFAULT 'generating',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      color TEXT NOT NULL,
      words_contributed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS state (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  // Initialize state if not exists
  const initState = db.prepare('INSERT OR IGNORE INTO state (key, value) VALUES (?, ?)');
  initState.run('next_position', '0');
  initState.run('current_image', '');

  console.log('Database initialized');
  return db;
}

// Assign a color to a new user
const USER_COLORS = [
  '#6366F1', '#8B5CF6', '#64748B', '#6B7280', '#475569',
  '#7C3AED', '#4F46E5', '#6D28D9', '#334155', '#57534E',
  '#78716C', '#9333EA', '#4338CA', '#525252', '#71717A'
];

function getOrCreateUser(userId) {
  let user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) {
    const color = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
    db.prepare('INSERT INTO users (id, color) VALUES (?, ?)').run(userId, color);
    user = { id: userId, color, words_contributed: 0 };
  }
  return user;
}

function generateGroupId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
}

// Atomically claim the next position and insert a word
function claimNextPosition(userId, word, groupId) {
  const txn = db.transaction(() => {
    const row = db.prepare('SELECT value FROM state WHERE key = ?').get('next_position');
    const position = parseInt(row.value, 10);

    if (position >= 10000) {
      throw new Error('Grid is full');
    }

    const user = getOrCreateUser(userId);
    if (!groupId) groupId = generateGroupId();

    db.prepare('INSERT INTO words (position, word, user_id, user_color, group_id) VALUES (?, ?, ?, ?, ?)')
      .run(position, word, userId, user.color, groupId);

    db.prepare('UPDATE state SET value = ? WHERE key = ?')
      .run(String(position + 1), 'next_position');

    db.prepare('UPDATE users SET words_contributed = words_contributed + 1 WHERE id = ?')
      .run(userId);

    return {
      position,
      row: Math.floor(position / 100),
      col: position % 100,
      word,
      user_id: userId,
      user_color: user.color,
      group_id: groupId
    };
  });

  return txn();
}

// Batch claim positions for multiple words (paste support)
function claimMultiplePositions(userId, words, groupId) {
  const txn = db.transaction(() => {
    const row = db.prepare('SELECT value FROM state WHERE key = ?').get('next_position');
    let position = parseInt(row.value, 10);
    const user = getOrCreateUser(userId);
    if (!groupId) groupId = generateGroupId();
    const results = [];

    for (const word of words) {
      if (position >= 10000) break;

      db.prepare('INSERT INTO words (position, word, user_id, user_color, group_id) VALUES (?, ?, ?, ?, ?)')
        .run(position, word, userId, user.color, groupId);

      results.push({
        position,
        row: Math.floor(position / 100),
        col: position % 100,
        word,
        user_id: userId,
        user_color: user.color,
        group_id: groupId
      });

      position++;
    }

    db.prepare('UPDATE state SET value = ? WHERE key = ?')
      .run(String(position), 'next_position');

    db.prepare('UPDATE users SET words_contributed = words_contributed + ? WHERE id = ?')
      .run(results.length, userId);

    return results;
  });

  return txn();
}

function getNextPosition() {
  const row = db.prepare('SELECT value FROM state WHERE key = ?').get('next_position');
  return parseInt(row.value, 10);
}

function getAllWords() {
  return db.prepare('SELECT * FROM words ORDER BY position ASC').all();
}

function getWordCount() {
  const row = db.prepare('SELECT COUNT(*) as count FROM words').get();
  return row.count;
}

// Get the last N words as a prompt string
function getPromptText(maxWords = 3000) {
  const words = db.prepare('SELECT word FROM words ORDER BY position DESC LIMIT ?').all(maxWords);
  return words.reverse().map(w => w.word).join(' ');
}

// Get ALL words as a prompt string
function getFullPromptText() {
  const words = db.prepare('SELECT word FROM words ORDER BY position ASC').all();
  return words.map(w => w.word).join(' ');
}

function getCurrentImage() {
  const row = db.prepare('SELECT value FROM state WHERE key = ?').get('current_image');
  return row ? row.value : '';
}

function setCurrentImage(imagePath) {
  db.prepare('UPDATE state SET value = ? WHERE key = ?').run(imagePath, 'current_image');
}

function addImageHistory(imagePath, promptSnapshot, wordCount, status) {
  return db.prepare(
    'INSERT INTO image_history (image_path, prompt_snapshot, word_count, status) VALUES (?, ?, ?, ?)'
  ).run(imagePath, promptSnapshot, wordCount, status);
}

function updateImageHistory(id, imagePath, status) {
  db.prepare('UPDATE image_history SET image_path = ?, status = ? WHERE id = ?')
    .run(imagePath, status, id);
}

function getImageHistory() {
  return db.prepare('SELECT * FROM image_history ORDER BY created_at DESC LIMIT 20').all();
}

function getOnlineUserCount() {
  // This is tracked in-memory by the server, not in DB
  return 0;
}

module.exports = {
  initDatabase,
  getOrCreateUser,
  claimNextPosition,
  claimMultiplePositions,
  getNextPosition,
  getAllWords,
  getWordCount,
  getPromptText,
  getFullPromptText,
  getCurrentImage,
  setCurrentImage,
  addImageHistory,
  updateImageHistory,
  getImageHistory
};
