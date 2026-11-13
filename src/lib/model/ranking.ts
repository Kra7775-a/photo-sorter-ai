import type { Score } from "./protocol";

/**
 * Turns cosine probabilities into the same shape the UI renders.
 * Kept pure so ordering and slicing can be tested without the model.
 */
export function rankScores(
  labels: readonly string[],
  probabilities: readonly number[],
  limit: number,
): Score[] {
  return labels
    .map((label, index) => ({ label, score: probabilities[index] ?? 0 }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(0, limit));
}
