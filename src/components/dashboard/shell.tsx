"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Building2,
  Circle,
  LayoutDashboard,
  Link2,
  Menu,
  MonitorPlay,
  PanelLeft,
  PanelLeftClose,
  Trophy,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BlackBoxLogo, BrandFooter } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/actions";

/**
 * Icon keys are plain strings so server layouts can pass `nav` into this
 * client component — React components aren't serializable across the boundary.
 */
const NAV_ICONS = {
  dashboard: LayoutDashboard,
  organizations: Building2,
  trophy: Trophy,
  users: Users,
  workspace: MonitorPlay,
  link: Link2,
} as const;

export type NavIcon = keyof typeof NAV_ICONS;

export type NavItem = {
  label: string;
  href: string;
  icon: NavIcon;
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
  // Desktop sidebar collapse — remembered across sessions per browser.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("bbq-sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem("bbq-sidebar-collapsed", next ? "1" : "0");
    } catch {
      // Private mode — the toggle still works for this session.
    }
  };

  const links = (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = NAV_ICONS[item.icon] ?? Circle;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={cn(
              "group flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-primary/10 text-primary font-semibold shadow-xs"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 transition-colors",
                active && "text-primary"
              )}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex min-h-svh flex-1">
      {/* Desktop sidebar — collapsible via the header toggle */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col overflow-hidden border-r bg-sidebar transition-[width] duration-300 ease-out lg:flex",
          collapsed ? "w-0 border-r-0" : "w-60"
        )}
      >
        <div className="flex w-60 flex-1 flex-col">
          <div className="flex h-14 items-center gap-2.5 border-b px-4">
            <BlackBoxLogo className="h-8 w-8 rounded-lg" />
            <div className="leading-tight">
              <p className="text-sm font-black tracking-tight">
                BLACKBOX <span className="text-primary">QUIZ</span>
              </p>
              <p className="text-[10px] text-muted-foreground">{areaLabel}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto text-muted-foreground"
              onClick={toggleSidebar}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
            >
              <PanelLeftClose />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">{links}</div>
          <div className="border-t p-4">
            <BrandFooter />
          </div>
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
              <div className="flex items-center gap-2">
                <BlackBoxLogo className="h-7 w-7 rounded-lg" />
                <p className="text-sm font-black">
                  BLACKBOX <span className="text-primary">QUIZ</span>
                </p>
              </div>
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
        <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-md lg:bg-background/60">
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <PanelLeft />
          </Button>
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
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary ring-1 ring-primary/20">
              {user.name
                .split(/\s+/)
                .map((part) => part[0])
                .slice(0, 2)
                .join("")
                .toUpperCase() || "?"}
            </span>
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
