import { describe, expect, test } from "bun:test";

import { averageLabelEmbeddings, labelPrompts, PROMPT_TEMPLATES } from "./prompt";

describe("PROMPT_TEMPLATES", () => {
  test("has exactly four templates containing {label}", () => {
    expect(PROMPT_TEMPLATES).toEqual([
      "a photo of {label}",
      "a picture of {label}",
      "an image of {label}",
      "a photograph of {label}",
    ]);
    expect(PROMPT_TEMPLATES).toHaveLength(4);

    for (const template of PROMPT_TEMPLATES) {
      expect(template).toContain("{label}");
    }
  });
});

describe("labelPrompts", () => {
  test("expands labels in label-major order", () => {
    const prompts = labelPrompts(["cat", "dog"]);

    expect(prompts).toHaveLength(8);
    expect(prompts).toEqual([
      "a photo of cat",
      "a picture of cat",
      "an image of cat",
      "a photograph of cat",
      "a photo of dog",
      "a picture of dog",
      "an image of dog",
      "a photograph of dog",
    ]);
  });

  test("returns nothing for no labels", () => {
    expect(labelPrompts([])).toEqual([]);
  });
});

describe("averageLabelEmbeddings", () => {
  test("keeps a group of identical unit vectors normalized", () => {
    expect(
      averageLabelEmbeddings([
        [1, 0],
        [1, 0],
        [1, 0],
        [1, 0],
      ]),
    ).toEqual([[1, 0]]);
  });

  test("averages and L2-normalizes a group", () => {
    const [result] = averageLabelEmbeddings([
      [1, 0],
      [0, 1],
    ]);

    expect(result[0]).toBeCloseTo(Math.SQRT1_2, 4);
    expect(result[1]).toBeCloseTo(Math.SQRT1_2, 4);
    expect(Math.hypot(...result)).toBeCloseTo(1, 6);
  });

  test("returns an empty list for empty input", () => {
    expect(averageLabelEmbeddings([])).toEqual([]);
  });

  test("returns a finite zero vector for a zero group", () => {
    const [result] = averageLabelEmbeddings([
      [0, 0],
      [0, 0],
      [0, 0],
      [0, 0],
    ]);

    expect(result).toEqual([0, 0]);
    expect(result.every(Number.isFinite)).toBe(true);
  });

  test("handles a partial trailing group", () => {
    const result = averageLabelEmbeddings(
      [
        [1, 0],
        [1, 0],
        [1, 0],
        [1, 0],
        [0, 1],
      ],
      4,
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual([1, 0]);
    expect(result[1]).toEqual([0, 1]);
  });
});
