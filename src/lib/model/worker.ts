import {
  AutoProcessor,
  AutoTokenizer,
  CLIPTextModelWithProjection,
  CLIPVisionModelWithProjection,
  RawImage,
  dot,
  softmax,
} from "@huggingface/transformers";

import type { ClassifyResult, LoadProgress, WorkerRequest, WorkerResponse } from "./protocol";
import { rankScores } from "./ranking";

/**
 * MobileCLIP-B: 76.8% zero-shot on ImageNet-1k at ~145 MB int8.
 * Only converted weights exist, no HF processor bundle for the pipeline task,
 * so the two towers are driven manually.
 */
const MODEL_ID = "Xenova/mobileclip_b";
const DTYPE = "q8";
const LOGIT_SCALE = 100;
const TOP_K = 3;
/**
 * The text tower is English-only: Russian labels score near random
 * (a cat photo lands in "природа" instead of "животные"), so prompts are
 * built in English and the template adds a measurable gain on short labels.
 */
const PROMPT_TEMPLATE = "a photo of ";
const MAX_CACHED_LABEL_SETS = 8;

type Loaded = {
  processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>>;
  text: Awaited<ReturnType<typeof CLIPTextModelWithProjection.from_pretrained>>;
  tokenizer: Awaited<ReturnType<typeof AutoTokenizer.from_pretrained>>;
  vision: Awaited<ReturnType<typeof CLIPVisionModelWithProjection.from_pretrained>>;
};

type ProgressEvent = {
  status: string;
  file?: string;
  loaded?: number;
  total?: number;
};

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse) => void;
};

const fileProgress = new Map<string, { loaded: number; total: number }>();

function isProgressEvent(event: unknown): event is Required<ProgressEvent> {
  if (typeof event !== "object" || event === null) {
    return false;
  }

  const candidate = event as ProgressEvent;

  return (
    candidate.status === "progress" &&
    typeof candidate.file === "string" &&
    typeof candidate.loaded === "number" &&
    typeof candidate.total === "number"
  );
}

function reportProgress(event: unknown): void {
  if (!isProgressEvent(event)) {
    return;
  }

  fileProgress.set(event.file, { loaded: event.loaded, total: event.total });

  let loaded = 0;
  let total = 0;

  for (const entry of fileProgress.values()) {
    loaded += entry.loaded;
    total += entry.total;
  }

  const progress: LoadProgress = { loaded, total };

  workerScope.postMessage({ type: "progress", progress });
}

async function loadModels(): Promise<Loaded> {
  const [tokenizer, processor, text, vision] = await Promise.all([
    AutoTokenizer.from_pretrained(MODEL_ID),
    AutoProcessor.from_pretrained(MODEL_ID),
    CLIPTextModelWithProjection.from_pretrained(MODEL_ID, {
      dtype: DTYPE,
      progress_callback: reportProgress,
    }),
    CLIPVisionModelWithProjection.from_pretrained(MODEL_ID, {
      dtype: DTYPE,
      progress_callback: reportProgress,
    }),
  ]);

  return { processor, text, tokenizer, vision };
}

let loading: Promise<Loaded> | null = null;

function load(): Promise<Loaded> {
  // A failed download must not poison every following attempt.
  loading ??= loadModels().catch((error: unknown) => {
    loading = null;
    fileProgress.clear();
    throw error;
  });

  return loading;
}

const textCache = new Map<string, number[][]>();

async function embedLabels(labels: readonly string[]): Promise<number[][]> {
  const key = labels.join("\n");
  const cached = textCache.get(key);

  if (cached) {
    return cached;
  }

  const { text, tokenizer } = await load();
  const prompts = labels.map((label) => `${PROMPT_TEMPLATE}${label}`);
  const inputs = tokenizer(prompts, { padding: "max_length", truncation: true });
  const { text_embeds } = await text(inputs);
  const embeddings: number[][] = text_embeds.normalize().tolist();

  if (textCache.size >= MAX_CACHED_LABEL_SETS) {
    const oldestKey = textCache.keys().next().value;

    if (oldestKey !== undefined) {
      textCache.delete(oldestKey);
    }
  }

  textCache.set(key, embeddings);

  return embeddings;
}

async function classify(image: Blob, labels: readonly string[]): Promise<ClassifyResult> {
  if (labels.length === 0) {
    throw new Error("At least one category is required");
  }

  const [model, textEmbeds] = await Promise.all([load(), embedLabels(labels)]);
  const started = performance.now();

  const inputs = await model.processor(await RawImage.fromBlob(image));
  const { image_embeds } = await model.vision(inputs);
  const imageEmbed: number[] = image_embeds.normalize().tolist()[0];

  const probabilities = softmax(
    labels.map((_, index) => LOGIT_SCALE * dot(imageEmbed, textEmbeds[index])),
  );

  return {
    ms: Math.round(performance.now() - started),
    scores: rankScores(labels, probabilities, TOP_K),
  };
}

function toMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handle(request: WorkerRequest): Promise<void> {
  try {
    const result = await classify(request.image, request.labels);

    workerScope.postMessage({ type: "result", id: request.id, ...result });
  } catch (error) {
    workerScope.postMessage({ type: "error", id: request.id, message: toMessage(error) });
  }
}

// ONNX sessions are not reentrant, so requests are handled one at a time.
let queue: Promise<void> = Promise.resolve();

workerScope.onmessage = (event) => {
  queue = queue.then(() => handle(event.data));
};
