"use client";

import { useRef, useState } from "react";
import { Music, Upload, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { sound, type SoundMode } from "@/features/audio/sound-engine";
import type { SoundPrefs } from "@/features/audio/use-competition-sound";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "cn";

const MODES: { value: SoundMode; label: string; hint: string }[] = [
  { value: "builtin", label: "Arena mix", hint: "Built-in synth loop" },
  { value: "custom", label: "Custom track", hint: "Your uploaded audio" },
  { value: "off", label: "Music off", hint: "Event sounds only" },
];

/**
 * Operator-facing audio panel (top of the live console). Master toggle, music
 * mode (built-in arena mix / uploaded custom track / off) and volume. Custom
 * tracks are uploaded to Supabase Storage so they survive reloads and play on
 * the audience projector; if the upload fails (e.g. offline) we fall back to a
 * session-only object URL so the operator is never blocked.
 */
export function SoundControls({
  competitionId,
  prefs,
  setPrefs,
}: {
  competitionId: string;
  prefs: SoundPrefs;
  setPrefs: (patch: Partial<SoundPrefs>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const muted = !prefs.enabled;

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop()?.toLowerCase() || "mp3";
      const path = `${competitionId}/music/track-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("competition-assets")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (error) {
        // Offline / no storage access — fall back to a session object URL.
        const url = URL.createObjectURL(file);
        setPrefs({ musicUrl: url, musicName: file.name, mode: "custom", enabled: true });
        toast.warning("Saved for this session only", {
          description: "Couldn't upload to the cloud — reconnect to persist it.",
        });
        return;
      }
      const { data } = supabase.storage
        .from("competition-assets")
        .getPublicUrl(path);
      setPrefs({
        musicUrl: data.publicUrl,
        musicName: file.name,
        mode: "custom",
        enabled: true,
      });
      toast.success("Custom track ready", { description: file.name });
    } catch {
      toast.error("Could not load that audio file");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
          muted
            ? "text-muted-foreground hover:bg-muted"
            : "bg-muted/60 text-foreground hover:bg-muted"
        )}
        aria-label="Competition audio settings"
      >
        {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        <span className="hidden sm:inline">Audio</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 gap-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="font-semibold">Competition audio</p>
            <p className="text-xs text-muted-foreground">
              Music while live, plus event sounds.
            </p>
          </div>
          <Switch
            checked={prefs.enabled}
            onCheckedChange={(checked) => setPrefs({ enabled: checked })}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Music
          </span>
          <div className="grid grid-cols-3 gap-1.5">
            {MODES.map((m) => {
              const active = prefs.mode === m.value;
              const disabled = m.value === "custom" && !prefs.musicUrl;
              return (
                <button
                  key={m.value}
                  type="button"
                  disabled={disabled}
                  title={disabled ? "Upload a track first" : m.hint}
                  onClick={() => setPrefs({ mode: m.value, enabled: true })}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-2 text-center text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "hover:bg-muted",
                    disabled && "cursor-not-allowed opacity-40"
                  )}
                >
                  <Music className="size-4" />
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Button
              size="sm"
              variant="outline"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload />
              {uploading ? "Uploading…" : prefs.musicUrl ? "Replace track" : "Upload track"}
            </Button>
            {prefs.musicUrl && (
              <button
                type="button"
                onClick={() =>
                  setPrefs({ musicUrl: null, musicName: null, mode: "off" })
                }
                className="text-xs font-medium text-muted-foreground hover:text-red-600"
              >
                Remove
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void handleFile(f);
            }}
          />
          <p className="truncate text-xs text-muted-foreground">
            {prefs.musicUrl
              ? `Now selected: ${prefs.musicName ?? "custom track"}`
              : "No custom track uploaded — using the built-in mix."}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Volume</span>
            <span>{Math.round(prefs.volume * 100)}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(prefs.volume * 100)}
            onChange={(e) => setPrefs({ volume: Number(e.target.value) / 100 })}
            className="w-full accent-primary"
          />
        </div>

        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-center"
          onClick={() => sound.playCue("reveal")}
        >
          Test sound
        </Button>
      </PopoverContent>
    </Popover>
  );
}
