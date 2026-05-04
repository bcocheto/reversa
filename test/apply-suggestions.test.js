import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import YAML from 'yaml';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, saveManifest } from '../lib/installer/manifest.js';
import { ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function installAnswers() {
  return {
    project_name: 'Apply Suggestions Demo',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript, NestJS, PostgreSQL',
    objective: 'develop-features',
    initial_agents: ['orchestrator', 'product-owner', 'architect', 'engineer', 'reviewer'],
    initial_flows: ['feature-development', 'release'],
    chat_language: 'pt-br',
    doc_language: 'pt-br',
    git_strategy: 'commit',
    setup_mode: 'bootstrap',
    output_folder: '_agentforge',
    engines: ['codex'],
    internal_agents: AGENT_SKILL_IDS,
    response_mode: 'chat',
    detail_level: 'complete',
    memory_policy: 'persistent',
    review_policy: 'strict',
  };
}

async function installFixture(projectRoot) {
  const writer = new Writer(projectRoot);
  writer.createProductDir(installAnswers(), '1.0.0');

  const codex = ENGINES.find((entry) => entry.id === 'codex');
  assert.ok(codex, 'Codex engine definition must exist');
  await writer.installEntryFile(codex, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, buildManifest(projectRoot, writer.manifestPaths));
}

function writeSuggestions(projectRoot) {
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'agents'), { recursive: true });
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'skills'), { recursive: true });
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'flows'), { recursive: true });
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'policies'), { recursive: true });

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'agents', 'automation-planner.yaml'), `${YAML.stringify({
    id: 'automation-planner',
    name: 'Automation Planner',
    category: 'automation',
    description: 'Planeja automações recorrentes e fluxos operacionais.',
    reason: 'O projeto tem workflows, workers e comandos de release.',
    confidence: 'high',
    responsibilities: [
      'Identificar automações repetitivas.',
      'Separar orquestração de execução.',
    ],
    reads: [
      '.github/workflows/',
      'worker/',
      'README.md',
    ],
    skills: ['create-implementation-plan', 'run-tests'],
    flows: ['release'],
    limits: [
      'Não automatizar operações destrutivas por padrão.',
      'Não esconder aprovações humanas em scripts.',
    ],
  }).trim()}\n`, 'utf8');

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'skills', 'ci-diagnosis.yaml'), `${YAML.stringify({
    id: 'ci-diagnosis',
    title: 'CI Diagnosis',
    description: 'Diagnostica falhas de CI e problemas de automação.',
    reason: 'GitHub Actions e scripts de validação estão presentes.',
    confidence: 'high',
    target_path: '.agentforge/skills/ci-diagnosis/SKILL.md',
    signals: ['.github/workflows/'],
    recommended_context: ['context/testing.md', 'references/commands.md'],
    recommended_steps: [
      'Listar os workflows e seus propósitos.',
      'Descrever a triagem de falhas.',
      'Separar erros de ambiente e de código.',
    ],
    safety_limits: [
      'Não editar segredos ou credenciais de workflow automaticamente.',
    ],
    status: 'recommended',
  }).trim()}\n`, 'utf8');

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'flows', 'review.yaml'), `${YAML.stringify({
    id: 'review',
    title: 'Review',
    description: 'Revisar mudanças com foco em risco, consistência e segurança.',
    reason: 'O projeto mostra documentação, automação e pontos de aprovação.',
    confidence: 'medium',
    target_path: '.agentforge/flows/review.yaml',
    recommended_steps: [
      'Ler a mudança.',
      'Checar impacto.',
      'Verificar políticas.',
      'Sinalizar riscos.',
      'Aprovar ou pedir ajustes.',
    ],
    safety_limits: ['Não aprovar uma revisão com riscos abertos.'],
    status: 'recommended',
  }).trim()}\n`, 'utf8');

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'policies', 'safety.yaml'), `${YAML.stringify({
    id: 'release-policy',
    title: 'Release Policy',
    description: 'Define aprovação e cuidados para ações de release.',
    reason: 'O projeto tem automação e processos de entrega.',
    confidence: 'high',
    target_path: '.agentforge/policies/release-policy.yaml',
    task_contexts: ['review'],
    safety_limits: ['Não automatizar ações de release sem confirmação humana.'],
    status: 'recommended',
  }).trim()}\n`, 'utf8');
}

