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

export type WorkerRequest = ClassifyRequest;

export type WorkerResponse =
  | { type: "progress"; progress: LoadProgress }
  | ({ type: "result"; id: string } & ClassifyResult)
  | { type: "error"; id: string; message: string };
