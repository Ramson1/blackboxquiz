import Link from "next/link";

/** BlackBox brand mark used across auth/live screens (spec §4). */
export function BrandMark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-16 w-16 text-2xl" : "h-10 w-10 text-base";
  const title = size === "lg" ? "text-4xl sm:text-5xl" : "text-2xl";
  return (
    <Link href="/" className="flex flex-col items-center gap-2 select-none">
      <span
        className={`${box} flex items-center justify-center rounded-2xl bg-black font-black text-white shadow-lg dark:bg-white dark:text-black`}
      >
        BX
      </span>
      <span className={`${title} font-black tracking-tight`}>
        BLACKBOX QUIZ
      </span>
    </Link>
  );
}

export function BrandFooter() {
  return (
    <p className="text-center text-xs text-muted-foreground">
      Designed &amp; Developed by{" "}
      <span className="font-semibold text-foreground">BlackBox Tech</span>
    </p>
  );
}
