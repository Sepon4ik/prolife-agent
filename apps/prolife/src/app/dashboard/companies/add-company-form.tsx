"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddCompanyForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [type, setType] = useState("UNKNOWN");
  const [result, setResult] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !country) return;

    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, country, website, type }),
      });
      const data = await res.json();

      if (res.ok) {
        setResult({ success: true });
        setName("");
        setCountry("");
        setWebsite("");
        setType("UNKNOWN");
        setOpen(false);
        router.refresh();
      } else {
        setResult({ error: data.error });
      }
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-md transition-colors"
      >
        + Add Company
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-dark-secondary rounded-lg p-5 border border-white/10 mb-6"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-300">
          Add Company Manually
        </h3>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          Cancel
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          required
          className="bg-dark-tertiary border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-primary-600 focus:outline-none"
        />
        <input
          type="text"
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Country"
          required
          className="bg-dark-tertiary border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-primary-600 focus:outline-none"
        />
        <input
          type="url"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          placeholder="Website (optional)"
          className="bg-dark-tertiary border border-white/10 rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-primary-600 focus:outline-none"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="bg-dark-tertiary border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:border-primary-600 focus:outline-none"
        >
          <option value="UNKNOWN">Unknown</option>
          <option value="DISTRIBUTOR">Distributor</option>
          <option value="PHARMACY_CHAIN">Pharmacy Chain</option>
          <option value="RETAIL">Retail</option>
          <option value="HYBRID">Hybrid</option>
        </select>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-600 text-white text-sm font-medium rounded-md transition-colors"
        >
          {loading ? "Adding..." : "Add & Enrich"}
        </button>
      </div>
      {result?.error && (
        <div className="mt-2 text-sm text-red-400">{result.error}</div>
      )}
    </form>
  );
}
