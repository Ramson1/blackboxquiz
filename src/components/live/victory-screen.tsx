"use client";

import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { animate, motion, useReducedMotion } from "framer-motion";
import { Crown, Medal, Sparkles, Trophy } from "lucide-react";

type TeamScore = {
  id: string;
  name: string;
  color: string;
  currentScore: number;
};

const CONFETTI_COLORS = [
  "#fbbf24", // amber
  "#38bdf8", // sky
  "#f472b6", // pink
  "#4ade80", // green
  "#a78bfa", // violet
  "#ffffff", // white
];

/**
 * Victory celebration (spec §51). When the competition ends with a winner the
 * whole panel turns into a champion takeover: falling confetti, a glowing
 * trophy with an orbiting dashed ring, the winning team's name in their color
 * and a count-up of their final score. A draw gets a calm, symmetrical panel
 * instead. Honors prefers-reduced-motion by dropping looping animations.
 */
export function VictoryScreen({
  teams,
  children,
}: {
  teams: TeamScore[];
  children?: React.ReactNode;
}) {
  const [a, b] = teams;
  const winner =
    a && b && a.currentScore !== b.currentScore
      ? a.currentScore > b.currentScore
        ? a
        : b
      : null;
  const runnerUp = winner ? (teams.find((t) => t.id !== winner.id) ?? null) : null;

  return winner ? (
    <ChampionPanel winner={winner} runnerUp={runnerUp}>
      {children}
    </ChampionPanel>
  ) : (
    <TiePanel teams={teams.filter(Boolean)}>{children}</TiePanel>
  );
}

function ChampionPanel({
  winner,
  runnerUp,
  children,
}: {
  winner: TeamScore;
  runnerUp: TeamScore | null;
  children?: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <div
      className="relative flex flex-col items-center gap-6 overflow-hidden rounded-3xl border-2 px-6 py-10 text-center sm:py-14"
      style={{
        borderColor: `${winner.color}66`,
        backgroundImage: `radial-gradient(120% 90% at 50% -10%, ${winner.color}2e, transparent 70%)`,
      }}
    >
      {!reduce && <Confetti tint={winner.color} />}

      {/* Breathing glow behind the trophy */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-24 size-72 -translate-x-1/2 rounded-full"
        style={{ backgroundColor: `${winner.color}33` }}
        animate={reduce ? undefined : { opacity: [0.35, 0.7, 0.35], scale: [0.9, 1.1, 0.9] }}
        transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* Trophy badge with an orbiting dashed ring */}
        <div className="relative flex size-28 items-center justify-center rounded-full sm:size-32">
          {!reduce && (
            <motion.div
              aria-hidden
              className="absolute inset-[-16px] rounded-full border-4 border-dashed"
              style={{ borderColor: `${winner.color}59` }}
              animate={{ rotate: 360 }}
              transition={{ duration: 16, repeat: Infinity, ease: "linear" }}
            />
          )}
          <motion.div
            className="flex size-full items-center justify-center rounded-full"
            style={{
              backgroundColor: `${winner.color}2e`,
              boxShadow: `0 0 90px 8px ${winner.color}66`,
            }}
            initial={{ scale: 0, rotate: -60 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 160, damping: 13, delay: 0.15 }}
          >
            <Trophy className="size-14 sm:size-16" style={{ color: winner.color }} />
          </motion.div>
        </div>

        {/* Champions pill */}
        <motion.span
          className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-black uppercase tracking-[0.3em] text-white"
          style={{
            backgroundColor: winner.color,
            boxShadow: `0 10px 30px -10px ${winner.color}`,
          }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5, duration: 0.4 }}
        >
          <Crown className="size-4" /> Champions
        </motion.span>

        {/* Team name — big, in team color, blur-in */}
        <motion.h2
          className="max-w-full text-5xl font-black leading-[1.05] tracking-tight sm:text-6xl"
          style={{ color: winner.color, textShadow: `0 8px 40px ${winner.color}59` }}
          initial={{ opacity: 0, filter: "blur(14px)", y: 12 }}
          animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={{ delay: 0.6, duration: 0.6, ease: "easeOut" }}
        >
          {winner.name}
        </motion.h2>

        {!reduce && (
          <motion.p
            className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-muted-foreground"
            animate={{ opacity: [0.55, 1, 0.55] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          >
            <Sparkles className="size-4 text-amber-400" />
            Winning the competition
            <Sparkles className="size-4 text-amber-400" />
          </motion.p>
        )}

        {/* Final score count-up */}
        <motion.div
          className="flex flex-col items-center gap-1"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.85, type: "spring", stiffness: 140, damping: 14 }}
        >
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Final score
          </span>
          <CountUp
            value={winner.currentScore}
            className="text-6xl font-black tabular-nums sm:text-7xl"
            style={{ color: winner.color }}
          />
          <span className="text-sm font-semibold text-muted-foreground">points</span>
        </motion.div>

        {runnerUp && (
          <motion.div
            className="flex items-center gap-3 rounded-2xl border bg-card/70 px-5 py-3 backdrop-blur"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15, duration: 0.5 }}
          >
            <Medal className="size-5 shrink-0 text-muted-foreground" />
            <span className="text-sm font-semibold text-muted-foreground">
              Runner-up:{" "}
              <span style={{ color: runnerUp.color }}>{runnerUp.name}</span>
            </span>
            <span className="text-sm font-black tabular-nums text-muted-foreground">
              {runnerUp.currentScore.toLocaleString()} pts
            </span>
          </motion.div>
        )}

        {children && <div className="relative z-10 flex flex-wrap justify-center gap-2 pt-1">{children}</div>}
      </div>
    </div>
  );
}

