#!/usr/bin/env bun

const PROSE_KINDS = ["issue", "pull-request", "document", "plan"] as const;

export type ProseKind = (typeof PROSE_KINDS)[number];

export type ProseWarning =
  | {
      code: "word-limit";
      actual: number;
      limit: number;
    }
  | {
      code: "long-paragraph";
      line: number;
      actual: number;
      limit: number;
    }
  | {
      code: "duplicate-paragraph";
      line: number;
      originalLine: number;
      actual: number;
      limit: number;
    };

export type ProseReport = {
  kind: ProseKind;
  wordCount: number;
  paragraphCount: number;
  warnings: ProseWarning[];
};

type ProseReportIo = {
  readStdin: () => Promise<string>;
  readFile: (path: string) => Promise<string>;
  stdout: (message: string) => void;
  stderr: (message: string) => void;
};

type Paragraph = {
  line: number;
  words: string[];
};

const WORD_LIMITS: Partial<Record<ProseKind, number>> = {
  issue: 800,
  "pull-request": 500,
  plan: 1_500,
};
const PARAGRAPH_WORD_LIMIT = 120;
const DUPLICATE_PARAGRAPH_MINIMUM = 20;
const USAGE = "Usage: prose-report <issue|pull-request|document|plan> <path|->";

export function analyzeProse(source: string, kind: ProseKind): ProseReport {
  const cleaned = removeExcludedMarkdown(source);
  const allWords = extractWords(cleaned);
  const paragraphs = extractParagraphs(cleaned);
  const warnings: ProseWarning[] = [];
  const wordLimit = WORD_LIMITS[kind];

  if (wordLimit !== undefined && allWords.length > wordLimit) {
    warnings.push({ code: "word-limit", actual: allWords.length, limit: wordLimit });
  }

  for (const paragraph of paragraphs) {
    if (paragraph.words.length > PARAGRAPH_WORD_LIMIT) {
      warnings.push({
        code: "long-paragraph",
        line: paragraph.line,
        actual: paragraph.words.length,
        limit: PARAGRAPH_WORD_LIMIT,
      });
    }
  }

  const firstLines = new Map<string, number>();
  for (const paragraph of paragraphs) {
    if (paragraph.words.length < DUPLICATE_PARAGRAPH_MINIMUM) {
      continue;
    }
    const normalized = paragraph.words.join(" ").toLowerCase();
    const originalLine = firstLines.get(normalized);
    if (originalLine === undefined) {
      firstLines.set(normalized, paragraph.line);
      continue;
    }
    warnings.push({
      code: "duplicate-paragraph",
      line: paragraph.line,
      originalLine,
      actual: paragraph.words.length,
      limit: DUPLICATE_PARAGRAPH_MINIMUM,
    });
  }

  return {
    kind,
    wordCount: allWords.length,
    paragraphCount: paragraphs.length,
    warnings,
  };
}

function removeExcludedMarkdown(source: string): string {
  const lines = source.split("\n");
  let frontmatterEnd = -1;
  if (/^---\s*$/.test(lines[0] ?? "")) {
    frontmatterEnd = lines.findIndex((line, index) => index > 0 && /^---\s*$/.test(line));
  }

  let fenceMarker: "`" | "~" | null = null;
  let fenceLength = 0;
  const visibleLines = lines.map((line, index) => {
    if (frontmatterEnd >= 0 && index <= frontmatterEnd) {
      return "";
    }

    const fence = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (fence !== undefined) {
      const marker = fence[0];
      if (fenceMarker === null && (marker === "`" || marker === "~")) {
        fenceMarker = marker;
        fenceLength = fence.length;
      } else if (marker === fenceMarker && fence.length >= fenceLength) {
        fenceMarker = null;
        fenceLength = 0;
      }
      return "";
    }
    return fenceMarker === null ? line : "";
  });

  return visibleLines
    .join("\n")
    .replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => comment.replace(/[^\n]/g, ""));
}

function extractWords(source: string): string[] {
  const withoutTargets = source.replace(/\]\([^\n)]*\)/g, "]");
  return withoutTargets.match(/[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu) ?? [];
}

function extractParagraphs(source: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let currentLines: string[] = [];
  let currentLine = 1;

  const flush = (): void => {
    const words = extractWords(currentLines.join(" "));
    if (words.length > 0) {
      paragraphs.push({ line: currentLine, words });
    }
    currentLines = [];
  };

  source.split("\n").forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.trim() === "") {
      flush();
      return;
    }

    const isHeading = /^ {0,3}#{1,6}\s+/.test(line);
    const isListItem = /^\s*(?:[-*+]|\d+[.)])\s+/.test(line);
    if (isHeading || isListItem) {
      flush();
    }
    if (currentLines.length === 0) {
      currentLine = lineNumber;
    }
    currentLines.push(line);
    if (isHeading) {
      flush();
    }
  });
  flush();

  return paragraphs;
}

function formatReport(report: ProseReport): string {
  const lines = [
    `Prose report (${report.kind}): ${report.wordCount} words, ${report.paragraphCount} paragraphs`,
  ];
  if (report.warnings.length === 0) {
    lines.push("No advisory warnings.");
    return lines.join("\n");
  }

  for (const warning of report.warnings) {
    if (warning.code === "word-limit") {
      lines.push(
        `warning ${warning.code}: ${warning.actual} words exceeds advisory limit ${warning.limit}.`,
      );
    } else if (warning.code === "long-paragraph") {
      lines.push(
        `warning ${warning.code}: line ${warning.line} has ${warning.actual} words; advisory limit is ${warning.limit}.`,
      );
    } else {
      lines.push(
        `warning ${warning.code}: line ${warning.line} repeats the ${warning.actual}-word paragraph from line ${warning.originalLine}.`,
      );
    }
  }
  return lines.join("\n");
}

function isProseKind(value: string | undefined): value is ProseKind {
  return value !== undefined && PROSE_KINDS.includes(value as ProseKind);
}

export async function runProseReport(args: string[], io: ProseReportIo): Promise<number> {
  const [kind, source] = args;
  if (args.length !== 2 || !isProseKind(kind) || source === undefined) {
    io.stderr(USAGE);
    return 1;
  }

  try {
    const content = source === "-" ? await io.readStdin() : await io.readFile(source);
    io.stdout(formatReport(analyzeProse(content, kind)));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`prose-report: ${message}`);
    return 1;
  }
}

if (import.meta.main) {
  const exitCode = await runProseReport(Bun.argv.slice(2), {
    readStdin: () => Bun.stdin.text(),
    readFile: (path) => Bun.file(path).text(),
    stdout: console.log,
    stderr: console.error,
  });
  process.exitCode = exitCode;
}
