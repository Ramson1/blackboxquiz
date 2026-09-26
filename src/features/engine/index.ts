/**
 * Live competition engine (Task 10) — deterministic, event-sourced state
 * machine. Pure logic only; persistence and the UI layer consume it.
 */
export * from "@/features/engine/types";
export {
  applyEvent,
  createInitialState,
  replay,
} from "@/features/engine/reducer";
export {
  commit,
  startCompetition,
  selectQuestion,
  startQuestion,
  submitPrimaryAnswer,
  startBonus,
  submitBonusAnswer,
  completeQuestion,
  pauseCompetition,
  resumeCompetition,
  completeCompetition,
  lockCompetitionEvent,
  unlockCompetitionEvent,
} from "@/features/engine/commands";
