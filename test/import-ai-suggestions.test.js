import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { spawnSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import YAML from 'yaml';

import { Writer } from '../lib/installer/writer.js';
import { buildManifest, loadManifest, saveManifest } from '../lib/installer/manifest.js';
import { ENGINES } from '../lib/installer/detector.js';
import { AGENT_SKILL_IDS, PRODUCT } from '../lib/product.js';

const AGENTFORGE_BIN = fileURLToPath(new URL('../bin/agentforge.js', import.meta.url));

function installAnswers() {
  return {
    project_name: 'Import AI Suggestions Demo',
    user_name: 'Ana',
    project_type: 'SaaS/Web App',
    stack: 'Node.js, TypeScript, Next.js, PostgreSQL',
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

function createProjectSurface(projectRoot) {
  writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
    name: 'import-ai-suggestions-demo',
    private: true,
    scripts: {
      test: 'node --test',
      lint: 'eslint .',
    },
  }, null, 2), 'utf8');

  writeFileSync(join(projectRoot, 'README.md'), [
    '# Import AI Suggestions Demo',
    '',
    'This repository is used to validate import-ai-suggestions.',
    '',
  ].join('\n'), 'utf8');

  mkdirSync(join(projectRoot, 'src'), { recursive: true });
  writeFileSync(join(projectRoot, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');
}

function runImport(projectRoot, args = []) {
  return spawnSync(process.execPath, [AGENTFORGE_BIN, 'import-ai-suggestions', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
  });
}

function writeOutboxFixtures(projectRoot) {
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'outbox'), { recursive: true });

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'outbox', 'agents.yaml'), `${YAML.stringify({
    source_request: '.agentforge/ai/requests/suggest-agents.md',
    items: [
      {
        id: 'automation-planner',
        name: 'Automation Planner',
        purpose: 'Planejar automações recorrentes com fronteiras claras.',
        confidence: 'high',
        reason: 'README.md e package.json mostram scripts e rotinas recorrentes.',
        recommended_context: ['context/project-overview.md'],
        safety_limits: ['Do not hide human approval gates.'],
        responsibilities: [
          'Mapear automações repetitivas.',
          'Separar orquestração de execução.',
        ],
        reads: ['README.md'],
        skills: ['run-tests'],
        flows: ['release'],
        limits: ['Do not perform destructive actions automatically.'],
        source_evidence: [
          {
            path: 'README.md',
            kind: 'project-doc',
            reason: 'Documentação principal descreve o projeto e seus comandos.',
            snippet: 'This repository is used to validate import-ai-suggestions.',
          },
        ],
      },
    ],
  }).trim()}\n`, 'utf8');

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'outbox', 'skills.json'), JSON.stringify({
    source_request: '.agentforge/ai/requests/suggest-skills.md',
    suggestions: [
      {
        id: 'ci-diagnosis',
        name: 'CI Diagnosis',
        description: 'Diagnostica problemas de CI com base em workflows e scripts.',
        confidence: 'high',
        reason: 'O repositório expõe scripts de validação e automação.',
        triggers: ['.github/workflows/'],
        recommended_context: ['context/testing.md', 'references/commands.md'],
        recommended_steps: [
          'Listar os workflows relevantes.',
          'Separar falhas de ambiente e de código.',
        ],
        safety_limits: ['Do not edit secrets automatically.'],
        source_evidence: [
          {
            path: 'package.json',
            kind: 'project-metadata',
            reason: 'Scripts mostram automação executável.',
            snippet: '"test": "node --test"',
          },
        ],
      },
    ],
  }, null, 2), 'utf8');

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'outbox', 'flows.yaml'), `${YAML.stringify({
    source_request: '.agentforge/ai/requests/suggest-flows.md',
    items: [
      {
        id: 'release-check',
        name: 'Release Check',
        purpose: 'Validar etapas antes de uma entrega.',
        confidence: 'medium',
        reason: 'O projeto tem scripts e documentação de entrega.',
        stages: [
          'Revisar mudanças.',
          'Executar validações.',
        ],
        recommended_context: ['context/deployment.md'],
        safety_limits: ['Do not publish without review.'],
        source_evidence: [
          {
            path: 'README.md',
            kind: 'project-doc',
            reason: 'Documentação principal ajuda a definir o fluxo.',
            snippet: 'This repository is used to validate import-ai-suggestions.',
          },
        ],
      },
    ],
  }).trim()}\n`, 'utf8');

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'outbox', 'policies.json'), JSON.stringify({
    source_request: '.agentforge/ai/requests/suggest-policies.md',
    items: [
      {
        id: 'protected-files',
        name: 'Protected Files',
        scope: 'Protected repository areas',
        rule: 'Do not edit protected files without explicit approval.',
        confidence: 'high',
        reason: 'Installation files and core docs should remain human-reviewable.',
        recommended_context: ['policies/human-approval.md'],
        safety_limits: ['Never relax approval gates automatically.'],
        signals: ['AGENTS.md'],
        source_evidence: [
          {
            path: 'AGENTS.md',
            kind: 'instruction',
            reason: 'Instruction surface exists and should be protected.',
            snippet: 'AgentForge',
          },
        ],
      },
    ],
  }, null, 2), 'utf8');

  writeFileSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'outbox', 'context.yaml'), `${YAML.stringify([
    {
      path: '.agentforge/context/project-overview.md',
      title: 'Project Overview',
      purpose: 'Summarize the repository in a compact reusable context document.',
      confidence: 'high',
      reason: 'README and package metadata indicate the project shape.',
      sections: [
        {
          heading: 'Repository',
          bullets: ['Node.js project used to validate import-ai-suggestions.'],
        },
      ],
      recommended_context: ['context/project-overview.md'],
      safety_limits: ['Do not invent architecture that is not supported by evidence.'],
      source_evidence: [
        {
          path: 'README.md',
          kind: 'project-doc',
          reason: 'README gives the first project summary.',
          snippet: 'This repository is used to validate import-ai-suggestions.',
        },
      ],
    },
  ]).trim()}\n`, 'utf8');
}

