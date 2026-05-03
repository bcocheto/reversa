import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

import { PRODUCT } from '../product.js';
import { renderManagedEntrypoint, hasBootloaderBlock, replaceBootloaderBlock } from '../exporter/bootloader.js';
import { writeImportedSnapshot } from '../commands/snapshots.js';

const ADOPTION_ENTRYPOINT_BOOTLOADERS = {
  'AGENTS.md': {
    entryFile: 'AGENTS.md',
    activationText: 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
  },
  'CLAUDE.md': {
    entryFile: 'CLAUDE.md',
    activationText: 'Quando o usuário digitar `agentforge` ou usar `/agentforge`, ative o orquestrador AgentForge.',
  },
};

function extractBootloaderBlockLines(content) {
  if (!hasBootloaderBlock(content)) return null;
  const match = String(content).match(/<!-- agentforge:start -->\n([\s\S]*?)\n<!-- agentforge:end -->/);
  if (!match) return null;
  return match[1].split(/\r?\n/);
}

function writeAdoptionEntrypoint(projectRoot, entrypointPath, state) {
  const bootloader = ADOPTION_ENTRYPOINT_BOOTLOADERS[entrypointPath];
  if (!bootloader) {
    return { written: false, skipped: false, reason: 'unsupported-entrypoint', path: entrypointPath };
  }

  const absPath = join(projectRoot, entrypointPath);
  const existing = existsSync(absPath) ? readFileSync(absPath, 'utf8') : null;
  const nextContent = renderManagedEntrypoint(bootloader, state);

  if (!existing) {
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, nextContent, 'utf8');
    return { written: true, skipped: false, reason: null, path: entrypointPath, snapshotPath: null, takeover: 'created' };
  }

  const nextBlockLines = extractBootloaderBlockLines(nextContent);
  if (hasBootloaderBlock(existing)) {
    const writtenContent = nextBlockLines ? replaceBootloaderBlock(existing, nextBlockLines) ?? nextContent : nextContent;
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, writtenContent, 'utf8');
    return {
      written: true,
      skipped: false,
      reason: null,
      path: entrypointPath,
      snapshotPath: null,
      takeover: 'updated',
    };
  }

  const snapshot = writeImportedSnapshot(projectRoot, PRODUCT.internalDir, entrypointPath, existing, {
    sourceType: entrypointPath === 'AGENTS.md' ? 'codex-entrypoint' : 'claude-entrypoint',
  });

  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, nextContent, 'utf8');
  return {
    written: true,
    skipped: false,
    reason: null,
    path: entrypointPath,
    snapshotPath: snapshot.snapshotPath,
    takeover: 'taken-over',
  };
}

export function takeOverAgenticEntrypoints(projectRoot, state, entrypointPaths = ['AGENTS.md', 'CLAUDE.md']) {
  const result = {
    entrypoints: [],
    snapshotPaths: [],
  };

  for (const entrypointPath of entrypointPaths) {
    const entrypointResult = writeAdoptionEntrypoint(projectRoot, entrypointPath, state);
    if (entrypointResult.written) {
      result.entrypoints.push(entrypointResult.path);
    }
    if (entrypointResult.snapshotPath) {
      result.snapshotPaths.push(entrypointResult.snapshotPath);
    }
  }

  return result;
}
