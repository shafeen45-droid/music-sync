// Real-Time Audio & YouTube Synchronization Engine
// Uses WebRTC Opus Audio Stream (Local Files) + Sub-150ms NTP Drift Compensated Sync (YouTube & Local)

class SyncAudioEngine {
  constructor(options = {}) {
    this.role = 'listener'; // 'admin' or 'listener'
    this.mode = 'local';    // 'local' or 'youtube'
    this.peer = null;
    this.myPeerId = null;
    this.roomCode = null;
    this.connections = new Map(); // For admin: map of peerId -> DataConnection
    this.calls = new Map();       // For admin: map of peerId -> MediaConnection
    this.adminConn = null;        // For listener: DataConnection to admin
    this.activeAudioStream = null;

    // Audio Elements & Web Audio
    this.audioCtx = null;
    this.sourceNode = null;
    this.streamDestination = null;
    this.analyser = null;
    this.localAudio = new Audio();
    this.remoteAudio = new Audio();
    this.remoteAudio.autoplay = true;

    // YouTube Player State
    this.ytPlayer = null;
    this.ytReady = false;
    this.currentYtId = null;
    this.isSyncing = false; // Prevents recursive event loops

    // Track metadata
    this.currentTrack = {
      title: 'No audio loaded',
      artist: 'Select local audio or YouTube link',
      duration: 0,
      currentTime: 0,
      isPlaying: false
    };

    // Callbacks for UI updates
    this.onStateChange = options.onStateChange || (() => {});
    this.onPeerCountChange = options.onPeerCountChange || (() => {});
    this.onStatusMessage = options.onStatusMessage || (() => {});
    this.onLatencyUpdate = options.onLatencyUpdate || (() => {});

    // Heartbeat timer for admin
    this.heartbeatInterval = null;

    this.initAudioContext();
    this.setupLocalAudioEvents();
  }

