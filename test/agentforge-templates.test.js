import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
} from "fs";
import { spawnSync } from "child_process";
import { join } from "path";
import { fileURLToPath } from "url";
import { tmpdir } from "os";

import { Writer } from "../lib/installer/writer.js";
import {
  buildManifest,
  saveManifest,
  loadManifest,
} from "../lib/installer/manifest.js";
import {
  buildUninstallPlan,
  applyUninstallPlan,
  runUninstall,
} from "../lib/commands/uninstall.js";
import { createProjectAgent } from "../lib/commands/add-agent.js";
import { createProjectFlow } from "../lib/commands/add-flow.js";
import { compileAgentForge } from "../lib/exporter/index.js";
import { ENGINES } from "../lib/installer/detector.js";
import {
  AGENT_SKILL_IDS,
  DEFAULT_GENERATED_SUBAGENT_IDS,
  PRODUCT,
} from "../lib/product.js";

const AGENTFORGE_BIN = fileURLToPath(
  new URL("../bin/agentforge.js", import.meta.url),
);

const BASE_INSTALL_ANSWERS = {
  project_name: "Demo Project",
  user_name: "Ana",
  project_type: "SaaS/Web App",
  stack: "Node.js, TypeScript, PostgreSQL",
  objective: "develop-features",
  initial_agents: [
    "orchestrator",
    "product-owner",
    "architect",
    "engineer",
    "reviewer",
  ],
  initial_flows: ["feature-development", "release"],
  chat_language: "pt-br",
  doc_language: "pt-br",
  git_strategy: "commit",
  setup_mode: "bootstrap",
  output_folder: "_agentforge",
  engines: ["codex"],
  internal_agents: AGENT_SKILL_IDS,
  response_mode: "chat",
  detail_level: "complete",
  memory_policy: "persistent",
  review_policy: "strict",
};

function createInstallAnswers(overrides = {}) {
  return {
    ...BASE_INSTALL_ANSWERS,
    ...overrides,
    initial_agents: overrides.initial_agents ?? [
      ...BASE_INSTALL_ANSWERS.initial_agents,
    ],
    initial_flows: overrides.initial_flows ?? [
      ...BASE_INSTALL_ANSWERS.initial_flows,
    ],
    engines: overrides.engines ?? [...BASE_INSTALL_ANSWERS.engines],
    internal_agents: overrides.internal_agents ?? [
      ...BASE_INSTALL_ANSWERS.internal_agents,
    ],
  };
}

async function createInstalledProject(
  projectRoot,
  { modifiedAgentsMd = false, keepOutput = false } = {},
) {
  const writer = new Writer(projectRoot);
  const answers = createInstallAnswers({
    engines: ["codex", "claude-code", "cursor", "github-copilot"],
  });

  writer.createProductDir(answers, "1.0.0");

  for (const engineId of ["codex", "claude-code"]) {
    const engine = ENGINES.find((entry) => entry.id === engineId);
    assert.ok(engine);
    await writer.installEntryFile(engine, { force: true });
    for (const agentId of answers.internal_agents) {
      await writer.installSkill(agentId, engine.skillsDir);
      if (
        engine.universalSkillsDir &&
        engine.universalSkillsDir !== engine.skillsDir
      ) {
        await writer.installSkill(agentId, engine.universalSkillsDir);
      }
    }
  }

  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

  await compileAgentForge(projectRoot, {
    mergeStrategyResolver: async () => "merge",
  });

  if (modifiedAgentsMd) {
    const agentsPath = join(projectRoot, "AGENTS.md");
    writeFileSync(
      agentsPath,
      `${readFileSync(agentsPath, "utf8")}\nLinha manual do usuário.\n`,
      "utf8",
    );
  }

  if (keepOutput) {
    const outputDir = join(projectRoot, PRODUCT.outputDir);
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(
      join(projectRoot, PRODUCT.outputDir, "notes.md"),
      "# Output\n",
      "utf8",
    );
  }

  return { writer, answers };
}

