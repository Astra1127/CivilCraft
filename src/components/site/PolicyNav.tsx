import { Link, useRouterState } from "@tanstack/react-router";
import { Cookie, FileText, Scale, ShieldAlert } from "lucide-react";

export interface TocItem {
  id: string;
  title: string;
}

export function PolicyTabs() {
  const router = useRouterState();
  const currentPath = router.location.pathname;

  const links = [
    { to: "/terms" as const, label: "Terms of Use", icon: Scale },
    { to: "/privacy" as const, label: "Privacy Policy", icon: FileText },
    { to: "/cookies" as const, label: "Cookie Policy", icon: Cookie },
  ];

  return (
    <nav
      aria-label="Legal and policy documents"
      className="flex flex-wrap gap-2 pb-6 border-b border-border"
    >
      {links.map((link) => {
        const active = currentPath === link.to;
        const Icon = link.icon;
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all ${
              active
                ? "bg-gold text-stone-900 shadow-sm"
                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{link.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DraftReviewNotice({ documentTitle }: { documentTitle: string }) {
  return (
    <div
      role="note"
      className="rounded-xl border border-amber-600/30 bg-amber-500/10 p-4 sm:p-5 text-xs sm:text-sm text-foreground/90 space-y-2"
    >
      <div className="flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-400">
        <ShieldAlert className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
        <span>Academic Project Review Draft</span>
      </div>
      <p className="text-muted-foreground text-xs leading-relaxed">
        This <strong>{documentTitle}</strong> is an institutional draft prepared for the CivilCraft:
        Bridge Edition student capstone research project. It accurately reflects the actual
        technical implementation, data flows, and backend services in compliance with{" "}
        <strong>Republic Act No. 10173 (Philippine Data Privacy Act of 2012)</strong>. Final
        commercial, licensing, and institutional provisions remain subject to formal review and
        approval by the academic research team and institutional advisors.
      </p>
    </div>
  );
}

export function TableOfContents({ items }: { items: TocItem[] }) {
  return (
    <nav
      aria-label="Table of contents"
      className="paper-panel p-4 sm:p-5 space-y-3 sticky top-24 self-start max-h-[calc(100vh-8rem)] overflow-y-auto"
    >
      <div className="flex items-center justify-between pb-2 border-b border-border">
        <h2 className="font-display text-sm uppercase tracking-wider text-foreground">Contents</h2>
        <span className="text-[11px] font-bold text-gold">{items.length} sections</span>
      </div>
      <ul className="space-y-1 text-xs">
        {items.map((item, idx) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="group flex items-start gap-2 py-1 text-muted-foreground hover:text-gold transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded px-1"
            >
              <span className="text-[10px] font-bold text-gold/70 mt-0.5 w-4 shrink-0">
                {String(idx + 1).padStart(2, "0")}
              </span>
              <span className="leading-snug">{item.title}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
