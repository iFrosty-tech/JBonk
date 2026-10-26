// Effetti sonori sintetizzati con WebAudio: nessun file audio da caricare.

type Sfx =
  | 'hit'
  | 'pickup'
  | 'level'
  | 'hurt'
  | 'boom'
  | 'boss'
  | 'coin'
  | 'open'
  | 'shoot'
  | 'block'
  | 'splash'
  | 'swish'
  | 'split'
  | 'pop'
  | 'ping'
  | 'fanfare';

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private last = new Map<Sfx, number>();

  /** Va chiamato da un gesto dell'utente (click/tasto). */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.25;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  toggle() {
    this.muted = !this.muted;
    return this.muted;
  }

  play(s: Sfx) {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const now = ctx.currentTime;
    const minGap = s === 'hit' || s === 'pop' ? 0.05 : s === 'pickup' ? 0.03 : 0.02;
    if (now - (this.last.get(s) ?? -1) < minGap) return;
    this.last.set(s, now);
    switch (s) {
      case 'hit':
        this.tone(220 + Math.random() * 60, 120, 0.06, 'square', 0.12);
        break;
      case 'shoot':
        this.tone(600, 900, 0.05, 'triangle', 0.06);
        break;
      case 'pickup':
        this.tone(880 + Math.random() * 200, 1400, 0.06, 'sine', 0.12);
        break;
      case 'coin':
        this.tone(988, 988, 0.05, 'square', 0.08);
        this.tone(1319, 1319, 0.12, 'square', 0.08, 0.05);
        break;
      case 'level':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, f, 0.12, 'triangle', 0.18, i * 0.07));
        break;
      case 'open':
        [392, 523, 659].forEach((f, i) => this.tone(f, f * 1.01, 0.1, 'square', 0.1, i * 0.05));
        break;
      case 'hurt':
        this.tone(160, 60, 0.18, 'sawtooth', 0.2);
        break;
      case 'boom':
        this.noise(0.3, 0.3);
        this.tone(120, 40, 0.3, 'sine', 0.3);
        break;
      case 'block':
        this.tone(1400, 700, 0.08, 'square', 0.08);
        break;
      case 'splash':
        this.noise(0.16, 0.14);
        this.tone(340, 140, 0.14, 'sine', 0.14);
        break;
      case 'swish': // disco lanciato
        this.noise(0.16, 0.06);
        this.tone(420, 1100, 0.16, 'triangle', 0.05);
        break;
      case 'split': // la foglia si divide
        this.tone(1500, 2300, 0.04, 'square', 0.05);
        this.tone(1900, 2700, 0.05, 'square', 0.04, 0.045);
        break;
      case 'pop': // esagono che esplode
        this.tone(760, 180, 0.08, 'square', 0.07);
        break;
      case 'ping': // il radar del totem NGH, con l'eco
        this.tone(1760, 1690, 0.5, 'sine', 0.2);
        this.tone(1760, 1690, 0.4, 'sine', 0.07, 0.28);
        break;
      case 'fanfare': // premiazione JOscar
        [523, 659, 784].forEach((f, i) => this.tone(f, f, 0.11, 'square', 0.1, i * 0.1));
        [523, 659, 784, 1047].forEach((f) => this.tone(f, f * 1.003, 0.7, 'triangle', 0.12, 0.32));
        break;
      case 'boss':
        [110, 104, 98].forEach((f, i) => this.tone(f, f, 0.35, 'sawtooth', 0.2, i * 0.3));
        break;
    }
  }

  private tone(f0: number, f1: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number) {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    g.gain.value = vol;
    src.buffer = buf;
    src.connect(g).connect(this.master!);
    src.start();
  }
}