test("install writes the AgentForge state, config, plan, and engine entry templates", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-templates-"));

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers({
      initial_agents: [
        "orchestrator",
        "product-owner",
        "architect",
        "engineer",
        "reviewer",
      ],
      initial_flows: ["feature-development", "release"],
    });

    writer.createProductDir(answers, "1.0.0");
    await writer.installEntryFile(
      { entryTemplate: "AGENTS.md", entryFile: "AGENTS.md" },
      { force: true },
    );
    await writer.installEntryFile(
      { entryTemplate: "CLAUDE.md", entryFile: "CLAUDE.md" },
      { force: true },
    );
    await writer.installEntryFile(
      { entryTemplate: "cursorrules", entryFile: ".cursorrules" },
      { force: true },
    );
    await writer.installEntryFile(
      { entryTemplate: "cursorrules", entryFile: ".cursor/rules/agentforge.md" },
      { force: true },
    );
    await writer.installEntryFile(
      {
        entryTemplate: "copilot-instructions",
        entryFile: ".github/copilot-instructions.md",
      },
      { force: true },
    );
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const state = JSON.parse(
      readFileSync(
        join(projectRoot, PRODUCT.internalDir, "state.json"),
        "utf8",
      ),
    );
    assert.equal(state.version, "1.0.0");
    assert.equal(state.project, "Demo Project");
    assert.equal(state.user_name, "Ana");
    assert.equal(state.setup_mode, "bootstrap");
    assert.equal(state.project_type, "SaaS/Web App");
    assert.equal(state.stack, "Node.js, TypeScript, PostgreSQL");
    assert.equal(state.objective, "develop-features");
    assert.equal(state.phase, null);
    assert.deepEqual(state.pending, [
      "discovery",
      "agent-design",
      "flow-design",
      "policies",
      "export",
      "review",
    ]);
    assert.deepEqual(state.internal_agents, AGENT_SKILL_IDS);
    assert.deepEqual(state.initial_agents, [
      "orchestrator",
      "product-owner",
      "architect",
      "engineer",
      "reviewer",
    ]);
    assert.deepEqual(state.generated_agents, [
      "orchestrator",
      "product-owner",
      "architect",
      "engineer",
      "reviewer",
      "qa",
      "security",
      "devops",
    ]);
    assert.deepEqual(state.generated_subagents, DEFAULT_GENERATED_SUBAGENT_IDS);
    assert.deepEqual(state.initial_flows, ["feature-development", "release"]);
    assert.deepEqual(state.flows, ["feature-development", "release"]);
    assert.equal(state.output_folder, "_agentforge");
    assert.equal(state.git_strategy, "commit");
    assert.deepEqual(state.checkpoints, {});
    assert.ok(state.created_files.includes(".agentforge/scope.md"));
    assert.ok(state.created_files.includes(".agentforge/README.md"));
    assert.ok(state.created_files.includes(".agentforge/harness/router.md"));
    assert.ok(
      state.created_files.includes(".agentforge/context/project-overview.md"),
    );
    assert.ok(
      state.created_files.includes(".agentforge/references/commands.md"),
    );
    assert.ok(
      state.created_files.includes(".agentforge/policies/protected-files.md"),
    );
    assert.ok(
      state.created_files.includes(".agentforge/flows/feature-development.md"),
    );
    assert.ok(
      state.created_files.includes(".agentforge/skills/run-tests/SKILL.md"),
    );
    assert.ok(state.created_files.includes(".agentforge/memory/lessons.md"));
    assert.ok(state.created_files.includes(".agentforge/reports/README.md"));
    assert.ok(
      state.created_files.includes(".agentforge/agents/orchestrator.yaml"),
    );
    assert.ok(state.created_files.includes(".agentforge/agents/qa.yaml"));
    assert.ok(state.created_files.includes(".agentforge/agents/security.yaml"));
    assert.ok(state.created_files.includes(".agentforge/agents/devops.yaml"));
    assert.ok(state.created_files.includes(".agentforge/flows/release.yaml"));
    assert.ok(
      state.created_files.includes(".agentforge/memory/conventions.md"),
    );
    assert.equal(Object.hasOwn(state, "agents"), false);
    assert.equal(Object.hasOwn(state, "answer_mode"), false);
    assert.equal(Object.hasOwn(state, "doc_level"), false);

    const config = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "config.toml"),
      "utf8",
    );
    assert.match(config, /\[initial_agents\]/);
    assert.match(config, /\[setup\]/);
    assert.match(config, /mode = "bootstrap"/);
    assert.match(config, /type = "SaaS\/Web App"/);
    assert.match(config, /stack = "Node\.js, TypeScript, PostgreSQL"/);
    assert.match(config, /objective = "develop-features"/);
    assert.match(config, /\[internal_agents\]/);
    assert.match(config, /response_mode = "chat"/);
    assert.match(config, /detail_level = "complete"/);
    assert.match(config, /folder = "_agentforge"/);

    const plan = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "plan.md"),
      "utf8",
    );
    assert.match(plan, /Fase 1 — Discovery/);
    assert.match(plan, /Fase 6 — Review/);
    assert.match(plan, /Tipo de projeto: SaaS\/Web App/);
    assert.match(plan, /Stack principal: Node\.js, TypeScript, PostgreSQL/);
    assert.match(plan, /Objetivo principal: develop-features/);
    assert.doesNotMatch(plan, /Reconhecimento|Escavação|Geração|Revisão/);

    const scope = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "scope.md"),
      "utf8",
    );
    assert.match(scope, /Escopo do AgentForge/);
    assert.match(scope, /Tipo: SaaS\/Web App/);
    assert.match(scope, /Stack principal: Node\.js, TypeScript, PostgreSQL/);
    assert.match(scope, /Objetivo principal: develop-features/);
    assert.match(
      scope,
      /Agentes iniciais: Orchestrator, Product Owner, Architect, Engineer, Reviewer/,
    );
    assert.match(scope, /Fluxos iniciais: Feature Development, Release/);

    const rootReadme = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "README.md"),
      "utf8",
    );
    assert.match(rootReadme, /AgentForge Workspace/);
    assert.match(rootReadme, /Modo de instalação/);

    const harnessRouter = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "harness", "router.md"),
      "utf8",
    );
    assert.match(harnessRouter, /Router/);
    assert.match(harnessRouter, /bootstrap/);

    const contextOverview = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "context", "project-overview.md"),
      "utf8",
    );
    assert.match(contextOverview, /Project Overview/);
    assert.match(contextOverview, /<nome do projeto>/);

    const skillsReadme = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "skills", "README.md"),
      "utf8",
    );
    assert.match(skillsReadme, /Skills/);

    const runTestsSkill = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "skills", "run-tests", "SKILL.md"),
      "utf8",
    );
    assert.match(runTestsSkill, /^---/m);
    assert.match(runTestsSkill, /name: run-tests/);
    assert.match(runTestsSkill, /license: MIT/);
    assert.match(runTestsSkill, /compatibility:/);

    const orchestrator = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "agents", "orchestrator.yaml"),
      "utf8",
    );
    assert.match(orchestrator, /name: orchestrator/);
    assert.match(orchestrator, /slash_command: \/agentforge/);
    assert.equal(
      existsSync(join(projectRoot, PRODUCT.internalDir, "agents", "qa.yaml")),
      true,
    );
    assert.equal(
      existsSync(
        join(projectRoot, PRODUCT.internalDir, "agents", "security.yaml"),
      ),
      true,
    );
    assert.equal(
      existsSync(
        join(projectRoot, PRODUCT.internalDir, "agents", "devops.yaml"),
      ),
      true,
    );
    assert.equal(
      existsSync(
        join(projectRoot, PRODUCT.internalDir, "flows", "release.yaml"),
      ),
      true,
    );

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest[".agentforge/scope.md"]);
    assert.ok(manifest[".agentforge/README.md"]);
    assert.ok(manifest[".agentforge/harness/router.md"]);
    assert.ok(manifest[".agentforge/context/project-overview.md"]);
    assert.ok(manifest[".agentforge/references/commands.md"]);
    assert.ok(manifest[".agentforge/policies/protected-files.md"]);
    assert.ok(manifest[".agentforge/flows/feature-development.md"]);
    assert.ok(manifest[".agentforge/skills/run-tests/SKILL.md"]);
    assert.ok(manifest[".agentforge/memory/lessons.md"]);
    assert.ok(manifest[".agentforge/reports/README.md"]);
    assert.ok(manifest[".agentforge/agents/orchestrator.yaml"]);
    assert.ok(manifest[".agentforge/agents/qa.yaml"]);
    assert.ok(manifest[".agentforge/agents/security.yaml"]);
    assert.ok(manifest[".agentforge/agents/devops.yaml"]);
    assert.ok(manifest[".agentforge/flows/feature-development.yaml"]);
    assert.ok(manifest[".agentforge/flows/release.yaml"]);
    assert.ok(manifest[".agentforge/policies/permissions.yaml"]);
    assert.ok(manifest[".agentforge/memory/decisions.md"]);
    assert.ok(manifest["AGENTS.md"]);
    assert.ok(manifest["CLAUDE.md"]);
    assert.ok(manifest[".cursorrules"]);
    assert.ok(manifest[".cursor/rules/agentforge.md"]);
    assert.ok(manifest[".github/copilot-instructions.md"]);
    assert.equal(
      existsSync(join(projectRoot, PRODUCT.internalDir, "reports")),
      true,
    );

    const agentsEntry = readFileSync(join(projectRoot, "AGENTS.md"), "utf8");
    assert.match(agentsEntry, /<!-- agentforge:start -->/);
    assert.match(agentsEntry, /Leia `\.agentforge\/harness\/router\.md`/);
    assert.match(
      agentsEntry,
      /Use `\.agentforge\/harness\/context-index\.yaml`/,
    );
    assert.match(
      agentsEntry,
      /Considere `\.agentforge\/memory\/` quando relevante\./,
    );
    assert.equal(
      (agentsEntry.match(/<!-- agentforge:start -->/g) ?? []).length,
      1,
    );
    assert.equal(
      (agentsEntry.match(/<!-- agentforge:end -->/g) ?? []).length,
      1,
    );

    const claudeEntry = readFileSync(join(projectRoot, "CLAUDE.md"), "utf8");
    assert.match(claudeEntry, /<!-- agentforge:start -->/);
    assert.match(claudeEntry, /Leia `\.agentforge\/harness\/router\.md`/);
    assert.match(
      claudeEntry,
      /Use `\.agentforge\/harness\/context-index\.yaml`/,
    );
    assert.match(
      claudeEntry,
      /Considere `\.agentforge\/memory\/` quando relevante\./,
    );
    assert.equal(
      (claudeEntry.match(/<!-- agentforge:start -->/g) ?? []).length,
      1,
    );
    assert.equal(
      (claudeEntry.match(/<!-- agentforge:end -->/g) ?? []).length,
      1,
    );

    const cursorEntry = readFileSync(join(projectRoot, ".cursorrules"), "utf8");
    assert.match(cursorEntry, /<!-- agentforge:start -->/);
    assert.match(
      cursorEntry,
      /Considere `\.agentforge\/memory\/` quando relevante\./,
    );
    assert.equal(
      (cursorEntry.match(/<!-- agentforge:start -->/g) ?? []).length,
      1,
    );
    assert.equal(
      (cursorEntry.match(/<!-- agentforge:end -->/g) ?? []).length,
      1,
    );

    const cursorRulesEntry = readFileSync(
      join(projectRoot, ".cursor", "rules", "agentforge.md"),
      "utf8",
    );
    assert.match(cursorRulesEntry, /<!-- agentforge:start -->/);
    assert.match(cursorRulesEntry, /alwaysApply: true/);
    assert.match(
      cursorRulesEntry,
      /Considere `\.agentforge\/memory\/` quando relevante\./,
    );
    assert.equal(
      (cursorRulesEntry.match(/<!-- agentforge:start -->/g) ?? []).length,
      1,
    );
    assert.equal(
      (cursorRulesEntry.match(/<!-- agentforge:end -->/g) ?? []).length,
      1,
    );

    const copilotEntry = readFileSync(
      join(projectRoot, ".github", "copilot-instructions.md"),
      "utf8",
    );
    assert.match(copilotEntry, /<!-- agentforge:start -->/);
    assert.match(
      copilotEntry,
      /Considere `\.agentforge\/memory\/` quando relevante\./,
    );
    assert.equal(
      (copilotEntry.match(/<!-- agentforge:start -->/g) ?? []).length,
      1,
    );
    assert.equal(
      (copilotEntry.match(/<!-- agentforge:end -->/g) ?? []).length,
      1,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge status shows the AgentForge team state on a fresh install", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-status-fresh-"));

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers();

    writer.createProductDir(answers, "1.0.0");
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, "status"], {
      cwd: projectRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /AgentForge status/);
    assert.match(result.stdout, /Project:/);
    assert.match(result.stdout, /User:/);
    assert.match(result.stdout, /Version:/);
    assert.match(result.stdout, /Setup mode:/);
    assert.match(result.stdout, /bootstrap/);
    assert.match(result.stdout, /Current phase:/);
    assert.match(result.stdout, /Engines:/);
    assert.match(result.stdout, /Generated agents:/);
    assert.match(result.stdout, /Generated subagents:/);
    assert.match(result.stdout, /Flows:/);
    assert.match(result.stdout, /Policies status:/);
    assert.match(result.stdout, /Last validation status:/);
    assert.match(result.stdout, /Output folder:/);
    assert.match(result.stdout, /orchestrator/);
    assert.match(result.stdout, /release/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge status reports the last validation status when report exists", async () => {
  const projectRoot = mkdtempSync(
    join(tmpdir(), "agentforge-status-validation-"),
  );

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers();

    writer.createProductDir(answers, "1.0.0");
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    spawnSync(process.execPath, [AGENTFORGE_BIN, "validate"], {
      cwd: projectRoot,
      encoding: "utf8",
    });

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, "status"], {
      cwd: projectRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Last validation status:/);
    assert.match(result.stdout, /válido/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge status reports when AgentForge is not installed", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-status-missing-"));

  try {
    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, "status"], {
      cwd: projectRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.match(
      result.stdout,
      /AgentForge is not installed in this directory\. Run npx agentforge install\./,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("uninstall preserves modified canonical files and removes intact ones", () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-uninstall-"));

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers();

    writer.createProductDir(answers, "1.0.0");
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const modifiedPath = join(
      projectRoot,
      PRODUCT.internalDir,
      "memory",
      "conventions.md",
    );
    writeFileSync(
      modifiedPath,
      `${readFileSync(modifiedPath, "utf8")}\nLinha adicionada pelo usuário.\n`,
      "utf8",
    );

    const state = JSON.parse(
      readFileSync(
        join(projectRoot, PRODUCT.internalDir, "state.json"),
        "utf8",
      ),
    );
    const manifest = loadManifest(projectRoot);
    const plan = buildUninstallPlan(
      projectRoot,
      state,
      manifest,
      PRODUCT.internalDir,
    );
    const result = applyUninstallPlan(projectRoot, plan);

    assert.equal(result.errors, 0);
    assert.equal(existsSync(modifiedPath), true);
    assert.equal(
      existsSync(join(projectRoot, PRODUCT.internalDir, "scope.md")),
      false,
    );
    assert.equal(
      existsSync(
        join(projectRoot, PRODUCT.internalDir, "agents", "orchestrator.yaml"),
      ),
      false,
    );
    assert.equal(
      existsSync(join(projectRoot, PRODUCT.internalDir, "reports")),
      false,
    );
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir)), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge uninstall removes a fresh installation when remove is confirmed", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-uninstall-full-"));

  try {
    await createInstalledProject(projectRoot, { keepOutput: true });

    const prompts = [{ confirmed: "remove" }, { removeOutput: true }];
    const result = await runUninstall(projectRoot, {
      prompt: async () => prompts.shift(),
    });

    assert.equal(result.errors, 0);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir)), false);
    assert.equal(existsSync(join(projectRoot, "AGENTS.md")), false);
    assert.equal(existsSync(join(projectRoot, "CLAUDE.md")), false);
    assert.equal(
      existsSync(join(projectRoot, ".cursor", "rules", "agentforge.md")),
      false,
    );
    assert.equal(
      existsSync(join(projectRoot, ".github", "copilot-instructions.md")),
      false,
    );
    assert.equal(existsSync(join(projectRoot, ".agents")), false);
    assert.equal(existsSync(join(projectRoot, ".claude")), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.outputDir)), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge uninstall preserves modified AGENTS.md and keeps output folder when declined", async () => {
  const projectRoot = mkdtempSync(
    join(tmpdir(), "agentforge-uninstall-preserve-"),
  );

  try {
    await createInstalledProject(projectRoot, {
      modifiedAgentsMd: true,
      keepOutput: true,
    });

    const prompts = [{ confirmed: "remove" }, { removeOutput: false }];
    const result = await runUninstall(projectRoot, {
      prompt: async () => prompts.shift(),
    });

    assert.equal(result.errors, 0);
    assert.equal(existsSync(join(projectRoot, "AGENTS.md")), true);
    assert.match(
      readFileSync(join(projectRoot, "AGENTS.md"), "utf8"),
      /Linha manual do usuário\./,
    );
    assert.equal(existsSync(join(projectRoot, "CLAUDE.md")), false);
    assert.equal(
      existsSync(join(projectRoot, ".cursor", "rules", "agentforge.md")),
      false,
    );
    assert.equal(
      existsSync(join(projectRoot, ".github", "copilot-instructions.md")),
      false,
    );
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir)), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.outputDir)), true);
    assert.equal(
      existsSync(join(projectRoot, PRODUCT.outputDir, "notes.md")),
      true,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge validate succeeds on a fresh install and writes validation.md", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-validate-ok-"));

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers();

    writer.createProductDir(answers, "1.0.0");
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, "validate"], {
      cwd: projectRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 0);
    assert.equal(
      existsSync(
        join(projectRoot, PRODUCT.internalDir, "reports", "validation.md"),
      ),
      true,
    );

    const report = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "reports", "validation.md"),
      "utf8",
    );
    assert.match(report, /Status: válido/);
    assert.match(report, /Agentes:/);
    assert.match(report, /Fluxos:/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge validate fails when a flow references a missing agent", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-validate-fail-"));

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers();

    writer.createProductDir(answers, "1.0.0");
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const flowPath = join(
      projectRoot,
      PRODUCT.internalDir,
      "flows",
      "feature-development.yaml",
    );
    const brokenFlow = readFileSync(flowPath, "utf8").replace(
      "agent: orchestrator",
      "agent: ghost-agent",
    );
    writeFileSync(flowPath, brokenFlow, "utf8");

    const result = spawnSync(process.execPath, [AGENTFORGE_BIN, "validate"], {
      cwd: projectRoot,
      encoding: "utf8",
    });

    assert.equal(result.status, 1);
    assert.equal(
      existsSync(
        join(projectRoot, PRODUCT.internalDir, "reports", "validation.md"),
      ),
      true,
    );

    const report = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "reports", "validation.md"),
      "utf8",
    );
    assert.match(report, /Status: inválido/);
    assert.match(report, /ghost-agent/);
    assert.match(report, /Agent inexistente referenciado/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge compile generates bootloader entrypoints and preserves modified AGENTS.md", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-compile-"));

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers();

    writer.createProductDir(answers, "1.0.0");
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const statePath = join(projectRoot, PRODUCT.internalDir, "state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.engines = ["codex", "claude-code", "cursor", "copilot"];
    writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");

    rmSync(join(projectRoot, "AGENTS.md"), { force: true });
    rmSync(join(projectRoot, "CLAUDE.md"), { force: true });
    rmSync(join(projectRoot, ".cursor"), { recursive: true, force: true });
    rmSync(join(projectRoot, ".github"), { recursive: true, force: true });
    rmSync(join(projectRoot, ".claude"), { recursive: true, force: true });

    const first = spawnSync(process.execPath, [AGENTFORGE_BIN, "compile"], {
      cwd: projectRoot,
      encoding: "utf8",
    });

    assert.equal(first.status, 0);
    assert.equal(existsSync(join(projectRoot, "AGENTS.md")), true);
    assert.equal(existsSync(join(projectRoot, "CLAUDE.md")), true);
    assert.equal(
      existsSync(join(projectRoot, ".cursor", "rules", "agentforge.md")),
      true,
    );
    assert.equal(
      existsSync(join(projectRoot, ".github", "copilot-instructions.md")),
      true,
    );
    assert.equal(
      existsSync(join(projectRoot, ".claude", "agents", "orchestrator.md")),
      true,
    );
    assert.equal(
      existsSync(
        join(projectRoot, PRODUCT.internalDir, "reports", "compile.md"),
      ),
      true,
    );

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest["AGENTS.md"]);
    assert.ok(manifest["CLAUDE.md"]);
    assert.ok(manifest[".cursor/rules/agentforge.md"]);
    assert.ok(manifest[".github/copilot-instructions.md"]);
    assert.ok(manifest[".claude/agents/orchestrator.md"]);
    assert.ok(manifest[".agentforge/reports/compile.md"]);

    const agentsEntry = readFileSync(join(projectRoot, "AGENTS.md"), "utf8");
    assert.match(agentsEntry, /<!-- agentforge:start -->/);
    assert.match(agentsEntry, /<!-- agentforge:end -->/);
    assert.match(agentsEntry, /router\.md/);
    assert.match(agentsEntry, /context-index\.yaml/);
    assert.match(agentsEntry, /policies\//);
    assert.match(agentsEntry, /skills\//);
    assert.match(agentsEntry, /flows\//);
    assert.match(agentsEntry, /references\//);
    assert.match(agentsEntry, /memory\//);
    assert.doesNotMatch(agentsEntry, /conteúdo.*dump/i);

    const manualLine = "Linha manual do usuário.";
    writeFileSync(
      join(projectRoot, "AGENTS.md"),
      `${agentsEntry}\n${manualLine}\n`,
      "utf8",
    );

    const second = spawnSync(process.execPath, [AGENTFORGE_BIN, "compile"], {
      cwd: projectRoot,
      encoding: "utf8",
    });

    assert.equal(second.status, 0);
    const secondAgents = readFileSync(join(projectRoot, "AGENTS.md"), "utf8");
    assert.match(secondAgents, /Linha manual do usuário\./);
    assert.equal(
      (secondAgents.match(/<!-- agentforge:start -->/g) ?? []).length,
      1,
    );

    const third = spawnSync(
      process.execPath,
      [AGENTFORGE_BIN, "compile", "--force"],
      {
        cwd: projectRoot,
        encoding: "utf8",
      },
    );

    assert.equal(third.status, 0);
    assert.match(
      readFileSync(join(projectRoot, "AGENTS.md"), "utf8"),
      /Linha manual do usuário\./,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge add-agent creates a project agent and updates state and manifest", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-add-agent-"));

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers();

    writer.createProductDir(answers, "1.0.0");
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const result = createProjectAgent(projectRoot, {
      id: "backend-engineer",
      name: "Backend Engineer",
      mission: "Construir e manter serviços de backend confiáveis.",
      responsibilities:
        "Criar APIs, manter integrações e revisar mudanças de persistência.",
      can_change: "src/backend, tests, .agentforge",
      cannot_change: ".env, secrets, package-lock.json",
      human_approval:
        "Remover dados, alterar contratos públicos, tocar em segredos",
      activation_commands: "agentforge backend-engineer, /backend-engineer",
      create_suggested_subagents: true,
    });

    assert.equal(result.ok, true);
    assert.equal(
      existsSync(
        join(
          projectRoot,
          PRODUCT.internalDir,
          "agents",
          "backend-engineer.yaml",
        ),
      ),
      true,
    );

    const state = JSON.parse(
      readFileSync(
        join(projectRoot, PRODUCT.internalDir, "state.json"),
        "utf8",
      ),
    );
    assert.ok(state.generated_agents.includes("backend-engineer"));
    assert.ok(
      state.created_files.includes(".agentforge/agents/backend-engineer.yaml"),
    );

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest[".agentforge/agents/backend-engineer.yaml"]);

    const agentFile = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "agents", "backend-engineer.yaml"),
      "utf8",
    );
    assert.match(agentFile, /id: backend-engineer/);
    assert.match(agentFile, /name: Backend Engineer/);
    assert.match(agentFile, /responsibilities:/);

    const validateResult = spawnSync(
      process.execPath,
      [AGENTFORGE_BIN, "validate"],
      {
        cwd: projectRoot,
        encoding: "utf8",
      },
    );

    assert.equal(validateResult.status, 0);
    assert.match(
      readFileSync(
        join(projectRoot, PRODUCT.internalDir, "reports", "validation.md"),
        "utf8",
      ),
      /backend-engineer/,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge add-agent refuses duplicate ids", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-add-agent-dup-"));

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers();

    writer.createProductDir(answers, "1.0.0");
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const first = createProjectAgent(projectRoot, {
      id: "backend-engineer",
      name: "Backend Engineer",
      mission: "Criar serviços de backend.",
      responsibilities: "Criar APIs",
      can_change: "src/backend",
      cannot_change: ".env",
      human_approval: "",
      activation_commands: "",
      create_suggested_subagents: false,
    });
    assert.equal(first.ok, true);

    const second = createProjectAgent(projectRoot, {
      id: "backend-engineer",
      name: "Backend Engineer 2",
      mission: "Outra missão",
      responsibilities: "Outra responsabilidade",
      can_change: "src/other",
      cannot_change: ".env",
      human_approval: "",
      activation_commands: "",
      create_suggested_subagents: false,
    });

    assert.equal(second.ok, false);
    assert.match(second.errors.join("\n"), /Já existe um agente com o id/);
    const agentFile = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "agents", "backend-engineer.yaml"),
      "utf8",
    );
    assert.match(agentFile, /Criar serviços de backend/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge add-flow creates a project flow and updates state and manifest", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "agentforge-add-flow-"));

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers();

    writer.createProductDir(answers, "1.0.0");
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const result = createProjectFlow(projectRoot, {
      id: "backend-release",
      name: "Backend Release",
      description: "Fluxo para liberar uma mudança de backend em segurança.",
      steps: [
        {
          id: "clarify",
          agent: "product-owner",
          instruction: "Esclarecer requisitos e riscos.",
          output: "requirements.md",
          depends_on: "",
          gate: false,
        },
        {
          id: "design",
          agent: "architect",
          instruction: "Desenhar a solução técnica.",
          output: "technical-plan.md",
          depends_on: "clarify",
          gate: false,
        },
        {
          id: "implement",
          agent: "engineer",
          instruction: "Implementar a solução aprovada.",
          output: "implementation-notes.md",
          depends_on: "design",
          gate: false,
        },
        {
          id: "review",
          agent: "reviewer",
          instruction: "Revisar a entrega final.",
          output: "",
          depends_on: "implement",
          gate: true,
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(
      existsSync(
        join(projectRoot, PRODUCT.internalDir, "flows", "backend-release.yaml"),
      ),
      true,
    );

    const state = JSON.parse(
      readFileSync(
        join(projectRoot, PRODUCT.internalDir, "state.json"),
        "utf8",
      ),
    );
    assert.ok(state.flows.includes("backend-release"));
    assert.ok(
      state.created_files.includes(".agentforge/flows/backend-release.yaml"),
    );

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest[".agentforge/flows/backend-release.yaml"]);

    const flowFile = readFileSync(
      join(projectRoot, PRODUCT.internalDir, "flows", "backend-release.yaml"),
      "utf8",
    );
    assert.match(flowFile, /id: backend-release/);
    assert.match(flowFile, /agent: product-owner/);
    assert.match(flowFile, /gate: required/);

    const validateResult = spawnSync(
      process.execPath,
      [AGENTFORGE_BIN, "validate"],
      {
        cwd: projectRoot,
        encoding: "utf8",
      },
    );

    assert.equal(validateResult.status, 0);
    assert.match(
      readFileSync(
        join(projectRoot, PRODUCT.internalDir, "reports", "validation.md"),
        "utf8",
      ),
      /backend-release/,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge add-flow rejects references to missing agents", async () => {
  const projectRoot = mkdtempSync(
    join(tmpdir(), "agentforge-add-flow-invalid-"),
  );

  try {
    const writer = new Writer(projectRoot);
    const answers = createInstallAnswers();

    writer.createProductDir(answers, "1.0.0");
    writer.saveCreatedFiles();
    saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));

    const result = createProjectFlow(projectRoot, {
      id: "invalid-flow",
      name: "Invalid Flow",
      description: "Fluxo inválido para teste.",
      steps: [
        {
          id: "clarify",
          agent: "ghost-agent",
          instruction: "Passo inválido.",
          output: "requirements.md",
          depends_on: "",
          gate: false,
        },
      ],
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join("\n"), /agente inexistente referenciado/);
    assert.equal(
      existsSync(
        join(projectRoot, PRODUCT.internalDir, "flows", "invalid-flow.yaml"),
      ),
      false,
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("agentforge help advertises the compile command", () => {
  const result = spawnSync(process.execPath, [AGENTFORGE_BIN, "--help"], {
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.match(
    result.stdout,
    /compile\s+Gera bootloaders pequenos e arquivos derivados para engines configuradas/,
  );
  assert.match(result.stdout, /export\s+Alias de compile/);
  assert.match(
    result.stdout,
    /improve\s+Analisa a estrutura e sugere melhorias/,
  );
  assert.match(
    result.stdout,
    /add-flow\s+Cria um fluxo operacional customizado/,
  );
  assert.doesNotMatch(result.stdout, /reversa/i);
});
