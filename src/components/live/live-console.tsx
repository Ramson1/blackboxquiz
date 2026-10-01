"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  Flag,
  Lock,
  Pause,
  Play,
  Rocket,
  Users,
} from "lucide-react";
import { BrandFooter } from "@/components/brand";
import type { LiveState } from "@/features/engine/types";
import { pointColorFor } from "@/lib/validation/questions";
import {
  useLiveEngine,
  type RunResult,
} from "@/features/live/use-live-engine";
import type { LiveEngineApi } from "@/features/live/engine-api";
import type { LiveContentMap, RevealInfo } from "@/features/live/types";
import { Scoreboard } from "@/components/live/scoreboard";
import { VictoryScreen } from "@/components/live/victory-screen";
import { QuestionPicker } from "@/components/live/question-picker";
import { QuestionScreen } from "@/components/live/question-screen";
import { RevealDialog } from "@/components/live/reveal-dialog";
import { SoundControls } from "@/components/live/sound-controls";
import { sound } from "@/features/audio/sound-engine";
import { useCompetitionSound } from "@/features/audio/use-competition-sound";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Online console: builds the server-backed engine and renders the console view.
 */
export function LiveConsole({
  competitionId,
  competitionName,
  initialState,
  contentMap,
  pointColors,
  allowBonus,
}: {
  competitionId: string;
  competitionName: string;
  initialState: LiveState;
  contentMap: LiveContentMap;
  pointColors: Record<string, string>;
  allowBonus: boolean;
}) {
  const engine = useLiveEngine(initialState);
  return (
    <LiveConsoleView
      engine={engine}
      competitionId={competitionId}
      competitionName={competitionName}
      contentMap={contentMap}
      pointColors={pointColors}
      allowBonus={allowBonus}
    />
  );
}

/**
 * The operator console (spec §18, §27–§29, §51–§53): picker → question → bonus →
 * reveal, with a persistent scoreboard. Driven by any {@link LiveEngineApi}, so
 * the identical UI runs both online (server-backed) and offline (IndexedDB).
 */
