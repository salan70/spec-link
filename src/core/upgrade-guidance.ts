/**
 * Package-manager upgrade guidance for the running CLI binary.
 *
 * DocBridge never upgrades itself: it is consumed through Bun, npm, pnpm,
 * Yarn, global installs, and package-manager runners, so invoking one of them
 * would make the real install state implicit and could silently disagree with
 * the project's lockfile. Instead the CLI detects what it can and prints the
 * command the user should run.
 */

import { sep } from "node:path";

export type PackageManager = "bun" | "npm" | "pnpm" | "yarn";

export type InstallScope = "project" | "global" | "unknown";

export type UpgradeGuidance = {
  /** Detected from the invoking package manager, when it announced itself. */
  packageManager: PackageManager | undefined;
  scope: InstallScope;
  /** The single command to print first. */
  primaryCommand: string;
  /** Equivalent commands for the package managers that were not detected. */
  alternativeCommands: string[];
};

const PACKAGE_MANAGERS: readonly PackageManager[] = ["bun", "npm", "pnpm", "yarn"];

const PROJECT_COMMANDS: Record<PackageManager, string> = {
  bun: "bun add -d docbridge@latest",
  npm: "npm install --save-dev docbridge@latest",
  pnpm: "pnpm add -D docbridge@latest",
  yarn: "yarn add -D docbridge@latest",
};

const GLOBAL_COMMANDS: Record<PackageManager, string> = {
  bun: "bun add -g docbridge@latest",
  npm: "npm install -g docbridge@latest",
  pnpm: "pnpm add -g docbridge@latest",
  yarn: "yarn global add docbridge@latest",
};

type GuidanceEnv = Readonly<Record<string, string | undefined>>;

/**
 * Identify the package manager that spawned the current process from the
 * `npm_config_user_agent` string every major manager sets for its scripts.
 * A direct binary invocation leaves it unset, which stays `undefined`.
 */
export function detectPackageManager(env: GuidanceEnv = process.env): PackageManager | undefined {
  const userAgent = env.npm_config_user_agent;
  if (userAgent === undefined || userAgent.length === 0) {
    return undefined;
  }

  const name = userAgent.trim().split("/", 1)[0]?.toLowerCase();
  return PACKAGE_MANAGERS.find((manager) => manager === name);
}

/**
 * Classify where the running package lives. A package root under the project's
 * own `node_modules` is a project dependency; any other `node_modules` is a
 * global or runner cache install. A source checkout has neither and stays
 * `unknown`, which keeps the guidance generic instead of guessing wrong.
 */
export function detectInstallScope(packageRoot: string, projectRoot: string): InstallScope {
  const normalizedPackageRoot = withTrailingSeparator(packageRoot);
  if (!normalizedPackageRoot.includes(`${sep}node_modules${sep}`)) {
    return "unknown";
  }

  return normalizedPackageRoot.startsWith(`${withTrailingSeparator(projectRoot)}node_modules${sep}`)
    ? "project"
    : "global";
}

/**
 * Build the guidance shown by the update notice and by `upgrade --check`.
 * An undetected scope is presented with the project-dependency command, which
 * is the common case, and the global forms stay available as alternatives.
 *
 * @doc docs/specs/cli.md#upgrade-guidance
 */
export function detectUpgradeGuidance(input: {
  packageRoot: string;
  projectRoot: string;
  env?: GuidanceEnv;
}): UpgradeGuidance {
  const packageManager = detectPackageManager(input.env ?? process.env);
  const scope = detectInstallScope(input.packageRoot, input.projectRoot);
  const commands = scope === "global" ? GLOBAL_COMMANDS : PROJECT_COMMANDS;
  const primaryManager = packageManager ?? "npm";

  return {
    packageManager,
    scope,
    primaryCommand: commands[primaryManager],
    alternativeCommands: PACKAGE_MANAGERS.filter((manager) => manager !== primaryManager).map(
      (manager) => commands[manager],
    ),
  };
}

/** Render the guidance as the lines shared by the notice and the command. */
export function formatUpgradeGuidance(guidance: UpgradeGuidance): string[] {
  const scopeLabel =
    guidance.scope === "unknown" ? "install scope not detected" : `${guidance.scope} install`;
  return [
    `Upgrade command (${scopeLabel}): ${guidance.primaryCommand}`,
    `Other package managers: ${guidance.alternativeCommands.join(", ")}`,
  ];
}

function withTrailingSeparator(path: string): string {
  return path.endsWith(sep) ? path : `${path}${sep}`;
}
