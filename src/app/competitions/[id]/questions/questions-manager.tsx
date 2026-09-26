"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Download, Eye, Pencil, Plus, Trash2, Upload } from "lucide-react";
import type { QuestionWithOptions } from "@/services/questions/question-service";
import {
  deleteQuestionAction,
  duplicateQuestionAction,
} from "@/features/questions/actions";
import { questionsToCsv } from "@/features/questions/parse-import";
import {
  QuestionFormDialog,
} from "@/app/competitions/[id]/questions/question-form-dialog";
import { BulkImportDialog } from "@/app/competitions/[id]/questions/bulk-import-dialog";
import { QuestionPreviewDialog } from "@/app/competitions/[id]/questions/preview-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const ALL = "__all__";

export function QuestionsManager({
  competitionId,
  defaultTimer,
  canManage,
  initialQuestions,
}: {
  competitionId: string;
  defaultTimer: number;
  canManage: boolean;
  initialQuestions: QuestionWithOptions[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL);
  const [points, setPoints] = useState(ALL);
  const [difficulty, setDifficulty] = useState(ALL);
  const [status, setStatus] = useState(ALL);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<QuestionWithOptions | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [preview, setPreview] = useState<QuestionWithOptions | null>(null);

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          initialQuestions
            .map((q) => q.category)
            .filter((c): c is string => Boolean(c))
        )
      ).sort(),
    [initialQuestions]
  );
  const pointOptions = useMemo(
    () =>
      Array.from(new Set(initialQuestions.map((q) => q.points))).sort(
        (a, b) => a - b
      ),
    [initialQuestions]
  );
  const difficulties = useMemo(
    () =>
      Array.from(
        new Set(
          initialQuestions
            .map((q) => q.difficulty)
            .filter((d): d is string => Boolean(d))
        )
      ).sort(),
    [initialQuestions]
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return initialQuestions.filter((q) => {
      if (term && !q.question_text.toLowerCase().includes(term)) return false;
      if (category !== ALL && q.category !== category) return false;
      if (points !== ALL && String(q.points) !== points) return false;
      if (difficulty !== ALL && q.difficulty !== difficulty) return false;
      if (status !== ALL && q.status !== status) return false;
      return true;
    });
  }, [initialQuestions, search, category, points, difficulty, status]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(q: QuestionWithOptions) {
    setEditing(q);
    setFormOpen(true);
  }

  async function onDuplicate(q: QuestionWithOptions) {
    const res = await duplicateQuestionAction({
      competitionId,
      questionId: q.id,
    });
    if (res.ok) {
      toast.success("Question duplicated");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function onDelete(q: QuestionWithOptions) {
    if (
      !window.confirm(`Delete question #${q.question_number}? This cannot be undone.`)
    )
      return;
    const res = await deleteQuestionAction({
      competitionId,
      questionId: q.id,
    });
    if (res.ok) {
      toast.success("Question deleted");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  function onExport() {
    const rows = initialQuestions.map((q) => {
      const correct = q.options.find((o) => o.id === q.correct_option_id);
      const optByKey = (k: string) =>
        q.options.find((o) => o.option_key === k)?.option_text ?? "";
      return {
        question: q.question_text,
        option_a: optByKey("A"),
        option_b: optByKey("B"),
        option_c: optByKey("C"),
        option_d: optByKey("D"),
        correct_answer: correct?.option_key ?? "",
        points: q.points,
        category: q.category ?? "",
        difficulty: q.difficulty ?? "",
        time_limit: q.time_limit,
        explanation: q.explanation ?? "",
      };
    });
    const csv = questionsToCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `questions-${competitionId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search questions…"
          className="max-w-xs"
        />
        <FilterSelect
          value={category}
          onChange={setCategory}
          placeholder="Category"
          options={categories.map((c) => ({ value: c, label: c }))}
        />
        <FilterSelect
          value={points}
          onChange={setPoints}
          placeholder="Points"
          options={pointOptions.map((p) => ({ value: String(p), label: String(p) }))}
        />
        <FilterSelect
          value={difficulty}
          onChange={setDifficulty}
          placeholder="Difficulty"
          options={difficulties.map((d) => ({ value: d, label: d }))}
        />
        <FilterSelect
          value={status}
          onChange={setStatus}
          placeholder="Status"
          options={Array.from(new Set(initialQuestions.map((q) => q.status))).map(
            (s) => ({ value: s, label: s.replaceAll("_", " ") })
          )}
        />

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download />
            Export
          </Button>
          {canManage && (
            <>
              <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
                <Upload />
                Bulk import
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus />
                Add question
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Question</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Difficulty</TableHead>
              <TableHead>Points</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {initialQuestions.length === 0
                    ? "No questions yet — add one or bulk import."
                    : "No questions match your filters."}
                </TableCell>
              </TableRow>
            )}
            {filtered.map((q) => {
              const editable = canManage && q.status === "AVAILABLE";
              return (
                <TableRow key={q.id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {q.question_number}
                  </TableCell>
                  <TableCell className="max-w-md">
                    <span className="line-clamp-2">{q.question_text}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {q.category ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {q.difficulty ?? "—"}
                  </TableCell>
                  <TableCell>
                    <span
                      className="inline-flex rounded-md px-2 py-0.5 text-xs font-bold text-white"
                      style={{ backgroundColor: q.point_color }}
                    >
                      {q.points.toLocaleString()}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {q.status.replaceAll("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        title="Preview"
                        onClick={() => setPreview(q)}
                      >
                        <Eye />
                      </Button>
                      {canManage && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title="Duplicate"
                            onClick={() => onDuplicate(q)}
                          >
                            <Copy />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={editable ? "Edit" : "Only available questions can be edited"}
                            disabled={!editable}
                            onClick={() => openEdit(q)}
                          >
                            <Pencil />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            title={editable ? "Delete" : "Only available questions can be deleted"}
                            disabled={!editable}
                            onClick={() => onDelete(q)}
                          >
                            <Trash2 />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {filtered.length} of {initialQuestions.length} question(s).
      </p>

      <QuestionFormDialog
        competitionId={competitionId}
        defaultTimer={defaultTimer}
        open={formOpen}
        onOpenChange={setFormOpen}
        question={editing}
      />
      <BulkImportDialog
        competitionId={competitionId}
        open={importOpen}
        onOpenChange={setImportOpen}
      />
      <QuestionPreviewDialog
        question={preview}
        open={preview !== null}
        onOpenChange={(o) => !o && setPreview(null)}
      />
    </div>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? ALL)}>
      <SelectTrigger size="sm" className="w-auto min-w-32" aria-label={placeholder}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All {placeholder.toLowerCase()}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
