# Million Token Image

A collaborative 100x100 word grid where users type words that collectively form an AI image prompt. The generated image is displayed above the grid, and all users see real-time updates via WebSockets.

## Tech Stack

- **Frontend**: Vanilla JavaScript, Canvas API, Socket.IO client
- **Backend**: Node.js, Express, Socket.IO
- **Database**: SQLite (better-sqlite3)
- **AI**: Google Gemini (gemini-2.5-flash-image)

## Getting Started

### Prerequisites

- Node.js
- A [Google Gemini API key](https://ai.google.dev/)

### Setup

1. Install dependencies:

   ```bash
   cd server
   npm install
   ```

2. Create a `server/.env` file with your API key:

   ```
   GEMINI_API_KEY=your_key_here
   ```

3. Start the server:

   ```bash
   cd server
   npm start
   ```

4. Open `http://localhost:3001` in your browser.

## How It Works

1. Click any cell in the 100x100 grid to select it.
2. Type a word — it gets saved and broadcast to all connected users in real time.
3. The collected words form a prompt that is sent to Google Gemini to generate an image.
4. The generated image is displayed in the top panel for everyone to see.

## Project Structure

```
index.html          Frontend layout (image panel + word grid)
style.css           Styling (split panel, glassmorphism)
grid-canvas.js      WordGrid class: 100x100 canvas with pan/zoom
app.js              App controller: typing, sockets, image display
server/
  server.js         Express + Socket.IO server (port 3001)
  database.js       SQLite database operations
  gemini.js         Google Gemini image generation
  .env              Environment variables (not committed)
```

## Development

Use `npm run dev` in the `server/` directory to start with nodemon for auto-reload.

Test real-time sync by opening multiple browser windows to `http://localhost:3001`.
