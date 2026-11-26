import { describe, expect, test } from "bun:test";

import type { Score } from "../model/protocol";
import { decideCategory, MIN_CONFIDENCE, MIN_MARGIN } from "./decision";

describe("decideCategory", () => {
  test("returns null for empty scores", () => {
    expect(decideCategory([])).toBeNull();
  });

  test("accepts a confident winner with a clear margin", () => {
    const scores: Score[] = [
      { label: "people", score: 0.9 },
      { label: "nature", score: 0.1 },
    ];

    expect(decideCategory(scores)).toEqual({
      category: "people",
      candidate: "people",
      runnerUp: "nature",
      margin: 0.8,
      score: 0.9,
      review: false,
    });
  });

  test("defers low-confidence results to review", () => {
    const scores: Score[] = [
      { label: "buildings", score: 0.5 },
      { label: "graphics", score: 0.3 },
    ];

    expect(decideCategory(scores)).toEqual({
      category: "review",
      candidate: "buildings",
      runnerUp: "graphics",
      margin: 0.2,
      score: 0.5,
      review: true,
    });
  });

  test("defers narrow margins even when the top score is high", () => {
    const scores: Score[] = [
      { label: "buildings", score: 0.9 },
      { label: "graphics", score: 0.88 },
    ];

    const decision = decideCategory(scores);

    expect(decision?.review).toBe(true);
    expect(decision?.category).toBe("review");
    expect(decision?.margin).toBeCloseTo(0.02);
  });

  test("sorts unsorted input by score before deciding", () => {
    const scores: Score[] = [
      { label: "nature", score: 0.2 },
      { label: "people", score: 0.95 },
      { label: "buildings", score: 0.7 },
    ];

    const decision = decideCategory(scores);

    expect(decision?.candidate).toBe("people");
    expect(decision?.score).toBe(0.95);
    expect(decision?.runnerUp).toBe("buildings");
    expect(decision?.review).toBe(false);
  });

  test("treats a missing runner-up as review with a null margin", () => {
    const decision = decideCategory([{ label: "people", score: 0.9 }]);

    expect(decision?.runnerUp).toBeNull();
    expect(decision?.margin).toBeNull();
    expect(decision?.review).toBe(true);
    expect(decision?.category).toBe("review");
  });

  test("pins the decision thresholds", () => {
    expect(MIN_CONFIDENCE).toBe(0.65);
    expect(MIN_MARGIN).toBe(0.15);
  });
});
