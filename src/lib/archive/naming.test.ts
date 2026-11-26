import { describe, expect, test } from "bun:test";

import {
  archiveOutputName,
  baseName,
  buildReportCsv,
  isImagePath,
  safeFileName,
  safeFolderName,
  uniquePath,
  type ReportRow,
} from "./naming";

describe("baseName", () => {
  test("returns the last segment for both separators", () => {
    expect(baseName("photos/2024/cat.jpg")).toBe("cat.jpg");
    expect(baseName("photos\\2024\\cat.jpg")).toBe("cat.jpg");
    expect(baseName("cat.jpg")).toBe("cat.jpg");
  });

  test("ignores trailing separators", () => {
    expect(baseName("photos/2024/")).toBe("2024");
    expect(baseName("photos//")).toBe("photos");
    expect(baseName("/")).toBe("");
  });
});

describe("isImagePath", () => {
  test("accepts browser-decodable extensions case-insensitively", () => {
    expect(isImagePath("cat.jpg")).toBe(true);
    expect(isImagePath("CAT.JPEG")).toBe(true);
    expect(isImagePath("nested/picture.WebP")).toBe(true);
    expect(isImagePath("animation.gif")).toBe(true);
    expect(isImagePath("scan.avif")).toBe(true);
  });

  test("rejects non-images and unsupported formats", () => {
    expect(isImagePath("notes.txt")).toBe(false);
    expect(isImagePath("photo")).toBe(false);
    expect(isImagePath(".jpg")).toBe(false);
    expect(isImagePath("photo.")).toBe(false);
    expect(isImagePath("iphone.heic")).toBe(false);
    expect(isImagePath("scan.tiff")).toBe(false);
  });
});

describe("safeFolderName", () => {
  test("removes path separators and filesystem-reserved characters", () => {
    expect(safeFolderName("food/drinks")).toBe("food_drinks");
    expect(safeFolderName('a\\b:c*d?e"f<g>h|i')).toBe("a_b_c_d_e_f_g_h_i");
  });

  test("collapses whitespace and trims trailing dots", () => {
    expect(safeFolderName("  raw   photos  ")).toBe("raw photos");
    expect(safeFolderName("dots...")).toBe("dots");
  });

  test("falls back for empty and traversal-like names", () => {
    expect(safeFolderName("")).toBe("_unsorted");
    expect(safeFolderName("   ")).toBe("_unsorted");
    expect(safeFolderName("..")).toBe("_unsorted");
    expect(safeFolderName("../etc")).toBe(".._etc");
  });

  test("truncates by code points, not UTF-16 units", () => {
    expect(safeFolderName("é".repeat(80))).toBe("é".repeat(64));
    expect(safeFolderName("😀".repeat(80))).toBe("😀".repeat(64));
  });
});

describe("safeFileName", () => {
  test("keeps the extension and cleans reserved characters", () => {
    expect(safeFileName("cat.jpg")).toBe("cat.jpg");
    expect(safeFileName("a:b?.jpg")).toBe("a_b_.jpg");
  });

  test("falls back when the name disappears", () => {
    expect(safeFileName("...")).toBe("file");
  });

  test("shortens long names but keeps the extension", () => {
    const long = `${"a".repeat(200)}.jpg`;
    const shortened = safeFileName(long);

    expect(Array.from(shortened)).toHaveLength(120);
    expect(shortened.endsWith(".jpg")).toBe(true);
    expect(safeFileName("a".repeat(200))).toBe("a".repeat(120));
  });
});

describe("uniquePath", () => {
  test("keeps the first path untouched", () => {
    const used = new Set<string>();

    expect(uniquePath("nature/cat.jpg", used)).toBe("nature/cat.jpg");
    expect(uniquePath("nature/dog.jpg", used)).toBe("nature/dog.jpg");
  });

  test("adds a numeric suffix before the extension", () => {
    const used = new Set<string>(["nature/cat.jpg", "nature/cat (2).jpg"]);

    expect(uniquePath("nature/cat.jpg", used)).toBe("nature/cat (3).jpg");
    expect(uniquePath("nature/cat.jpg", used)).toBe("nature/cat (4).jpg");
  });

  test("handles names without extension and without folder", () => {
    const used = new Set<string>(["report"]);

    expect(uniquePath("report", used)).toBe("report (2)");
  });

  test("keeps dotfiles from becoming extension-only names", () => {
    const used = new Set<string>(["folder/.env"]);

    expect(uniquePath("folder/.env", used)).toBe("folder/.env (2)");
  });
});

describe("archiveOutputName", () => {
  test("renames zip archives and falls back to a generic name", () => {
    expect(archiveOutputName("photos.zip")).toBe("photos-sorted.zip");
    expect(archiveOutputName("Photos.ZIP")).toBe("Photos-sorted.zip");
    expect(archiveOutputName("archive")).toBe("archive-sorted.zip");
    expect(archiveOutputName("   ")).toBe("sorted.zip");
    expect(archiveOutputName(".zip")).toBe("photos-sorted.zip");
  });
});

describe("buildReportCsv", () => {
  const rows: ReportRow[] = [
    {
      source: "photos/cat.jpg",
      category: "animals",
      score: 0.912345,
      margin: 0.5,
      candidate: "animals",
      runnerUp: "people",
      status: "sorted",
      error: "",
    },
    {
      source: "notes.txt",
      category: "",
      score: null,
      margin: null,
      candidate: "",
      runnerUp: null,
      status: "skipped",
      error: "not a supported image",
    },
    {
      source: 'photos/weird, "name".png',
      category: "",
      score: null,
      margin: null,
      candidate: "",
      runnerUp: null,
      status: "error",
      error: 'decode failed: bad "header"',
    },
  ];

  test("writes a header, a BOM and CRLF line endings", () => {
    const csv = buildReportCsv(rows);

    expect(
      csv.startsWith("\uFEFFsource,category,score,margin,candidate,runner_up,status,error\r\n"),
    ).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  test("formats scores and escapes commas and quotes", () => {
    const lines = buildReportCsv(rows).split("\r\n");

    expect(lines[1]).toBe("photos/cat.jpg,animals,0.9123,0.5000,animals,people,sorted,");
    expect(lines[2]).toBe("notes.txt,,,,,,skipped,not a supported image");
    expect(lines[3]).toBe(
      '"photos/weird, ""name"".png",,,,,,error,"decode failed: bad ""header"""',
    );
  });

  test("writes review rows with a four-decimal margin and a blank runner-up", () => {
    const csv = buildReportCsv([
      {
        source: "photos/uncertain.jpg",
        category: "review",
        score: 0.5,
        margin: 0.1234,
        candidate: "buildings",
        runnerUp: null,
        status: "review",
        error: "",
      },
    ]);

    expect(csv).toBe(
      "\uFEFFsource,category,score,margin,candidate,runner_up,status,error\r\n" +
        "photos/uncertain.jpg,review,0.5000,0.1234,buildings,,review,\r\n",
    );
  });

  test("serializes legacy rows without review evidence as blanks", () => {
    const csv = buildReportCsv([
      {
        source: "old.jpg",
        category: "people",
        score: 0.9,
        status: "sorted",
        error: "",
      },
    ]);

    expect(csv).toBe(
      "\uFEFFsource,category,score,margin,candidate,runner_up,status,error\r\n" +
        "old.jpg,people,0.9000,,,,sorted,\r\n",
    );
  });

  test("returns just the header for an empty report", () => {
    expect(buildReportCsv([])).toBe(
      "\uFEFFsource,category,score,margin,candidate,runner_up,status,error\r\n",
    );
  });
});
