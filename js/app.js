// Main Application Controller
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Lucide icons
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Initialize Visualizer
  const visualizer = new Visualizer('visualizer-canvas');

  // Initialize Audio Sync Engine
  const engine = new SyncAudioEngine({
    onStateChange: handleStateChange,
    onPeerCountChange: handlePeerCountChange,
    onStatusMessage: showToast,
    onLatencyUpdate: handleLatencyUpdate
  });

  // UI Element References
  const viewSetup = document.getElementById('view-setup');
  const viewPlayer = document.getElementById('view-player');
  const headerStatusBar = document.getElementById('header-status-bar');
  const headerRoomCode = document.getElementById('header-room-code');
  const roleBadge = document.getElementById('role-badge');
  const peerCountEl = document.getElementById('peer-count');
  const latencyText = document.getElementById('latency-text');

  // Role setup buttons
  const btnCreateAdmin = document.getElementById('btn-create-admin');
  const btnJoinRoom = document.getElementById('btn-join-room');
  const inputJoinCode = document.getElementById('input-join-code');

  // Tabs & Panels
  const tabLocal = document.getElementById('tab-local');
  const tabYoutube = document.getElementById('tab-youtube');
  const panelLocalInput = document.getElementById('panel-local-input');
  const panelYoutubeInput = document.getElementById('panel-youtube-input');
  const adminSourceControls = document.getElementById('admin-source-controls');
  const youtubeContainer = document.getElementById('youtube-container');
  const localTrackDisplay = document.getElementById('local-track-display');

  // Media Inputs
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');
  const inputYtUrl = document.getElementById('input-yt-url');
  const btnLoadYt = document.getElementById('btn-load-yt');

  // Player UI
  const trackTitle = document.getElementById('track-title');
  const trackArtist = document.getElementById('track-artist');
  const badgeModeType = document.getElementById('badge-mode-type');
  const vinylDisc = document.getElementById('vinyl-disc');
  const timeCurrent = document.getElementById('time-current');
  const timeDuration = document.getElementById('time-duration');
  const seekSlider = document.getElementById('seek-slider');
  const btnPlayPause = document.getElementById('btn-play-pause');
  const iconPlay = document.getElementById('icon-play');
  const iconPause = document.getElementById('icon-pause');
  const btnBack10 = document.getElementById('btn-back-10');
  const btnFwd10 = document.getElementById('btn-fwd-10');
  const volumeSlider = document.getElementById('volume-slider');
  const volumeText = document.getElementById('volume-text');
  const btnMute = document.getElementById('btn-mute');
  const listenerNotice = document.getElementById('listener-notice');
  const listenerUnmutePrompt = document.getElementById('listener-unmute-prompt');
  const btnUnmuteListener = document.getElementById('btn-unmute-listener');
  const btnCopyRoom = document.getElementById('btn-copy-room');
  const btnShareLink = document.getElementById('btn-share-link');

  let isSeeking = false;
  let ytPlayerInstance = null;

  // -------------------------------------------------------------
  // YouTube IFrame API Initialization
  // -------------------------------------------------------------
  window.onYouTubeIframeAPIReady = function() {
    ytPlayerInstance = new YT.Player('yt-iframe-placeholder', {
      height: '100%',
      width: '100%',
      playerVars: {
        playsinline: 1,
        controls: 0, // Admin uses our custom unified player UI
        disablekb: 1,
        modestbranding: 1,
        rel: 0
      },
      events: {
        onReady: (event) => {
          engine.setYouTubePlayer(event.target);
        },
        onStateChange: (event) => {
          // If Admin plays/pauses inside the iframe directly
          if (engine.role === 'admin' && !engine.isSyncing) {
            if (event.data === YT.PlayerState.PLAYING) {
              engine.currentTrack.isPlaying = true;
              visualizer.start(true);
            } else if (event.data === YT.PlayerState.PAUSED) {
              engine.currentTrack.isPlaying = false;
              visualizer.stop();
            }
          }
        }
      }
    });
  };

  // Dynamically load YouTube API script
  const ytTag = document.createElement('script');
  ytTag.src = 'https://www.youtube.com/iframe_api';
  const firstScriptTag = document.getElementsByTagName('script')[0];
  firstScriptTag.parentNode.insertBefore(ytTag, firstScriptTag);

  // -------------------------------------------------------------
  // URL Param Check for 1-Click Joining
  // -------------------------------------------------------------
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    inputJoinCode.value = roomParam;
    showToast(`Found room code [${roomParam}]. Click "Join Room" to listen!`, 'info');
  }

  // -------------------------------------------------------------
  // Setup View Handlers
  // -------------------------------------------------------------
  btnCreateAdmin.addEventListener('click', () => {
    engine.initAdmin();
    switchToPlayerView('admin');
  });

  btnJoinRoom.addEventListener('click', () => {
    const code = inputJoinCode.value.trim();
    if (!code) {
      showToast('Please enter a room code first!', 'warning');
      inputJoinCode.focus();
      return;
    }
    engine.initListener(code);
    switchToPlayerView('listener');
  });

  function switchToPlayerView(role) {
    viewSetup.classList.add('hidden');
    viewPlayer.classList.remove('hidden');
    headerStatusBar.classList.remove('hidden');

    if (role === 'admin') {
      roleBadge.textContent = 'Admin / Host';
      roleBadge.className = 'px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30';
      adminSourceControls.classList.remove('hidden');
      listenerNotice.classList.add('hidden');
      document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    } else {
      roleBadge.textContent = 'Listener';
      roleBadge.className = 'px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
      adminSourceControls.classList.add('hidden');
      listenerNotice.classList.remove('hidden');
      listenerUnmutePrompt.classList.remove('hidden');
      document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));

      // Listener cannot scrub or play/pause globally
      seekSlider.disabled = true;
      btnPlayPause.disabled = true;
      btnPlayPause.classList.add('opacity-75', 'cursor-not-allowed');
    }

    if (window.lucide) window.lucide.createIcons();
  }

  // -------------------------------------------------------------
  // Tabs: Local Audio vs YouTube
  // -------------------------------------------------------------
  tabLocal.addEventListener('click', () => {
    if (engine.role !== 'admin') return;
    setModeUI('local');
    engine.setMode('local');
  });

  tabYoutube.addEventListener('click', () => {
    if (engine.role !== 'admin') return;
    setModeUI('youtube');
    engine.setMode('youtube');
  });

  function setModeUI(mode) {
    if (mode === 'local') {
      tabLocal.className = 'tab-btn px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition bg-purple-600 text-white shadow-md';
      tabYoutube.className = 'tab-btn px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition text-gray-400 hover:text-white';
      panelLocalInput.classList.remove('hidden');
      panelYoutubeInput.classList.add('hidden');
      youtubeContainer.classList.add('hidden');
      localTrackDisplay.classList.remove('hidden');
      badgeModeType.textContent = 'Local Stream';
    } else {
      tabYoutube.className = 'tab-btn px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition bg-red-600 text-white shadow-md';
      tabLocal.className = 'tab-btn px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition text-gray-400 hover:text-white';
      panelLocalInput.classList.add('hidden');
      panelYoutubeInput.classList.remove('hidden');
      youtubeContainer.classList.remove('hidden');
      badgeModeType.textContent = 'YouTube Sync';
    }
  }

  // -------------------------------------------------------------
  // Local File Dropzone & Loading
  // -------------------------------------------------------------
  dropZone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleAudioFile(file);
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-purple-400', 'bg-purple-500/20');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-purple-400', 'bg-purple-500/20');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-purple-400', 'bg-purple-500/20');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('audio/')) {
      handleAudioFile(file);
    } else {
      showToast('Please drop a valid audio file (MP3, WAV, etc.)', 'warning');
    }
  });

  function handleAudioFile(file) {
    engine.loadLocalFile(file);
    if (engine.analyser) {
      visualizer.connect(engine.analyser);
    }
    showToast(`Loaded "${file.name}"! Press Play to broadcast live.`, 'success');
  }

  // -------------------------------------------------------------
  // YouTube Loading & Demos
  // -------------------------------------------------------------
  btnLoadYt.addEventListener('click', () => {
    const url = inputYtUrl.value.trim();
    const videoId = engine.extractYouTubeId(url);
    if (videoId) {
      engine.loadYouTubeVideo(videoId);
      showToast(`Loaded YouTube video! Click Play to sync.`, 'success');
    } else {
      showToast('Invalid YouTube URL or ID!', 'warning');
    }
  });

  document.querySelectorAll('.btn-demo-yt').forEach(btn => {
    btn.addEventListener('click', () => {
      const vidId = btn.getAttribute('data-id');
      if (vidId) {
        inputYtUrl.value = 'https://youtu.be/' + vidId;
        engine.loadYouTubeVideo(vidId);
        showToast('Demo track loaded!', 'success');
      }
    });
  });

  // -------------------------------------------------------------
  // Playback Controls
  // -------------------------------------------------------------
  btnPlayPause.addEventListener('click', () => {
    if (engine.role !== 'admin') return;

    if (engine.currentTrack.isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
  });

  btnBack10.addEventListener('click', () => {
    if (engine.role !== 'admin') return;
    const target = Math.max(0, engine.currentTrack.currentTime - 10);
    engine.seek(target);
  });

  btnFwd10.addEventListener('click', () => {
    if (engine.role !== 'admin') return;
    const max = engine.currentTrack.duration || 99999;
    const target = Math.min(max, engine.currentTrack.currentTime + 10);
    engine.seek(target);
  });

  seekSlider.addEventListener('input', () => {
    if (engine.role !== 'admin') return;
    isSeeking = true;
    timeCurrent.textContent = formatTime(seekSlider.value);
  });

  seekSlider.addEventListener('change', () => {
    if (engine.role !== 'admin') return;
    isSeeking = false;
    engine.seek(parseFloat(seekSlider.value));
  });

  // Volume
  volumeSlider.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    engine.setVolume(val);
    volumeText.textContent = Math.round(val * 100) + '%';
  });

  let prevVolume = 0.9;
  btnMute.addEventListener('click', () => {
    if (volumeSlider.value > 0) {
      prevVolume = volumeSlider.value;
      volumeSlider.value = 0;
      engine.setVolume(0);
      volumeText.textContent = '0%';
    } else {
      volumeSlider.value = prevVolume;
      engine.setVolume(prevVolume);
      volumeText.textContent = Math.round(prevVolume * 100) + '%';
    }
  });

  // Listener Unmute Prompt
  btnUnmuteListener.addEventListener('click', () => {
    engine.ensureAudioContextRunning();
    if (engine.remoteAudio) {
      engine.remoteAudio.play().then(() => {
        listenerUnmutePrompt.classList.add('hidden');
        showToast('Live audio connected and unmuted!', 'success');
      }).catch(e => {
        showToast('Audio unlocked. Waiting for Admin to play music...', 'info');
        listenerUnmutePrompt.classList.add('hidden');
      });
    } else {
      listenerUnmutePrompt.classList.add('hidden');
    }
  });

  // -------------------------------------------------------------
  // Copy & Share Invite Links
  // -------------------------------------------------------------
  function copyInviteLink() {
    if (!engine.roomCode) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${engine.roomCode}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      showToast(`Copied room invite link to clipboard!`, 'success');
    }).catch(() => {
      showToast(`Room code: ${engine.roomCode}`, 'info');
    });
  }

  btnCopyRoom.addEventListener('click', copyInviteLink);
  btnShareLink.addEventListener('click', copyInviteLink);

  // -------------------------------------------------------------
  // Engine State Change Listeners
  // -------------------------------------------------------------
  function handleStateChange(snap) {
    if (snap.roomCode) {
      headerRoomCode.textContent = snap.roomCode.toUpperCase();
    }

    setModeUI(snap.mode);

    trackTitle.textContent = snap.track.title || 'No Track Loaded';
    trackArtist.textContent = snap.track.artist || 'Select an audio source';

    // Update play/pause icons
    if (snap.track.isPlaying) {
      iconPlay.classList.add('hidden');
      iconPause.classList.remove('hidden');
      vinylDisc.classList.remove('paused-spin');
      if (snap.mode === 'youtube') {
        visualizer.start(true);
      } else {
        visualizer.start(false);
      }
    } else {
      iconPlay.classList.remove('hidden');
      iconPause.classList.add('hidden');
      vinylDisc.classList.add('paused-spin');
      visualizer.stop();
    }

    // Time progress
    if (!isSeeking) {
      const cur = snap.track.currentTime || 0;
      const dur = snap.track.duration || 0;
      timeCurrent.textContent = formatTime(cur);
      timeDuration.textContent = formatTime(dur);
      seekSlider.max = dur > 0 ? dur : 100;
      seekSlider.value = cur;
    }
  }

  function handlePeerCountChange(count) {
    peerCountEl.textContent = count;
  }

  function handleLatencyUpdate(ms) {
    latencyText.textContent = `${ms} ms`;
    if (ms < 80) {
      latencyText.className = 'text-emerald-400 font-mono font-medium';
    } else if (ms < 200) {
      latencyText.className = 'text-amber-400 font-mono font-medium';
    } else {
      latencyText.className = 'text-red-400 font-mono font-medium';
    }
  }

  function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // -------------------------------------------------------------
  // Toast Alert Manager
  // -------------------------------------------------------------
  const toastBanner = document.getElementById('toast-banner');
  const toastMessage = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');
  let toastTimer = null;

  function showToast(message, type = 'info') {
    if (!toastBanner || !toastMessage) return;
    toastMessage.textContent = message;
    toastBanner.classList.remove('hidden', 'bg-blue-900/50', 'border-blue-500/40', 'bg-emerald-900/50', 'border-emerald-500/40', 'bg-amber-900/50', 'border-amber-500/40', 'bg-red-900/50', 'border-red-500/40');

    if (type === 'success') {
      toastBanner.classList.add('bg-emerald-900/60', 'border-emerald-500/40', 'text-emerald-200');
    } else if (type === 'warning') {
      toastBanner.classList.add('bg-amber-900/60', 'border-amber-500/40', 'text-amber-200');
    } else if (type === 'error') {
      toastBanner.classList.add('bg-red-900/60', 'border-red-500/40', 'text-red-200');
    } else {
      toastBanner.classList.add('bg-purple-900/60', 'border-purple-500/40', 'text-purple-200');
    }

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastBanner.classList.add('hidden');
    }, 4500);

    if (window.lucide) window.lucide.createIcons();
  }
});
