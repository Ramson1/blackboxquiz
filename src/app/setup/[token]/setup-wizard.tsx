"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  FileDown,
  FileUp,
  Loader2,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  setupCheckAction,
  setupCompleteAction,
} from "@/features/public/actions";
import {
  downloadTemplateDocx,
  parseDocxFile,
} from "@/features/questions/parse-docx";
import {
  DEFAULT_OPTION_KEYS,
  pointColorFor,
  questionFormSchema,
} from "@/lib/validation/questions";
import type { PublicSetupQuestion } from "@/types/public";
import { BlackBoxLogo, BrandFooter } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Textarea } from "@/components/ui/textarea";

/**
 * Public setup wizard (migration 0012): password gate → competition details →
 * questions one at a time → review + single atomic submit. No account: the
 * link + admin password ARE the authorization; every step re-verifies through
 * the SECURITY DEFINER RPCs. Work in progress is mirrored to sessionStorage
 * so an accidental refresh never loses typed questions.
 */

const POINT_TIERS = [100, 200, 300, 500, 1000] as const;

interface SetupDraft {
  title: string;
  teamOne: string;
  teamTwo: string;
  timePerQuestion: number;
  questions: PublicSetupQuestion[];
}

const EMPTY_DRAFT: SetupDraft = {
  title: "",
  teamOne: "",
  teamTwo: "",
  timePerQuestion: 20,
  questions: [],
};

interface QuestionEditor {
  question_text: string;
  points: number;
  correct_key: string;
  options: { key: string; text: string }[];
}

function blankQuestion(): QuestionEditor {
  return {
    question_text: "",
    points: 100,
    correct_key: "A",
    options: DEFAULT_OPTION_KEYS.map((key) => ({ key, text: "" })),
  };
}

const STEPS = ["Password", "Details", "Questions", "Review"] as const;

