export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Companies Found" value="0" />
        <StatCard title="Enriched" value="0" />
        <StatCard title="Emails Sent" value="0" />
        <StatCard title="Replies" value="0" />
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-dark-secondary rounded-lg p-6 border border-white/10">
          <h2 className="text-xl font-semibold mb-4">Recent Scraping Jobs</h2>
          <p className="text-gray-400">No scraping jobs yet. Start one from the Sources page.</p>
        </div>
        <div className="bg-dark-secondary rounded-lg p-6 border border-white/10">
          <h2 className="text-xl font-semibold mb-4">Pipeline Overview</h2>
          <p className="text-gray-400">Pipeline will show here once companies are discovered.</p>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-dark-secondary rounded-lg p-6 border border-white/10">
      <p className="text-sm text-gray-400">{title}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
    </div>
  );
}
