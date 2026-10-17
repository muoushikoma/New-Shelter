// 程序化环境音：通风机的嗡嗡声、风声、滴水、远处的炮声。不依赖任何音频文件
export class Audio {
  ctx: AudioContext | null = null;
  on = true;
  master: GainNode | null = null;
  hum: OscillatorNode | null = null; humGain: GainNode | null = null;
  wind: GainNode | null = null;
  constructor() { try { this.on = localStorage.getItem('shelter.audio') !== 'off'; } catch { /* 无痕模式 */ } }
  unlock() {
    if (this.ctx || !this.on) return;
    try {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new C();
      this.master = this.ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(this.ctx.destination);
      // 发电机嗡嗡声
      this.hum = this.ctx.createOscillator(); this.hum.type = 'sawtooth'; this.hum.frequency.value = 49;
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
      this.humGain = this.ctx.createGain(); this.humGain.gain.value = 0.05;
      this.hum.connect(lp); lp.connect(this.humGain); this.humGain.connect(this.master); this.hum.start();
      // 风声：滤波白噪声
      const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
      const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 0.6;
      this.wind = this.ctx.createGain(); this.wind.gain.value = 0.03;
      src.connect(bp); bp.connect(this.wind); this.wind.connect(this.master); src.start();
      setInterval(() => this.drip(), 5200);
    } catch { this.ctx = null; }
  }
  toggle() { this.on = !this.on; try { localStorage.setItem('shelter.audio', this.on ? 'on' : 'off'); } catch { /* */ } if (this.master) this.master.gain.value = this.on ? 0.35 : 0; if (this.on) this.unlock(); }
  setPower(p: boolean) { if (this.humGain) this.humGain.gain.value = p ? 0.05 : 0; }
  drip() {
    if (!this.ctx || !this.master || !this.on || Math.random() < 0.4) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.frequency.setValueAtTime(1400 + Math.random() * 600, this.ctx.currentTime); o.frequency.exponentialRampToValueAtTime(500, this.ctx.currentTime + 0.08);
    g.gain.setValueAtTime(0.05, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.15);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + 0.2);
  }
  boom() {
    if (!this.ctx || !this.master || !this.on) return;
    const n = this.ctx.createBufferSource(); const b = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    n.buffer = b; const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 120;
    const g = this.ctx.createGain(); g.gain.value = 0.6; n.connect(lp); lp.connect(g); g.connect(this.master); n.start();
  }
  cue(kind: string) {
    if (!this.ctx || !this.master || !this.on) return;
    if (kind === 'dark' || kind === 'outside') { this.boom(); return; }
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'triangle'; o.frequency.value = kind === 'door' ? 110 : 220;
    g.gain.setValueAtTime(0.08, this.ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.6);
    o.connect(g); g.connect(this.master); o.start(); o.stop(this.ctx.currentTime + 0.7);
    if (kind === 'door') setTimeout(() => this.cue('knock2'), 180);
  }
}
