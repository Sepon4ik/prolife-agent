"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Search,
  Mail,
  Newspaper,
  Settings,
  Zap,
  LogOut,
} from "lucide-react";
import { cn } from "@agency/ui";
import { useSession, signOut } from "@agency/auth/client";

const navItems = [
  { label: "Центр управления", href: "/dashboard", icon: LayoutDashboard },
  { label: "Пайплайн", href: "/dashboard/companies", icon: Building2 },
  { label: "Источники", href: "/dashboard/sources", icon: Search },
  { label: "Рассылка", href: "/dashboard/outreach", icon: Mail },
  { label: "Аналитика", href: "/dashboard/news", icon: Newspaper },
  { label: "Настройки", href: "/dashboard/settings", icon: Settings },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();

  async function handleLogout() {
    await signOut();
    router.push("/login");
  }

  return (
    <div className="flex min-h-screen bg-dark">
      {/* Sidebar */}
      <aside className="w-56 bg-dark-secondary border-r border-white/5 flex flex-col shrink-0">
        <div className="p-4 border-b border-white/5">
          <Link href="/dashboard" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white leading-none">
                ProLife
              </h2>
              <p className="text-[10px] text-gray-600 mt-0.5 tracking-wider uppercase">
                AI Агент
              </p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-2 space-y-0.5">
          {navItems.map((item) => {
            const isActive =
              item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-white/[0.08] text-white font-medium"
                    : "text-gray-400 hover:bg-white/[0.04] hover:text-gray-200"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 shrink-0",
                    isActive ? "text-primary-400" : "text-gray-500"
                  )}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-white/5">
          {session?.user ? (
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-gray-300 truncate">
                  {session.user.name ?? session.user.email}
                </p>
                <p className="text-[10px] text-gray-600 truncate">
                  {session.user.email}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-600 hover:text-gray-300 transition-colors shrink-0 p-1"
                title="Выйти"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="text-[10px] text-gray-600 text-center">
              ProLife AG &middot; Swiss MedTech
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
