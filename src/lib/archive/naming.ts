/**
 * Formats the browser can decode and the model can consume. HEIC/TIFF are
 * deliberately absent: `createImageBitmap` rejects them in Chromium/Firefox,
 * so such files are reported as skipped instead of failing later.
 */
const IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "jpe",
  "jfif",
  "png",
  "webp",
  "gif",
  "bmp",
  "avif",
]);

// Control characters are exactly what must be stripped from archive names.
// oxlint-disable-next-line eslint/no-control-regex
const ILLEGAL_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export type ReportStatus = "sorted" | "skipped" | "error";

export type ReportRow = {
  source: string;
  category: string;
  score: number | null;
  status: ReportStatus;
  error: string;
};

const REPORT_HEADER = ["source", "category", "score", "status", "error"] as const;
const UTF8_BOM = "\uFEFF";

/** Last path segment; archives may contain both separators in malformed entries. */
export function baseName(path: string): string {
  const segments = path.split(/[\\/]/);
  let end = segments.length;

  while (end > 0 && segments[end - 1] === "") {
    end -= 1;
  }

  return end === 0 ? "" : segments[end - 1];
}

export function isImagePath(path: string): boolean {
  const name = baseName(path);
  const dot = name.lastIndexOf(".");

  if (dot <= 0 || dot === name.length - 1) {
    return false;
  }

  return IMAGE_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
}

function truncate(value: string, max: number): string {
  const chars = Array.from(value);

  return chars.length <= max ? value : chars.slice(0, max).join("");
}

/** Keeps the extension when a long name has to be shortened. */
function truncateFileName(name: string, max: number): string {
  const chars = Array.from(name);

  if (chars.length <= max) {
    return name;
  }

  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? Array.from(name.slice(dot)) : [];
  const stem = dot > 0 ? Array.from(name.slice(0, dot)) : chars;

  if (extension.length === 0 || extension.length >= max) {
    return chars.slice(0, max).join("");
  }

  return `${stem.slice(0, max - extension.length).join("")}${extension.join("")}`;
}

function cleanName(value: string): string {
  return value
    .replaceAll(ILLEGAL_FILENAME_CHARS, "_")
    .replaceAll(/\s+/g, " ")
    .replace(/[. ]+$/, "")
    .trim();
}

/** Folder name taken from a model label; never contains path separators. */
export function safeFolderName(label: string): string {
  const cleaned = cleanName(label);

  return cleaned === "" ? "_unsorted" : truncate(cleaned, 64);
}

/** Original basename is kept, but stripped of anything a filesystem rejects. */
export function safeFileName(name: string): string {
  const cleaned = cleanName(name);

  return cleaned === "" ? "file" : truncateFileName(cleaned, 120);
}

/**
 * Adds ` (2)`, ` (3)`, … before the extension until the path is unused.
 * The set is mutated with the chosen path.
 */
export function uniquePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);

    return path;
  }

  const slash = path.lastIndexOf("/");
  const directory = slash === -1 ? "" : path.slice(0, slash + 1);
  const name = slash === -1 ? path : path.slice(slash + 1);
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : "";

  let index = 2;
  let candidate = `${directory}${stem} (${index})${extension}`;

  while (used.has(candidate)) {
    index += 1;
    candidate = `${directory}${stem} (${index})${extension}`;
  }

  used.add(candidate);

  return candidate;
}

export function archiveOutputName(inputName: string): string {
  const trimmed = inputName.trim();

  if (trimmed === "") {
    return "sorted.zip";
  }

  const stem = trimmed.replace(/\.zip$/i, "");

  return `${stem === "" ? "photos" : stem}-sorted.zip`;
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function buildReportCsv(rows: readonly ReportRow[]): string {
  const lines = [REPORT_HEADER.join(",")];

  for (const row of rows) {
    lines.push(
      [
        row.source,
        row.category,
        row.score === null ? "" : row.score.toFixed(4),
        row.status,
        row.error,
      ]
        .map(csvField)
        .join(","),
    );
  }

  // BOM keeps non-ASCII filenames readable in Excel; CRLF is the CSV default.
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}
