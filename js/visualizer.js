// Visualizer Engine - Responsive Neon Canvas Audio Visualizer
class Visualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.analyser = null;
    this.dataArray = null;
    this.isPlaying = false;
    this.animationId = null;
    this.isSimulated = false;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.renderIdle();
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * (window.devicePixelRatio || 1);
    this.canvas.height = rect.height * (window.devicePixelRatio || 1);
  }

  connect(analyserNode) {
    this.analyser = analyserNode;
    this.analyser.fftSize = 128;
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);
    this.isSimulated = false;
  }

  start(simulated = false) {
    this.isPlaying = true;
    this.isSimulated = simulated;
    if (this.animationId) cancelAnimationFrame(this.animationId);
    this.loop();
  }

  stop() {
    this.isPlaying = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.renderIdle();
  }

  renderIdle() {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const barCount = 36;
    const barWidth = (w / barCount) - 3;

    for (let i = 0; i < barCount; i++) {
      const x = i * (barWidth + 3);
      const barHeight = 4;
      const y = h - barHeight;

      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, barWidth, barHeight, [2, 2, 0, 0]);
      this.ctx.fill();
    }
  }

  loop() {
    if (!this.isPlaying) return;
    this.animationId = requestAnimationFrame(() => this.loop());

    const w = this.canvas.width;
    const h = this.canvas.height;
    this.ctx.clearRect(0, 0, w, h);

    const barCount = 36;
    const barWidth = Math.max(2, (w / barCount) - 3);

    let values = [];
    if (!this.isSimulated && this.analyser && this.dataArray) {
      this.analyser.getByteFrequencyData(this.dataArray);
      const step = Math.floor(this.dataArray.length / barCount);
      for (let i = 0; i < barCount; i++) {
        values.push(this.dataArray[i * step] || 0);
      }
    } else {
      // Smooth sinusoidal simulated audio waves (used for YouTube mode or fallback)
      const t = Date.now() / 250;
      for (let i = 0; i < barCount; i++) {
        const wave = Math.sin(t + i * 0.3) * 0.5 + 0.5;
        const wave2 = Math.cos(t * 1.4 - i * 0.2) * 0.5 + 0.5;
        const combined = (wave * 0.6 + wave2 * 0.4) * 200 + 40;
        values.push(combined);
      }
    }

    // Create vibrant gradient
    const gradient = this.ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, '#8b5cf6');   // Purple
    gradient.addColorStop(0.5, '#ec4899'); // Pink
    gradient.addColorStop(1, '#06b6d4');   // Cyan

    for (let i = 0; i < barCount; i++) {
      const val = values[i] / 255;
      const barHeight = Math.max(4, val * (h - 8));
      const x = i * (barWidth + 3);
      const y = h - barHeight;

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.roundRect(x, y, barWidth, barHeight, [3, 3, 0, 0]);
      this.ctx.fill();

      // Top glowing dot
      this.ctx.fillStyle = '#ffffff';
      this.ctx.beginPath();
      this.ctx.arc(x + barWidth / 2, y - 2, Math.min(2, barWidth / 3), 0, Math.PI * 2);
      this.ctx.fill();
    }
  }
}

window.Visualizer = Visualizer;
