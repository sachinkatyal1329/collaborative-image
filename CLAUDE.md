# Million Token Image - Project Guidelines

## Project Overview

A collaborative 100x100 word grid where users type words that collectively form an AI image prompt. The image is displayed on top and the word grid is on the bottom. All users see real-time updates via WebSockets.

## Tech Stack

- **Frontend**: Vanilla JavaScript, Canvas API, Socket.IO client
- **Backend**: Node.js, Express, Socket.IO
- **Database**: SQLite (better-sqlite3)
- **AI**: Google Gemini (gemini-2.5-flash-image)

## Key Files

- `index.html` - Split layout: image on top, word grid on bottom
- `style.css` - Flexbox split panel + glassmorphism styling
- `grid-canvas.js` - WordGrid class: 100x100 canvas with pan/zoom, text rendering
- `app.js` - App controller: typing, sockets, image display
- `server/server.js` - Express server with Socket.IO (port 3001)
- `server/database.js` - SQLite database operations
- `server/gemini.js` - Google Gemini image generation/editing
- `server/grid.db` - SQLite database (persisted state)
- `server/.env` - Environment variables (API keys)

## Development Workflow

1. Start server: `cd server && npm start`
2. Access frontend at `http://localhost:3001`
3. Test with multiple browser windows for real-time sync

## Environment Setup

- Gemini API key: Set in `server/.env` as `GEMINI_API_KEY`
- Server port: Default 3001
