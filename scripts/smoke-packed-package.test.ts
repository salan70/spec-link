import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  assertDocumentationCommands,
  assertInstalledScannerExecutables,
  type CommandResult,
} from "./smoke-packed-package";

test("assertInstalledScannerExecutables rejects installed scanner binaries without executable bits", () => {
  const root = mkdtempSync(join(tmpdir(), "docbridge-pack-smoke-"));
  try {
    const scanner = join(
      root,
      "node_modules/docbridge/dist/bin/darwin-arm64/docbridge-swift-scanner",
    );
    mkdirSync(join(scanner, ".."), { recursive: true });
    writeFileSync(scanner, "#!/bin/sh\n");
    chmodSync(scanner, 0o644);

    expect(() => assertInstalledScannerExecutables(root)).toThrow(
      "node_modules/docbridge/dist/bin/darwin-arm64/docbridge-swift-scanner is not executable",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("assertDocumentationCommands covers canonical, legacy, and unknown names", () => {
  const commands: string[][] = [];
  const canonical = [
    "automation",
    "commands",
    "configuration",
    "getting-started",
    "linking",
    "troubleshooting",
  ];
  const aliases: Record<string, string> = {
    annotations: "linking",
    "linking-workflow": "linking",
    "link-review": "linking",
    "agent-integration": "automation",
  };
  const execute = (args: string[]): CommandResult => {
    commands.push(args);
    if (args.join(" ") === "docs list --json") {
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          documents: canonical.map((name) => ({ name, description: `${name} guide` })),
          help: "help",
        }),
        stderr: "",
      };
    }
    const name = args[2] ?? "";
    if (name === "missing") {
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Unknown documentation name: missing\nAvailable names:\n  ${canonical.join(", ")}\n`,
      };
    }
    const resolved = aliases[name] ?? name;
    return {
      exitCode: 0,
      stdout: `# ${resolved}\n`,
      stderr:
        aliases[name] === undefined
          ? ""
          : `Documentation name '${name}' is deprecated; use '${resolved}'.\n`,
    };
  };

  assertDocumentationCommands(execute);

  expect(commands).toHaveLength(12);
  expect(commands).toContainEqual(["docs", "show", "agent-integration"]);
  expect(commands).toContainEqual(["docs", "show", "missing"]);
});

test("assertDocumentationCommands rejects aliases exposed by docs list", () => {
  expect(() =>
    assertDocumentationCommands(
      (): CommandResult => ({
        exitCode: 0,
        stdout: JSON.stringify({
          documents: [
            { name: "getting-started", description: "Start" },
            { name: "annotations", description: "Legacy" },
          ],
          help: "help",
        }),
        stderr: "",
      }),
    ),
  ).toThrow("docs list returned non-canonical names");
});
