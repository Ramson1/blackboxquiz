import Link from "next/link";
import { ArrowRight, Mail, ShieldCheck, Wifi, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BlackBoxLogo, BrandFooter } from "@/components/brand";
import { BRAND } from "@/lib/brand";

export default function Home() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center gap-10 overflow-hidden p-8 text-center">
      {/* Ambient glow behind the hero */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-120px] h-[440px] w-[760px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      </div>

      <div className="flex flex-col items-center gap-5">
        <BlackBoxLogo className="h-20 w-20 rounded-3xl shadow-xl shadow-primary/25" />
        <h1 className="text-5xl font-black tracking-tight text-balance sm:text-7xl">
          BLACKBOX{" "}
          <span className="bg-gradient-to-r from-primary via-sky-500 to-primary bg-clip-text text-transparent">
            QUIZ
          </span>
        </h1>
        <p className="max-w-lg text-balance text-base text-muted-foreground sm:text-lg">
          The live two-team academic competition platform for schools,
          universities, and organizations — built for flawless events, even
          offline.
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs font-medium">
          {[
            { icon: Wifi, label: "Offline-first" },
            { icon: Zap, label: "Real-time scoring" },
            { icon: ShieldCheck, label: "Secure & audited" },
          ].map((chip) => (
            <span
              key={chip.label}
              className="inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-muted-foreground shadow-xs"
            >
              <chip.icon className="size-3.5 text-primary" />
              {chip.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" render={<Link href="/login" />}>
          Sign in
          <ArrowRight data-slot="icon" />
        </Button>
        <Button
          size="lg"
          variant="outline"
          render={
            <a
              href={BRAND.website}
              target="_blank"
              rel="noopener noreferrer"
            />
          }
        >
          {BRAND.websiteLabel}
        </Button>
        <Button
          size="lg"
          variant="ghost"
          render={<a href={`mailto:${BRAND.email}`} />}
        >
          <Mail data-slot="icon" />
          Contact us
        </Button>
      </div>

      <footer className="absolute bottom-6">
        <BrandFooter />
      </footer>
    </main>
  );
}
