import type { SyncRun, SyncSettings } from "./types";

/** Newer content wins, but a serverId from either record survives the merge. */
function mergeConflict(existing: SyncRun, incoming: SyncRun): SyncRun {
  const winner = incoming.createdAt > existing.createdAt ? incoming : existing;
  const loser = winner === incoming ? existing : incoming;

  return winner.serverId === undefined && loser.serverId !== undefined
    ? { ...winner, serverId: loser.serverId }
    : winner;
}

export function mergeRuns(local: SyncRun[], remote: SyncRun[]): SyncRun[] {
  const byClientId = new Map<string, SyncRun>();

  for (const run of [...local, ...remote]) {
    const existing = byClientId.get(run.clientRunId);

    if (existing === undefined) {
      byClientId.set(run.clientRunId, run);
    } else {
      byClientId.set(run.clientRunId, mergeConflict(existing, run));
    }
  }

  return [...byClientId.values()];
}

export function mergeSettings(
  local: SyncSettings | null,
  remote: SyncSettings | null,
): SyncSettings | null {
  if (local === null) {
    return remote;
  }
  if (remote === null) {
    return local;
  }

  return local.updatedAt >= remote.updatedAt ? local : remote;
}

export function pendingUploads(runs: SyncRun[]): SyncRun[] {
  return runs.filter((run) => run.serverId === undefined);
}
