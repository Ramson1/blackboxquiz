/** Client-safe types shared by the live UI (spec §18, §27–§28). */

export interface LiveOption {
  id: string;
  key: string;
  text: string;
}

/** Full question content needed to display and reveal a question live. */
export interface LiveQuestionContent {
  id: string;
  text: string;
  options: LiveOption[];
  correctOptionId: string | null;
  explanation: string | null;
  category: string | null;
}

export type LiveContentMap = Record<string, LiveQuestionContent>;

/** Summary shown after a question is finalized (spec §24). */
export interface RevealInfo {
  question: LiveQuestionContent;
  /** Team that earned points, if any. */
  awardedTeamId: string | null;
  awardedPoints: number;
  primaryResult: string | null;
}
