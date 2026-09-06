import { expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { applySkillOperation, compareSkillTree, isSymlink, listSkillFiles } from "./skill-assets";

type Fixture = {
  root: string;
  projectRoot: string;
  packageRoot: string;
  templateDir: string;
};

function withFixture(body: (fixture: Fixture) => void): void {
  const root = mkdtempSync(join(tmpdir(), "docbridge-skill-assets-"));
  try {
    const packageRoot = join(root, "package");
    const templateDir = join(packageRoot, "templates", "skills", "docbridge");
    mkdirSync(join(templateDir, "references"), { recursive: true });
    writeFileSync(join(templateDir, "SKILL.md"), "# Skill\n", "utf8");
    writeFileSync(join(templateDir, "references", "checks.md"), "# Checks\n", "utf8");

    const projectRoot = join(root, "project");
    mkdirSync(projectRoot, { recursive: true });
    body({ root, projectRoot, packageRoot, templateDir });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("listSkillFiles walks nested directories in sorted order", () => {
  withFixture((fixture) => {
    expect(listSkillFiles(fixture.templateDir)).toEqual(["SKILL.md", "references/checks.md"]);
  });
});

test("listSkillFiles returns nothing for a missing directory", () => {
  withFixture((fixture) => {
    expect(listSkillFiles(join(fixture.root, "absent"))).toEqual([]);
  });
});

test("compareSkillTree reports no drift for an identical copy", () => {
  withFixture((fixture) => {
    const installed = join(fixture.projectRoot, "installed");
    mkdirSync(join(installed, "references"), { recursive: true });
    writeFileSync(join(installed, "SKILL.md"), "# Skill\n", "utf8");
    writeFileSync(join(installed, "references", "checks.md"), "# Checks\n", "utf8");

    expect(compareSkillTree(installed, fixture.templateDir)).toEqual({
      modified: [],
      missing: [],
      extra: [],
    });
  });
});

test("compareSkillTree separates changed, missing, and extra files", () => {
  withFixture((fixture) => {
    const installed = join(fixture.projectRoot, "installed");
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(installed, "SKILL.md"), "# Edited\n", "utf8");
    writeFileSync(join(installed, "notes.md"), "local\n", "utf8");

    expect(compareSkillTree(installed, fixture.templateDir)).toEqual({
      modified: ["SKILL.md"],
      missing: ["references/checks.md"],
      extra: ["notes.md"],
    });
  });
});

test("compareSkillTree treats an absent installation as fully missing", () => {
  withFixture((fixture) => {
    expect(compareSkillTree(join(fixture.root, "absent"), fixture.templateDir)).toEqual({
      modified: [],
      missing: ["SKILL.md", "references/checks.md"],
      extra: [],
    });
  });
});

test("isSymlink distinguishes links from directories and absent paths", () => {
  withFixture((fixture) => {
    const link = join(fixture.projectRoot, "link");
    symlinkSync(fixture.templateDir, link);

    expect(isSymlink(link)).toBe(true);
    expect(isSymlink(fixture.templateDir)).toBe(false);
    expect(isSymlink(join(fixture.root, "absent"))).toBe(false);
  });
});

test("applySkillOperation copies the template for a create action", () => {
  withFixture((fixture) => {
    applySkillOperation(fixture.projectRoot, fixture.packageRoot, {
      action: "create",
      path: ".claude/skills/docbridge",
    });

    expect(
      readFileSync(join(fixture.projectRoot, ".claude/skills/docbridge/SKILL.md"), "utf8"),
    ).toBe("# Skill\n");
    expect(
      readFileSync(
        join(fixture.projectRoot, ".claude/skills/docbridge/references/checks.md"),
        "utf8",
      ),
    ).toBe("# Checks\n");
  });
});

test("applySkillOperation replaces local edits for an overwrite action", () => {
  withFixture((fixture) => {
    const installed = join(fixture.projectRoot, ".claude/skills/docbridge");
    mkdirSync(installed, { recursive: true });
    writeFileSync(join(installed, "SKILL.md"), "# Edited\n", "utf8");

    applySkillOperation(fixture.projectRoot, fixture.packageRoot, {
      action: "overwrite",
      path: ".claude/skills/docbridge",
    });

    expect(readFileSync(join(installed, "SKILL.md"), "utf8")).toBe("# Skill\n");
  });
});

test("applySkillOperation removes an ordinary directory", () => {
  withFixture((fixture) => {
    const legacy = join(fixture.projectRoot, ".claude/skills/docbridge-adopt");
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, "SKILL.md"), "# Legacy\n", "utf8");

    applySkillOperation(fixture.projectRoot, fixture.packageRoot, {
      action: "remove",
      path: ".claude/skills/docbridge-adopt",
    });

    expect(existsSync(legacy)).toBe(false);
  });
});

test.each(["create", "overwrite", "remove"] as const)(
  "applySkillOperation leaves a symlink untouched for a %s action",
  (action) => {
    withFixture((fixture) => {
      const skills = join(fixture.projectRoot, ".claude/skills");
      mkdirSync(skills, { recursive: true });
      const link = join(skills, "docbridge");
      symlinkSync(fixture.templateDir, link);
      writeFileSync(join(fixture.templateDir, "SKILL.md"), "# Shared source\n", "utf8");

      applySkillOperation(fixture.projectRoot, fixture.packageRoot, {
        action,
        path: ".claude/skills/docbridge",
      });

      expect(isSymlink(link)).toBe(true);
      expect(readFileSync(join(fixture.templateDir, "SKILL.md"), "utf8")).toBe("# Shared source\n");
    });
  },
);

test.each(["skip", "would-create", "would-overwrite", "would-remove"] as const)(
  "applySkillOperation writes nothing for the %s action",
  (action) => {
    withFixture((fixture) => {
      applySkillOperation(fixture.projectRoot, fixture.packageRoot, {
        action,
        path: ".claude/skills/docbridge",
      });

      expect(existsSync(join(fixture.projectRoot, ".claude/skills/docbridge"))).toBe(false);
    });
  },
);

test("applySkillOperation removing an absent path is a no-op", () => {
  withFixture((fixture) => {
    expect(() => {
      applySkillOperation(fixture.projectRoot, fixture.packageRoot, {
        action: "remove",
        path: ".claude/skills/docbridge-adopt",
      });
    }).not.toThrow();
  });
});