function TiePanel({
  teams,
  children,
}: {
  teams: TeamScore[];
  children?: React.ReactNode;
}) {
  return (
    <div className="relative flex flex-col items-center gap-6 overflow-hidden rounded-3xl border-2 px-6 py-12 text-center">
      <motion.div
        className="flex size-24 items-center justify-center rounded-full bg-muted"
        initial={{ scale: 0, rotate: -45 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 13 }}
      >
        <Trophy className="size-12 text-muted-foreground" />
      </motion.div>
      <motion.h2
        className="text-4xl font-black tracking-tight sm:text-5xl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
      >
        It&apos;s a tie!
      </motion.h2>
      <div className="flex flex-wrap items-center justify-center gap-4">
        {teams.map((t) => (
          <div
            key={t.id}
            className="flex items-center gap-3 rounded-2xl border-2 px-5 py-3"
            style={{ borderColor: t.color, backgroundColor: `${t.color}14` }}
          >
            <span className="truncate text-lg font-black" style={{ color: t.color }}>
              {t.name}
            </span>
            <span className="text-lg font-black tabular-nums">
              {t.currentScore.toLocaleString()}
            </span>
          </div>
        ))}
      </div>
      {children && <div className="flex flex-wrap justify-center gap-2 pt-1">{children}</div>}
    </div>
  );
}

/** mulberry32 — seeded PRNG so confetti stays pure/deterministic per render. */
function seededRandom(seed: number) {
  let t = seed;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic-per-mount confetti rain in the winner's color + party mix. */
function Confetti({ tint }: { tint: string }) {
  const pieces = useMemo(() => {
    let seed = 7;
    for (let i = 0; i < tint.length; i++) seed = (seed * 31 + tint.charCodeAt(i)) | 0;
    const rand = seededRandom(seed);
    return Array.from({ length: 70 }, (_, i) => ({
      id: i,
      left: rand() * 100,
      width: 6 + rand() * 7,
      height: 8 + rand() * 8,
      color:
        i % 4 === 0
          ? tint
          : CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)],
      delay: -rand() * 5,
      duration: 3.5 + rand() * 3.5,
      drift: (rand() - 0.5) * 90,
      spin: 240 + rand() * 720,
      round: rand() > 0.65,
    }));
  }, [tint]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute block"
          style={{
            left: `${p.left}%`,
            top: -20,
            width: p.width,
            height: p.round ? p.width : p.height,
            backgroundColor: p.color,
            borderRadius: p.round ? "9999px" : "2px",
          }}
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 640, x: [0, p.drift, 0], rotate: p.spin, opacity: [0, 1, 1, 0.85] }}
          transition={{ duration: p.duration, delay: p.delay, repeat: Infinity, ease: "linear" }}
        />
      ))}
    </div>
  );
}

/** Animates 0 → value once on mount; writes text directly (no state churn). */
function CountUp({
  value,
  className,
  style,
}: {
  value: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.textContent = "0";
    const controls = animate(0, value, {
      duration: 1.6,
      delay: 0.9,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = Math.round(v).toLocaleString();
      },
    });
    return () => controls.stop();
  }, [value]);

  return (
    <span ref={ref} className={className} style={style}>
      0
    </span>
  );
}
