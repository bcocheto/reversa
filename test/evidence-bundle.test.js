import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import { buildAiEvidenceBundle, renderAiEvidenceBrief } from '../lib/ai/evidence-bundle.js';

test('buildAiEvidenceBundle gathers structured evidence and renders a brief', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'agentforge-evidence-bundle-'));

  try {
    writeFileSync(join(projectRoot, 'package.json'), JSON.stringify({
      name: 'evidence-bundle-demo',
      private: true,
      packageManager: 'pnpm@9.0.0',
      scripts: {
        test: 'node --test',
        lint: 'eslint .',
      },
      dependencies: {
        next: '^15.0.0',
        react: '^19.0.0',
      },
    }, null, 2), 'utf8');

    writeFileSync(join(projectRoot, 'README.md'), [
      '# Evidence Bundle Demo',
      '',
      'Objective: prepare an AI evidence bundle for the active engine.',
      '',
      'Audience: internal AI and engineering workflow.',
      '',
    ].join('\n'), 'utf8');

    mkdirSync(join(projectRoot, 'src'), { recursive: true });
    writeFileSync(join(projectRoot, 'src', 'index.ts'), [
      'export function hello() {',
      '  return "world";',
      '}',
    ].join('\n'), 'utf8');

    const bundle = buildAiEvidenceBundle(projectRoot);
    assert.equal(bundle.project.name, 'evidence-bundle-demo');
    assert.equal(bundle.stack.framework, 'Next.js');
    assert.ok(Array.isArray(bundle.packageScripts));
    assert.equal(bundle.packageScripts.length, 2);
    assert.ok(bundle.mainAreas.some((area) => area.path === 'src/'));
    assert.ok(bundle.docsDetected.some((doc) => doc.path === 'README.md'));
    assert.ok(bundle.evidence.some((item) => item.path === 'package.json' && item.kind === 'project-metadata'));
    assert.ok(bundle.evidence.some((item) => item.path === 'README.md' && item.kind === 'doc'));
    assert.ok(bundle.evidence.some((item) => item.path === 'src/index.ts'));
    assert.ok(bundle.evidence.every((item) => typeof item.path === 'string' && typeof item.kind === 'string' && typeof item.reason === 'string' && typeof item.snippet === 'string'));

    const brief = renderAiEvidenceBrief(bundle);
    assert.match(brief, /# AI Evidence Brief/);
    assert.match(brief, /evidence-bundle-demo/);
    assert.match(brief, /Package Scripts/);
    assert.match(brief, /Main Areas/);
    assert.match(brief, /Evidence/);
    assert.match(brief, /package\.json/);
    assert.match(brief, /README\.md/);
    assert.match(brief, /src\/index\.ts/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
