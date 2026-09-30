import { createClient } from "@/lib/supabase/server";
import type { EngineEvent } from "@/features/engine/types";
import type {
  PublicBundle,
  PublicSetupSnapshot,
  PublicSetupSubmission,
} from "@/types/public";

/**
 * Public competition flow data access (migration 0012). Every call runs as
 * anon or authenticated — authorization lives entirely in the SECURITY
 * DEFINER RPCs, which verify the invite token / bcrypt password themselves
 * and lock the invite row after repeated failures. Errors raised by the
 * database ("Invalid link or password", lockouts, validation) surface as
 * `Error`s with the user-facing message for the actions layer to format.
 */

/** Outcome of the first wizard gate. Beyond verifying the password it also
 * reports whether this link has already been published (`used`) and, when it
 * points at a still-editable (READY) competition, the saved `setup` snapshot. */
export interface PublicSetupCheck {
  ok: boolean;
  organization_name: string | null;
  used: boolean;
  editable: boolean;
  status: string | null;
  setup: PublicSetupSnapshot | null;
}

/** First gate of the setup wizard: token + password check. */
export async function publicCheckSetup(
  token: string,
  password: string
): Promise<PublicSetupCheck> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_public_check_setup", {
    p_token: token,
    p_password: password,
  });
  if (error) throw new Error(error.message);
  return (data ?? {
    ok: false,
    organization_name: null,
    used: false,
    editable: false,
    status: null,
    setup: null,
  }) as PublicSetupCheck;
}

/** Submits the whole setup in one atomic call. */
export async function publicCompleteSetup(
  input: PublicSetupSubmission
): Promise<{ competition_id: string; question_count: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_public_complete_setup", {
    p_token: input.token,
    p_password: input.password,
    p_title: input.title,
    p_team_one: input.teamOne,
    p_team_two: input.teamTwo,
    p_time_per_question: input.timePerQuestion,
    p_questions: input.questions,
  });
  if (error) throw new Error(error.message);
  return data as unknown as { competition_id: string; question_count: number };
}

/** Start (or resume) a competition from the home screen. */
export async function publicStart(
  title: string,
  password: string
): Promise<PublicBundle> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_public_start", {
    p_title: title,
    p_password: password,
  });
  if (error) throw new Error(error.message);
  return data as unknown as PublicBundle;
}

/** Batched event flush from the run screen (idempotent via client uuids). */
export async function publicRecordEvents(
  competitionId: string,
  password: string,
  events: EngineEvent[]
): Promise<{ inserted: number; last_sequence: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("blackboxquiz_public_record_events", {
    p_competition_id: competitionId,
    p_password: password,
    p_events: events,
  });
  if (error) throw new Error(error.message);
  return (data ?? { inserted: 0, last_sequence: 0 }) as {
    inserted: number;
    last_sequence: number;
  };
}
