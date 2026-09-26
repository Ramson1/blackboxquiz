import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-black text-2xl font-black text-white shadow-lg dark:bg-white dark:text-black">
          BX
        </div>
        <h1 className="text-4xl font-black tracking-tight sm:text-6xl">
          BLACKBOX QUIZ
        </h1>
        <p className="max-w-md text-balance text-muted-foreground">
          The live two-team academic competition platform for schools,
          universities, and organizations.
        </p>
      </div>

      <div className="flex gap-3">
        <Button size="lg" render={<Link href="/login" />}>
          Sign in
          <ArrowRight data-slot="icon" />
        </Button>
      </div>

      <footer className="absolute bottom-6 text-xs text-muted-foreground">
        Designed &amp; Developed by BlackBox Tech
      </footer>
    </main>
  );
}
