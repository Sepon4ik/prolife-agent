"use client";

import { useState } from "react";
import { Sparkles, Loader2, CheckCircle2 } from "lucide-react";

export function EnrichButton({ companyId }: { companyId: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [message, setMessage] = useState("");

  async function handleEnrich() {
    setState("loading");
    try {
      const res = await fetch("/api/re-enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyIds: [companyId] }),
      });
      const data = await res.json();
      if (res.ok) {
        setState("done");
        setMessage("Enrichment запущен. Обновите через 30-60 сек.");
      } else {
        setState("error");
        setMessage(data.error || "Ошибка");
      }
    } catch {
      setState("error");
      setMessage("Ошибка сети");
    }
  }

  return (
    <button
      onClick={handleEnrich}
      disabled={state === "loading" || state === "done"}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary-500/20 bg-primary-500/5 text-primary-400 hover:bg-primary-500/10 text-xs font-medium transition-colors disabled:opacity-50"
      title={message || "Запустить обогащение контактов через Apollo + Hunter"}
    >
      {state === "loading" ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : state === "done" ? (
        <CheckCircle2 className="w-3.5 h-3.5" />
      ) : (
        <Sparkles className="w-3.5 h-3.5" />
      )}
      {state === "done" ? "Запущено" : state === "loading" ? "Запуск..." : "Обогатить контакты"}
    </button>
  );
}
