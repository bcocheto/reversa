import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { buildAiEvidenceBundle } from '../lib/ai/evidence-bundle.js';
import {
  normalizeAgenticBlueprint,
  renderAgenticBlueprintSchema,
  validateAgenticBlueprint,
} from '../lib/ai/agentic-blueprint-schema.js';

function createEvidenceFixture() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-agentic-blueprint-schema-'));

  try {
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      name: 'agentic-blueprint-schema-demo',
      private: true,
      scripts: {
        test: 'node --test',
        lint: 'eslint .',
      },
      dependencies: {
        next: '^15.0.0',
      },
    }, null, 2), 'utf8');

    writeFileSync(join(projectRoot, 'README.md'), [
      '# Agentic Blueprint Schema Demo',
      '',
      'Objective: validate the schema for agentic blueprints.',
      '',
    ].join('\n'), 'utf8');

    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'index.ts'), 'export const value = 1;\n', 'utf8');

    mkdirSync(join(projectRoot, 'docs'), { recursive: true });
    writeFileSync(join(projectRoot, 'docs', 'architecture.md'), '# Architecture\n\nSystem boundaries.\n', 'utf8');

    writeFileSync(join(projectRoot, 'AGENTS.md'), '# AGENTS\n\nProtect the agentic layer.\n', 'utf8');
    writeFileSync(join(projectRoot, 'CLAUDE.md'), '# CLAUDE\n\nProtect the agentic layer.\n', 'utf8');

    return buildAiEvidenceBundle(projectRoot);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
}

function makeEvidence(path) {
  return {
    path,
    kind: 'project-doc',
    reason: 'Evidence from the project surface.',
    snippet: `snippet for ${path}`,
  };
}

function buildValidBlueprint() {
  return {
    blueprint: {
      project: {
        name: 'Agentic Blueprint Schema Demo',
        type: 'SaaS/Web App',
        objective: 'validate the blueprint schema',
        package_manager: 'pnpm',
        source_evidence: [makeEvidence('README.md')],
      },
      agents: [
        {
          id: 'product-owner',
          name: 'Product Owner',
          purpose: 'Own the product intent and the blueprint decision.',
          responsibilities: ['Translate evidence into project-facing decisions.'],
          triggers: ['README.md'],
          skills: ['context-curator'],
          context: ['context/project-overview.md'],
          safety_limits: ['Do not invent roadmap commitments.'],
          source_evidence: [makeEvidence('README.md')],
        },
      ],
      skills: [
        {
          id: 'context-curator',
          name: 'Context Curator',
          description: 'Curate project context from repository evidence.',
          owner_agents: ['product-owner'],
          steps: ['Review evidence', 'Summarize context'],
          source_evidence: [makeEvidence('docs/architecture.md')],
        },
      ],
      context_documents: [
        {
          path: 'context/project-overview.md',
          title: 'Project Overview',
          purpose: 'Summarize the project from the collected evidence.',
          owner_agent: 'product-owner',
          sections: [
            {
              heading: 'Overview',
              bullets: ['Describe the project from source evidence.'],
            },
          ],
          source_evidence: [makeEvidence('README.md')],
        },
      ],
      flows: [
        {
          id: 'feature-development',
          name: 'Feature Development',
          purpose: 'Guide feature delivery decisions.',
          owner_agents: ['product-owner'],
          steps: ['Review evidence', 'Choose the next implementation step'],
          source_evidence: [makeEvidence('docs/architecture.md')],
        },
      ],
      policies: [
        {
          id: 'protected-files',
          name: 'Protected Files',
          scope: 'entrypoints',
          rule: 'Do not rewrite protected files without explicit review.',
          owner_agents: ['product-owner'],
          source_evidence: [makeEvidence('AGENTS.md')],
        },
      ],
      routing: {
        default_agent: 'product-owner',
        rules: [
          {
            trigger: 'README.md',
            agent: 'product-owner',
            reason: 'README signals the product owner as the decision owner.',
            source_evidence: [makeEvidence('README.md')],
          },
        ],
        source_evidence: [makeEvidence('README.md')],
      },
      entrypoints: [
        {
          path: 'AGENTS.md',
          engine: 'codex',
          purpose: 'Codex bootloader for the agentic layer.',
          owner_agent: 'product-owner',
          source_evidence: [makeEvidence('AGENTS.md')],
        },
        {
          path: 'CLAUDE.md',
          engine: 'claude-code',
          purpose: 'Claude bootloader for the agentic layer.',
          owner_agent: 'product-owner',
          source_evidence: [makeEvidence('CLAUDE.md')],
        },
      ],
      exports: [
        {
          path: '.agentforge/agents/product-owner.yaml',
          source: 'templates/agentforge/agents/product-owner.yaml',
          engine: 'codex',
          owner_agent: 'product-owner',
          source_evidence: [makeEvidence('README.md')],
        },
      ],
      migration_plan: {
        mode: 'adopt',
        steps: [
          {
            title: 'Review evidence',
            details: 'Use the collected evidence to define the blueprint.',
            source_evidence: [makeEvidence('README.md')],
          },
        ],
        source_evidence: [makeEvidence('README.md')],
      },
    },
  };
}

