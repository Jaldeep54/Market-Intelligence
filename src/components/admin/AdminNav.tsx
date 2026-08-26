"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOutAction } from "@/lib/actions/auth";

const ITEMS = [
  { label: "Dashboard", href: "/admin" },
  { label: "News Management", href: "/admin/news" },
  { label: "Add News", href: "/admin/news/new" },
  { label: "News Inbox", href: "/admin/inbox" },
  { label: "Admin News View", href: "/admin/review" },
  { label: "News Sources", href: "/admin/sources" },
  { label: "Automation", href: "/admin/automation" },
  { label: "Company Management", href: "/admin/companies" },
  { label: "Users", href: "/admin/users" },
];

export function AdminNav({ email }: { email: string | null }) {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div className="flex items-center gap-1 overflow-x-auto px-3 py-2.5 sm:px-6">
        <span className="mr-2 shrink-0 text-sm font-semibold text-foreground">
          Market Intelligence <span className="text-muted">· Admin</span>
        </span>
        {ITEMS.map((item) => {
          const isActive =
            item.href === "/admin" ? pathname === "/admin" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted hover:bg-background hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {email && <span className="hidden text-xs text-muted sm:inline">{email}</span>}
          <Link
            href="/"
            className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
          >
            Viewer site
          </Link>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-background"
            >
              Sign out
            </button>
          </form>
        </div>
      </div>
    </nav>
  );
}
