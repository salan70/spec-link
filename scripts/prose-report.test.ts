import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { analyzeProse, runProseReport } from "./prose-report";

function words(count: number): string {
  return Array.from({ length: count }, (_, index) => `word${index}`).join(" ");
}

test("analyzeProse excludes frontmatter, comments, and fenced code", () => {
  const report = analyzeProse(
    [
      "---",
      "description: hidden words",
      "---",
      "",
      "<!-- hidden comment words -->",
      "Visible words.",
      "",
      "```text",
      "hidden fenced words",
      "```",
    ].join("\n"),
    "document",
  );

  expect(report.wordCount).toBe(2);
  expect(report.warnings).toEqual([]);
});

test.each([
  ["issue", 800],
  ["pull-request", 500],
  ["plan", 1_500],
] as const)("%s warns only above its word limit", (kind, limit) => {
  expect(analyzeProse(words(limit), kind).warnings).not.toContainEqual(
    expect.objectContaining({ code: "word-limit" }),
  );
  expect(analyzeProse(words(limit + 1), kind).warnings).toContainEqual(
    expect.objectContaining({ code: "word-limit", actual: limit + 1, limit }),
  );
});

test("document has no total word limit", () => {
  const report = analyzeProse(`${words(100)}\n\n${words(100)}\n\n${words(100)}`, "document");

  expect(report.warnings).not.toContainEqual(expect.objectContaining({ code: "word-limit" }));
});

test("all kinds warn about paragraphs longer than 120 words", () => {
  expect(analyzeProse(words(120), "document").warnings).not.toContainEqual(
    expect.objectContaining({ code: "long-paragraph" }),
  );
  expect(analyzeProse(words(121), "document").warnings).toContainEqual(
    expect.objectContaining({ code: "long-paragraph", line: 1, actual: 121, limit: 120 }),
  );
});

test("wrapped list items remain one paragraph", () => {
  const report = analyzeProse(`- first\n  ${words(120)}`, "document");

  expect(report.warnings).toContainEqual(
    expect.objectContaining({ code: "long-paragraph", line: 1, actual: 121 }),
  );
});

test("duplicate paragraphs require at least 20 normalized words", () => {
  const longParagraph = words(20);
  const report = analyzeProse(
    `${longParagraph}\n\n${longParagraph.toUpperCase().replaceAll(" ", "   ")}\n`,
    "document",
  );

  expect(report.warnings).toContainEqual({
    code: "duplicate-paragraph",
    line: 3,
    originalLine: 1,
    actual: 20,
    limit: 20,
  });
  expect(analyzeProse(`${words(19)}\n\n${words(19)}`, "document").warnings).toEqual([]);
});

test("representative verbose and concise pull requests produce different warnings", () => {
  const repeated = words(130);
  const verbose = ["# Summary", repeated, repeated, words(250)].join("\n\n");
  const concise = [
    "# Summary",
    "Adds the requested writing workflow.",
    "# Verification",
    "Tests pass.",
  ].join("\n\n");

  expect(analyzeProse(verbose, "pull-request").warnings.length).toBeGreaterThan(0);
  expect(analyzeProse(concise, "pull-request").warnings).toEqual([]);
});

test("runProseReport reads stdin and keeps advisory warnings non-blocking", async () => {
  const stdout: string[] = [];
  const stderr: string[] = [];

  const exitCode = await runProseReport(["issue", "-"], {
    readStdin: async () => words(801),
    readFile: async () => {
      throw new Error("file input was not expected");
    },
    stdout: (message) => stdout.push(message),
    stderr: (message) => stderr.push(message),
  });

  expect(exitCode).toBe(0);
  expect(stdout.join("\n")).toContain("word-limit");
  expect(stderr).toEqual([]);
});

test("runProseReport rejects invalid arguments", async () => {
  const stderr: string[] = [];

  const exitCode = await runProseReport(["email", "draft.md"], {
    readStdin: async () => "",
    readFile: async () => "",
    stdout: () => {},
    stderr: (message) => stderr.push(message),
  });

  expect(exitCode).toBe(1);
  expect(stderr.join("\n")).toContain(
    "Usage: prose-report <issue|pull-request|document|plan> <path|->",
  );
});

test("the justfile exposes the prose report command", () => {
  const justfile = readFileSync(join(import.meta.dir, "..", "justfile"), "utf8");

  expect(justfile).toContain(
    "prose-report kind source:\n    bun run scripts/prose-report.ts {{ kind }} {{ source }}",
  );
});