function createProjectSurface(projectRoot) {
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
    name: 'apply-suggestions-demo',
    private: true,
    packageManager: 'pnpm@9.0.0',
    scripts: {
      test: 'node --test',
      lint: 'eslint .',
    },
    dependencies: {
      next: '^15.0.0',
      react: '^19.0.0',
      'react-dom': '^19.0.0',
      prisma: '^5.0.0',
      pg: '^8.0.0',
    },
  }, null, 2), 'utf8');

  writeFileSync(join(projectRoot, 'README.md'), [
    '# Apply Suggestions Demo',
    '',
    'Objective: validate apply-suggestions blueprint mode.',
    '',
    '## Commands',
    '',
    '- `npm test`',
    '- `npm run lint`',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, 'src'), { recursive: true });
  writeFileSync(join(projectRoot, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');
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
  const projectEvidence = findEvidence(bundle, '.agentforge/ai/evidence/project-evidence.json');

  return {
    blueprint: {
      project: {
        name: 'Apply Suggestions Blueprint Demo',
        type: 'SaaS/Web App',
        objective: 'materialize-agentic-blueprint',
        source_evidence: [
          evidenceItem(projectEvidence, 'Evidence bundle generated by ai-evidence.', 'project-evidence.json'),
        ],
      },
      agents: [
        {
          id: 'decision-orchestrator',
          name: 'Decision Orchestrator',
          purpose: 'Coordinate blueprint application and validate the adopted surface.',
          responsibilities: ['Plan the write order.', 'Keep the materialization deterministic.'],
          triggers: ['Blueprint approved for apply.'],
          skills: ['blueprint-materialization'],
          context: ['context/decision-architecture.md'],
          safety_limits: ['Do not invent roles without evidence.'],
          source_evidence: [
            evidenceItem(agentsMd, 'Legacy Codex instructions show the active entrypoint.', 'AGENTS.md'),
            evidenceItem(projectEvidence, 'Evidence bundle produced by ai-evidence.', 'bundle'),
          ],
        },
      ],
      skills: [
        {
          id: 'blueprint-materialization',
          name: 'Blueprint Materialization',
          description: 'Materialize an agentic blueprint into canonical files.',
          owner_agents: ['decision-orchestrator'],
          steps: [
            'Read the blueprint.',
            'Write canonical files.',
            'Update state and manifest.',
          ],
          source_evidence: [
            evidenceItem(projectEvidence, 'The blueprint is derived from the collected evidence.', 'project-evidence.json'),
          ],
        },
      ],
      context_documents: [
        {
          path: 'context/decision-architecture.md',
          title: 'Decision Architecture',
          purpose: 'Explain the chosen agentic layout and file map.',
          owner_agent: 'decision-orchestrator',
          sections: [
            {
              heading: 'Architecture',
              bullets: [
                'The orchestrator coordinates the canonical AgentForge surface.',
                'Blueprint decisions remain evidence-backed.',
              ],
            },
          ],
          source_evidence: [
            evidenceItem(projectEvidence, 'Evidence bundle identifies the project surface.', 'bundle'),
          ],
        },
      ],
      flows: [
        {
          id: 'decision-materialization',
          name: 'Decision Materialization',
          purpose: 'Write blueprint-decided files into the canonical AgentForge surface.',
          owner_agents: ['decision-orchestrator'],
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
          owner_agents: ['decision-orchestrator'],
          source_evidence: [
            evidenceItem(projectEvidence, 'Permissions are part of the evidence-driven decision.', 'bundle'),
          ],
        },
        {
          id: 'protected-files',
          name: 'Protected Files Policy',
          scope: 'entrypoints',
          rule: 'Snapshots must precede overwrites of legacy entrypoints and generated surfaces.',
          owner_agents: ['decision-orchestrator'],
          source_evidence: [
            evidenceItem(agentsMd, 'Legacy AGENTS.md must be snapshotted before overwrite.', 'Legacy AGENTS'),
          ],
        },
        {
          id: 'human-approval',
          name: 'Human Approval Policy',
          scope: 'apply',
          rule: 'A validated blueprint is required before adoption apply can materialize final files.',
          owner_agents: ['decision-orchestrator'],
          source_evidence: [
            evidenceItem(claudeMd, 'Legacy Claude instructions are preserved as evidence.', 'CLAUDE.md'),
          ],
        },
      ],
      routing: {
        default_agent: 'decision-orchestrator',
        rules: [
          {
            trigger: 'materialize blueprint',
            agent: 'decision-orchestrator',
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
          owner_agent: 'decision-orchestrator',
          source_evidence: [evidenceItem(agentsMd, 'Codex entrypoint evidence.', 'AGENTS.md')],
        },
        {
          path: 'CLAUDE.md',
          engine: 'claude-code',
          purpose: 'Claude entrypoint for the adopted agentic surface.',
          owner_agent: 'decision-orchestrator',
          source_evidence: [evidenceItem(claudeMd, 'Claude entrypoint evidence.', 'CLAUDE.md')],
        },
        {
          path: '.cursor/rules/agentforge.md',
          engine: 'cursor',
          purpose: 'Cursor rules for the adopted agentic surface.',
          owner_agent: 'decision-orchestrator',
          source_evidence: [evidenceItem(projectEvidence, 'Cursor rule derived from evidence bundle.', 'bundle')],
        },
        {
          path: '.github/copilot-instructions.md',
          engine: 'github-copilot',
          purpose: 'Copilot instructions for the adopted agentic surface.',
          owner_agent: 'decision-orchestrator',
          source_evidence: [evidenceItem(projectEvidence, 'Copilot instructions derived from evidence bundle.', 'bundle')],
        },
      ],
      migration_plan: {
        mode: 'apply-suggestions-blueprint',
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
        source_evidence: [evidenceItem(projectEvidence, 'Migration plan comes from the evidence bundle.', 'bundle')],
      },
    },
  };
}

function writeBlueprintFile(projectRoot, bundle) {
  const blueprintPath = join(projectRoot, 'apply-suggestions-blueprint.json');
  writeFileSync(blueprintPath, `${JSON.stringify(buildBlueprint(bundle), null, 2)}\n`, 'utf8');
  return blueprintPath;
}

function runApply(projectRoot, args = [], input = '') {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'apply-suggestions', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    input,
  });
}

