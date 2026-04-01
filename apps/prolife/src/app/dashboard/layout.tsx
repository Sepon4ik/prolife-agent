import Link from "next/link";

const navItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Companies", href: "/dashboard/companies" },
  { label: "Sources", href: "/dashboard/sources" },
  { label: "Outreach", href: "/dashboard/outreach" },
  { label: "Settings", href: "/dashboard/settings" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-dark-secondary border-r border-white/10 p-4">
        <div className="mb-8">
          <h2 className="text-xl font-bold text-primary-600">ProLife</h2>
          <p className="text-xs text-gray-400">AI Distributor Agent</p>
        </div>
        <nav className="space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-dark-tertiary hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
