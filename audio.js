/**
 * Original table SFX via Web Audio — no commercial samples.
 */

export class MahjongAudio {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.enabled = true;
    this.master = 0.22;
  }

  async unlock() {
    this.ensure();
    if (this.ctx?.state === "suspended") await this.ctx.resume();
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
  }

  setEnabled(on) {
    this.enabled = on;
  }

  /**
   * @param {number} freq
   * @param {number} dur
   * @param {OscillatorType} [type]
   * @param {number} [gain]
   * @param {number} [when]
   */
  tone(freq, dur, type = "square", gain = 0.12, when = 0) {
    if (!this.enabled) return;
    this.ensure();
    const ctx = this.ctx;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * this.master, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.03, dur));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  deal() {
    for (let i = 0; i < 6; i++) {
      this.tone(300 + i * 35, 0.035, "triangle", 0.05, i * 0.03);
    }
  }

  discard() {
    this.tone(240, 0.05, "triangle", 0.08);
    this.tone(180, 0.06, "square", 0.04, 0.04);
  }

  claim() {
    this.tone(520, 0.06, "square", 0.08);
    this.tone(660, 0.08, "triangle", 0.06, 0.05);
  }

  win() {
    for (let i = 0; i < 6; i++) {
      this.tone(392 * Math.pow(1.15, i), 0.1, "square", 0.08, i * 0.06);
    }
  }

  deny() {
    this.tone(120, 0.08, "sawtooth", 0.05);
  }

  soft() {
    this.tone(700, 0.03, "triangle", 0.04);
  }
}