export function LiveConsoleView({
  engine,
  competitionId,
  competitionName,
  contentMap,
  pointColors,
  allowBonus,
  exitHref,
  hideResults = false,
}: {
  engine: LiveEngineApi;
  competitionId: string;
  competitionName: string;
  contentMap: LiveContentMap;
  pointColors: Record<string, string>;
  allowBonus: boolean;
  /** Overrides the admin-workspace exit/results links (public run screens). */
  exitHref?: string;
  /** Hides the results/back links on the completed screen (public runs). */
  hideResults?: boolean;
}) {
  const [reveal, setReveal] = useState<RevealInfo | null>(null);
  const state = engine.state;
  const { prefs, setPrefs } = useCompetitionSound(competitionId, state);

  const colorFor = useCallback(
    (points: number) => pointColors[String(points)] ?? pointColorFor(points),
    [pointColors]
  );

  // Team name honored on the current reveal overlay, when points were earned.
  const revealedTeamName = useMemo(() => {
    if (!reveal || reveal.awardedPoints <= 0 || !reveal.awardedTeamId) return null;
    return state.teams.find((x) => x.id === reveal.awardedTeamId)?.name ?? null;
  }, [reveal, state.teams]);

  // Detect a finalized question after a submit and open the reveal overlay.
  const afterFinal = useCallback(
    (res: RunResult) => {
      if (!res.ok || res.state.active) return;
      const last = res.state.history[res.state.history.length - 1];
      if (!last) return;
      const q = contentMap[last.questionId];
      if (!q) return;
      // Result sting fires the instant the reveal overlay opens.
      sound.playCue(last.pointsAwarded > 0 ? "correct" : "incorrect");
      setReveal({
        question: q,
        awardedTeamId: last.pointsAwarded > 0 ? last.teamId : null,
        awardedPoints: last.pointsAwarded,
        primaryResult: last.result,
      });
    },
    [contentMap]
  );

  const active = state.active;
  const activeContent = active ? contentMap[active.questionId] : null;
  const activeQuestion = active
    ? state.questions.find((q) => q.id === active.questionId)
    : null;
  const primaryTeam =
    state.teams.find((t) => t.id === active?.primaryTeamId) ?? state.teams[0];
  const bonusTeam = active?.bonusTeamId
    ? (state.teams.find((t) => t.id === active.bonusTeamId) ?? null)
    : null;
  const currentTeam =
    state.teams.find((t) => t.id === state.currentTeamId) ?? state.teams[0];
  const otherTeam =
    state.teams.find((t) => t.id !== currentTeam?.id) ?? null;

  const paused = state.status === "PAUSED";

  function handleAnswer(optionId: string) {
    if (!active || !activeContent) return;
    const correct = optionId === activeContent.correctOptionId;
    const result = correct ? ("CORRECT" as const) : ("WRONG" as const);
    if (active.phase === "ANSWERING")
      afterFinal(engine.submitPrimary(result, optionId));
    else if (active.phase === "BONUS_ANSWERING")
      afterFinal(engine.submitBonus(result, optionId));
  }

  function handleTimeout() {
    if (!active) return;
    if (active.phase === "ANSWERING")
      afterFinal(engine.submitPrimary("TIMEOUT"));
    else if (active.phase === "BONUS_ANSWERING")
      afterFinal(engine.submitBonus("TIMEOUT"));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground"
          render={<Link href={exitHref ?? `/competitions/${competitionId}`} />}
        >
          Exit live console
        </Button>
        <div className="flex items-center gap-2">
          <SoundControls
            competitionId={competitionId}
            prefs={prefs}
            setPrefs={setPrefs}
          />
          {(state.status === "LIVE" || state.status === "PAUSED") && (
            <div className="flex gap-2">
              {paused ? (
                <Button size="sm" onClick={() => engine.resume()}>
                  <Play /> Resume
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => engine.pause()}
                >
                  <Pause /> Pause
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => engine.complete()}
              >
                <Flag /> End competition
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <Scoreboard
          competitionName={competitionName}
          teams={state.teams}
          currentTeamId={state.currentTeamId}
          status={state.status}
          locked={state.locked}
        />
      </div>

      {state.locked && (
        <Card className="border-red-500/40 bg-red-500/5">
          <CardContent className="flex items-center gap-3 py-6">
            <Lock className="size-6 text-red-600" />
            <div>
              <p className="font-bold text-red-600">COMPETITION LOCKED</p>
              <p className="text-sm text-muted-foreground">
                This competition has been locked by an administrator. Competition
                actions are disabled.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {!state.locked && state.status === "IDLE" && (
        <StartScreen
          competitionName={competitionName}
          state={state}
          onStart={() => engine.start()}
        />
      )}

      {!state.locked && paused && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-center justify-between gap-3 py-5">
            <div className="flex items-center gap-3">
              <Pause className="size-6 text-amber-600" />
              <div>
                <p className="font-bold text-amber-700 dark:text-amber-400">
                  COMPETITION PAUSED
                </p>
                <p className="text-sm text-muted-foreground">
                  Waiting for operator…
                </p>
              </div>
            </div>
            <Button onClick={() => engine.resume()}>
              <Play /> Resume
            </Button>
          </CardContent>
        </Card>
      )}

      {!state.locked && state.status === "COMPLETED" && (
        <CompletedView
          state={state}
          competitionId={competitionId}
          exitHref={exitHref}
          hideResults={hideResults}
        />
      )}

      {!state.locked && !paused && state.status === "LIVE" && active && activeContent && activeQuestion && (
        <QuestionScreen
          content={activeContent}
          points={active.points}
          questionNumber={activeQuestion.questionNumber}
          color={colorFor(active.points)}
          phase={active.phase}
          primaryTeam={{ name: primaryTeam.name, color: primaryTeam.color }}
          bonusTeam={
            bonusTeam ? { name: bonusTeam.name, color: bonusTeam.color } : null
          }
          timeLimit={activeQuestion.timeLimit}
          expiresAt={active.expiresAt}
          paused={paused}
          allowBonus={allowBonus}
          onStart={() => engine.startQuestion()}
          onAnswer={handleAnswer}
          onTimeout={handleTimeout}
          onOfferBonus={() => engine.startBonus()}
          onRevealWithoutBonus={() => afterFinal(engine.revealWithoutBonus())}
        />
      )}

      {!state.locked && !paused && state.status === "LIVE" && !active && (
        <QuestionPicker
          questions={state.questions}
          currentTeam={{
            name: currentTeam?.name ?? "",
            color: currentTeam?.color ?? "#64748b",
          }}
          otherTeam={
            otherTeam
              ? { name: otherTeam.name, color: otherTeam.color }
              : null
          }
          colorFor={colorFor}
          disabled={false}
          onSelect={(qid) => engine.select(qid)}
        />
      )}

      <BrandFooter />

      <RevealDialog
        reveal={reveal}
        teamName={revealedTeamName}
        onContinue={() => setReveal(null)}
      />
    </div>
  );
}

function StartScreen({
  competitionName,
  state,
  onStart,
}: {
  competitionName: string;
  state: LiveState;
  onStart: () => void;
}) {
  const ready = state.teams.length === 2 && state.questions.length > 0;
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-primary/10">
          <Rocket className="size-8 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold">{competitionName} is ready</h2>
          <p className="text-sm text-muted-foreground">
            Start the competition to open the question board.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4" /> {state.teams.length}/2 teams
          </span>
          <span>
            {state.questions.filter((q) => q.status === "AVAILABLE").length}{" "}
            questions available
          </span>
        </div>
        <Button size="lg" disabled={!ready} onClick={onStart}>
          <Rocket /> Start competition
        </Button>
        {!ready && (
          <p className="text-xs text-red-600">
            A competition needs exactly two teams and at least one question.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function CompletedView({
  state,
  competitionId,
  exitHref,
  hideResults = false,
}: {
  state: LiveState;
  competitionId: string;
  exitHref?: string;
  hideResults?: boolean;
}) {
  return (
    <VictoryScreen teams={state.teams}>
      {!hideResults && (
        <Button
          variant="outline"
          size="lg"
          render={<Link href={`/competitions/${competitionId}/results`} />}
        >
          View full results
        </Button>
      )}
      <Button
        size="lg"
        render={<Link href={exitHref ?? `/competitions/${competitionId}`} />}
      >
        {exitHref ? "Exit" : "Back to competition"}
      </Button>
    </VictoryScreen>
  );
}
