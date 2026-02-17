// Million Token Image - App Controller
(function () {
    const SERVER_URL = window.location.origin;

    // User identity
    const userId = localStorage.getItem('mti-user-id') || crypto.randomUUID();
    localStorage.setItem('mti-user-id', userId);
    let userColor = '#60A5FA';

    function newGroupId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    }

    // State
    let currentWord = '';
    let cursorPosition = 0;
    let currentGroupId = newGroupId(); // all words until next Generate share this
    let isGenerating = false;
    let hasNewWords = false;
    let socket = null;
    let grid = null;

    // Initialize
    function init() {
        grid = new WordGrid('grid-canvas');
        setupSocket();
        setupKeyboard();
        setupGenerateButton();
        setupFindCursor();
    }

    // --- Socket.IO ---
    function setupSocket() {
        socket = io(SERVER_URL);

        socket.on('connect', () => {
            console.log('Connected to server');
            socket.emit('register', { userId });
        });

        socket.on('user-registered', (data) => {
            userColor = data.color;
        });

        socket.on('initial-state', (data) => {
            // Load all words
            data.words.forEach(w => {
                grid.setWord(w.position, {
                    word: w.word,
                    user_id: w.user_id,
                    user_color: w.user_color,
                    group_id: w.group_id
                });
            });

            cursorPosition = data.nextPosition;
            grid.setCursorPosition(cursorPosition);
            grid.centerOnPosition(cursorPosition);
            grid.render();

            // Update UI
            updateWordCount(data.wordCount);
            updateOnlineUsers(data.onlineUsers);
            updateCursorDisplay();

            // Load current image
            if (data.currentImage) {
                showImage(data.currentImage);
            }

            // Hide generate button until new words are added
            updateGenerateButton();
        });

        socket.on('word-placed', (data) => {
            grid.setWord(data.position, {
                word: data.word,
                user_id: data.user_id,
                user_color: data.user_color,
                group_id: data.group_id
            });

            // Advance cursor if this word was at or past our position
            if (data.position >= cursorPosition) {
                cursorPosition = data.position + 1;
                grid.setCursorPosition(cursorPosition);
            }

            grid.render();
            updateWordCount();
            updateCursorDisplay();
            hasNewWords = true;
            updateGenerateButton();
        });

        socket.on('users-update', (data) => {
            updateOnlineUsers(data.count);
        });

        socket.on('generation-started', (data) => {
            isGenerating = true;
            hasNewWords = false;
            setGenerationStatus('Generating image...');
            setGenerateButtonLoading(true);
            updateGenerateButton();
        });

        socket.on('generation-complete', (data) => {
            isGenerating = false;
            showImage(data.imagePath);
            setGenerationStatus('');
            setGenerateButtonLoading(false);
            showToast('Image generated!', 'success');
            updateGenerateButton();

            // New group for words typed after this generation
            currentGroupId = newGroupId();
        });

        socket.on('generation-failed', (data) => {
            isGenerating = false;
            setGenerationStatus('');
            setGenerateButtonLoading(false);
            showToast(data.error || 'Generation failed', 'error');
            updateGenerateButton();
        });

        socket.on('cursor-update', (data) => {
            grid.setRemoteCursor(data.id, data.position || 0, data.color);
            grid.render();
        });

        socket.on('cursor-leave', (data) => {
            grid.removeRemoteCursor(data.id);
            grid.render();
        });

        socket.on('error', (data) => {
            showToast(data.message, 'error');
        });

        socket.on('disconnect', () => {
            console.log('Disconnected');
            grid.remoteCursors.clear();
        });
    }

    // --- Keyboard Input ---
    function setupKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Don't capture if focus is on an input element
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (e.key === 'Backspace') {
                e.preventDefault();
                if (currentWord.length > 0) {
                    currentWord = currentWord.slice(0, -1);
                    updateCurrentWordDisplay();
                }
            } else if (isGenerating) {
                return;
            } else if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                submitCurrentWord();
            } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                currentWord += e.key;
                updateCurrentWordDisplay();
            }
        });

        // Paste support
        document.addEventListener('paste', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            e.preventDefault();
            if (isGenerating) return;

            const text = e.clipboardData.getData('text').trim();
            if (!text) return;

            const words = text.split(/\s+/).filter(w => w.length > 0);
            if (words.length === 0) return;

            if (words.length === 1) {
                // Single word - add to current buffer
                currentWord += words[0];
                updateCurrentWordDisplay();
            } else {
                // Multiple words - submit current word first, then batch submit
                if (currentWord.trim()) {
                    words.unshift(currentWord.trim());
                    currentWord = '';
                }
                socket.emit('submit-words', { userId, words, groupId: currentGroupId });
                currentWord = '';
                updateCurrentWordDisplay();
                showToast(`Pasted ${words.length} words`, 'info');
            }
        });
    }

    function submitCurrentWord() {
        const word = currentWord.trim();
        if (!word || isGenerating) return;

        socket.emit('submit-word', { userId, word, groupId: currentGroupId });

        // Optimistic update
        grid.setWord(cursorPosition, {
            word: word,
            user_id: userId,
            user_color: userColor,
            group_id: currentGroupId
        });
        cursorPosition++;
        grid.setCursorPosition(cursorPosition);
        grid.ensureCursorVisible();
        grid.render();

        currentWord = '';
        hasNewWords = true;
        updateCurrentWordDisplay();
        updateCursorDisplay();
        updateGenerateButton();
    }

    function updateCurrentWordDisplay() {
        grid.setCurrentWord(currentWord);
        grid.render();
    }

    // --- Generate Button ---
    function setupGenerateButton() {
        const btn = document.getElementById('generate-btn');
        btn.addEventListener('click', () => {
            if (isGenerating) return;
            // Auto-submit any in-progress word before generating
            if (currentWord.trim()) {
                submitCurrentWord();
            }
            socket.emit('request-generate');
        });
    }

    function updateGenerateButton() {
        const btn = document.getElementById('generate-btn');
        const show = hasNewWords && !isGenerating;
        btn.style.display = show ? 'flex' : 'none';
    }

    // --- Find Cursor ---
    function setupFindCursor() {
        document.getElementById('find-cursor-btn').addEventListener('click', jumpToCursor);
    }

    function jumpToCursor() {
        grid.animateTo(cursorPosition, 1, 400);
    }

    function setGenerateButtonLoading(loading) {
        const text = document.getElementById('generate-btn-text');
        const spinner = document.getElementById('generate-spinner');

        if (loading) {
            text.textContent = 'Generating...';
            spinner.style.display = 'block';
        } else {
            text.textContent = 'Generate Image';
            spinner.style.display = 'none';
        }
    }

    function setGenerationStatus(msg) {
        document.getElementById('generation-status').textContent = msg;
    }

    // --- Image Display ---
    function showImage(imagePath) {
        const img = document.getElementById('generated-image');
        const placeholder = document.getElementById('image-placeholder');

        img.src = imagePath;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    }

    // --- UI Updates ---
    function updateWordCount(count) {
        if (count === undefined) {
            count = grid.words.size;
        }
        document.getElementById('word-count').textContent = count.toLocaleString();
        updateProgressBar(count);
    }

    function updateProgressBar(count) {
        const total = 10000;
        const pct = Math.min(100, (count / total) * 100);
        document.getElementById('progress-fill').style.width = pct + '%';
        document.getElementById('progress-label').textContent =
            `${count.toLocaleString()} / 10,000 words`;
    }

    function updateOnlineUsers(count) {
        document.getElementById('online-users').textContent = count;
    }

    function updateCursorDisplay() {
        // cursor position is now shown on the grid canvas info panel
    }

    // --- Toast ---
    function showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease-out';
            setTimeout(() => {
                if (toast.parentNode) container.removeChild(toast);
            }, 300);
        }, 4000);
    }

    // Start the app
    document.addEventListener('DOMContentLoaded', init);
})();
