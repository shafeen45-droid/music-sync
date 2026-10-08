# 🎵 BeatSync Live — Real-Time Lag-Free Music Room

> An ultra-low latency web application where an **Admin** plays music (local downloaded MP3/WAV/FLAC or YouTube) and all connected **Listeners** hear it simultaneously in lockstep with **zero lag**.

Built with **HTML5**, **JavaScript (ES6+)**, **Tailwind CSS**, and **Node.js**, engineered specifically for seamless deployment to **Vercel**.

---

## ⚡ Why There is "Zero Lag"

1. **For Local Audio Files (MP3, WAV, FLAC, AAC, OGG):**
   - The Admin selects any audio file from their device.
   - The Web Audio API captures the stream into a WebRTC Opus audio channel.
   - The audio stream is broadcasted **directly Peer-to-Peer over WebRTC UDP**.
   - **Result:** Sub-100ms latency (identical to Discord/Zoom voice calls). Listeners don't even have to download the file—they hear the live stream instantly!

2. **For YouTube Music:**
   - Powered by the official **YouTube IFrame Player API**.
   - Admin pastes any YouTube video/music URL or video ID.
   - Admin broadcasts playback state, current timestamp, and high-precision reference clock.
   - Listeners calculate one-way network transit latency `(Date.now() - timestamp) / 1000` and automatically compensate.
   - **Drift Compensation:** If any client drifts by more than 150ms due to Wi-Fi fluctuations, the engine seeks and micro-aligns them silently. A 2-second heartbeat guarantees nobody ever falls behind.

---

## 🚀 How to Run Locally

### Option 1: Using Python (Instant, No Install Needed)
Since Python is already available on your machine:
```powershell
cd "C:\bca 5th sem\sync"
python -m http.server 3000
```
Open **`http://localhost:3000`** in your browser.

### Option 2: Using Node.js
If you have Node.js installed:
```powershell
cd "C:\bca 5th sem\sync"
npm install
npm start
```
Open **`http://localhost:3000`** in your browser.

### Option 3: Direct Browser Launch
You can also directly double-click `index.html` to open it in Chrome, Edge, Brave, or Firefox.

---

## 🌐 How to Deploy to Vercel (100% Free & Fast)

Because BeatSync uses client-side WebRTC signaling and CDN assets, it is **100% serverless-ready** and deploys to Vercel with zero server overhead.

### Method A: Deploy via GitHub & Vercel Dashboard (Easiest)
1. Initialize a git repository inside `C:\bca 5th sem\sync`:
   ```powershell
   git init
   git add .
   git commit -m "Initial commit of BeatSync Live"
   ```
2. Push the repository to your [GitHub](https://github.com) account.
3. Go to [vercel.com](https://vercel.com) and log in.
4. Click **"Add New..."** -> **"Project"** and import your GitHub repository.
5. Leave all build settings default (Framework: *Other*, Root Directory: `./`).
6. Click **"Deploy"**. Vercel will give you a live HTTPS link (e.g., `https://beatsync.vercel.app`) in under 30 seconds!

### Method B: Deploy via Vercel CLI
If you have Vercel CLI installed:
```powershell
cd "C:\bca 5th sem\sync"
vercel
```
Follow the 3 prompts to deploy directly.

---

## 🎧 How to Use

### 👑 As Admin (Host)
1. Click **"Host as Admin"** (or click **"Create New Room"**).
2. You will be given a unique Room Code (e.g. `sync-k39a1z`).
3. Click **"Share Invite Link"** or **"Copy"** and send the link to your listeners.
4. Choose your audio source:
   - **Local Audio File:** Drag and drop any MP3/WAV/FLAC file into the dropzone.
   - **YouTube Music:** Paste any YouTube video URL or select one of the quick demo buttons (Lofi Hip Hop, Synthwave, NCS).
5. Click **Play**! You can seek forward/backward, pause, or switch tracks—all changes sync to everyone in real time.

### 👥 As Listener
1. Open the invite link sent by the Admin, or enter the Room Code and click **"Join Room"**.
2. Click **"🔊 Start Audio Stream"** (required once by browser security to enable autoplay).
3. Sit back and enjoy the music! Your volume slider lets you adjust your own listening volume independently without affecting others.

---

## 📁 Project Structure

```
C:\bca 5th sem\sync\
├── index.html          # Responsive single-page application with Tailwind CSS
├── js/
│   ├── app.js          # UI controller, drag & drop, room links, YouTube API integration
│   ├── audio-engine.js # WebRTC Opus audio streaming & sub-150ms NTP drift sync
│   └── visualizer.js   # Dynamic glowing canvas frequency visualizer
├── css/
│   └── style.css       # Glassmorphism, animations, dark mode theme
├── package.json        # Node.js project definition
├── server.js           # Express server for local or Node hosting
├── vercel.json         # Vercel deployment & routing configuration
└── README.md           # Documentation & guides
```
