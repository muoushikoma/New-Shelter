// 程序生成的配乐：D 小调，钢琴 + 弦乐垫音 + 低音持续音 + 音乐盒，经过合成混响。
// 按局势切换情绪（标题 / 白天 / 夜晚 / 紧张 / 结局），放一段停一段，不依赖任何音频文件。
export type Mood = 'title' | 'day' | 'night' | 'tension' | 'ending' | 'silent';

const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
// D 自然小调音阶（相对 D 的半音）
const SCALE = [0, 2, 3, 5, 7, 8, 10];
const D = 62; // D4

// 和弦：相对 D 的根音 + 和弦音（半音）
type Chord = { root: number; tones: number[] };
const C = (root: number, ...tones: number[]): Chord => ({ root, tones });
const PROG: Record<Exclude<Mood, 'silent'>, Chord[][]> = {
  title: [[C(0, 0, 3, 7, 14), C(-4, 0, 4, 7, 11), C(3, 0, 4, 7), C(-2, 0, 4, 7, 9)], [C(0, 0, 3, 7), C(5, 0, 3, 7), C(-4, 0, 4, 7), C(-5, 0, 4, 7)]],
  day: [[C(0, 0, 3, 7), C(-4, 0, 4, 7), C(3, 0, 4, 7), C(-2, 0, 4, 7)], [C(0, 0, 3, 7), C(5, 0, 3, 7), C(-4, 0, 4, 7), C(-5, 0, 4, 7)], [C(0, 0, 3, 7), C(3, 0, 4, 7), C(5, 0, 3, 7), C(0, 0, 3, 7)]],
  night: [[C(0, 0, 3, 7, 14), C(-4, 0, 4, 7, 11), C(5, 0, 3, 7, 10), C(-5, 0, 5, 7)], [C(0, 0, 3, 10, 14), C(-2, 0, 4, 7, 14), C(-4, 0, 4, 11)]],
  tension: [[C(0, 0, 3, 7), C(1, 0, 4, 7), C(0, 0, 3, 7), C(-1, 0, 3, 6)], [C(0, 0, 3, 6), C(-4, 0, 4, 7), C(1, 0, 4, 7), C(0, 0, 3, 7)]],
  ending: [[C(0, 0, 3, 7), C(-4, 0, 4, 7), C(5, 0, 3, 7), C(-5, 0, 4, 7), C(-2, 0, 4, 7), C(0, 0, 3, 7, 14)]],
};
const GAIN = 2; // 合成乐器整体偏轻，统一补一点
const TEMPO: Record<Exclude<Mood, 'silent'>, number> = { title: 56, day: 62, night: 50, tension: 66, ending: 52 };

export class Music {
  ctx: BaseAudioContext | null = null;
  out: GainNode | null = null;       // 音乐总音量
  bus: GainNode | null = null;       // 进混响前
  on = true;
  volume = 0.55;
  mood: Mood = 'silent';
  want: Mood = 'silent';
  private timer = 0;
  private next = 0;                  // 下一拍的时间
  private beat = 0;                  // 当前和弦内第几拍
  private chordIdx = 0;
  private prog: Chord[] = [];
  private lastMel = D + 7;
  private chordsLeft = 0;            // 这一段还剩几个和弦，0 时进入休止
  private restUntil = 0;
  private noise: AudioBuffer | null = null;

  constructor() {
    try { this.on = localStorage.getItem('shelter.music') !== 'off'; const v = Number(localStorage.getItem('shelter.musicVol')); if (v > 0) this.volume = v; } catch { /* 无痕模式 */ }
  }

