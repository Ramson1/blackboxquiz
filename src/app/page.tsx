import { BlackBoxLogo, BrandFooter } from "@/components/brand";
import { StartCompetitionDialog } from "@/components/public/start-competition";

/**
 * Home screen (public): brand splash + the single entry point. Students and
 * hosts only need one action — Start Competition (title + admin password).
 * Server-side auth redirects live in src/proxy.ts; this page stays static so
 * it keeps working offline and inside the PWA shell precache. Admins use
 * /login directly — no sign-in affordance here on purpose.
 */
export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-10 overflow-hidden p-8 text-center">
      {/* Vibrant ambient wash: slow-drifting gradient blobs over the base glow. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-140px] h-[460px] w-[780px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute -left-24 bottom-[-120px] h-[380px] w-[380px] animate-pulse rounded-full bg-sky-400/15 blur-3xl [animation-duration:6s]" />
        <div className="absolute -right-24 top-1/3 h-[340px] w-[340px] animate-pulse rounded-full bg-fuchsia-500/12 blur-3xl [animation-duration:8s]" />
      </div>

      <div className="flex flex-col items-center gap-5">
        <BlackBoxLogo className="h-20 w-20 rounded-3xl shadow-xl shadow-primary/25" />
        <h1 className="text-5xl font-black tracking-tight text-balance sm:text-7xl">
          BLACK-BOX
        </h1>
        <p className="text-lg font-semibold uppercase tracking-[0.35em] text-primary sm:text-xl">
          Competition Software
        </p>
        <p className="max-w-md text-sm text-balance text-muted-foreground sm:text-base">
          Two teams. One board. A thousand points on the line — bring the
          buzzers, we&apos;ll handle the rest. ⚡
        </p>
      </div>

      <StartCompetitionDialog />

      <footer className="absolute bottom-6">
        <BrandFooter />
      </footer>
    </main>
  );
}
