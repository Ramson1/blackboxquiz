"use client";

/**
 * Competition sound engine — 100% WebAudio-synthesized, zero audio assets.
 * Provides six event cues (turn switch, question reveal, urgent ticks, correct,
 * incorrect, victory fanfare), a built-in tense/suspenseful "arena mix" ambient
 * loop and a deck for one custom music track (uploaded by the operator). Browsers only allow
 * audio after a user gesture, so everything routes through a lazy AudioContext
 * plus a one-time pointerdown/keydown unlock; playback intent is remembered in
 * `lastCfg` and reconciled the moment the page is unlocked.
 */

export type SoundCue =
  | "turn"
  | "reveal"
  | "tick"
  | "correct"
  | "incorrect"
  | "victory";

export type SoundMode = "off" | "builtin" | "custom";

export interface SoundConfig {
  enabled: boolean;
  mode: SoundMode;
  volume: number; // 0..1
  musicUrl: string | null;
}

const midi = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/**
 * Tension cycle in D minor — i–VII–VI–V (Dm · C · B♭ · A). The pull back to the
 * tonic and the dominant A give a dark, urgent, "time-is-running-out" feel.
 * Each entry is a low bass root; harmony is layered on top during the loop.
 */
const BASS_ROOTS = [38, 36, 34, 33]; // D2 · C2 · B♭1 · A1
const STEP_MS = 250; // pulse resolution — a fast ticking ostinato
const STEPS_PER_BAR = 8; // one harmony change every 2s

class CompetitionSoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cfg: SoundConfig = { enabled: false, mode: "off", volume: 0.7, musicUrl: null };
  private ambientTimer: number | null = null;
  private chordIndex = 0;
  private music: HTMLAudioElement | null = null;
  private musicSrc: string | null = null;
  private unlockArmed = false;

  /** Lazily create/resume the context; returns null when unsupported. */
  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.cfg.volume;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
      this.armUnlock();
    }
    return this.ctx;
  }

  /** Retry playback on the first user gesture (autoplay policy). */
  private armUnlock() {
    if (this.unlockArmed) return;
    this.unlockArmed = true;
    const handler = () => {
      this.unlockArmed = false;
      window.removeEventListener("pointerdown", handler);
      window.removeEventListener("keydown", handler);
      void this.ctx?.resume();
      if (this.music && this.music.paused && this.cfg.mode === "custom") {
        void this.music.play().catch(() => undefined);
      }
      if (this.cfg.enabled && this.cfg.mode === "builtin") this.startAmbient();
    };
    window.addEventListener("pointerdown", handler);
    window.addEventListener("keydown", handler);
  }

  /** Reconcile everything against the latest UI preference. */
  configure(next: SoundConfig) {
    this.cfg = next;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(next.volume, this.ctx.currentTime, 0.05);
    }
    if (this.music) this.music.volume = next.volume;

    const ambientWanted = next.enabled && next.mode === "builtin";
    const musicWanted =
      next.enabled && next.mode === "custom" ? next.musicUrl : null;

    if (ambientWanted) this.startAmbient();
    else this.stopAmbient();

    if (musicWanted) this.playMusic(musicWanted);
    else this.stopMusic();
  }

  playCue(cue: SoundCue) {
    if (!this.cfg.enabled) return;
    const ctx = this.ensure();
    if (!ctx || ctx.state !== "running") {
      this.armUnlock();
      return;
    }
    switch (cue) {
      case "tick":
        this.tone(1100, 0, 0.08, "square", 0.08);
        break;
      case "reveal":
        // Low ominous double-hit + airy sweep — dramatic, not decorative.
        this.tone(midi(45), 0, 0.4, "sawtooth", 0.13, midi(45) * 0.7);
        this.tone(midi(52), 0.16, 0.34, "square", 0.06);
        this.swoosh(0.04);
        break;
      case "turn":
        this.swoosh();
        break;
      case "correct":
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
          this.tone(f, i * 0.09, 0.2, "triangle", 0.16)
        );
        break;
      case "incorrect":
        this.tone(180, 0, 0.55, "sawtooth", 0.12, 110);
        break;
      case "victory": {
        const fanfare = [523.25, 659.25, 783.99, 1046.5];
        fanfare.forEach((f, i) => this.tone(f, i * 0.16, 0.3, "square", 0.09));
        [523.25, 659.25, 783.99].forEach((f) =>
          this.tone(f, 0.7, 1.1, "triangle", 0.13)
        );
        this.swoosh(0.62);
        break;
      }
    }
  }

  // ── internals ──────────────────────────────────────────────────────────

  private tone(
    freq: number,
    at: number,
    dur: number,
    type: OscillatorType,
    peak: number,
    glideTo?: number
  ) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.master) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur * 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Filtered noise sweep — a short airy "whoosh" for turn switches. */
  private swoosh(at = 0) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.master) return;
    const t = ctx.currentTime + at;
    const dur = 0.4;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.setValueAtTime(350, t);
    band.frequency.exponentialRampToValueAtTime(1900, t + dur);
    band.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.1, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(band).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  private startAmbient() {
    if (!this.ensure()) return;
    if (this.ambientTimer != null) return;
    this.stopMusic();
    const step = () => {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== "running") return;
      const bar =
        Math.floor(this.chordIndex / STEPS_PER_BAR) % BASS_ROOTS.length;
      const inBar = this.chordIndex % STEPS_PER_BAR;
      const root = BASS_ROOTS[bar];

      // Driving ostinato pulse — a short saw stab every step, accented on the
      // beat with a slight downward pitch bend for a pressing, ticking feel.
      const accent = inBar % 2 === 0;
      this.tone(
        midi(root),
        0,
        accent ? 0.16 : 0.11,
        "sawtooth",
        accent ? 0.05 : 0.03,
        midi(root) * 0.98
      );
      // Off-beat high stab: adds nervous, clock-like urgency.
      if (!accent) this.tone(midi(root + 12), 0, 0.05, "square", 0.022);

      // Heartbeat kick on beats 1 and 3 — the pulse of suspense.
      if (inBar === 0 || inBar === STEPS_PER_BAR / 2) {
        this.tone(midi(root - 12), 0, 0.22, "sine", 0.14, midi(root - 12) * 0.6);
      }

      // Uneasy tremolo pad at the head of each bar.
      if (inBar === 0) this.tensionPad(root);

      // Rising swell into the resolve on the dominant (last bar).
      if (bar === BASS_ROOTS.length - 1 && inBar === STEPS_PER_BAR - 2) {
        this.riser(root);
      }

      this.chordIndex++;
    };
    step();
    this.ambientTimer = window.setInterval(step, STEP_MS);
  }

  /** Sustained minor-second cluster (root + ♭9 colour) — dark, shimmering dread. */
  private tensionPad(root: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.master) return;
    const t = ctx.currentTime;
    const dur = 2.0;
    // Perfect fifth for openness + a semitone clash for tension.
    for (const [m, det] of [
      [root + 12, -6],
      [root + 19, 6],
      [root + 13, 10],
    ] as const) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = midi(m);
      osc.detune.value = det;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(550, t);
      lp.frequency.linearRampToValueAtTime(1700, t + dur * 0.7);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.028, t + 0.5);
      g.gain.setValueAtTime(0.028, t + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(lp).connect(g).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  /** Filtered upward saw sweep — the classic "hold that question…" riser. */
  private riser(root: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running" || !this.master) return;
    const t = ctx.currentTime;
    const dur = 0.9;
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(midi(root), t);
    osc.frequency.exponentialRampToValueAtTime(midi(root + 19), t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(800, t);
    lp.frequency.exponentialRampToValueAtTime(5200, t + dur);
    lp.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + dur * 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp).connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }


  private stopAmbient() {
    if (this.ambientTimer != null) {
      clearInterval(this.ambientTimer);
      this.ambientTimer = null;
    }
  }

  private playMusic(url: string) {
    if (this.musicSrc === url && this.music && !this.music.paused) return;
    this.stopAmbient();
    if (this.musicSrc !== url) {
      this.stopMusic();
      this.music = new Audio(url);
      this.music.loop = true;
      this.music.volume = this.cfg.volume;
      this.musicSrc = url;
    }
    void this.music?.play().catch(() => this.armUnlock());
  }

  private stopMusic() {
    if (this.music) {
      this.music.pause();
      this.music.src = "";
      this.music = null;
    }
    this.musicSrc = null;
  }
}

export const sound = new CompetitionSoundEngine();
