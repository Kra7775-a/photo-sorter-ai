import type { ReportRow } from "../archive/naming";
import type { SortArchiveResult } from "../archive/sort";

export type Counts = SortArchiveResult["counts"];

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
