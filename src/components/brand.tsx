import Link from "next/link";
import Image from "next/image";
import { Mail, Globe } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** The official BlackBox hex mark, rendered as a rounded badge tile. */
export function BlackBoxLogo({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 overflow-hidden rounded-xl bg-black shadow-sm ring-1 ring-black/10 dark:ring-white/15",
        className
      )}
    >
      <Image
        src={BRAND.logo}
        alt={`${BRAND.company} logo`}
        width={480}
        height={299}
        priority
        className="size-full object-cover"
      />
    </span>
  );
}

/** BlackBox brand mark used across auth/live screens (spec §4). */
export function BrandMark({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-16 w-16 rounded-2xl" : "h-11 w-11";
  const title = size === "lg" ? "text-4xl sm:text-5xl" : "text-xl";
  return (
    <Link
      href="/"
      className="group flex flex-col items-center gap-2.5 text-center select-none"
    >
      <BlackBoxLogo
        className={cn(
          box,
          "transition-transform duration-300 group-hover:scale-[1.04] group-hover:shadow-lg group-hover:shadow-primary/25"
        )}
      />
      <span className={`${title} font-black tracking-tight`}>
        BLACKBOX <span className="text-primary">QUIZ</span>
      </span>
    </Link>
  );
}

/**
 * Site-wide brand footer: attribution, website and contact email.
 * Compact enough for the sidebar, works on any surface.
 */
export function BrandFooter({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-1 text-center",
        className
      )}
    >
      <p className="text-xs text-muted-foreground">
        Designed &amp; Developed by{" "}
        <a
          href={BRAND.website}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-foreground underline-offset-4 hover:underline"
        >
          {BRAND.company}
        </a>
      </p>
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        <a
          href={BRAND.website}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 transition-colors hover:text-primary"
        >
          <Globe className="size-3" />
          {BRAND.websiteLabel}
        </a>
        <a
          href={`mailto:${BRAND.email}`}
          className="inline-flex items-center gap-1 transition-colors hover:text-primary"
        >
          <Mail className="size-3" />
          {BRAND.email}
        </a>
      </div>
    </div>
  );
}
