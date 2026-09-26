"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
} from "lucide-react";
import { downloadCompetitionPackageAction } from "@/features/offline/actions";
import { setCompetitionStatusAction } from "@/features/competitions/actions";
import {
  checkCompleteness,
  getPackage,
  savePackage,
  type CompletenessReport,
} from "@/lib/offline/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Downloads the full competition package into IndexedDB for offline operation
 * and shows the §31 "Competition Ready" verification screen. The server lifecycle
 * is advanced (READY → DOWNLOADING → DOWNLOADED) best-effort — illegal transitions
 * are ignored so offline capability never depends on lifecycle state.
 */
export function DownloadPanel({
  competitionId,
  offlineHref,
  onComplete,
}: {
  competitionId: string;
  offlineHref?: string;
  onComplete?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<CompletenessReport | null>(null);

  const refresh = useCallback(async () => {
    const pkg = await getPackage(competitionId);
    setReport(checkCompleteness(pkg));
  }, [competitionId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pkg = await getPackage(competitionId);
      if (!cancelled) setReport(checkCompleteness(pkg));
    })();
    return () => {
      cancelled = true;
    };
  }, [competitionId]);

  async function handleDownload() {
    setBusy(true);
    try {
      // Best-effort lifecycle markers (ignored if not a legal transition).
      await setCompetitionStatusAction({
        competitionId,
        status: "DOWNLOADING",
      });
      const res = await downloadCompetitionPackageAction(competitionId);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      await savePackage(res.pkg);
      const r = checkCompleteness(res.pkg);
      if (r.ok) {
        await setCompetitionStatusAction({
          competitionId,
          status: "DOWNLOADED",
        });
        toast.success("Competition downloaded for offline play");
      } else {
        toast.warning("Downloaded, but package is incomplete", {
          description: r.issues[0],
        });
      }
      await refresh();
      onComplete?.();
    } finally {
      setBusy(false);
    }
  }

  const ready = report?.ok ?? false;

  return (
    <Card className={ready ? "border-emerald-500/40" : undefined}>
      <CardContent className="flex flex-col gap-4 py-5">
        <div className="flex items-center gap-2">
          {busy ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : ready ? (
            <CheckCircle2 className="size-5 text-emerald-600" />
          ) : (
            <AlertTriangle className="size-5 text-amber-600" />
          )}
          <h3 className="font-bold">
            {ready ? "Competition Ready" : "Offline package"}
          </h3>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <Row label="Questions" value={`${report?.questions ?? 0}`} />
          <Row label="Teams" value={`${report?.teams ?? 0}/2`} />
          <Row label="Options" value={`${report?.options ?? 0}`} />
          <Row
            label="Offline Mode"
            value={busy ? "DOWNLOADING…" : ready ? "READY" : "NOT READY"}
          />
        </div>

        {!ready && report && report.issues.length > 0 && (
          <ul className="flex flex-col gap-1 text-xs text-red-600">
            {report.issues.map((issue) => (
              <li key={issue}>• {issue}</li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={handleDownload} disabled={busy}>
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Download />
            )}
            {ready ? "Re-download package" : "Download for offline"}
          </Button>
          {ready && offlineHref && (
            <Button
              variant="outline"
              render={<Link href={offlineHref} />}
            >
              Open offline console
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}
