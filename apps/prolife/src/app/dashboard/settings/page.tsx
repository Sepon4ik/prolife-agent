export default function SettingsPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <div className="space-y-6 max-w-2xl">
        {/* API Keys */}
        <SettingsSection title="API Configuration">
          <SettingsRow
            label="Anthropic API"
            value="Connected"
            status="active"
          />
          <SettingsRow
            label="Email Provider"
            value="Not configured"
            status="inactive"
          />
          <SettingsRow
            label="Stripe"
            value="Not configured"
            status="inactive"
          />
        </SettingsSection>

        {/* Scraping */}
        <SettingsSection title="Scraping Configuration">
          <SettingsRow
            label="Max concurrent jobs"
            value="3"
            status="neutral"
          />
          <SettingsRow
            label="Proxy"
            value="Not configured"
            status="inactive"
          />
        </SettingsSection>

        {/* Outreach */}
        <SettingsSection title="Outreach Configuration">
          <SettingsRow
            label="Auto-send emails"
            value="Disabled"
            status="inactive"
          />
          <SettingsRow
            label="Max follow-ups"
            value="3"
            status="neutral"
          />
          <SettingsRow
            label="Follow-up delay"
            value="5 days"
            status="neutral"
          />
        </SettingsSection>

        {/* Tenant */}
        <SettingsSection title="Organization">
          <p className="text-gray-400 text-sm">
            Multi-tenant settings will be available once authentication is configured.
          </p>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-dark-secondary rounded-lg border border-white/10 overflow-hidden">
      <div className="px-5 py-3 border-b border-white/10">
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </div>
  );
}

function SettingsRow({
  label,
  value,
  status,
}: {
  label: string;
  value: string;
  status: "active" | "inactive" | "neutral";
}) {
  const statusDot = {
    active: "bg-green-400",
    inactive: "bg-gray-500",
    neutral: "bg-blue-400",
  };

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-300">{label}</span>
      <div className="flex items-center gap-2">
        <span
          className={`w-1.5 h-1.5 rounded-full ${statusDot[status]}`}
        />
        <span className="text-sm text-gray-400">{value}</span>
      </div>
    </div>
  );
}
