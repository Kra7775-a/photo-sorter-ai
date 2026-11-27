export const PROMPT_TEMPLATES = [
  "a photo of {label}",
  "a picture of {label}",
  "an image of {label}",
  "a photograph of {label}",
] as const;

/** Expands every template per label, in label-major order. */
export function labelPrompts(labels: readonly string[]): string[] {
  return labels.flatMap((label) =>
    PROMPT_TEMPLATES.map((template) => template.replace("{label}", label)),
  );
}

function averageAndNormalize(group: readonly number[][]): number[] {
  const dimension = group[0]?.length ?? 0;
  const mean = Array.from(
    { length: dimension },
    (_, index) => group.reduce((sum, vector) => sum + (vector[index] ?? 0), 0) / group.length,
  );
  const magnitude = Math.hypot(...mean);

  if (magnitude === 0) {
    return Array.from({ length: dimension }, () => 0);
  }

  return mean.map((value) => value / magnitude);
}

/** Averages consecutive embeddings per label and L2-normalizes each mean. */
export function averageLabelEmbeddings(
  embeddings: readonly number[][],
  templateCount = PROMPT_TEMPLATES.length,
): number[][] {
  const averaged: number[][] = [];

  for (let start = 0; start < embeddings.length; start += templateCount) {
    averaged.push(averageAndNormalize(embeddings.slice(start, start + templateCount)));
  }

  return averaged;
}
