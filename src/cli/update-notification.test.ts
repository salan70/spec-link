import { expect, test } from "bun:test";

import pkg from "../../package.json";
import type { CliRuntime } from "./index";
import { run } from "./index";
import { capture } from "./test-support";

const NEWER: CliRuntime["latest"] = { status: "ok", latest: "99.0.0", source: "cache" };

function runCheck(cliRuntime: CliRuntime) {
  const c = capture();
  const code = run(
    ["check", "--root", "examples/typescript"],
    c.io,
    { prompts: { isInteractive: false, confirm: () => false, select: (_m, _c, d) => d } },
    cliRuntime,
  );
  return { code, out: c.out, err: c.err };
}

test("a newer stable release produces one notice on stderr", () => {
  const result = runCheck({ latest: NEWER, env: {}, isTty: true });

  expect(result.code).toBe(0);
  expect(result.err).toContain(`Update available: docbridge ${pkg.version} -> 99.0.0`);
  expect(result.err).toContain("docbridge@latest");
  expect(result.err).toContain("DOCBRIDGE_NO_UPDATE_CHECK=1");
  expect(result.err.trimEnd().split("\n")).toHaveLength(3);
});

test("the notice never reaches stdout", () => {
  expect(runCheck({ latest: NEWER, env: {}, isTty: true }).out).not.toContain("Update available");
});

test("an up-to-date registry answer prints nothing", () => {
  expect(
    runCheck({
      latest: { status: "ok", latest: pkg.version, source: "cache" },
      env: {},
      isTty: true,
    }).err,
  ).toBe("");
});

test("a prerelease on the registry prints nothing", () => {
  expect(
    runCheck({
      latest: { status: "ok", latest: "99.0.0-rc.1", source: "cache" },
      env: {},
      isTty: true,
    }).err,
  ).toBe("");
});

test("an unavailable registry answer prints nothing", () => {
  expect(
    runCheck({ latest: { status: "unavailable", source: "network" }, env: {}, isTty: true }).err,
  ).toBe("");
});

test("no lookup at all prints nothing", () => {
  expect(runCheck({ env: {}, isTty: true }).err).toBe("");
});

test("a non-TTY invocation prints nothing", () => {
  expect(runCheck({ latest: NEWER, env: {}, isTty: false }).err).toBe("");
});

test("CI prints nothing", () => {
  expect(runCheck({ latest: NEWER, env: { CI: "true" }, isTty: true }).err).toBe("");
});

test("the opt-out environment variable prints nothing", () => {
  expect(
    runCheck({ latest: NEWER, env: { DOCBRIDGE_NO_UPDATE_CHECK: "1" }, isTty: true }).err,
  ).toBe("");
});

test("JSON output prints nothing", () => {
  const c = capture();
  const code = run(
    ["check", "--root", "examples/typescript", "--json"],
    c.io,
    { prompts: { isInteractive: false, confirm: () => false, select: (_m, _c, d) => d } },
    { latest: NEWER, env: {}, isTty: true },
  );

  expect(code).toBe(0);
  expect(c.err).toBe("");
  expect(() => JSON.parse(c.out)).not.toThrow();
});

test("the upgrade command prints no separate notice", () => {
  const c = capture();
  run(
    ["upgrade", "--check", "--agent-target", "none"],
    c.io,
    { prompts: { isInteractive: false, confirm: () => false, select: (_m, _c, d) => d } },
    { latest: NEWER, env: {}, isTty: true },
  );

  expect(c.err).toBe("");
  expect(c.out).toContain("Status: outdated");
});

test("--version prints the notice on stderr and keeps stdout exact", () => {
  const c = capture();
  const code = run(["--version"], c.io, undefined, { latest: NEWER, env: {}, isTty: true });

  expect(code).toBe(0);
  expect(c.out).toBe(`${pkg.version}\n`);
  expect(c.err).toContain("Update available");
});

test("a failing command prints no notice", () => {
  const c = capture();
  const code = run(["check", "--root", "definitely-missing-root"], c.io, undefined, {
    latest: NEWER,
    env: {},
    isTty: true,
  });

  expect(code).toBe(1);
  expect(c.err).not.toContain("Update available");
});
