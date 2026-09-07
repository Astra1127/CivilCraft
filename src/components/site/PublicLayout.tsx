import { SiteFooter } from "./SiteFooter";
import { SiteNavbar } from "./SiteNavbar";

export function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <SiteNavbar />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
