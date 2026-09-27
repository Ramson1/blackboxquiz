import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { BlackBoxLogo, BrandFooter } from "@/components/brand";

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-14 overflow-hidden p-8 text-center">
      {/* Ambient glow behind the hero */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-120px] h-[460px] w-[780px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      </div>

      <div className="flex flex-col items-center gap-6">
        <BlackBoxLogo className="h-24 w-24 rounded-3xl shadow-xl shadow-primary/25" />
        <h1 className="text-6xl font-black tracking-tight text-balance sm:text-8xl">
          BLACK-BOX
        </h1>
        <p className="text-xl font-semibold uppercase tracking-[0.35em] text-primary sm:text-2xl">
          Competition Software
        </p>
      </div>

      {/* The single, bold entry point into the competition screens.
          Unauthenticated visitors are redirected through login by the proxy. */}
      <Link
        href="/competitions"
        className="group relative inline-flex items-center gap-4 rounded-2xl bg-gradient-to-r from-primary via-sky-500 to-primary bg-[length:200%_100%] px-12 py-6 text-2xl font-extrabold uppercase tracking-widest text-primary-foreground shadow-2xl shadow-primary/40 transition-all duration-300 hover:-translate-y-1 hover:bg-[position:100%_0] hover:shadow-primary/60 active:translate-y-0 sm:text-3xl"
      >
        <span
          aria-hidden
          className="absolute -inset-1 -z-10 rounded-3xl bg-gradient-to-r from-primary via-sky-500 to-primary bg-[length:200%_100%] opacity-40 blur-lg transition-all duration-300 group-hover:opacity-70 group-hover:bg-[position:100%_0]"
        />
        Enter Competition Screens
        <ArrowRight className="size-7 transition-transform duration-300 group-hover:translate-x-1.5" />
      </Link>

      <footer className="absolute bottom-6">
        <BrandFooter />
      </footer>
    </main>
  );
}
