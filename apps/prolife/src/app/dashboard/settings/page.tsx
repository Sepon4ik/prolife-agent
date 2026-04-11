import { Card } from "@agency/ui";
import {
  Key,
  Search,
  Mail,
  Building2,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="p-6 lg:p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Настройки</h1>
        <p className="text-gray-500 text-xs mt-0.5">
          Конфигурация системы и интеграции
        </p>
      </div>

      <div className="space-y-5">
        <SettingsSection title="API Конфигурация" icon={<Key className="w-4 h-4" />}>
          <SettingsRow label="Anthropic API" value="Подключено" status="active" />
          <SettingsRow label="Email провайдер" value="Не настроено" status="inactive" />
          <SettingsRow label="Stripe" value="Не настроено" status="inactive" />
        </SettingsSection>

        <SettingsSection title="Скрейпинг" icon={<Search className="w-4 h-4" />}>
          <SettingsRow label="Макс. параллельных задач" value="3" status="neutral" />
          <SettingsRow label="Прокси" value="Не настроено" status="inactive" />
        </SettingsSection>

        <SettingsSection title="Рассылка" icon={<Mail className="w-4 h-4" />}>
          <SettingsRow label="Авто-отправка писем" value="Выключено" status="inactive" />
          <SettingsRow label="Макс. фоллоу-апов" value="3" status="neutral" />
          <SettingsRow label="Задержка фоллоу-апа" value="5 дней" status="neutral" />
        </SettingsSection>

        <SettingsSection title="Организация" icon={<Building2 className="w-4 h-4" />}>
          <p className="text-gray-500 text-xs">
            Настройки мультитенанта будут доступны после настройки авторизации.
          </p>
        </SettingsSection>
      </div>
    </div>
  );
}

function SettingsSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2">
        <span className="text-gray-500">{icon}</span>
        <h2 className="text-sm font-semibold text-gray-300">{title}</h2>
      </div>
      <div className="p-5 space-y-3">{children}</div>
    </Card>
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
  const icons = {
    active: <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />,
    inactive: <XCircle className="w-3.5 h-3.5 text-gray-600" />,
    neutral: <Info className="w-3.5 h-3.5 text-blue-400" />,
  };

  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-gray-300">{label}</span>
      <div className="flex items-center gap-2">
        {icons[status]}
        <span className="text-sm text-gray-400">{value}</span>
      </div>
    </div>
  );
}