function runAiEvidence(projectRoot, args = []) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'ai-evidence', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

test('agentforge apply-suggestions --dry-run only generates the report', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-apply-dry-'));

  try {
    await installFixture(projectRoot);
    writeSuggestions(projectRoot);

    const result = runApply(projectRoot, ['--dry-run', '--all']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /apply-suggestions\.md/);

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'automation-planner.yaml')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'ci-diagnosis', 'SKILL.md')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'review.yaml')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'policies', 'safety.yaml')), false);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'apply-suggestions.md'), 'utf8');
    assert.match(report, /Dry run: yes/);
    assert.match(report, /Agents:/);
    assert.match(report, /Skills:/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge apply-suggestions applies selected artifacts after confirmation', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-apply-confirm-'));

  try {
    await installFixture(projectRoot);
    writeSuggestions(projectRoot);

    const agentsSnapshot = readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8');
    const result = runApply(projectRoot, ['--all'], 'y\n');
    assert.equal(result.status, 0);

    assert.equal(readFileSync(join(projectRoot, 'AGENTS.md'), 'utf8'), agentsSnapshot);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'automation-planner.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'ci-diagnosis', 'SKILL.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'review.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'policies', 'release-policy.yaml')), true);

    const skill = readFileSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'ci-diagnosis', 'SKILL.md'), 'utf8');
    assert.match(skill, /# CI Diagnosis/);
    assert.match(skill, /## Limites de segurança/);

    const flow = YAML.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'review.yaml'), 'utf8'));
    assert.equal(flow.id, 'review');
    assert.ok(Array.isArray(flow.steps));

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'apply-suggestions.md'), 'utf8');
    assert.match(report, /Confirmed: yes/);
    assert.match(report, /Applied/);
    assert.match(report, /Harness updates/);
    assert.match(report, /agents\.automation-planner/);
    assert.match(report, /task_contexts\.review\.policies/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.last_apply_suggestions_at, 'string');
    assert.ok(state.generated_agents.includes('automation-planner'));
    assert.ok(state.generated_skills.includes('ci-diagnosis'));
    assert.ok(state.flows.includes('review'));
    assert.ok(Array.isArray(state.applied_suggestions.agents));
    assert.ok(Array.isArray(state.applied_suggestions.skills));
    assert.ok(state.created_files.includes('.agentforge/harness/context-index.yaml'));

    const contextIndex = YAML.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8'));
    assert.ok(Array.isArray(contextIndex.agents));
    assert.ok(Array.isArray(contextIndex.skills));
    assert.ok(Array.isArray(contextIndex.flows));
    assert.ok(contextIndex.agents.some((item) => item.id === 'automation-planner'));
    assert.ok(contextIndex.skills.some((item) => item.id === 'ci-diagnosis'));
    assert.ok(contextIndex.flows.some((item) => item.id === 'review'));
    assert.ok(contextIndex.task_contexts.review.skills.includes('skills/ci-diagnosis/SKILL.md'));
    assert.ok(contextIndex.task_contexts.review.flows.includes('flows/review.yaml'));
    assert.ok(contextIndex.task_contexts.review.policies.includes('policies/release-policy.yaml'));

    const manifest = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json'), 'utf8'));
    assert.ok(manifest['.agentforge/reports/apply-suggestions.md']);
    assert.ok(manifest['.agentforge/agents/automation-planner.yaml']);
    assert.ok(manifest['.agentforge/skills/ci-diagnosis/SKILL.md']);
    assert.ok(manifest['.agentforge/flows/review.yaml']);
    assert.ok(manifest['.agentforge/policies/release-policy.yaml']);
    assert.ok(manifest['.agentforge/harness/context-index.yaml']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge apply-suggestions preserves a modified context index without --force', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-apply-context-index-modified-'));

  try {
    await installFixture(projectRoot);
    writeSuggestions(projectRoot);

    const contextIndexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
    const originalContextIndex = readFileSync(contextIndexPath, 'utf8');
    writeFileSync(contextIndexPath, `${originalContextIndex}manual_guard: keep\n`, 'utf8');

    const result = runApply(projectRoot, ['--all'], 'y\n');
    assert.equal(result.status, 0);

    const contextIndex = readFileSync(contextIndexPath, 'utf8');
    assert.match(contextIndex, /manual_guard: keep/);

    const report = readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'apply-suggestions.md'), 'utf8');
    assert.match(report, /Harness updates/);
    assert.match(report, /blocked/);
    assert.match(report, /Patch recommendation/);
    assert.match(report, /context-index-modified/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge apply-suggestions --blueprint materializes a blueprint-decided architecture', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-apply-blueprint-'));

  try {
    await installFixture(projectRoot);
    writeLegacySurface(projectRoot);
    createProjectSurface(projectRoot);

    const evidenceResult = runAiEvidence(projectRoot);
    assert.equal(evidenceResult.status, 0);

    const evidenceBundle = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'evidence', 'project-evidence.json'), 'utf8'));
    const blueprintPath = writeBlueprintFile(projectRoot, evidenceBundle);

    const result = runApply(projectRoot, ['--blueprint', blueprintPath]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Blueprint da IA materializado com sucesso/);

    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'decision-orchestrator.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'blueprint-materialization', 'SKILL.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'context', 'decision-architecture.md')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'decision-materialization.yaml')), true);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'policies', 'permissions.yaml')), true);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(state.adoption_status, 'applied');
    assert.equal(state.adoption?.apply_status, 'applied');
    assert.ok(state.generated_agents.includes('decision-orchestrator'));
    assert.ok(state.generated_skills.includes('blueprint-materialization'));
    assert.ok(state.flows.includes('decision-materialization'));

    const contextIndex = YAML.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml'), 'utf8'));
    assert.ok(Array.isArray(contextIndex.task_contexts?.adopt?.agents));
    assert.ok(contextIndex.task_contexts.adopt.agents.includes('.agentforge/agents/'));
    assert.ok(contextIndex.skills.some((item) => item.id === 'blueprint-materialization'));
    assert.ok(contextIndex.flows.some((item) => item.id === 'decision-materialization'));

    const manifest = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json'), 'utf8'));
    assert.ok(manifest['.agentforge/agents/decision-orchestrator.yaml']);
    assert.ok(manifest['.agentforge/skills/blueprint-materialization/SKILL.md']);
    assert.ok(manifest['.agentforge/context/decision-architecture.md']);
    assert.ok(manifest['.agentforge/flows/decision-materialization.yaml']);
    assert.ok(manifest['.agentforge/policies/permissions.yaml']);
    assert.ok(manifest['.agentforge/reports/adoption-apply.md']);
    assert.ok(manifest['.agentforge/reports/agentic-blueprint-validation.md']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge apply-suggestions --blueprint rejects an invalid blueprint without changing the state', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-apply-blueprint-invalid-'));

  try {
    await installFixture(projectRoot);
    writeLegacySurface(projectRoot);
    createProjectSurface(projectRoot);

    const evidenceResult = runAiEvidence(projectRoot);
    assert.equal(evidenceResult.status, 0);

    const stateBefore = readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8');
    const invalidBlueprintPath = join(projectRoot, 'invalid-blueprint.yaml');
    writeFileSync(invalidBlueprintPath, [
      'blueprint:',
      '  project:',
      '    name: Invalid Blueprint',
      '    type: SaaS/Web App',
      '    objective: materialize-agentic-blueprint',
      '    source_evidence:',
      '      - path: AGENTS.md',
      '        kind: file',
      '        reason: legacy entrypoint',
      '        snippet: AGENTS.md',
      '  routing:',
      '    default_agent: decision-orchestrator',
      '  migration_plan:',
      '    mode: apply-suggestions-blueprint',
    ].join('\n'), 'utf8');

    const result = runApply(projectRoot, ['--blueprint', invalidBlueprintPath]);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /routing\.default_agent/);
    assert.match(result.stdout, /Blueprint validation report/);

    assert.equal(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'), stateBefore);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'agents', 'decision-orchestrator.yaml')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'skills', 'blueprint-materialization', 'SKILL.md')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'context', 'decision-architecture.md')), false);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'flows', 'decision-materialization.yaml')), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
