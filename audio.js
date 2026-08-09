/**
 * Original table SFX via Web Audio — no commercial samples.
 * Must resume AudioContext under a user gesture (Playgrounds iframe / autoplay policy).
 */

export class MahjongAudio {
  constructor() {
    /** @type {AudioContext | null} */
    this.ctx = null;
    this.enabled = true;
    this.master = 0.38;
    /** @type {Promise<void> | null} */
    this._unlocking = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    return this.ctx;
  }

  /**
   * Resume context; safe to call from click / pointer handlers.
   * @returns {Promise<boolean>} true when context is running
   */
  async unlock() {
    const ctx = this.ensure();
    if (!ctx) return false;
    if (ctx.state === "running") return true;
    if (!this._unlocking) {
      this._unlocking = ctx
        .resume()
        .catch(() => {})
        .finally(() => {
          this._unlocking = null;
        });
    }
    // go-client / some WebViews: resume() may never settle — don't block UI
    await Promise.race([
      this._unlocking,
      new Promise((r) => setTimeout(r, 300)),
    ]);
    return ctx.state === "running";
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) void this.unlock();
  }

  /**
   * @param {number} freq
   * @param {number} dur
   * @param {OscillatorType} [type]
   * @param {number} [gain]
   * @param {number} [when]
   */
  async tone(freq, dur, type = "square", gain = 0.14, when = 0) {
    if (!this.enabled) return;
    const ok = await this.unlock();
    if (!ok) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    const peak = Math.max(0.0001, gain * this.master);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.max(0.04, dur));
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.04);
  }

  async deal() {
    for (let i = 0; i < 6; i++) {
      void this.tone(300 + i * 35, 0.045, "triangle", 0.12, i * 0.035);
    }
  }

  async discard() {
    void this.tone(240, 0.06, "triangle", 0.16);
    void this.tone(180, 0.07, "square", 0.1, 0.04);
  }

  async claim() {
    void this.tone(520, 0.07, "square", 0.16);
    void this.tone(660, 0.09, "triangle", 0.12, 0.05);
  }

  async win() {
    for (let i = 0; i < 6; i++) {
      void this.tone(392 * Math.pow(1.15, i), 0.12, "square", 0.14, i * 0.06);
    }
  }

  async deny() {
    void this.tone(120, 0.1, "sawtooth", 0.12);
  }

  async soft() {
    void this.tone(700, 0.04, "triangle", 0.1);
  }
}
