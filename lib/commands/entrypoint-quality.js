import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import {
  ENTRYPOINT_MAX_LINES,
  countDocumentLines,
  hasBootloaderBlock,
} from '../exporter/bootloader.js';

export const ENTRYPOINT_TARGETS = [
  { path: 'AGENTS.md', label: 'Codex' },
  { path: 'CLAUDE.md', label: 'Claude Code' },
  { path: 'GEMINI.md', label: 'Gemini CLI' },
  { path: '.cursor/rules/agentforge.md', label: 'Cursor rules' },
  { path: '.github/copilot-instructions.md', label: 'GitHub Copilot' },
  { path: '.cursorrules', label: 'Cursor legacy' },
];

export const REQUIRED_BOOTLOADER_REFERENCES = [
  '.agentforge/harness/router.md',
  '.agentforge/harness/context-index.yaml',
  '.agentforge/policies/',
  '.agentforge/skills/',
  '.agentforge/flows/',
  '.agentforge/references/',
];

const LEGACY_REVERSA_PATTERNS = [
  { pattern: /<!--\s*reversa:start\s*-->/i, label: '<!-- reversa:start -->' },
  { pattern: /<!--\s*reversa:end\s*-->/i, label: '<!-- reversa:end -->' },
  { pattern: /\.reversa\//i, label: '.reversa/' },
  { pattern: /_reversa_sdd\//i, label: '_reversa_sdd/' },
];

const CODEX_ONLY_PATTERNS = [
  { pattern: /Abra\s+Codex\b/i, label: 'Abra Codex' },
  { pattern: /Codex\s+only/i, label: 'Codex only' },
  { pattern: /Codex-only/i, label: 'Codex-only' },
  { pattern: /codex-plan/i, label: 'codex-plan' },
  { pattern: /\.agentforge\/codex\//i, label: '.agentforge/codex/' },
];

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function extractBootloaderBlock(content) {
  const text = String(content ?? '');
  const match = text.match(/<!-- agentforge:start -->[\s\S]*?<!-- agentforge:end -->/);
  return match ? match[0] : '';
}

function removeBootloaderBlock(content) {
  return String(content ?? '').replace(/<!-- agentforge:start -->[\s\S]*?<!-- agentforge:end -->/g, '\n');
}

function countContentLines(content) {
  const text = String(content ?? '').trimEnd();
  if (!text) return 0;
  return countDocumentLines(text);
}

function detectLegacyReversaSignals(content) {
  const text = String(content ?? '');
  return LEGACY_REVERSA_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);
}

function detectCodexOnlySignals(content) {
  const text = String(content ?? '');
  return CODEX_ONLY_PATTERNS
    .filter(({ pattern }) => pattern.test(text))
    .map(({ label }) => label);
}

export function inspectManagedEntrypointContent(content) {
  const text = String(content ?? '');
  const hasBlock = hasBootloaderBlock(text);
  const bootloaderBlock = extractBootloaderBlock(text);
  const lineCount = countContentLines(text);
  const bootloaderLineCount = countContentLines(bootloaderBlock);
  const manualOutsideBlockLineCount = hasBlock ? countContentLines(removeBootloaderBlock(text)) : lineCount;
  const referenceScope = hasBlock ? bootloaderBlock : text;
  const missingReferences = REQUIRED_BOOTLOADER_REFERENCES.filter(
    (token) => referenceScope.includes(token) === false,
  );
  const legacyReversaSignals = hasBlock ? detectLegacyReversaSignals(bootloaderBlock) : [];
  const codexOnlySignals = detectCodexOnlySignals(referenceScope);

  return {
    hasBlock,
    lineCount,
    bootloaderLineCount,
    manualOutsideBlockLineCount,
    missingReferences,
    legacyReversaSignals,
    codexOnlySignals,
  };
}

export function analyzeManagedEntrypointFiles(projectRoot, targetPaths = ENTRYPOINT_TARGETS) {
  return targetPaths
    .filter((target) => existsSync(join(projectRoot, target.path)))
    .map((target) => {
      const content = readFileSync(join(projectRoot, target.path), 'utf8');
      return {
        ...target,
        ...inspectManagedEntrypointContent(content),
      };
    });
}

export function buildEntrypointQualityMessage(entry) {
  const messages = [];

  if (!entry.hasBlock) {
    messages.push('Arquivo de entrada sem bloco gerenciado do AgentForge.');
  }

  if (entry.hasBlock && entry.lineCount > 0 && entry.lineCount > ENTRYPOINT_MAX_LINES) {
    if (entry.manualOutsideBlockLineCount > ENTRYPOINT_MAX_LINES) {
      messages.push(
        `Conteúdo manual excessivo fora do bloco AgentForge (${entry.manualOutsideBlockLineCount} linhas). Mova esse material para .agentforge/context ou references.`,
      );
    } else {
      messages.push(
        `Entrypoint gerenciado excede o limite de ${ENTRYPOINT_MAX_LINES} linhas (${entry.lineCount}).`,
      );
    }
  }

  if (entry.hasBlock && entry.bootloaderLineCount > ENTRYPOINT_MAX_LINES) {
    messages.push(
      `Bloco AgentForge excede o limite de ${ENTRYPOINT_MAX_LINES} linhas (${entry.bootloaderLineCount}).`,
    );
  }

  if (entry.hasBlock && entry.missingReferences.length > 0) {
    messages.push(
      `Bootloader sem referências obrigatórias: ${entry.missingReferences.join(', ')}.`,
    );
  }

  if (entry.legacyReversaSignals.length > 0) {
    messages.push(
      `Conteúdo legado Reversa detectado: ${entry.legacyReversaSignals.join(', ')}.`,
    );
  }

  if (entry.codexOnlySignals.length > 0) {
    messages.push(
      `Linguagem Codex-only detectada: ${entry.codexOnlySignals.join(', ')}.`,
    );
  }

  return messages;
}

export function summarizeManagedEntrypointIssue(entry) {
  const messages = buildEntrypointQualityMessage(entry);
  return messages.length > 0 ? messages : ['Arquivo de entrada válido.'];
}

export function hasRequiredBootloaderReferences(content) {
  const text = normalizeString(content);
  return REQUIRED_BOOTLOADER_REFERENCES.every((token) => text.includes(token));
}
