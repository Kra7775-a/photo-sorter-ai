import type { Counts } from "#shared/counts";

import type { ReportRow } from "../archive/naming";

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
