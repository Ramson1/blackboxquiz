"use client";

/**
 * Competition sound engine — 100% WebAudio-synthesized, zero audio assets.
 * Provides six event cues (turn switch, question reveal, urgent ticks, correct,
 * incorrect, victory fanfare), a built-in "arena mix" ambient loop and a deck
 * for one custom music track (uploaded by the operator). Browsers only allow
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

/** C – G – Am – F pad progression, one chord every 4 seconds. */
const CHORDS = [
  [48, 55, 60, 64],
  [43, 50, 55, 59],
  [45, 52, 57, 60],
  [41, 48, 53, 57],
];
const CHORD_MS = 4000;

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
        this.tone(523.25, 0, 0.16, "triangle", 0.16);
        this.tone(783.99, 0.13, 0.24, "triangle", 0.16);
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
    const beat = () => {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== "running") return;
      const chord = CHORDS[this.chordIndex % CHORDS.length];
      this.chordIndex++;
      // Warm pad: detuned triangle pair through a lowpass, long soft envelope.
      chord.forEach((m) => {
        const f = midi(m);
        for (const detune of [-4, 4]) {
          const osc = ctx.createOscillator();
          osc.type = "triangle";
          osc.frequency.value = f;
          osc.detune.value = detune;
          const lp = ctx.createBiquadFilter();
          lp.type = "lowpass";
          lp.frequency.value = 900;
          const g = ctx.createGain();
          const t = ctx.currentTime;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.035, t + 1.3);
          g.gain.setValueAtTime(0.035, t + 2.6);
          g.gain.exponentialRampToValueAtTime(0.0001, t + 4.1);
          osc.connect(lp).connect(g).connect(this.master!);
          osc.start(t);
          osc.stop(t + 4.25);
        }
      });
      // Sub bass root, one octave under the chord root.
      const bass = ctx.createOscillator();
      bass.type = "sine";
      bass.frequency.value = midi(chord[0] - 12);
      const bg = ctx.createGain();
      const bt = ctx.currentTime;
      bg.gain.setValueAtTime(0.0001, bt);
      bg.gain.exponentialRampToValueAtTime(0.06, bt + 0.4);
      bg.gain.exponentialRampToValueAtTime(0.0001, bt + 3.6);
      bass.connect(bg).connect(this.master!);
      bass.start(bt);
      bass.stop(bt + 3.8);
    };
    beat();
    this.ambientTimer = window.setInterval(beat, CHORD_MS);
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
