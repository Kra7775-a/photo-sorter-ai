export type Score = {
  label: string;
  score: number;
};

export type ClassifyResult = {
  ms: number;
  scores: Score[];
};

export type LoadProgress = {
  loaded: number;
  total: number;
};

export type ClassifyRequest = {
  type: "classify";
  id: string;
  image: Blob;
  labels: string[];
};

export type ClassifyBatchRequest = {
  type: "classify-batch";
  id: string;
  images: Blob[];
  labels: string[];
};

export type BatchResult = {
  type: "batch-result";
  id: string;
  results: ClassifyResult[];
};

export type WorkerRequest = ClassifyRequest | ClassifyBatchRequest;

export type ProgressMessage = { type: "progress"; progress: LoadProgress };

export type ClassifyResponse = { type: "result"; id: string } & ClassifyResult;

export type ErrorResponse = { type: "error"; id: string; message: string };

export type WorkerResponse = ProgressMessage | ClassifyResponse | BatchResult | ErrorResponse;
