"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { moveToStage, bulkMoveToStage } from "./actions";

interface TrashReasonDialogProps {
  companyIds: string[];
  onClose: () => void;
  onSuccess: () => void;
}

export function TrashReasonDialog({
  companyIds,
  onClose,
  onSuccess,
}: TrashReasonDialogProps) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please provide a reason");
      return;
    }

    startTransition(async () => {
      const result =
        companyIds.length === 1
          ? await moveToStage({
              companyId: companyIds[0],
              stage: "TRASH",
              trashReason: reason.trim(),
            })
          : await bulkMoveToStage({
              companyIds,
              stage: "TRASH",
              trashReason: reason.trim(),
            });

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-dark-secondary border border-white/10 rounded-xl w-full max-w-md p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">
            Move to Trash
            {companyIds.length > 1 && (
              <span className="text-gray-500 font-normal ml-1">
                ({companyIds.length} companies)
              </span>
            )}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <label className="block text-xs text-gray-400 mb-1.5">
            Why is this company not a fit?
          </label>
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
            }}
            placeholder="e.g. Too small, wrong segment, no distribution license..."
            className="w-full h-24 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:border-primary-600/50 focus:outline-none resize-none"
            autoFocus
          />

          {error && (
            <p className="text-red-400 text-xs mt-1.5">{error}</p>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              {isPending ? "Moving..." : "Move to Trash"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
