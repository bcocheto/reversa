import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

import {
  buildManifest,
  fileStatus,
  loadManifest,
  mergeUpdateManifest,
  saveManifest,
} from '../lib/installer/manifest.js';
import { PRODUCT } from '../lib/product.js';

test('update preserves manifest entries for modified files', () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'reversa-update-'));

  try {
    const intactPath = 'skills/alpha.md';
    const modifiedPath = 'skills/beta.md';
    const newPath = 'skills/gamma.md';

    mkdirSync(join(projectRoot, 'skills'), { recursive: true });
    writeFileSync(join(projectRoot, intactPath), 'original alpha\n', 'utf8');
    writeFileSync(join(projectRoot, modifiedPath), 'original beta\n', 'utf8');

    const initialManifest = buildManifest(projectRoot, [intactPath, modifiedPath]);
    assert.equal(fileStatus(projectRoot, modifiedPath, initialManifest[modifiedPath]), 'intact');

    writeFileSync(join(projectRoot, modifiedPath), 'user edited beta\n', 'utf8');
    writeFileSync(join(projectRoot, newPath), 'generated gamma\n', 'utf8');

    assert.equal(fileStatus(projectRoot, modifiedPath, initialManifest[modifiedPath]), 'modified');

    const newManifest = buildManifest(projectRoot, [intactPath, newPath]);
    const mergedManifest = mergeUpdateManifest(
      initialManifest,
      [intactPath],
      [modifiedPath],
      newManifest
    );

    saveManifest(projectRoot, mergedManifest);

    const savedManifest = loadManifest(projectRoot);
    assert.deepEqual(savedManifest, mergedManifest);
    assert.equal(savedManifest[intactPath], initialManifest[intactPath]);
    assert.equal(savedManifest[modifiedPath], initialManifest[modifiedPath]);
    assert.equal(savedManifest[newPath], newManifest[newPath]);

    const manifestFile = readFileSync(join(projectRoot, PRODUCT.internalDir, '_config', 'files-manifest.json'), 'utf8');
    assert.match(manifestFile, /skills\/beta\.md/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
