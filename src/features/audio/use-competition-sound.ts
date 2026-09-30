"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LiveState } from "@/features/engine/types";
import { sound, type SoundMode } from "@/features/audio/sound-engine";

export interface SoundPrefs {
  enabled: boolean;
  mode: SoundMode;
  volume: number; // 0..1
  musicUrl: string | null;
  musicName: string | null;
}

const DEFAULTS: SoundPrefs = {
  enabled: true,
  mode: "builtin",
  volume: 0.7,
  musicUrl: null,
  musicName: null,
};

const KEY = (competitionId: string) => `bbq-sound-${competitionId}`;

function loadPrefs(competitionId: string): SoundPrefs {
  try {
    const raw = localStorage.getItem(KEY(competitionId));
    if (!raw) return DEFAULTS;
    const parsed = { ...DEFAULTS, ...(JSON.parse(raw) as Partial<SoundPrefs>) };
    // Object URLs die with the session — drop stale custom tracks back to the
    // built-in mix so a reload never points at a dead source.
    if (parsed.musicUrl && !/^https?:|^blob:/.test(parsed.musicUrl)) {
      parsed.musicUrl = null;
      parsed.musicName = null;
      parsed.mode = "builtin";
    }
    if (parsed.musicUrl?.startsWith("blob:")) {
      parsed.musicUrl = null;
      parsed.musicName = null;
      parsed.mode = "builtin";
    }
    return parsed;
  } catch {
    return DEFAULTS;
  }
}

/**
 * Binds the sound engine to a running competition: persists per-competition
 * preferences, plays music only while the competition is LIVE/PAUSED and fires
 * event cues (victory, question reveal, turn switch and the last-5-seconds
 * ticks) by diffing engine state transitions. Correct/incorrect cues are played
 * directly by the console when a reveal opens.
 */
export function useCompetitionSound(competitionId: string, state: LiveState) {
  const [prefs, setPrefsState] = useState<SoundPrefs>(() =>
    typeof window === "undefined" ? DEFAULTS : loadPrefs(competitionId)
  );

  const setPrefs = useCallback((patch: Partial<SoundPrefs>) => {
    setPrefsState((p) => ({ ...p, ...patch }));
  }, []);

  // Persist per competition.
  useEffect(() => {
    try {
      localStorage.setItem(KEY(competitionId), JSON.stringify(prefs));
    } catch {
      // Private mode / quota — preferences simply won't survive reloads.
    }
  }, [competitionId, prefs]);

  // Music only runs while the competition is on air; cues stay enabled so the
  // victory fanfare (fired on the COMPLETED transition itself) still sounds.
  useEffect(() => {
    const onAir = state.status === "LIVE" || state.status === "PAUSED";
    sound.configure({
      enabled: prefs.enabled,
      mode: onAir ? prefs.mode : "off",
      volume: prefs.volume,
      musicUrl: prefs.musicUrl,
    });
  }, [prefs, state.status]);

  // Event cues from engine-state transitions.
  const prev = useRef<{
    status: LiveState["status"];
    teamId: string | null;
    questionId: string | null;
    phase: string | null;
  } | null>(null);
  useEffect(() => {
    const cur = {
      status: state.status,
      teamId: state.currentTeamId ?? null,
      questionId: state.active?.questionId ?? null,
      phase: state.active?.phase ?? null,
    };
    const p = prev.current;
    prev.current = cur;
    if (!p) return;
    if (p.status !== "COMPLETED" && cur.status === "COMPLETED") {
      sound.playCue("victory");
    } else if (
      p.questionId !== cur.questionId &&
      cur.questionId &&
      cur.phase === "SELECTED"
    ) {
      sound.playCue("reveal");
    } else if (
      p.teamId !== cur.teamId &&
      cur.teamId &&
      cur.status === "LIVE" &&
      !cur.questionId
    ) {
      sound.playCue("turn");
    }
  }, [state]);

  // Urgent ticking for the final five seconds of an answer window.
  const deadline =
    state.active?.phase === "ANSWERING" || state.active?.phase === "BONUS_ANSWERING"
      ? (state.active?.expiresAt ?? null)
      : null;
  useEffect(() => {
    if (!deadline || !prefs.enabled) return;
    let lastSec = -1;
    const id = window.setInterval(() => {
      const rem = Math.ceil((deadline - Date.now()) / 1000);
      if (rem <= 5 && rem >= 1 && rem !== lastSec) {
        lastSec = rem;
        sound.playCue("tick");
      }
    }, 250);
    return () => clearInterval(id);
  }, [deadline, prefs.enabled]);

  return { prefs, setPrefs };
}
