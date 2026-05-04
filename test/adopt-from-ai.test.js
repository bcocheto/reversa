import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest } from '../lib/installer/manifest.js';
import { ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function createAdoptAnswers() {
  return {
    project_name: 'Adopt From AI Demo',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript, PostgreSQL',
    objective: 'materialize-agentic-blueprint',
    initial_agents: ['orchestrator', 'product-owner', 'architect', 'engineer', 'reviewer'],
    initial_flows: ['feature-development', 'release'],
    chat_language: 'pt-br',
    doc_language: 'pt-br',
    git_strategy: 'commit',
    setup_mode: 'adopt',
    output_folder: '_agentforge',
    engines: ['codex'],
    internal_agents: AGENT_SKILL_IDS,
    response_mode: 'chat',
    detail_level: 'complete',
    memory_policy: 'persistent',
    review_policy: 'strict',
  };
}

async function installAdoptFixture(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir(createAdoptAnswers(), '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function writeLegacySurface(projectRoot) {
  writeFileSync(join(projectRoot, 'AGENTS.md'), [
    '# Legacy AGENTS',
    '',
    'This entrypoint still contains legacy instructions.',
  ].join('\n'), 'utf8');

  writeFileSync(join(projectRoot, 'CLAUDE.md'), [
    '# Legacy Claude',
    '',
    'This entrypoint also still contains legacy instructions.',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, '.agents', 'skills', 'legacy-audit'), { recursive: true });
  writeFileSync(join(projectRoot, '.agents', 'skills', 'legacy-audit', 'SKILL.md'), [
    '# Legacy Audit',
    '',
    'Audit the legacy surface before migration.',
  ].join('\n'), 'utf8');
}

function writeExistingCanonicalSurface(projectRoot) {
  mkdirSync(join(projectRoot, '.agentforge', 'agents'), { recursive: true });
  mkdirSync(join(projectRoot, '.agentforge', 'skills', 'blueprint-materialization'), { recursive: true });

  writeFileSync(join(projectRoot, '.agentforge', 'agents', 'adoption-orchestrator.yaml'), [
    'id: adoption-orchestrator',
    'name: Old Adoption Orchestrator',
    'description: legacy agent content',
    'responsibilities:',
    '  - legacy responsibility',
    'boundaries:',
    '  - legacy boundary',
  ].join('\n'), 'utf8');

  writeFileSync(join(projectRoot, '.agentforge', 'skills', 'blueprint-materialization', 'SKILL.md'), [
    '---',
    'name: Old Blueprint Materialization',
    'description: legacy skill content',
    'license: MIT',
    'metadata:',
    '  framework: agentforge',
    '  type: project-skill',
    '  source: skill-suggestion',
    '  suggestion_id: blueprint-materialization',
    '  confidence: high',
    '---',
    '',
    '# Old Blueprint Materialization',
    '',
    'Legacy skill content.',
  ].join('\n'), 'utf8');
}

function runCli(projectRoot, args) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

function findEvidence(bundle, path) {
  return bundle.evidence.find((item) => item.path === path) ?? bundle.evidence[0];
}

function evidenceItem(item, reason, snippet) {
  return {
    path: item.path,
    kind: item.kind,
    reason,
    snippet,
    ...(Number.isInteger(item.line) ? { line: item.line } : {}),
  };
}

function buildBlueprint(bundle) {
  const agentsMd = findEvidence(bundle, 'AGENTS.md');
  const claudeMd = findEvidence(bundle, 'CLAUDE.md');
  const legacySkill = findEvidence(bundle, '.agents/skills/legacy-audit/SKILL.md');
  const projectEvidence = findEvidence(bundle, '.agentforge/ai/evidence/project-evidence.json');
  const routerEvidence = findEvidence(bundle, '.agentforge/harness/router.md');

  return {
    blueprint: {
      project: {
        name: 'Adopt From AI Demo',
        type: 'SaaS/Web App',
        objective: 'materialize-agentic-blueprint',
        source_evidence: [
          evidenceItem(projectEvidence, 'Evidence bundle generated for blueprint materialization.', 'project-evidence.json'),
        ],
      },
      agents: [
        {
          id: 'adoption-orchestrator',
          name: 'Adoption Orchestrator',
          purpose: 'Coordinate blueprint application and validate the materialized architecture.',
          responsibilities: [
            'Plan the write order.',
            'Keep the materialization deterministic.',
          ],
          triggers: [
            'Blueprint approved for apply.',
          ],
          skills: ['blueprint-materialization'],
          context: ['context/adoption-architecture.md'],
          safety_limits: [
            'Do not invent roles without evidence.',
          ],
          source_evidence: [
            evidenceItem(agentsMd, 'Legacy Codex instructions show the active entrypoint.', 'AGENTS.md'),
            evidenceItem(projectEvidence, 'Evidence bundle produced by adopt --prepare.', 'bundle'),
          ],
        },
        {
          id: 'surface-curator',
          name: 'Surface Curator',
          purpose: 'Curate supporting context, policies, and documentation for the adopted architecture.',
          responsibilities: [
            'Shape context docs.',
            'Keep policies explicit.',
          ],
          triggers: [
            'Need to map policy or context files.',
          ],
          skills: ['context-curation'],
          context: ['context/adoption-governance.md'],
          safety_limits: [
            'Do not overwrite curated source evidence.',
          ],
          source_evidence: [
            evidenceItem(legacySkill, 'Legacy skill evidence informs the curated context.', 'Legacy Audit'),
            evidenceItem(routerEvidence, 'Router evidence anchors the managed surfaces.', 'router'),
          ],
        },
      ],
      skills: [
        {
          id: 'blueprint-materialization',
          name: 'Blueprint Materialization',
          description: 'Materialize an agentic blueprint into canonical files.',
          owner_agents: ['adoption-orchestrator'],
          steps: [
            'Read the blueprint.',
            'Write canonical files.',
            'Update state and manifest.',
          ],
          source_evidence: [
            evidenceItem(projectEvidence, 'The blueprint is derived from the collected evidence.', 'project-evidence.json'),
          ],
        },
        {
          id: 'context-curation',
          name: 'Context Curation',
          description: 'Curate human-readable context for the adopted architecture.',
          owner_agents: ['surface-curator'],
          steps: [
            'Summarize the architecture.',
            'Document policies and flows.',
          ],
          source_evidence: [
            evidenceItem(legacySkill, 'Legacy skill evidence shows a curated legacy surface.', 'Legacy Audit'),
          ],
        },
      ],
      context_documents: [
        {
          path: 'context/adoption-architecture.md',
          title: 'Adoption Architecture',
          purpose: 'Explain the chosen agentic layout and file map.',
          owner_agent: 'adoption-orchestrator',
          sections: [
            {
              heading: 'Architecture',
              bullets: [
                'The orchestrator coordinates the canonical AgentForge surface.',
                'Skills stay narrow and evidence-backed.',
              ],
            },
          ],
          source_evidence: [
            evidenceItem(projectEvidence, 'Evidence bundle identifies the project surface.', 'bundle'),
          ],
        },
        {
          path: 'context/adoption-governance.md',
          title: 'Adoption Governance',
          purpose: 'Describe policies, entrypoints, and safety rails.',
          owner_agent: 'surface-curator',
          sections: [
            {
              heading: 'Governance',
              bullets: [
                'Snapshots precede overwrites.',
                'Blueprint validation gates the apply step.',
              ],
            },
          ],
          source_evidence: [
            evidenceItem(claudeMd, 'Legacy Claude entrypoint is part of the managed surface.', 'CLAUDE.md'),
          ],
        },
      ],
      flows: [
        {
          id: 'adoption-materialization',
          name: 'Adoption Materialization',
          purpose: 'Write blueprint-decided files into the canonical AgentForge surface.',
          owner_agents: ['adoption-orchestrator', 'surface-curator'],
          steps: [
            'Normalize the blueprint.',
            'Write agents, skills, context docs, flows, and policies.',
            'Refresh context-index and context-map.',
            'Update state and manifest.',
          ],
          source_evidence: [
            evidenceItem(projectEvidence, 'Blueprint flow is derived from evidence bundle signals.', 'bundle'),
          ],
        },
      ],
      policies: [
        {
          id: 'permissions',
          name: 'Permission Policy',
          scope: 'materialization',
          rule: 'Only the blueprint-decided surfaces may be written; no heuristic promotion is allowed.',
          owner_agents: ['surface-curator'],
          source_evidence: [
            evidenceItem(projectEvidence, 'Permissions are part of the evidence-driven decision.', 'bundle'),
          ],
        },
        {
          id: 'protected-files',
          name: 'Protected Files Policy',
          scope: 'entrypoints',
          rule: 'Snapshots must precede overwrites of legacy entrypoints and generated surfaces.',
          owner_agents: ['adoption-orchestrator'],
          source_evidence: [
            evidenceItem(agentsMd, 'Legacy AGENTS.md must be snapshotted before overwrite.', 'Legacy AGENTS'),
          ],
        },
        {
          id: 'human-approval',
          name: 'Human Approval Policy',
          scope: 'apply',
          rule: 'A validated blueprint is required before adoption apply can materialize final files.',
          owner_agents: ['adoption-orchestrator', 'surface-curator'],
          source_evidence: [
            evidenceItem(claudeMd, 'Legacy Claude instructions are preserved as evidence.', 'Legacy Claude'),
          ],
        },
      ],
      routing: {
        default_agent: 'adoption-orchestrator',
        rules: [
          {
            trigger: 'materialize blueprint',
            agent: 'adoption-orchestrator',
            reason: 'Coordinates the write order and state updates.',
            source_evidence: [
              evidenceItem(projectEvidence, 'Evidence bundle supports materialization routing.', 'bundle'),
            ],
          },
        ],
        source_evidence: [
          evidenceItem(projectEvidence, 'Routing is decided from collected evidence.', 'bundle'),
        ],
      },
      entrypoints: [
        {
          path: 'AGENTS.md',
          engine: 'codex',
          purpose: 'Codex entrypoint for the adopted agentic surface.',
          owner_agent: 'adoption-orchestrator',
          source_evidence: [evidenceItem(agentsMd, 'Codex entrypoint evidence.', 'AGENTS.md')],
        },
        {
          path: 'CLAUDE.md',
          engine: 'claude-code',
          purpose: 'Claude entrypoint for the adopted agentic surface.',
          owner_agent: 'adoption-orchestrator',
          source_evidence: [evidenceItem(claudeMd, 'Claude entrypoint evidence.', 'CLAUDE.md')],
        },
        {
          path: '.cursor/rules/agentforge.md',
          engine: 'cursor',
          purpose: 'Cursor rules for the adopted agentic surface.',
          owner_agent: 'surface-curator',
          source_evidence: [evidenceItem(projectEvidence, 'Cursor rule derived from evidence bundle.', 'bundle')],
        },
        {
          path: '.github/copilot-instructions.md',
          engine: 'github-copilot',
          purpose: 'Copilot instructions for the adopted agentic surface.',
          owner_agent: 'surface-curator',
          source_evidence: [evidenceItem(projectEvidence, 'Copilot instructions derived from evidence bundle.', 'bundle')],
        },
      ],
      migration_plan: {
        mode: 'adopt-apply',
        steps: [
          {
            title: 'Snapshot legacy entrypoints',
            details: 'Preserve the old AGENTS.md and CLAUDE.md content before overwriting.',
            source_evidence: [evidenceItem(agentsMd, 'Legacy entrypoint snapshot is required.', 'Legacy AGENTS')],
          },
          {
            title: 'Materialize canonical surfaces',
            details: 'Write agents, skills, context, flows, policies, and entrypoints from the blueprint.',
            source_evidence: [evidenceItem(projectEvidence, 'Materialization is driven by the evidence bundle.', 'bundle')],
          },
        ],
        source_evidence: [
          evidenceItem(projectEvidence, 'Migration plan comes from the evidence bundle.', 'bundle'),
        ],
      },
    },
  };
}

function writeBlueprintFile(projectRoot, bundle) {
  const blueprint = buildBlueprint(bundle);
  const blueprintPath = join(projectRoot, 'adopt-blueprint.json');
  writeFileSync(blueprintPath, `${JSON.stringify(blueprint, null, 2)}\n`, 'utf8');
  return blueprintPath;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

test('agentforge adopt --apply --from-ai materializes a blueprint-decided architecture', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-from-ai-'));
  const cwd = process.cwd();

  try {
    process.chdir(projectRoot);
    await installAdoptFixture(projectRoot);
    writeLegacySurface(projectRoot);
    writeExistingCanonicalSurface(projectRoot);

    const prepareResult = runCli(projectRoot, ['adopt', '--prepare']);
    assert.equal(prepareResult.status, 0);

    const evidenceBundle = readJson(join(projectRoot, '.agentforge', 'ai', 'evidence', 'project-evidence.json'));
    const blueprintPath = writeBlueprintFile(projectRoot, evidenceBundle);

    const applyResult = runCli(projectRoot, ['adopt', '--apply', '--from-ai', blueprintPath]);
    assert.equal(applyResult.status, 0);
    assert.match(applyResult.stdout, /Blueprint da IA materializado com sucesso/);

    const generatedAgent = readFileSync(join(projectRoot, '.agentforge', 'agents', 'adoption-orchestrator.yaml'), 'utf8');
    assert.match(generatedAgent, /id: adoption-orchestrator/);
    const generatedSkill = readFileSync(join(projectRoot, '.agentforge', 'skills', 'blueprint-materialization', 'SKILL.md'), 'utf8');
    assert.match(generatedSkill, /Blueprint Materialization/);
    const generatedContext = readFileSync(join(projectRoot, '.agentforge', 'context', 'adoption-architecture.md'), 'utf8');
    assert.match(generatedContext, /Adoption Architecture/);
    const generatedFlow = readFileSync(join(projectRoot, '.agentforge', 'flows', 'adoption-materialization.yaml'), 'utf8');
    assert.match(generatedFlow, /id: adoption-materialization/);
    const generatedPolicy = readFileSync(join(projectRoot, '.agentforge', 'policies', 'permissions.yaml'), 'utf8');
    assert.match(generatedPolicy, /name: Permission Policy/);

    const agentsMd = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    assert.match(agentsMd, /<!-- agentforge:start -->/);
    const claudeMd = readFileSync(join(projectRoot, 'CLAUDE.md'), 'utf8');
    assert.match(claudeMd, /<!-- agentforge:start -->/);
    const cursorRules = readFileSync(join(projectRoot, '.cursor', 'rules', 'agentforge.md'), 'utf8');
    assert.match(cursorRules, /<!-- agentforge:start -->/);
    const copilot = readFileSync(join(projectRoot, '.github', 'copilot-instructions.md'), 'utf8');
    assert.match(copilot, /<!-- agentforge:start -->/);

    assert.equal(existsSync(join(projectRoot, '.agentforge', 'imports', 'snapshots', 'AGENTS.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'imports', 'snapshots', 'CLAUDE.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'imports', 'snapshots', '.agentforge', 'agents', 'adoption-orchestrator.yaml')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'imports', 'snapshots', '.agentforge', 'skills', 'blueprint-materialization', 'SKILL.md')), true);

    assert.equal(existsSync(join(projectRoot, '.agentforge', 'reports', 'adoption-apply.md')), true);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'reports', 'agentic-blueprint-validation.md')), true);

    const state = readJson(join(projectRoot, '.agentforge', 'state.json'));
    assert.equal(state.adoption_status, 'applied');
    assert.equal(state.adoption?.apply_status, 'applied');
    assert.ok(state.generated_agents.includes('adoption-orchestrator'));
    assert.ok(state.generated_agents.includes('surface-curator'));
    assert.ok(state.generated_skills.includes('blueprint-materialization'));
    assert.ok(state.generated_skills.includes('context-curation'));
    assert.ok(state.flows.includes('adoption-materialization'));

    const manifest = readJson(join(projectRoot, '.agentforge', '_config', 'files-manifest.json'));
    assert.ok(manifest['.agentforge/agents/adoption-orchestrator.yaml']);
    assert.ok(manifest['.agentforge/skills/blueprint-materialization/SKILL.md']);
    assert.ok(manifest['.agentforge/context/adoption-architecture.md']);
    assert.ok(manifest['.agentforge/flows/adoption-materialization.yaml']);
    assert.ok(manifest['.agentforge/policies/permissions.yaml']);
    assert.ok(manifest['.agentforge/reports/adoption-apply.md']);
    assert.ok(manifest['.agentforge/reports/agentic-blueprint-validation.md']);

    const validateResult = runCli(projectRoot, ['validate']);
    assert.equal(validateResult.status, 0);
  } finally {
    process.chdir(cwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge adopt --apply --from-ai fails when the blueprint is missing', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-adopt-from-ai-missing-'));
  const cwd = process.cwd();

  try {
    process.chdir(projectRoot);
    await installAdoptFixture(projectRoot);
    writeLegacySurface(projectRoot);

    const result = runCli(projectRoot, ['adopt', '--apply', '--from-ai', 'missing-blueprint.yaml']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /Blueprint ausente/);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'reports', 'adoption-apply.md')), false);
    assert.equal(existsSync(join(projectRoot, '.agentforge', 'reports', 'agentic-blueprint-validation.md')), false);
  } finally {
    process.chdir(cwd);
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
