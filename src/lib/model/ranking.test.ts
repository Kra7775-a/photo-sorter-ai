import { describe, expect, test } from "bun:test";

import { rankScores } from "./ranking";

const LABELS = ["people", "food", "animals"];

describe("rankScores", () => {
  test("orders labels by descending probability", () => {
    expect(rankScores(LABELS, [0.1, 0.7, 0.2], 3)).toEqual([
      { label: "food", score: 0.7 },
      { label: "animals", score: 0.2 },
      { label: "people", score: 0.1 },
    ]);
  });

  test("keeps only the requested number of labels", () => {
    expect(rankScores(LABELS, [0.1, 0.7, 0.2], 2)).toEqual([
      { label: "food", score: 0.7 },
      { label: "animals", score: 0.2 },
    ]);
  });

  test("returns every label when the limit exceeds the label count", () => {
    expect(rankScores(LABELS, [0.1, 0.7, 0.2], 10)).toHaveLength(LABELS.length);
  });

  test("returns an empty list for a non-positive limit", () => {
    expect(rankScores(LABELS, [0.1, 0.7, 0.2], 0)).toEqual([]);
    expect(rankScores(LABELS, [0.1, 0.7, 0.2], -1)).toEqual([]);
  });

  test("treats missing probabilities as zero", () => {
    expect(rankScores(LABELS, [0.5], 3)).toEqual([
      { label: "people", score: 0.5 },
      { label: "food", score: 0 },
      { label: "animals", score: 0 },
    ]);
  });
});