test('renderAgenticBlueprintSchema documents the unified blueprint contract', () => {
  const schema = renderAgenticBlueprintSchema();

  assert.match(schema, /# Agentic Blueprint Schema/);
  assert.match(schema, /blueprint:/);
  assert.match(schema, /context_documents:/);
  assert.match(schema, /migration_plan:/);
  assert.match(schema, /engine: codex\|claude-code\|cursor\|gemini-cli/);
  assert.match(schema, /entrypoints and exports must use a valid engine id/);
});

test('normalizeAgenticBlueprint and validateAgenticBlueprint accept a valid blueprint', () => {
  const evidenceBundle = createEvidenceFixture();
  const doc = buildValidBlueprint();

  const normalized = normalizeAgenticBlueprint(doc);
  assert.equal(normalized.blueprint.project.name, 'Agentic Blueprint Schema Demo');
  assert.equal(normalized.blueprint.agents[0].skills[0], 'context-curator');
  assert.equal(normalized.blueprint.entrypoints[0].engine, 'codex');

  const result = validateAgenticBlueprint(doc, evidenceBundle);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.normalized.blueprint.routing.default_agent, 'product-owner');
  assert.equal(result.normalized.blueprint.skills[0].owner_agents[0], 'product-owner');
});

test('validateAgenticBlueprint rejects invalid ids, paths, references, and engines', () => {
  const evidenceBundle = createEvidenceFixture();
  const doc = {
    blueprint: {
      project: {
        name: 'Broken Blueprint',
        type: 'SaaS/Web App',
        objective: 'validate failures',
        package_manager: 'pnpm',
        source_evidence: [makeEvidence('README.md')],
      },
      agents: [
        {
          id: 'Product Owner',
          name: 'Product Owner',
          purpose: 'Broken agent id.',
          responsibilities: ['...'],
          triggers: ['README.md'],
          skills: ['missing-skill'],
          context: ['../context/project-overview.md'],
          safety_limits: ['...'],
          source_evidence: [makeEvidence('README.md')],
        },
      ],
      skills: [
        {
          id: 'context-curator',
          name: 'Context Curator',
          description: 'Curate project context.',
          owner_agents: ['missing-agent'],
          steps: ['Review evidence'],
          source_evidence: [makeEvidence('docs/architecture.md')],
        },
      ],
      context_documents: [
        {
          path: '/absolute/path.md',
          title: 'Broken Doc',
          purpose: 'Broken path.',
          owner_agent: 'Product Owner',
          sections: [{ heading: 'Broken', bullets: ['x'] }],
          source_evidence: [makeEvidence('README.md')],
        },
      ],
      flows: [
        {
          id: 'feature-development',
          name: 'Feature Development',
          purpose: 'Broken flow evidence.',
          owner_agents: ['Product Owner'],
          steps: ['Review evidence'],
          source_evidence: [makeEvidence('missing.md')],
        },
      ],
      policies: [
        {
          id: 'protected-files',
          name: 'Protected Files',
          scope: 'entrypoints',
          rule: 'Protect files.',
          owner_agents: ['missing-agent'],
          source_evidence: [],
        },
      ],
      routing: {
        default_agent: 'missing-agent',
        rules: [
          {
            trigger: 'README.md',
            agent: 'missing-agent',
            reason: 'Broken routing.',
            source_evidence: [makeEvidence('README.md')],
          },
        ],
        source_evidence: [makeEvidence('README.md')],
      },
      entrypoints: [
        {
          path: '../AGENTS.md',
          engine: 'unknown-engine',
          purpose: 'Broken engine.',
          owner_agent: 'missing-agent',
          source_evidence: [makeEvidence('AGENTS.md')],
        },
      ],
      exports: [
        {
          path: '.agentforge/agents/product-owner.yaml',
          source: '../templates/agentforge/agents/product-owner.yaml',
          engine: 'codex',
          owner_agent: 'missing-agent',
          source_evidence: [makeEvidence('README.md')],
        },
      ],
      migration_plan: {
        mode: 'adopt',
        steps: [
          {
            title: 'Review evidence',
            details: 'Broken migration evidence.',
            source_evidence: [],
          },
        ],
        source_evidence: [],
      },
    },
  };

  const result = validateAgenticBlueprint(doc, evidenceBundle);

  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 8);
  assert.match(JSON.stringify(result.errors), /kebab-case/);
  assert.match(JSON.stringify(result.errors), /source_evidence\.path/);
  assert.match(JSON.stringify(result.errors), /não existe no evidence bundle/);
  assert.match(JSON.stringify(result.errors), /engine inválido/);
  assert.match(JSON.stringify(result.errors), /referencia id inexistente/);
  assert.match(JSON.stringify(result.errors), /source_evidence é obrigatório/);
  assert.match(JSON.stringify(result.errors), /caminho relativo seguro/);
});