export function PublicSetupWizard({ token }: { token: string }) {
  const [step, setStep] = useState(0);
  const [pending, start] = useTransition();

  // Gate state.
  const [password, setPassword] = useState("");
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [gateError, setGateError] = useState<string | null>(null);

  // Wizard data (persisted per token).
  const [draft, setDraft] = useState<SetupDraft>(EMPTY_DRAFT);
  const storageKey = `blackboxquiz:setup:${token}`;
  useEffect(() => {
    // Async IIFE: the hydration-safe restore happens right after mount.
    void (async () => {
      try {
        const raw = sessionStorage.getItem(storageKey);
        if (raw) setDraft({ ...EMPTY_DRAFT, ...JSON.parse(raw) });
      } catch {
        /* corrupted draft — start fresh */
      }
    })();
  }, [storageKey]);
  useEffect(() => {
    if (step > 0) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        /* private mode / quota — non-fatal */
      }
    }
  }, [storageKey, draft, step]);

  // Question editor state.
  const [question, setQuestion] = useState<QuestionEditor>(blankQuestion());
  const [editIndex, setEditIndex] = useState<number | null>(null);

  // Bulk .docx import state.
  const docxInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [bulkIssues, setBulkIssues] = useState<string[]>([]);

  async function handleTemplateDownload() {
    try {
      await downloadTemplateDocx();
    } catch {
      toast.error("Could not build the Word template.");
    }
  }

  /** PARSE → VALIDATE → APPEND: rows failing the shared form schema are
   * reported inline instead of silently dropped (spec §46 pipeline). */
  async function handleDocxFile(file: File) {
    setImporting(true);
    try {
      const { questions, issues } = await parseDocxFile(file);
      const problems = [...issues];
      const room = 200 - draft.questions.length;
      const accepted: PublicSetupQuestion[] = [];
      for (const q of questions) {
        if (accepted.length >= room) {
          problems.push(
            `Reached the 200-question cap — "${q.question_text.slice(0, 60)}" and later questions were skipped`
          );
          break;
        }
        const payload: PublicSetupQuestion = {
          question_text: q.question_text,
          points: q.points,
          point_color: pointColorFor(q.points),
          time_limit: draft.timePerQuestion,
          correct_key: q.correct_key,
          options: q.options.map((o, i) => ({
            key: o.key,
            text: o.text,
            display_order: i + 1,
          })),
        };
        const parsed = questionFormSchema.safeParse({
          question_text: payload.question_text,
          points: payload.points,
          time_limit: payload.time_limit,
          correct_key: payload.correct_key,
          options: payload.options,
        });
        if (!parsed.success) {
          problems.push(
            `"${q.question_text.slice(0, 60)}": ${parsed.error.issues[0]?.message ?? "invalid row"}`
          );
          continue;
        }
        accepted.push(payload);
      }
      if (accepted.length > 0) {
        setDraft((d) => ({ ...d, questions: [...d.questions, ...accepted] }));
        toast.success(
          `Imported ${accepted.length} question${accepted.length === 1 ? "" : "s"}`
        );
      } else if (problems.length === 0) {
        toast.error("No questions found — open the template and follow its format.");
      }
      setBulkIssues(problems);
    } catch (err) {
      setBulkIssues([
        err instanceof Error ? err.message : "Could not read this .docx file.",
      ]);
      toast.error("Import failed");
    } finally {
      setImporting(false);
    }
  }

  function checkPassword() {
    setGateError(null);
    start(async () => {
      const res = await setupCheckAction({ token, password });
      if (res.ok) {
        setOrganizationName(res.organizationName);
        setStep(1);
      } else {
        setGateError(res.error);
      }
    });
  }

  // ---- Question editor helpers -------------------------------------------

  const canAddQuestion = useMemo(
    () =>
      question.question_text.trim().length > 0 &&
      question.options.filter((o) => o.text.trim()).length >= 2 &&
      draft.questions.length < 200,
    [question, draft.questions.length]
  );

  function questionPayload(editor: QuestionEditor): PublicSetupQuestion {
    return {
      question_text: editor.question_text.trim(),
      points: editor.points,
      correct_key: editor.correct_key,
      time_limit: draft.timePerQuestion,
      options: editor.options
        .filter((o) => o.text.trim())
        .map((o, i) => ({ key: o.key, text: o.text.trim(), display_order: i + 1 })),
    };
  }

  function submitQuestion() {
    const payload = questionPayload(question);
    const parsed = questionFormSchema.safeParse({
      question_text: payload.question_text,
      points: payload.points,
      time_limit: payload.time_limit,
      correct_key: payload.correct_key,
      options: payload.options,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (editIndex == null) {
      setDraft((d) => ({ ...d, questions: [...d.questions, payload] }));
    } else {
      setDraft((d) => ({
        ...d,
        questions: d.questions.map((q, i) => (i === editIndex ? payload : q)),
      }));
      setEditIndex(null);
    }
    setQuestion(blankQuestion());
    toast.success("Question saved");
  }

  function editQuestion(index: number) {
    const q = draft.questions[index];
    setQuestion({
      question_text: q.question_text,
      points: q.points,
      correct_key: q.correct_key,
      options: q.options.map((o) => ({ key: o.key, text: o.text })),
    });
    setEditIndex(index);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function removeQuestion(index: number) {
    setDraft((d) => ({ ...d, questions: d.questions.filter((_, i) => i !== index) }));
    if (editIndex === index) {
      setEditIndex(null);
      setQuestion(blankQuestion());
    }
  }

  function addOption() {
    if (question.options.length >= 8) return;
    const nextKey = String.fromCharCode(65 + question.options.length);
    setQuestion((q) => ({ ...q, options: [...q.options, { key: nextKey, text: "" }] }));
  }

  function removeOption(key: string) {
    if (question.options.length <= 2) return;
    setQuestion((q) => {
      const options = q.options.filter((o) => o.key !== key);
      return {
        ...q,
        options,
        correct_key: q.correct_key === key ? options[0].key : q.correct_key,
      };
    });
  }

  // ---- Final submit -------------------------------------------------------

  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function completeSetup() {
    setSubmitError(null);
    start(async () => {
      const res = await setupCompleteAction({
        token,
        password,
        title: draft.title,
        teamOne: draft.teamOne,
        teamTwo: draft.teamTwo,
        timePerQuestion: draft.timePerQuestion,
        questions: draft.questions,
      });
      if (res.ok) {
        try {
          sessionStorage.removeItem(storageKey);
        } catch {
          /* ignore */
        }
        setSubmitted(true);
      } else {
        setSubmitError(res.error);
      }
    });
  }

  // ---- Rendering ----------------------------------------------------------

  if (submitted) {
    return (
      <WizardShell step={null}>
        <Card>
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <span className="flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
              <Check className="size-8" />
            </span>
            <h2 className="text-xl font-bold">You&apos;re all set!</h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold">{draft.title || "Your competition"}</span>{" "}
              is ready with {draft.questions.length} question
              {draft.questions.length === 1 ? "" : "s"}.
            </p>
            <div className="w-full rounded-lg border bg-muted/40 p-4 text-left">
              <p className="text-sm font-medium">
                🏆 Next step — share with your host:
              </p>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
                <li>
                  The competition title: <span className="font-semibold text-foreground">{draft.title}</span>
                </li>
                <li>
                  This same password: <span className="font-semibold text-foreground">{password}</span>
                </li>
              </ul>
              <p className="mt-2 text-sm text-muted-foreground">
                On the home screen, press <span className="font-semibold">Start Competition</span>{" "}
                and enter both to begin.
              </p>
            </div>
            <Link href="/">
              <Button variant="outline">Go to home screen</Button>
            </Link>
          </div>
        </Card>
      </WizardShell>
    );
  }

  return (
    <WizardShell step={step}>
      {step === 0 && (
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold">Welcome! 🔐</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the password your administrator gave you to set up your
                competition.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="setup-password">Password</Label>
              <PasswordInput
                id="setup-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="off"
                onKeyDown={(e) => e.key === "Enter" && checkPassword()}
              />
              {gateError && (
                <p className="text-sm text-destructive">{gateError}</p>
              )}
            </div>
            <Button onClick={checkPassword} disabled={pending || password.trim().length < 4}>
              {pending ? "Checking…" : "Unlock setup"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Wrong password too many times locks this link for 15 minutes.
            </p>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold">Competition details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {organizationName ? `${organizationName} · ` : ""}
                name the competition and its two teams.
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-title">Competition title</Label>
              <Input
                id="f-title"
                value={draft.title}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="Inter-House Quiz 2025"
                maxLength={200}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-team-one">Team 1 name</Label>
                <Input
                  id="f-team-one"
                  value={draft.teamOne}
                  onChange={(e) => setDraft((d) => ({ ...d, teamOne: e.target.value }))}
                  placeholder="Firebirds"
                  maxLength={120}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="f-team-two">Team 2 name</Label>
                <Input
                  id="f-team-two"
                  value={draft.teamTwo}
                  onChange={(e) => setDraft((d) => ({ ...d, teamTwo: e.target.value }))}
                  placeholder="Thunderbolts"
                  maxLength={120}
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-time">Time per question (seconds)</Label>
              <Input
                id="f-time"
                type="number"
                min={5}
                max={600}
                value={draft.timePerQuestion}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    timePerQuestion: Number(e.target.value) || 20,
                  }))
                }
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">
                Default 15 seconds — each team gets this long to answer.
              </p>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(0)}>
                <ChevronLeft />
                Back
              </Button>
              <Button
                disabled={
                  draft.title.trim().length < 3 ||
                  !draft.teamOne.trim() ||
                  !draft.teamTwo.trim() ||
                  draft.teamOne.trim().toLowerCase() === draft.teamTwo.trim().toLowerCase() ||
                  draft.timePerQuestion < 5 ||
                  draft.timePerQuestion > 600
                }
                onClick={() => setStep(2)}
              >
                Continue
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <>
          <Card className="mb-4">
            <div className="flex flex-col gap-3">
              <div>
                <h2 className="text-lg font-bold">Bulk upload</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Many questions at once? Download the Word template, write one
                  block per question (question, options, correct answer,
                  points), then upload your .docx here — everything is filled
                  in automatically and you can still edit any question below.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleTemplateDownload}
                  disabled={importing}
                >
                  <FileDown />
                  Download template (.docx)
                </Button>
                <input
                  ref={docxInputRef}
                  type="file"
                  accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) void handleDocxFile(file);
                  }}
                />
                <Button
                  type="button"
                  onClick={() => docxInputRef.current?.click()}
                  disabled={importing}
                >
                  {importing ? <Loader2 className="animate-spin" /> : <FileUp />}
                  {importing ? "Reading document…" : "Upload questions (.docx)"}
                </Button>
              </div>
              {bulkIssues.length > 0 && (
                <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <p className="font-semibold">
                    Could not import {bulkIssues.length} line
                    {bulkIssues.length === 1 ? "" : "s"}:
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {bulkIssues.slice(0, 8).map((issue, i) => (
                      <li key={i}>{issue}</li>
                    ))}
                    {bulkIssues.length > 8 && (
                      <li>…and {bulkIssues.length - 8} more</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-bold">
                  {editIndex == null ? "Add a question" : "Edit question"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Type the question, fill the options, then mark the correct
                  answer. Add them one after another.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="q-text">Question</Label>
                <Textarea
                  id="q-text"
                  rows={3}
                  value={question.question_text}
                  onChange={(e) =>
                    setQuestion((q) => ({ ...q, question_text: e.target.value }))
                  }
                  placeholder="Who wrote the novel 'Things Fall Apart'?"
                  maxLength={4000}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Options</Label>
                {question.options.map((opt, i) => (
                  <div key={opt.key} className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Mark option ${opt.key} as correct`}
                      onClick={() =>
                        setQuestion((q) => ({ ...q, correct_key: question.options[i].key }))
                      }
                      className="shrink-0"
                    >
                      <span
                        className={
                          question.correct_key === opt.key
                            ? "flex size-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                            : "flex size-7 items-center justify-center rounded-full border text-xs font-bold text-muted-foreground"
                        }
                      >
                        {opt.key}
                      </span>
                    </button>
                    <Input
                      value={opt.text}
                      onChange={(e) =>
                        setQuestion((q) => ({
                          ...q,
                          options: q.options.map((o, j) =>
                            j === i ? { ...o, text: e.target.value } : o
                          ),
                        }))
                      }
                      placeholder={`Option ${opt.key}`}
                      maxLength={2000}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove option ${opt.key}`}
                      disabled={question.options.length <= 2}
                      onClick={() => removeOption(opt.key)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={question.options.length >= 8}
                    onClick={addOption}
                  >
                    <Plus />
                    Add option
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Tap the letter to mark the correct answer.
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Points</Label>
                <div className="flex flex-wrap gap-2">
                  {POINT_TIERS.map((tier) => (
                    <button
                      key={tier}
                      type="button"
                      onClick={() => setQuestion((q) => ({ ...q, points: tier }))}
                      style={
                        question.points === tier
                          ? { backgroundColor: pointColorFor(tier), color: "#fff" }
                          : { borderColor: pointColorFor(tier), color: pointColorFor(tier) }
                      }
                      className={
                        question.points === tier
                          ? "h-9 rounded-full px-4 text-sm font-bold"
                          : "h-9 rounded-full border px-4 text-sm font-bold"
                      }
                    >
                      {tier}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button onClick={submitQuestion} disabled={!canAddQuestion}>
                  {editIndex == null ? <Plus /> : <Check />}
                  {editIndex == null ? "Add question" : "Save changes"}
                </Button>
                {editIndex != null && (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditIndex(null);
                      setQuestion(blankQuestion());
                    }}
                  >
                    Cancel edit
                  </Button>
                )}
              </div>
            </div>
          </Card>

          <Card className="mt-4">
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold">
                Questions ({draft.questions.length})
              </h3>
              {draft.questions.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  None yet — add your first question above.
                </p>
              )}
              {draft.questions.map((q, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {i + 1}. {q.question_text}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {q.options.length} options ·{" "}
                      <span
                        className="font-semibold"
                        style={{ color: pointColorFor(q.points) }}
                      >
                        {q.points} pts
                      </span>{" "}
                      · answer: {q.correct_key}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Edit question"
                      onClick={() => editQuestion(i)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Remove question"
                      onClick={() => removeQuestion(i)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setStep(1)}>
                <ChevronLeft />
                Back
              </Button>
              <Button disabled={draft.questions.length === 0} onClick={() => setStep(3)}>
                Review
              </Button>
            </div>
          </Card>
        </>
      )}

      {step === 3 && (
        <Card>
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-bold">Review &amp; publish</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                One check before we build your competition board.
              </p>
            </div>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Title</dt>
                <dd className="font-semibold">{draft.title}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Time per question</dt>
                <dd className="font-semibold">{draft.timePerQuestion}s</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Team 1</dt>
                <dd className="font-semibold">{draft.teamOne}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Team 2</dt>
                <dd className="font-semibold">{draft.teamTwo}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Questions</dt>
                <dd className="font-semibold">{draft.questions.length}</dd>
              </div>
            </dl>
            {submitError && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {submitError}
              </p>
            )}
            <div className="flex items-center justify-between">
              <Button variant="ghost" disabled={pending} onClick={() => setStep(2)}>
                <ChevronLeft />
                Back
              </Button>
              <Button onClick={completeSetup} disabled={pending}>
                <ShieldCheck />
                {pending ? "Publishing…" : "Publish competition"}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </WizardShell>
  );
}

// ---- Small presentational helpers -----------------------------------------

function WizardShell({
  step,
  children,
}: {
  step: number | null;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 size-96 -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/30 via-sky-400/20 to-fuchsia-500/25 blur-3xl"
      />
      <div className="relative flex w-full max-w-xl flex-col gap-6">
        <div className="flex flex-col items-center gap-2">
          <BlackBoxLogo className="h-12 w-12 rounded-2xl" />
          <h1 className="text-xl font-bold tracking-tight">Competition setup</h1>
        </div>
        {step != null && (
          <ol className="flex items-center justify-center gap-2">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={
                    i === step
                      ? "flex h-7 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-primary-foreground"
                      : i < step
                        ? "flex h-7 items-center gap-1.5 rounded-full bg-primary/15 px-3 text-xs font-semibold text-primary"
                        : "flex h-7 items-center rounded-full border px-3 text-xs font-medium text-muted-foreground"
                  }
                >
                  {i < step && <Check className="size-3" />}
                  {label}
                </span>
                {i < STEPS.length - 1 && (
                  <span className="h-px w-4 bg-border" aria-hidden />
                )}
              </li>
            ))}
          </ol>
        )}
        {children}
        <BrandFooter className="justify-center pt-2" />
      </div>
    </div>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}
