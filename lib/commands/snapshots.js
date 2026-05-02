import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

import { PRODUCT } from '../product.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');
const IMPORTS_README_TEMPLATE = join(REPO_ROOT, 'templates', 'agentforge', 'imports', 'README.md');

function toPosixPath(path) {
  return path.split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function hashContent(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

function inferImportType(relPath) {
  if (relPath.startsWith('.agents/references/')) return 'legacy-reference';
  if (relPath === '.agents/architecture.md') return 'legacy-architecture-context';
  if (relPath.startsWith('.agents/skills/') && basename(relPath).toUpperCase() === 'SKILL.MD') return 'legacy-skill';
  if (relPath.startsWith('.agents/skills/') && relPath.endsWith('.md')) return 'legacy-skill';
  if (relPath.startsWith('.agents/') && relPath.endsWith('.md')) return 'legacy-agent-context';
  if (relPath === 'AGENTS.md') return 'codex-entrypoint';
  if (relPath === 'CLAUDE.md') return 'claude-entrypoint';
  if (relPath === '.cursorrules' || relPath.startsWith('.cursor/rules/')) return 'cursor-rule';
  if (relPath === '.github/copilot-instructions.md') return 'copilot-instruction';
  if (relPath.startsWith('.github/agents/') || relPath.startsWith('.claude/agents/')) return 'agent-definition';
  if (relPath.startsWith('.claude/skills/')) return 'skill-definition';
  if (basename(relPath).toUpperCase() === 'CONVENTIONS.MD') return 'convention-doc';
  if (relPath === 'GEMINI.md' || relPath === '.windsurfrules' || relPath === '.clinerules' || relPath === '.roorules') {
    return 'unknown-agentic-doc';
  }
  return 'unknown-agentic-doc';
}

function ensureImportsStructure(projectRoot, internalDir) {
  const baseDir = internalDir.startsWith('/') ? internalDir : join(projectRoot, internalDir);
  const importsDir = join(baseDir, 'imports');
  const snapshotsDir = join(importsDir, 'snapshots');
  mkdirSync(snapshotsDir, { recursive: true });

  const readmePath = join(importsDir, 'README.md');
  let createdReadme = false;
  if (!existsSync(readmePath)) {
    const template = existsSync(IMPORTS_README_TEMPLATE)
      ? readFileSync(IMPORTS_README_TEMPLATE, 'utf8')
      : [
          '# Imports',
          '',
          'Esta pasta guarda snapshots de arquivos de instrução agentic encontrados no projeto.',
          '',
          '## Regras',
          '',
          '- Os arquivos originais nunca são alterados por `agentforge ingest`.',
          '- Os snapshots ficam em `snapshots/`.',
          '- Use estes arquivos como base para auditoria e refatoração.',
          '',
        ].join('\n');
    writeFileSync(readmePath, template.endsWith('\n') ? template : `${template}\n`, 'utf8');
    createdReadme = true;
  }

  return { importsDir, snapshotsDir, readmePath, createdReadme };
}

function buildSnapshotPath(snapshotsDir, sourceRelPath, contentHash) {
  const segments = sourceRelPath.split('/');
  return join(snapshotsDir, ...segments, `${contentHash}.json`);
}

function renderSnapshotDoc(sourceRelPath, sourceType, contentHash, contentBytes, content, capturedAt) {
  return `${JSON.stringify({
    snapshot_version: 1,
    source_path: sourceRelPath,
    source_type: sourceType,
    source_hash: contentHash,
    source_size_bytes: contentBytes,
    captured_at: capturedAt,
    content,
  }, null, 2)}\n`;
}

export function getSnapshotImportType(relPath) {
  return inferImportType(relPath);
}

export function getImportsStructure(projectRoot) {
  return ensureImportsStructure(projectRoot, PRODUCT.internalDir);
}

export function writeImportedSnapshot(projectRoot, internalDir, sourceRelPath, content, { sourceType = inferImportType(sourceRelPath), capturedAt = new Date().toISOString() } = {}) {
  const imports = ensureImportsStructure(projectRoot, internalDir);
  const contentHash = hashContent(content);
  const contentBytes = Buffer.byteLength(content, 'utf8');
  const snapshotPath = buildSnapshotPath(imports.snapshotsDir, sourceRelPath, contentHash);
  const existsAlready = existsSync(snapshotPath);

  if (!existsAlready) {
    mkdirSync(dirname(snapshotPath), { recursive: true });
    writeFileSync(
      snapshotPath,
      renderSnapshotDoc(
        sourceRelPath,
        sourceType,
        contentHash,
        contentBytes,
        content,
        capturedAt,
      ),
      'utf8',
    );
  }

  return {
    snapshotPath: rel(projectRoot, snapshotPath),
    sourcePath: sourceRelPath,
    sourceType,
    sourceHash: contentHash,
    sourceSizeBytes: contentBytes,
    capturedAt,
    created: !existsAlready,
  };
}
