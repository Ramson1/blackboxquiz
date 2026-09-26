"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandFooter } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";

export type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function DashboardShell({
  nav,
  areaLabel,
  user,
  children,
}: {
  nav: NavItem[];
  areaLabel: string;
  user: { name: string; email: string | null; role: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const links = (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-svh flex-1">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-14 items-center gap-2 border-b px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-black text-[10px] font-black text-white dark:bg-white dark:text-black">
            BX
          </span>
          <div className="leading-tight">
            <p className="text-sm font-black tracking-tight">BLACKBOX QUIZ</p>
            <p className="text-[10px] text-muted-foreground">{areaLabel}</p>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">{links}</div>
        <div className="border-t p-4">
          <BrandFooter />
        </div>
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close menu"
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col bg-background shadow-xl">
            <div className="flex h-14 items-center justify-between border-b px-4">
              <p className="text-sm font-black">BLACKBOX QUIZ</p>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">{links}</div>
            <div className="border-t p-4">
              <BrandFooter />
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b px-4">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu />
          </Button>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{user.name}</p>
              <p className="text-xs text-muted-foreground">
                {user.role.replaceAll("_", " ")}
              </p>
            </div>
            <form action={signOutAction}>
              <Button type="submit" variant="outline" size="sm">
                Sign out
              </Button>
            </form>
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
