import type { Score } from "../model/protocol";
import { safeFolderName } from "./naming";

export const MIN_CONFIDENCE = 0.65;
export const MIN_MARGIN = 0.15;

export type Decision = {
  category: string;
  candidate: string;
  runnerUp: string | null;
  margin: number | null;
  score: number;
  review: boolean;
};

/**
 * Selective prediction: abstain into `review` when the top score is weak or
 * the gap to the runner-up is too small, so uncertain images are not silently
 * filed under a wrong category.
 */
export function decideCategory(scores: readonly Score[]): Decision | null {
  if (scores.length === 0) {
    return null;
  }

  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const second = ranked.at(1);
  const margin = second === undefined ? null : top.score - second.score;
  const review = top.score < MIN_CONFIDENCE || margin === null || margin < MIN_MARGIN;

  return {
    category: review ? "review" : safeFolderName(top.label),
    candidate: top.label,
    runnerUp: second?.label ?? null,
    margin,
    score: top.score,
    review,
  };
}
