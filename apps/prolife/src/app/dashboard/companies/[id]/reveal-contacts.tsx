"use client";

import { useState } from "react";
import {
  Users,
  Lock,
  Eye,
  Mail,
  Phone,
  Linkedin,
  Loader2,
} from "lucide-react";

type Contact = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  photoUrl: string | null;
  bio: string | null;
  languages: string[];
  isPrimary: boolean;
  linkedinHeadline: string | null;
  linkedinSeniority: string | null;
  linkedinDepartment: string | null;
};

export function RevealContacts({
  companyId,
  contactCount,
}: {
  companyId: string;
  contactCount: number;
}) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealInfo, setRevealInfo] = useState<{
    used: number;
    limit: number;
  } | null>(null);

  async function handleReveal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reveals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка при загрузке контактов");
        if (data.used !== undefined) {
          setRevealInfo({ used: data.used, limit: data.limit });
        }
        return;
      }
      setContacts(data.contacts);
      if (data.revealsUsed !== undefined) {
        setRevealInfo({ used: data.revealsUsed, limit: data.revealsLimit });
      }
    } catch {
      setError("Ошибка сети");
    } finally {
      setLoading(false);
    }
  }

  if (contactCount === 0) {
    return (
      <div className="py-6 text-center">
        <Users className="w-8 h-8 text-gray-700 mx-auto mb-2" />
        <p className="text-gray-600 text-xs">Контактов пока нет</p>
      </div>
    );
  }

  if (contacts) {
    return (
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-white">
            Контакты ({contacts.length})
          </h2>
          {revealInfo && (
            <span className="text-[10px] text-gray-600 tabular-nums">
              Просмотров: {revealInfo.used}/{revealInfo.limit}
            </span>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className="p-3 rounded-lg bg-white/[0.02] border border-white/5"
            >
              <div className="flex items-start gap-3">
                {contact.photoUrl ? (
                  <img
                    src={contact.photoUrl}
                    alt={contact.name}
                    className="w-9 h-9 rounded-full object-cover border border-white/10 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-dark-tertiary flex items-center justify-center shrink-0 border border-white/10">
                    <span className="text-[10px] text-gray-500 font-medium">
                      {contact.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {contact.name}
                    </span>
                    {contact.isPrimary && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-primary-500/20 text-primary-400 shrink-0">
                        PRIMARY
                      </span>
                    )}
                  </div>
                  {contact.title && (
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {contact.title}
                    </div>
                  )}
                  {contact.bio && (
                    <div className="text-[11px] text-gray-500 mt-1 leading-relaxed italic line-clamp-2">
                      &ldquo;{contact.bio}&rdquo;
                    </div>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {contact.email && (
                      <a
                        href={`mailto:${contact.email}`}
                        className="text-gray-500 hover:text-primary-400 transition-colors"
                        title={contact.email}
                      >
                        <Mail className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        className="text-gray-500 hover:text-primary-400 transition-colors"
                        title={contact.phone}
                      >
                        <Phone className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {contact.linkedin && (
                      <a
                        href={contact.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-500 hover:text-blue-400 transition-colors"
                      >
                        <Linkedin className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  {contact.languages.length > 0 && (
                    <div className="flex gap-1 mt-2">
                      {contact.languages.map((lang) => (
                        <span
                          key={lang}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 text-gray-500"
                        >
                          {lang}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="py-8 text-center">
      <Lock className="w-8 h-8 text-gray-700 mx-auto mb-3" />
      <p className="text-sm text-gray-400 mb-1">
        {contactCount} контакт{contactCount === 1 ? "" : contactCount < 5 ? "а" : "ов"}
      </p>
      <p className="text-xs text-gray-600 mb-4">
        Контактные данные скрыты. Нажмите для просмотра.
      </p>
      {error && <p className="text-xs text-red-400 mb-3">{error}</p>}
      {revealInfo && (
        <p className="text-[10px] text-gray-600 mb-3 tabular-nums">
          Лимит: {revealInfo.used}/{revealInfo.limit} в день
        </p>
      )}
      <button
        onClick={handleReveal}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Загрузка...
          </>
        ) : (
          <>
            <Eye className="w-4 h-4" />
            Показать контакты
          </>
        )}
      </button>
    </div>
  );
}
