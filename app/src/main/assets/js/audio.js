class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.activeVoices = 0;
    this.maxVoices = 12;
  }

  unlock() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.85;
        this.master.connect(this.ctx.destination);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
  }

  vary(val, pct = 0.07) {
    return val * (1 + (Math.random() * 2 - 1) * pct);
  }

  canPlay() {
    return !this.muted && this.ctx && this.ctx.state === 'running' && this.activeVoices < this.maxVoices;
  }

  playTone({ freq = 220, freqEnd = 110, type = 'triangle', duration = 0.12, gain = 0.14 }) {
    if (!this.canPlay()) return;
    this.activeVoices++;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(this.vary(freq, 0.06), now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(28, this.vary(freqEnd, 0.06)), now + duration);
    const vGain = this.vary(gain, 0.07);
    g.gain.setValueAtTime(vGain, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);
    osc.connect(g);
    g.connect(this.master || this.ctx.destination);
    osc.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
    osc.start(now);
    osc.stop(now + duration + 0.015);
  }

  playNoise({ duration = 0.09, filterFreq = 1200, gain = 0.12 }) {
    if (!this.canPlay()) return;
    this.activeVoices++;
    const now = this.ctx.currentTime;
    const bufferSize = Math.max(64, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(this.vary(filterFreq, 0.07), now);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(this.vary(gain, 0.07), now);
    g.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(g);
    g.connect(this.master || this.ctx.destination);
    src.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
    src.start(now);
  }

  swing(heavy = false, weaponId = 'fists') {
    const baseFilter =
      weaponId === 'gauntlets' || weaponId === 'halberd'
        ? 580
        : weaponId === 'twin_daggers' || weaponId === 'katana'
        ? 1780
        : 1250;
    this.playNoise({
      duration: heavy ? 0.15 : 0.08,
      filterFreq: heavy ? baseFilter * 0.72 : baseFilter,
      gain: heavy ? 0.15 : 0.1,
    });
  }

  hit(heavy = false, weaponId = 'fists') {
    const deep = weaponId === 'gauntlets' || weaponId === 'halberd' ? 0.8 : 1.0;
    this.playTone({
      freq: (heavy ? 145 : 215) * deep,
      freqEnd: 42,
      type: 'sawtooth',
      duration: heavy ? 0.18 : 0.1,
      gain: heavy ? 0.21 : 0.14,
    });
    this.playNoise({
      duration: heavy ? 0.11 : 0.06,
      filterFreq: heavy ? 740 : 1020,
      gain: heavy ? 0.17 : 0.11,
    });
  }

  block() {
    this.playTone({ freq: 310, freqEnd: 165, type: 'square', duration: 0.08, gain: 0.09 });
  }

  parry() {
    this.playTone({ freq: 1040, freqEnd: 1860, type: 'sine', duration: 0.24, gain: 0.19 });
    this.playTone({ freq: 1560, freqEnd: 780, type: 'triangle', duration: 0.28, gain: 0.14 });
  }

  dash() {
    this.playNoise({ duration: 0.1, filterFreq: 2150, gain: 0.09 });
  }

  jump() {
    this.playTone({ freq: 210, freqEnd: 410, type: 'sine', duration: 0.09, gain: 0.07 });
  }

  telegraph() {
    this.playTone({ freq: 440, freqEnd: 790, type: 'triangle', duration: 0.19, gain: 0.12 });
  }

  phaseShift() {
    this.playTone({ freq: 110, freqEnd: 48, type: 'sawtooth', duration: 0.48, gain: 0.22 });
    this.playTone({ freq: 330, freqEnd: 660, type: 'sine', duration: 0.36, gain: 0.14 });
  }

  special() {
    this.playTone({ freq: 240, freqEnd: 700, type: 'sawtooth', duration: 0.32, gain: 0.17 });
    this.playTone({ freq: 480, freqEnd: 120, type: 'triangle', duration: 0.42, gain: 0.17 });
  }

  hazard() {
    this.playNoise({ duration: 0.18, filterFreq: 640, gain: 0.14 });
    this.playTone({ freq: 140, freqEnd: 58, type: 'triangle', duration: 0.2, gain: 0.12 });
  }

  ko() {
    this.playTone({ freq: 128, freqEnd: 32, type: 'sawtooth', duration: 0.45, gain: 0.25 });
    this.playNoise({ duration: 0.22, filterFreq: 500, gain: 0.19 });
  }

  coin() {
    this.playTone({ freq: 880, freqEnd: 1320, type: 'sine', duration: 0.12, gain: 0.1 });
  }

  uiClick() {
    this.playTone({ freq: 520, freqEnd: 640, type: 'sine', duration: 0.045, gain: 0.05 });
  }
}

export const sound = new SoundEngine();
