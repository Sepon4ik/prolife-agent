export interface PipelineCompany {
  id: string;
  name: string;
  type: string;
  country: string;
  priority: string;
  score: number;
  status: string;
  emailCount: number;
  updatedAt: string; // ISO string for serialization
}

/** Kanban columns — 6 active statuses */
export const BOARD_COLUMNS = [
  "RAW",
  "SCORED",
  "OUTREACH_SENT",
  "REPLIED",
  "INTERESTED",
  "HANDED_OFF",
] as const;

export type BoardColumnId = (typeof BOARD_COLUMNS)[number];

export const COLUMN_LABELS: Record<string, string> = {
  RAW: "Raw",
  SCORED: "Scored",
  OUTREACH_SENT: "Outreach",
  REPLIED: "Replied",
  INTERESTED: "Interested",
  HANDED_OFF: "Handed Off",
};

export const COLUMN_COLORS: Record<string, string> = {
  RAW: "bg-gray-500",
  SCORED: "bg-purple-500",
  OUTREACH_SENT: "bg-yellow-500",
  REPLIED: "bg-cyan-500",
  INTERESTED: "bg-green-500",
  HANDED_OFF: "bg-emerald-500",
};
