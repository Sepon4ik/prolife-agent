"use client";

import { useState } from "react";
import { Bookmark, ThumbsUp, EyeOff } from "lucide-react";

const icons = {
  bookmark: Bookmark,
  thumbsup: ThumbsUp,
  eyeoff: EyeOff,
};

export function EngageButton({
  newsId,
  action,
  isActive,
  icon,
  label,
}: {
  newsId: string;
  action: "like" | "bookmark" | "dismiss" | "unbookmark";
  isActive?: boolean;
  icon: keyof typeof icons;
  label: string;
}) {
  const [active, setActive] = useState(isActive ?? false);
  const [loading, setLoading] = useState(false);

  const Icon = icons[icon];

  async function handleClick() {
    setLoading(true);
    try {
      const actualAction = action === "bookmark" && active ? "unbookmark" : action;
      const res = await fetch(`/api/news/${newsId}/engage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: actualAction }),
      });
      if (res.ok) {
        if (action === "bookmark") setActive(!active);
        else setActive(true);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading || (active && action !== "bookmark")}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors ${
        active
          ? "bg-primary-500/10 text-primary-400 border border-primary-500/20"
          : "bg-white/5 text-gray-400 border border-white/5 hover:border-white/10 hover:text-gray-300"
      } disabled:opacity-50`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
