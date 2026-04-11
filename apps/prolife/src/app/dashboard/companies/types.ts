import type { PipelineStage, SalesStatus } from "@agency/db";

export interface PipelineCompany {
  id: string;
  name: string;
  type: string;
  country: string;
  priority: string;
  score: number;
  status: string;
  stage: PipelineStage;
  salesStatus: SalesStatus | null;
  trashReason: string | null;
  emailCount: number;
  updatedAt: string;
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  NEW: "New",
  DEEP_RESEARCH: "Deep Research",
  LAST_STAGE: "Last Stage",
  TRASH: "Trash",
};

export const STAGE_COLORS: Record<PipelineStage, string> = {
  NEW: "bg-blue-500",
  DEEP_RESEARCH: "bg-amber-500",
  LAST_STAGE: "bg-green-500",
  TRASH: "bg-red-500",
};

export const SALES_STATUS_LABELS: Record<SalesStatus, string> = {
  READY_TO_WORK: "Ready to work",
  IN_PROGRESS: "In progress",
  POTENTIAL_CONTRACT: "Potential contract",
  DONE: "Done",
};

export const SALES_STATUS_COLORS: Record<SalesStatus, string> = {
  READY_TO_WORK: "bg-blue-500/20 text-blue-400",
  IN_PROGRESS: "bg-amber-500/20 text-amber-400",
  POTENTIAL_CONTRACT: "bg-green-500/20 text-green-400",
  DONE: "bg-gray-500/20 text-gray-400",
};

export interface CountryCount {
  country: string;
  count: number;
}

export interface RegionGroup {
  region: string;
  countries: CountryCount[];
  total: number;
}

export interface StageCounts {
  NEW: number;
  DEEP_RESEARCH: number;
  LAST_STAGE: number;
  TRASH: number;
}
