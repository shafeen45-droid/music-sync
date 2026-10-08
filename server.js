const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: Date.now(),
    service: 'BeatSync Live'
  });
});

// SPA Fallback: send index.html for any unhandled routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🎵 BeatSync Live Server is running!`);
  console.log(`📡 Local URL: http://localhost:${PORT}`);
  console.log(`✨ Open multiple tabs or share room links to test real-time lag-free sync!\n`);
});
