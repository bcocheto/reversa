import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { buildManifest, saveManifest } from '../lib/installer/manifest.js';
import { PRODUCT } from '../lib/product.js';
import {
  applyCoreContextSynthesis,
  buildCoreContextDocuments,
} from '../lib/commands/context-synthesis.js';

function makeMinimalAnalysisBundle() {
  return {
    analysis: {
      signals: {
        readmeExists: false,
        packageJson: false,
        docsFiles: [],
        instructionDocs: [],
        agentsFiles: [],
        packageScripts: [
          { name: 'test', command: 'npm test', source: 'package.json' },
          { name: 'lint', command: 'npm run lint', source: 'package.json' },
        ],
        testingCommands: [],
        projectCommands: [],
        workflowFiles: [],
        architectureLayers: [],
        mainAreas: [],
        projectName: '',
        projectType: '',
        objectiveText: '',
        audienceText: '',
        readmeSections: [],
      },
      detectedStack: [],
      framework: 'Unknown',
      architecture: 'Arquitetura ainda pouco explícita nos sinais locais',
      mainAreas: [],
      extraCodeSurface: [],
      localPatterns: [],
      integrationSignals: [],
      dataSignals: [],
      securitySignals: [],
      risks: [],
    },
    patternResearch: { recommendedPatterns: [] },
    suggestions: {
      agents: [],
      flows: [],
      skills: [],
    },
  };
}

test('buildCoreContextDocuments generates explicit A confirmar sections and no placeholders', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-synthesis-docs-'));

  try {
    const docs = buildCoreContextDocuments(projectRoot, {}, makeMinimalAnalysisBundle());
    assert.ok(docs['context/project-overview.md']);
    assert.ok(docs['context/architecture.md']);
    assert.ok(docs['context/testing.md']);
    assert.ok(docs['context/deployment.md']);
    assert.ok(docs['context/glossary.md']);
    assert.ok(docs['references/commands.md']);
    assert.ok(docs['references/external-docs.md']);
    assert.ok(docs['README.md']);

    for (const [relPath, content] of Object.entries(docs)) {
      if (!['references/commands.md', 'README.md'].includes(relPath)) {
        assert.doesNotMatch(content, /A preencher|<[^>]+>|TBD/);
      } else {
        assert.doesNotMatch(content, /A preencher|TBD/);
      }
      assert.ok(content.includes('#'), `${relPath} should look like markdown`);
      if (relPath !== 'references/commands.md') {
        assert.match(content, /A confirmar/);
      }
    }

    assert.match(docs['references/commands.md'], /## AgentForge commands/);
    assert.match(docs['references/commands.md'], /## Project commands/);
    assert.match(docs['references/commands.md'], /npm test/);
    assert.match(docs['references/commands.md'], /analyze \[--write-context\]/);
    assert.match(docs['README.md'], /npx @bcocheto\/agentforge <command>/);
    assert.match(docs['references/commands.md'], /npx @bcocheto\/agentforge <command>/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('applyCoreContextSynthesis preserves modified human files and records synthesis state', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-context-synthesis-write-'));

  try {
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'context'), { recursive: true });
    writeFileSync(
      join(projectRoot, PRODUCT.internalDir, 'plan.md'),
      '# Plan\n\n## Export\n\n- [ ] Finish packaging.\n',
      'utf8',
    );
    const overviewPath = join(projectRoot, PRODUCT.internalDir, 'context', 'project-overview.md');
    writeFileSync(overviewPath, '# Project Overview\n\nConteúdo humano original.\n', 'utf8');
    saveManifest(projectRoot, buildManifest(projectRoot, [join(PRODUCT.internalDir, 'context', 'project-overview.md')]));
    writeFileSync(overviewPath, '# Project Overview\n\nConteúdo humano alterado.\n', 'utf8');

    const result = applyCoreContextSynthesis(
      projectRoot,
      { project: 'Demo Project', user_name: 'Ana', setup_mode: 'bootstrap', engines: ['codex'] },
      makeMinimalAnalysisBundle(),
    );

    assert.equal(readFileSync(overviewPath, 'utf8'), '# Project Overview\n\nConteúdo humano alterado.\n');
    assert.equal(existsSync(join(projectRoot, PRODUCT.internalDir, 'context', 'testing.md')), true);
    assert.equal(typeof result.state.last_context_synthesis_at, 'string');
    assert.ok(Array.isArray(result.state.synthesized_context_files));
    assert.ok(!result.state.synthesized_context_files.includes('.agentforge/context/project-overview.md'));
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