  attach(ctx: BaseAudioContext, realtime = true) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.out = ctx.createGain(); this.out.gain.value = this.on ? this.volume * GAIN : 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    this.out.connect(comp); comp.connect(ctx.destination);
    // 合成混响：衰减的立体声噪声当作冲激响应
    const len = Math.floor(ctx.sampleRate * 3.6);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.42;
    const dry = ctx.createGain(); dry.gain.value = 0.75;
    const warm = ctx.createBiquadFilter(); warm.type = 'lowpass'; warm.frequency.value = 5200;
    this.bus = ctx.createGain();
    this.bus.connect(warm); warm.connect(dry); warm.connect(verb); verb.connect(wet); dry.connect(this.out); wet.connect(this.out);
    const nb = ctx.createBuffer(1, ctx.sampleRate / 10, ctx.sampleRate); const nd = nb.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noise = nb;
    this.next = ctx.currentTime + 0.3;
    if (realtime) this.timer = window.setInterval(() => this.schedule(), 120);
  }

  toggle() { this.on = !this.on; try { localStorage.setItem('shelter.music', this.on ? 'on' : 'off'); } catch { /* */ } this.applyVolume(); }
  setVolume(v: number) { this.volume = Math.max(0.05, Math.min(1, v)); try { localStorage.setItem('shelter.musicVol', String(this.volume)); } catch { /* */ } this.applyVolume(); }
  private applyVolume() { if (this.out && this.ctx) this.out.gain.setTargetAtTime(this.on ? this.volume * GAIN : 0, this.ctx.currentTime, 0.4); }

  // 每帧调用：告诉配乐现在该是什么情绪（在和弦交替时才真正切换）
  setMood(m: Mood) {
    if (m === this.want) return;
    this.want = m;
    // 从沉默或标题进入游戏时立刻起；其他情况等这个和弦结束
    if (this.mood === 'silent' || this.mood === 'title' || m === 'title' || m === 'ending' || m === 'tension') { this.beat = 0; this.startSection(); if (this.ctx) this.next = Math.max(this.next, this.ctx.currentTime + 0.1); }
  }

  private startSection() {
    this.restUntil = 0;
    this.mood = this.want;
    if (this.mood === 'silent') return;
    const ps = PROG[this.mood];
    this.prog = ps[Math.floor(Math.random() * ps.length)];
    this.chordIdx = 0; this.beat = 0;
    this.chordsLeft = this.mood === 'title' || this.mood === 'ending' ? 1e9 : 10 + Math.floor(Math.random() * 10);
  }

  // horizon：排到哪个时间点为止（离线渲染试听时可以一次排很远）
  schedule(horizon?: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    if (horizon === undefined && ctx.currentTime > this.next + 2) this.next = ctx.currentTime + 0.1; // 页面切到后台回来时不要一下补很多拍
    const until = horizon ?? ctx.currentTime + 0.7;
    while (this.next < until) {
      // 休止中 / 沉默
      if (this.restUntil || this.mood === 'silent') {
        if (this.restUntil && this.next >= this.restUntil) { this.startSection(); continue; }
        if (!this.restUntil && this.want !== 'silent') { this.startSection(); continue; }
        this.next += 0.5;
        continue;
      }
      const mood = this.mood as Exclude<Mood, 'silent'>;
      const spb = 60 / TEMPO[mood];
      const perChord = 8;
      if (this.beat === 0) {
        if (this.want !== mood) { this.startSection(); continue; }
        this.chordStart(this.next, spb * perChord);
      }
      this.playBeat(this.next, spb);
      this.next += spb;
      this.beat++;
      if (this.beat >= perChord) {
        this.beat = 0;
        this.chordIdx = (this.chordIdx + 1) % this.prog.length;
        if (this.chordIdx === 0 && --this.chordsLeft <= 0) {
          // 一段结束：休息 40~90 秒，只剩环境音
          this.restUntil = this.next + 40 + Math.random() * 50;
          this.next = this.restUntil;
        } else if (this.chordIdx === 0 && Math.random() < 0.4) {
          const ps = PROG[mood]; this.prog = ps[Math.floor(Math.random() * ps.length)];
        }
      }
    }
  }

  private get chord() { return this.prog[this.chordIdx]; }

  private chordStart(t: number, len: number) {
    const ch = this.chord, mood = this.mood as Exclude<Mood, 'silent'>;
    const base = D - 12 + ch.root;
    // 弦乐垫音
    const padNotes = ch.tones.slice(0, 3).map((x) => base + 12 + x);
    const padLvl = mood === 'night' ? 0.05 : mood === 'tension' ? 0.045 : mood === 'day' ? 0.028 : 0.04;
    for (const n of padNotes) this.pad(t, mtof(n), len + 1.5, padLvl);
    // 低音
    if (mood === 'tension') { this.drone(t, mtof(D - 24), len, 0.09); }
    else if (mood !== 'title') this.drone(t, mtof(base - 12 < 33 ? base : base - 12), len, mood === 'night' ? 0.05 : 0.04);
  }

  private playBeat(t: number, spb: number) {
    const mood = this.mood, b = this.beat, ch = this.chord;
    const base = D + ch.root;
    const strong = b % 4 === 0;
    if (mood === 'title' || mood === 'ending') {
      // 音乐盒：分解和弦 + 偶尔的旋律音
      const arp = ch.tones.map((x) => base + 12 + x);
      if (b % 2 === 0 || Math.random() < 0.3) this.box(t, mtof(arp[(b >> 1) % arp.length] + (b >= 4 ? 12 : 0)), 0.05);
      if (strong) this.piano(t, mtof(base - 12), 0.22, spb * 4);
      if (b === 2 || b === 6) { const m = this.melodyNote(true); this.piano(t, mtof(m), 0.2, spb * 2); }
      return;
    }
    if (mood === 'tension') {
      // 心跳一样的低音脉冲 + 不安的高音
      if (b % 2 === 0) this.thump(t, b % 4 === 0 ? 0.32 : 0.2);
      if (Math.random() < 0.22) { const m = this.melodyNote(strong); this.piano(t + (Math.random() < 0.3 ? spb / 2 : 0), mtof(m), 0.18, spb * 1.5); }
      if (b === 0) this.piano(t, mtof(D - 12), 0.28, spb * 6);
      return;
    }
    if (mood === 'night') {
      if (b === 0) this.piano(t, mtof(base - 12), 0.18, spb * 8);
      if (Math.random() < 0.16) this.piano(t, mtof(this.melodyNote(strong) + 12), 0.12, spb * 3);
      return;
    }
    // 白天：左手低音 + 分解，右手稀疏旋律
    if (b === 0) this.piano(t, mtof(base - 12), 0.26, spb * 4);
    if (b === 4) this.piano(t, mtof(base - 12 + 7), 0.18, spb * 3);
    if (b === 2 || b === 6) this.piano(t, mtof(base + ch.tones[1 + (b === 6 ? 1 : 0)] ), 0.11, spb * 2);
    const p = strong ? 0.6 : 0.38;
    if (Math.random() < p) {
      const m = this.melodyNote(strong);
      this.piano(t, mtof(m), 0.2 + Math.random() * 0.08, spb * (strong ? 2 : 1.2));
      if (Math.random() < 0.18) this.piano(t + spb / 2, mtof(this.melodyNote(false)), 0.14, spb);
    }
  }

  // 旋律：在音阶里小步走，强拍落在和弦音上
  private melodyNote(strong: boolean): number {
    const ch = this.chord;
    const cands: number[] = [];
    for (let m = D; m <= D + 17; m++) {
      const rel = ((m - D) % 12 + 12) % 12;
      if (!SCALE.includes(rel)) continue;
      const isChord = ch.tones.some((x) => ((ch.root + x - rel) % 12 + 12) % 12 === 0);
      if (strong && !isChord) continue;
      const step = Math.abs(m - this.lastMel);
      if (step > 7) continue;
      const w = (step === 0 ? 0.4 : step <= 2 ? 3 : step <= 4 ? 2 : 0.8) * (isChord ? 1.6 : 1);
      for (let i = 0; i < Math.round(w * 4); i++) cands.push(m);
    }
    const m = cands.length ? cands[Math.floor(Math.random() * cands.length)] : D + 7;
    this.lastMel = m;
    return m;
  }

  // ---------- 乐器 ----------
  private piano(t: number, f: number, vel: number, dur: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400 + vel * 6000;
    g.connect(lp); lp.connect(this.bus!);
    const tau = 1.5 * Math.pow(220 / f, 0.35);
    const parts = [1, 0.42, 0.22, 0.11, 0.05];
    parts.forEach((a, i) => {
      const n = i + 1;
      const o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.value = f * n * (1 + 0.0004 * n * n);
      o.detune.value = (Math.random() - 0.5) * 4;
      const og = ctx.createGain(); og.gain.value = a / (1 + i * 0.3);
      o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + tau * 3 + 0.2);
    });
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * 0.5, t + 0.006);
    g.gain.setTargetAtTime(vel * 0.18, t + 0.006, tau * 0.25);
    g.gain.setTargetAtTime(0, t + dur, tau * 0.6);
    // 琴槌的一点噪声
    if (this.noise) {
      const ns = ctx.createBufferSource(); ns.buffer = this.noise;
      const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = f * 4; nf.Q.value = 1.5;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(vel * 0.05, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      ns.connect(nf); nf.connect(ng); ng.connect(this.bus!); ns.start(t); ns.stop(t + 0.06);
    }
  }
  private pad(t: number, f: number, dur: number, lvl: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.4;
    g.connect(lp); lp.connect(this.bus!);
    for (const d of [-7, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      o.connect(g); o.start(t); o.stop(t + dur + 3.5);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + Math.min(2.8, dur * 0.4));
    g.gain.setTargetAtTime(0, t + dur - 0.5, 1.0);
  }
  private drone(t: number, f: number, dur: number, lvl: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain(); g.connect(this.bus!);
    for (const [type, mul, a] of [['triangle', 1, 1], ['sine', 0.5, 0.7]] as const) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f * mul;
      const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(g);
      o.start(t); o.stop(t + dur + 3);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(lvl, t + 1.8);
    g.gain.setTargetAtTime(0, t + dur - 0.3, 0.8);
  }
  private box(t: number, f: number, vel: number) {
    const ctx = this.ctx!;
    const g = ctx.createGain(); g.connect(this.bus!);
    for (const [mul, a] of [[1, 1], [4.01, 0.25], [6.3, 0.08]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(g);
      o.start(t); o.stop(t + 2.5);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  }
  private thump(t: number, vel: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.35);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g); g.connect(this.bus!); o.start(t); o.stop(t + 0.7);
  }
}