  initAudioContext() {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !this.audioCtx) {
      this.audioCtx = new AudioContextClass();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
    }
  }

  ensureAudioContextRunning() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  // -------------------------------------------------------------
  // WebRTC & PeerJS Networking
  // -------------------------------------------------------------

  initAdmin(customRoomCode = null) {
    this.role = 'admin';
    const code = customRoomCode || 'sync-' + Math.random().toString(36).substring(2, 8);
    this.roomCode = code.toLowerCase().trim();

    this.onStatusMessage(`Initializing Admin Room [${this.roomCode}]...`, 'info');

    // Initialize PeerJS with public cloud signaling (zero server setup required, Vercel-ready)
    this.peer = new Peer(this.roomCode, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      this.onStatusMessage(`Room created! Share code: ${id}`, 'success');
      this.startHeartbeat();
      this.onStateChange(this.getSnapshot());
    });

    this.peer.on('connection', (conn) => {
      this.handleNewListenerData(conn);
    });

    this.peer.on('error', (err) => {
      console.error('Peer error:', err);
      if (err.type === 'unavailable-id') {
        this.onStatusMessage(`Room code "${this.roomCode}" is currently active. Generating alternative code...`, 'warning');
        this.initAdmin('sync-' + Math.random().toString(36).substring(2, 8));
      } else {
        this.onStatusMessage(`Connection error: ${err.message}`, 'error');
      }
    });
  }

  initListener(roomCode) {
    this.role = 'listener';
    this.roomCode = roomCode.toLowerCase().trim();

    this.onStatusMessage(`Connecting to Room [${this.roomCode}]...`, 'info');

    // Create random peer for listener
    this.peer = new Peer(null, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]
      }
    });

    this.peer.on('open', (id) => {
      this.myPeerId = id;
      this.connectToAdmin();
    });

    // Handle incoming audio stream from admin
    this.peer.on('call', (call) => {
      call.answer(); // Answer without sending any local audio
      call.on('stream', (remoteStream) => {
        this.activeAudioStream = remoteStream;
        this.remoteAudio.srcObject = remoteStream;
        this.remoteAudio.play().catch(e => {
          console.warn('Autoplay prevented - user interaction needed:', e);
          this.onStatusMessage('Click "Tap to Unmute" to start audio playback', 'warning');
        });

        // Connect remote stream to visualizer if AudioContext active
        if (this.audioCtx) {
          try {
            const streamSource = this.audioCtx.createMediaStreamSource(remoteStream);
            streamSource.connect(this.analyser);
          } catch (e) {
            console.log('Stream audio node routing note:', e);
          }
        }
      });
    });

    this.peer.on('error', (err) => {
      console.error('Listener peer error:', err);
      this.onStatusMessage(`Error: ${err.type || err.message}`, 'error');
    });
  }

  connectToAdmin() {
    if (!this.peer || !this.roomCode) return;

    const conn = this.peer.connect(this.roomCode, { reliable: true });
    this.adminConn = conn;

    conn.on('open', () => {
      this.onStatusMessage(`Connected to Admin Room [${this.roomCode}]!`, 'success');
      // Send handshake ping
      conn.send({ type: 'ping', sendTime: Date.now() });
    });

    conn.on('data', (data) => {
      this.handleAdminMessage(data);
    });

    conn.on('close', () => {
      this.onStatusMessage('Disconnected from Admin. Host may have closed the room.', 'error');
      this.onPeerCountChange(0);
    });
  }

  handleNewListenerData(conn) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
      this.onPeerCountChange(this.connections.size);

      // Immediately send current room state to new listener
      conn.send({
        type: 'state_sync',
        mode: this.mode,
        track: this.currentTrack,
        timestamp: Date.now()
      });

      // If we are playing local audio and have an active stream, call the new listener with WebRTC audio!
      if (this.mode === 'local' && this.activeAudioStream) {
        const call = this.peer.call(conn.peer, this.activeAudioStream);
        this.calls.set(conn.peer, call);
      }
    });

    conn.on('data', (data) => {
      if (data.type === 'ping') {
        // Return pong for latency calculation
        conn.send({ type: 'pong', sendTime: data.sendTime, serverTime: Date.now() });
      }
    });

    conn.on('close', () => {
      this.connections.delete(conn.peer);
      if (this.calls.has(conn.peer)) {
        this.calls.get(conn.peer).close();
        this.calls.delete(conn.peer);
      }
      this.onPeerCountChange(this.connections.size);
    });
  }

  broadcast(message) {
    if (this.role !== 'admin') return;
    for (const [, conn] of this.connections) {
      if (conn.open) {
        conn.send(message);
      }
    }
  }

  startHeartbeat() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      if (this.role !== 'admin') return;

      let currentTime = 0;
      let isPlaying = false;
      let duration = 0;

      if (this.mode === 'local') {
        currentTime = this.localAudio.currentTime;
        isPlaying = !this.localAudio.paused;
        duration = this.localAudio.duration || 0;
      } else if (this.mode === 'youtube' && this.ytPlayer && this.ytReady && typeof this.ytPlayer.getCurrentTime === 'function') {
        currentTime = this.ytPlayer.getCurrentTime();
        isPlaying = this.ytPlayer.getPlayerState() === 1; // 1 = playing
        duration = this.ytPlayer.getDuration() || 0;
      }

      this.currentTrack.currentTime = currentTime;
      this.currentTrack.isPlaying = isPlaying;
      this.currentTrack.duration = duration;

      this.broadcast({
        type: 'heartbeat',
        mode: this.mode,
        time: currentTime,
        isPlaying: isPlaying,
        duration: duration,
        timestamp: Date.now()
      });

      this.onStateChange(this.getSnapshot());
    }, 2000);
  }

  // -------------------------------------------------------------
  // Listener Message Handling & Drift Sync
  // -------------------------------------------------------------

  handleAdminMessage(data) {
    if (data.type === 'pong') {
      const now = Date.now();
      const rtt = now - data.sendTime;
      const latency = Math.round(rtt / 2);
      this.onLatencyUpdate(latency);
      return;
    }

    if (data.type === 'mode_switch') {
      this.setMode(data.mode);
      return;
    }

    if (data.type === 'state_sync') {
      this.setMode(data.mode);
      this.currentTrack = { ...this.currentTrack, ...data.track };
      if (data.mode === 'youtube' && data.track.ytId) {
        this.loadYouTubeVideo(data.track.ytId, false);
      }
      this.onStateChange(this.getSnapshot());
      return;
    }

    if (data.type === 'yt_load') {
      this.setMode('youtube');
      this.currentTrack.title = data.title || 'YouTube Video';
      this.currentTrack.artist = 'YouTube Stream';
      this.currentTrack.ytId = data.videoId;
      this.loadYouTubeVideo(data.videoId, false);
      this.onStateChange(this.getSnapshot());
      return;
    }

    if (data.type === 'yt_control' || data.type === 'heartbeat') {
      if (data.mode) this.setMode(data.mode);

      // Latency compensation
      const transitDelay = (Date.now() - data.timestamp) / 1000;
      const targetTime = data.time + (data.isPlaying ? transitDelay : 0);

      this.currentTrack.currentTime = targetTime;
      this.currentTrack.isPlaying = data.isPlaying;
      this.currentTrack.duration = data.duration || this.currentTrack.duration;

      if (this.mode === 'youtube' && this.ytPlayer && this.ytReady && typeof this.ytPlayer.getCurrentTime === 'function') {
        this.syncYouTubePlayback(targetTime, data.isPlaying);
      } else if (this.mode === 'local') {
        // In local mode, audio is delivered over WebRTC live stream!
        // We update progress bar & UI state
      }

      this.onStateChange(this.getSnapshot());
    }

    if (data.type === 'track_info') {
      this.currentTrack.title = data.title;
      this.currentTrack.artist = data.artist || 'Local Audio';
      this.currentTrack.duration = data.duration;
      this.onStateChange(this.getSnapshot());
    }
  }

  syncYouTubePlayback(targetTime, shouldPlay) {
    if (!this.ytPlayer || !this.ytReady) return;
    this.isSyncing = true;

    try {
      const currentTime = this.ytPlayer.getCurrentTime();
      const drift = Math.abs(currentTime - targetTime);

      // If drift is > 150ms, seek immediately to resynchronize
      if (drift > 0.15) {
        this.ytPlayer.seekTo(targetTime, true);
      }

      const currentState = this.ytPlayer.getPlayerState();
      if (shouldPlay && currentState !== 1 && currentState !== 3) { // 1 = playing, 3 = buffering
        this.ytPlayer.playVideo();
      } else if (!shouldPlay && currentState === 1) {
        this.ytPlayer.pauseVideo();
      }
    } catch (e) {
      console.error('Error syncing YouTube:', e);
    } finally {
      setTimeout(() => {
        this.isSyncing = false;
      }, 300);
    }
  }

  // -------------------------------------------------------------
  // Local Audio File Engine (Admin side)
  // -------------------------------------------------------------

  setupLocalAudioEvents() {
    this.localAudio.addEventListener('timeupdate', () => {
      if (this.role === 'admin' && this.mode === 'local') {
        this.currentTrack.currentTime = this.localAudio.currentTime;
        this.currentTrack.duration = this.localAudio.duration || 0;
        this.onStateChange(this.getSnapshot());
      }
    });

    this.localAudio.addEventListener('ended', () => {
      if (this.role === 'admin') {
        this.currentTrack.isPlaying = false;
        this.broadcast({
          type: 'yt_control',
          mode: 'local',
          time: this.localAudio.duration,
          isPlaying: false,
          timestamp: Date.now()
        });
        this.onStateChange(this.getSnapshot());
      }
    });
  }

  loadLocalFile(file) {
    if (this.role !== 'admin') return;
    this.ensureAudioContextRunning();
    this.setMode('local');

    const fileUrl = URL.createObjectURL(file);
    this.localAudio.src = fileUrl;
    this.localAudio.load();

    const title = file.name.replace(/\.[^/.]+$/, "");
    this.currentTrack.title = title;
    this.currentTrack.artist = 'Local File (' + (file.size / (1024 * 1024)).toFixed(1) + ' MB)';
    this.currentTrack.currentTime = 0;

    // Connect Web Audio graph once
    if (!this.sourceNode) {
      this.sourceNode = this.audioCtx.createMediaElementSource(this.localAudio);
      this.streamDestination = this.audioCtx.createMediaStreamDestination();

      // Connect to local speakers + visualizer analyser
      this.sourceNode.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);

      // Connect to WebRTC stream destination for broadcasting
      this.sourceNode.connect(this.streamDestination);
    }

    this.activeAudioStream = this.streamDestination.stream;

    // Call all connected listeners with the new audio stream
    for (const [peerId] of this.connections) {
      if (this.calls.has(peerId)) {
        this.calls.get(peerId).close();
      }
      const call = this.peer.call(peerId, this.activeAudioStream);
      this.calls.set(peerId, call);
    }

    this.broadcast({
      type: 'track_info',
      title: this.currentTrack.title,
      artist: this.currentTrack.artist,
      duration: 0
    });

    this.localAudio.onloadedmetadata = () => {
      this.currentTrack.duration = this.localAudio.duration;
      this.broadcast({
        type: 'track_info',
        title: this.currentTrack.title,
        artist: this.currentTrack.artist,
        duration: this.localAudio.duration
      });
      this.onStateChange(this.getSnapshot());
    };

    this.onStateChange(this.getSnapshot());
  }

  // -------------------------------------------------------------
  // YouTube API Integration
  // -------------------------------------------------------------

  setYouTubePlayer(playerInstance) {
    this.ytPlayer = playerInstance;
    this.ytReady = true;
  }

  loadYouTubeVideo(videoId, broadcast = true) {
    this.currentYtId = videoId;
    this.setMode('youtube');

    if (this.ytPlayer && this.ytReady && typeof this.ytPlayer.loadVideoById === 'function') {
      this.ytPlayer.loadVideoById(videoId);
      this.ytPlayer.pauseVideo();
    }

    if (this.role === 'admin' && broadcast) {
      this.currentTrack.title = 'YouTube Video (' + videoId + ')';
      this.currentTrack.artist = 'YouTube Stream';
      this.currentTrack.ytId = videoId;

      this.broadcast({
        type: 'yt_load',
        videoId: videoId,
        title: this.currentTrack.title
      });

      this.onStateChange(this.getSnapshot());
    }
  }

  extractYouTubeId(urlOrId) {
    if (!urlOrId) return null;
    const trimmed = urlOrId.trim();
    if (trimmed.length === 11 && !trimmed.includes('/') && !trimmed.includes('?')) {
      return trimmed;
    }
    const match = trimmed.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/);
    return match ? match[1] : null;
  }

  // -------------------------------------------------------------
  // Unified Play / Pause / Seek Controls
  // -------------------------------------------------------------

  play() {
    this.ensureAudioContextRunning();
    if (this.role !== 'admin') return;

    if (this.mode === 'local') {
      this.localAudio.play().then(() => {
        this.currentTrack.isPlaying = true;
        this.broadcast({
          type: 'yt_control',
          mode: 'local',
          time: this.localAudio.currentTime,
          isPlaying: true,
          duration: this.localAudio.duration,
          timestamp: Date.now()
        });
        this.onStateChange(this.getSnapshot());
      }).catch(e => console.error('Play error:', e));
    } else if (this.mode === 'youtube' && this.ytPlayer && this.ytReady) {
      this.ytPlayer.playVideo();
      this.currentTrack.isPlaying = true;
      this.broadcast({
        type: 'yt_control',
        mode: 'youtube',
        time: this.ytPlayer.getCurrentTime() || 0,
        isPlaying: true,
        duration: this.ytPlayer.getDuration() || 0,
        timestamp: Date.now()
      });
      this.onStateChange(this.getSnapshot());
    }
  }

  pause() {
    if (this.role !== 'admin') return;

    if (this.mode === 'local') {
      this.localAudio.pause();
      this.currentTrack.isPlaying = false;
      this.broadcast({
        type: 'yt_control',
        mode: 'local',
        time: this.localAudio.currentTime,
        isPlaying: false,
        duration: this.localAudio.duration,
        timestamp: Date.now()
      });
      this.onStateChange(this.getSnapshot());
    } else if (this.mode === 'youtube' && this.ytPlayer && this.ytReady) {
      this.ytPlayer.pauseVideo();
      this.currentTrack.isPlaying = false;
      this.broadcast({
        type: 'yt_control',
        mode: 'youtube',
        time: this.ytPlayer.getCurrentTime() || 0,
        isPlaying: false,
        duration: this.ytPlayer.getDuration() || 0,
        timestamp: Date.now()
      });
      this.onStateChange(this.getSnapshot());
    }
  }

  seek(seconds) {
    if (this.role !== 'admin') return;

    if (this.mode === 'local') {
      this.localAudio.currentTime = seconds;
      this.currentTrack.currentTime = seconds;
      this.broadcast({
        type: 'yt_control',
        mode: 'local',
        time: seconds,
        isPlaying: !this.localAudio.paused,
        duration: this.localAudio.duration,
        timestamp: Date.now()
      });
      this.onStateChange(this.getSnapshot());
    } else if (this.mode === 'youtube' && this.ytPlayer && this.ytReady) {
      this.ytPlayer.seekTo(seconds, true);
      this.currentTrack.currentTime = seconds;
      this.broadcast({
        type: 'yt_control',
        mode: 'youtube',
        time: seconds,
        isPlaying: this.ytPlayer.getPlayerState() === 1,
        duration: this.ytPlayer.getDuration() || 0,
        timestamp: Date.now()
      });
      this.onStateChange(this.getSnapshot());
    }
  }

  setVolume(fraction) {
    const val = Math.max(0, Math.min(1, fraction));
    this.localAudio.volume = val;
    this.remoteAudio.volume = val;
    if (this.ytPlayer && this.ytReady && typeof this.ytPlayer.setVolume === 'function') {
      this.ytPlayer.setVolume(val * 100);
    }
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;

    if (this.role === 'admin') {
      // Pause other source when switching
      if (mode === 'local' && this.ytPlayer && this.ytReady) {
        this.ytPlayer.pauseVideo();
      } else if (mode === 'youtube') {
        this.localAudio.pause();
      }

      this.broadcast({
        type: 'mode_switch',
        mode: mode
      });
    }

    this.onStateChange(this.getSnapshot());
  }

  getSnapshot() {
    return {
      role: this.role,
      mode: this.mode,
      roomCode: this.roomCode,
      peerId: this.myPeerId,
      track: { ...this.currentTrack },
      peerCount: this.role === 'admin' ? this.connections.size : 1
    };
  }
}

window.SyncAudioEngine = SyncAudioEngine;
