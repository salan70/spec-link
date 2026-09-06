/**
 * Filesystem operations and drift detection for the distributable skill trees.
 *
 * `init` and `upgrade` both install exactly one managed directory per agent
 * destination and both refuse to touch a symlink, so the guard lives here once
 * rather than in each command. Comparison against the packaged template is what
 * lets `upgrade` distinguish an untouched copy from a locally edited one.
 */

import { cpSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

/** Every action a planned managed-asset operation can carry. */
export type FileOpAction =
  | "create"
  | "skip"
  | "overwrite"
  | "would-create"
  | "would-overwrite"
  | "remove"
  | "would-remove";

export type PlannedFileOp = {
  action: FileOpAction;
  path: string;
  content?: string;
  reason?: string;
};

export type SkillTreeComparison = {
  /** Files present in both trees whose bytes differ. */
  modified: string[];
  /** Template files absent from the installed copy. */
  missing: string[];
  /** Installed files with no template counterpart. */
  extra: string[];
};

export function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * List every regular file under `directory`, as `/`-separated relative paths.
 * Symlinked entries are listed but never followed, so a link inside a skill
 * tree is reported as drift instead of being silently traversed.
 */
export function listSkillFiles(directory: string): string[] {
  const files: string[] = [];
  collectSkillFiles(directory, "", files);
  return files.toSorted();
}

/**
 * Compare an installed skill directory against its packaged template.
 *
 * @doc docs/specs/cli.md#managed-skill-assets
 */
export function compareSkillTree(installedDir: string, templateDir: string): SkillTreeComparison {
  const installedFiles = new Set(listSkillFiles(installedDir));
  const templateFiles = listSkillFiles(templateDir);
  const modified: string[] = [];
  const missing: string[] = [];

  for (const file of templateFiles) {
    if (!installedFiles.has(file)) {
      missing.push(file);
      continue;
    }
    installedFiles.delete(file);
    if (
      readFileOrUndefined(join(installedDir, file)) !== readFileOrUndefined(join(templateDir, file))
    ) {
      modified.push(file);
    }
  }

  return { modified, missing, extra: [...installedFiles].toSorted() };
}

/**
 * Apply one planned skill operation.
 *
 * Every action re-checks the symlink guard immediately before touching the
 * path: the plan was built earlier, and a destination that became a symlink in
 * between must still be left alone rather than removed or overwritten.
 *
 * @doc docs/specs/cli.md#managed-skill-assets
 */
export function applySkillOperation(
  projectRoot: string,
  packageRoot: string,
  operation: PlannedFileOp,
): void {
  const destinationDir = join(projectRoot, operation.path);

  if (operation.action === "remove") {
    if (!isSymlink(destinationDir)) {
      rmSync(destinationDir, { recursive: true, force: true });
    }
    return;
  }

  if (operation.action !== "create" && operation.action !== "overwrite") {
    return;
  }
  if (isSymlink(destinationDir)) {
    return;
  }

  const skillName = operation.path.split("/").at(-1);
  if (skillName === undefined) {
    return;
  }

  mkdirSync(destinationDir, { recursive: true });
  cpSync(join(packageRoot, "templates", "skills", skillName), destinationDir, {
    recursive: true,
    force: true,
  });
}

function collectSkillFiles(root: string, prefix: string, files: string[]): void {
  let entries;
  try {
    entries = readdirSync(join(root, prefix), { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries.toSorted((left, right) => (left.name < right.name ? -1 : 1))) {
    const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      collectSkillFiles(root, relativePath, files);
      continue;
    }
    files.push(relativePath);
  }
}

function readFileOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}
