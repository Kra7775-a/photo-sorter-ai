import type { ReportRow } from "../archive/naming";

export type Counts = {
  sorted: number;
  skipped: number;
  errors: number;
  // Optional for synced runs created before the review bucket existed.
  review?: number;
};

export type SyncRun = {
  clientRunId: string;
  sourceName: string;
  createdAt: number;
  counts: Counts;
  rows: ReportRow[];
  serverId?: string;
};

export type SyncSettings = {
  labels: string[];
  updatedAt: number;
};