test('agentforge import-ai-suggestions imports YAML and JSON suggestions for every kind', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-import-ai-'));

  try {
    await installFixture(projectRoot);
    createProjectSurface(projectRoot);
    writeOutboxFixtures(projectRoot);

    const cases = [
      {
        kind: 'agents',
        file: '.agentforge/ai/outbox/agents.yaml',
        output: '.agentforge/suggestions/agents/automation-planner.yaml',
      },
      {
        kind: 'skills',
        file: '.agentforge/ai/outbox/skills.json',
        output: '.agentforge/suggestions/skills/ci-diagnosis.yaml',
      },
      {
        kind: 'flows',
        file: '.agentforge/ai/outbox/flows.yaml',
        output: '.agentforge/suggestions/flows/release-check.yaml',
      },
      {
        kind: 'policies',
        file: '.agentforge/ai/outbox/policies.json',
        output: '.agentforge/suggestions/policies/protected-files.yaml',
      },
      {
        kind: 'context',
        file: '.agentforge/ai/outbox/context.yaml',
        output: '.agentforge/suggestions/context/project-overview.yaml',
      },
    ];

    for (const entry of cases) {
      const result = runImport(projectRoot, ['--kind', entry.kind, '--file', entry.file]);
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /Sugestões importadas/);
      assert.match(result.stdout, /Report: \.agentforge\/reports\/import-ai-suggestions\.md/);

      const outputPath = join(projectRoot, entry.output);
      assert.equal(existsSync(outputPath), true);

      const parsed = YAML.parse(readFileSync(outputPath, 'utf8'));
      assert.equal(parsed.generated_by, 'active-ai');
      assert.equal(typeof parsed.imported_at, 'string');
      assert.equal(parsed.source_request.startsWith('.agentforge/ai/requests/'), true);
      assert.equal(parsed.source_file, entry.file);
      assert.ok(Array.isArray(parsed.source_evidence));
      assert.ok(parsed.source_evidence.length > 0);
    }

    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'import-ai-suggestions.md');
    assert.equal(existsSync(reportPath), true);
    assert.match(readFileSync(reportPath, 'utf8'), /# AgentForge AI Suggestions Import/);
    assert.match(readFileSync(reportPath, 'utf8'), /Imported: 1/);

    const state = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
    assert.equal(typeof state.last_import_ai_suggestions_at, 'string');
    assert.equal(state.import_ai_suggestions.kind, 'context');
    assert.ok(Array.isArray(state.imported_ai_suggestions));
    assert.ok(state.imported_ai_suggestions.some((item) => item.id === 'project-overview'));

    const manifest = loadManifest(projectRoot);
    assert.ok(manifest['.agentforge/reports/import-ai-suggestions.md']);
    assert.ok(manifest['.agentforge/suggestions/context/project-overview.yaml']);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge import-ai-suggestions rejects ids outside kebab-case', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-import-ai-invalid-'));

  try {
    await installFixture(projectRoot);
    createProjectSurface(projectRoot);
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'outbox'), { recursive: true });

    writeFileSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'outbox', 'invalid-skills.yaml'), `${YAML.stringify({
      items: [
        {
          id: 'InvalidSkillId',
          name: 'Broken Skill',
          description: 'Invalid id should be rejected.',
          confidence: 'medium',
          reason: 'Testing validation.',
          triggers: ['test'],
          recommended_context: ['context/testing.md'],
          recommended_steps: ['Read the file'],
          safety_limits: ['Do not proceed blindly.'],
          source_evidence: [
            {
              path: 'README.md',
              kind: 'project-doc',
              reason: 'README exists.',
              snippet: 'This repository is used to validate import-ai-suggestions.',
            },
          ],
        },
      ],
    }).trim()}\n`, 'utf8');

    const result = runImport(projectRoot, ['--kind', 'skills', '--file', '.agentforge/ai/outbox/invalid-skills.yaml']);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout, /kebab-case/);
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'suggestions', 'skills', 'InvalidSkillId.yaml')), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('agentforge import-ai-suggestions warns when evidence is missing', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-import-ai-warning-'));

  try {
    await installFixture(projectRoot);
    createProjectSurface(projectRoot);
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'outbox'), { recursive: true });

    writeFileSync(join(projectRoot, PRODUCT.internalDir, 'ai', 'outbox', 'flows-no-evidence.yaml'), `${YAML.stringify({
      items: [
        {
          id: 'release-check',
          name: 'Release Check',
          purpose: 'Validate steps before release.',
          confidence: 'medium',
          reason: 'This flow is still useful even without evidence.',
          stages: ['Review changes', 'Run validations'],
          recommended_context: ['context/deployment.md'],
          safety_limits: ['Do not publish without review.'],
        },
      ],
    }).trim()}\n`, 'utf8');

    const result = runImport(projectRoot, ['--kind', 'flows', '--file', '.agentforge/ai/outbox/flows-no-evidence.yaml']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /Avisos: 1/);
    assert.match(readFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'import-ai-suggestions.md'), 'utf8'), /Nenhuma evidência foi fornecida/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
