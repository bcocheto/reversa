import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';

const MAP_REL_PATH = join(PRODUCT.internalDir, 'harness', 'context-map.yaml');
const REPORT_REL_PATH = join(PRODUCT.internalDir, 'reports', 'context-map.md');
const SCAN_DIRS = [
  'context',
  'references',
  'policies',
  'flows',
  'memory',
];

const VALID_KINDS = new Set([
  'project-overview',
  'architecture',
  'domain',
  'glossary-term',
  'coding-standard',
  'testing',
  'deployment',
  'workflow',
  'policy',
  'tooling',
  'command',
  'reference',
  'memory',
  'unknown',
]);

const VALID_CONFIDENCE = new Set(['low', 'medium', 'high']);
const VALID_STATUS = new Set(['needs-review', 'curated', 'stale', 'rejected']);

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toPosixPath(path) {
  return String(path ?? '').split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function slugify(value) {
  return normalizeString(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function countLines(content) {
  const text = String(content ?? '').replace(/\r\n/g, '\n');
  if (!text) return 0;
  const lines = text.split('\n');
  if (text.endsWith('\n')) {
    lines.pop();
  }
  return lines.length;
}

function listFilesRecursive(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
      continue;
    }
    files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function normalizeFilePath(relPath) {
  return toPosixPath(String(relPath ?? '')).replace(/^\.\//, '');
}

function fileTitleFromPath(relPath) {
  const stem = basename(relPath, extname(relPath));
  return stem
    .split(/[-_]/g)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function extractMarkdownSections(content, fileRelPath) {
  const lines = String(content ?? '').replace(/\r\n/g, '\n').split('\n');
  const totalLines = countLines(content);
  const headings = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^(#{1,6})\s+(.*)$/);
    if (!match) continue;
    headings.push({
      title: match[2].trim(),
      level: match[1].length,
      line: index + 1,
    });
  }

  if (headings.length === 0) {
    return [{
      title: fileTitleFromPath(fileRelPath),
      start_line: 1,
      end_line: Math.max(1, totalLines),
      text: String(content ?? '').trim(),
      heading_level: 0,
    }];
  }

  return headings.map((heading, index) => {
    let endLine = totalLines;
    for (let cursor = index + 1; cursor < headings.length; cursor += 1) {
      if (headings[cursor].level <= heading.level) {
        endLine = headings[cursor].line - 1;
        break;
      }
    }

    const text = lines
      .slice(heading.line, endLine)
      .join('\n')
      .trim();

    return {
      title: heading.title,
      start_line: heading.line,
      end_line: Math.max(heading.line, endLine),
      text,
      heading_level: heading.level,
    };
  });
}

function extractSummary(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const paragraphs = [];
  let current = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.length > 0) {
        paragraphs.push(current.join(' '));
        current = [];
      }
      continue;
    }

    if (/^(#{1,6})\s+/.test(trimmed)) continue;
    current.push(trimmed.replace(/^[-*+]\s+/, ''));
  }

  if (current.length > 0) {
    paragraphs.push(current.join(' '));
  }

  return paragraphs[0] ?? '';
}

function inferKind(fileRelPath, title = '') {
  const normalizedPath = normalizeFilePath(fileRelPath);
  const normalizedTitle = slugify(title);

  if (normalizedPath.startsWith('context/')) {
    if (normalizedPath.includes('project-overview') || normalizedTitle.includes('overview') || normalizedTitle.includes('project')) return 'project-overview';
    if (normalizedPath.includes('architecture') || normalizedTitle.includes('architecture')) return 'architecture';
    if (normalizedPath.includes('coding-standards') || normalizedPath.includes('conventions') || normalizedTitle.includes('standard')) return 'coding-standard';
    if (normalizedPath.includes('testing') || normalizedTitle.includes('test')) return 'testing';
    if (normalizedPath.includes('deployment') || normalizedTitle.includes('deploy') || normalizedTitle.includes('release')) return 'deployment';
    if (normalizedPath.includes('glossary') || normalizedTitle.includes('glossary') || normalizedTitle.includes('term')) return 'glossary-term';
    return 'domain';
  }

  if (normalizedPath.startsWith('references/')) {
    if (normalizedPath.includes('commands') || normalizedTitle.includes('command')) return 'command';
    if (normalizedPath.includes('tools') || normalizedTitle.includes('tool')) return 'tooling';
    return 'reference';
  }

  if (normalizedPath.startsWith('policies/')) return 'policy';
  if (normalizedPath.startsWith('flows/')) return 'workflow';
  if (normalizedPath.startsWith('memory/')) return 'memory';
  return 'unknown';
}

function inferTags(fileRelPath, title, kind) {
  const tags = new Set([kind]);
  const parts = slugify([fileRelPath, title].join(' ')).split('-').filter(Boolean);
  for (const part of parts.slice(0, 6)) {
    tags.add(part);
  }
  return [...tags];
}

function buildGeneratedItems(projectRoot) {
  const items = [];

  for (const dir of SCAN_DIRS) {
    const absDir = join(projectRoot, PRODUCT.internalDir, dir);
    if (!existsSync(absDir) || !statSync(absDir).isDirectory()) continue;

    for (const filePath of listFilesRecursive(absDir)) {
      if (!statSync(filePath).isFile()) continue;

      const relPath = normalizeFilePath(rel(projectRoot, filePath).replace(`${PRODUCT.internalDir}/`, ''));
      const content = readText(filePath);
      if (!content.trim()) continue;

      const ext = extname(filePath).toLowerCase();
      const sections = ext === '.md' || ext === '.mdx'
        ? extractMarkdownSections(content, relPath)
        : [{
            title: fileTitleFromPath(relPath),
            start_line: 1,
            end_line: Math.max(1, countLines(content)),
            text: content.trim(),
            heading_level: 0,
          }];

      for (const [index, section] of sections.entries()) {
        const kind = inferKind(relPath, section.title);
        const summary = extractSummary(section.text) || section.title || fileTitleFromPath(relPath);
        const idBase = section.heading_level > 0
          ? `${basename(relPath, extname(relPath))}-${section.title}`
          : basename(relPath, extname(relPath));
        const itemId = slugify(idBase || `${relPath}-${index}`) || `context-item-${items.length + 1}`;

        items.push({
          id: itemId,
          title: section.title || fileTitleFromPath(relPath),
          kind,
          file: relPath,
          start_line: section.start_line,
          end_line: section.end_line,
          summary: summary.length > 200 ? `${summary.slice(0, 199).trimEnd()}…` : summary,
          tags: inferTags(relPath, section.title, kind),
          confidence: 'low',
          curation_status: 'needs-review',
          owner_agent: 'context-curator',
          source: {
            type: 'mechanical',
            evidence: [relPath, `${relPath}:${section.start_line}-${section.end_line}`],
          },
        });
      }
    }
  }

  return items;
}

function loadExistingContextMap(projectRoot) {
  const filePath = join(projectRoot, MAP_REL_PATH);
  if (!existsSync(filePath)) return null;

  try {
    const parsed = YAML.parse(readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function mergeContextMapItems(existingItems = [], generatedItems = []) {
  const generatedById = new Map(generatedItems.map((item) => [item.id, item]));

  for (const item of existingItems) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const id = normalizeString(item.id);
    if (!id) continue;
    if (normalizeString(item.curation_status) === 'curated') {
      generatedById.set(id, item);
    }
  }

  return [...generatedById.values()].sort((a, b) => {
    if (a.file === b.file) {
      return Number(a.start_line ?? 0) - Number(b.start_line ?? 0) || String(a.id).localeCompare(String(b.id));
    }
    return String(a.file).localeCompare(String(b.file)) || String(a.id).localeCompare(String(b.id));
  });
}

function buildContextMapDoc(projectRoot) {
  const existing = loadExistingContextMap(projectRoot);
  const generated = buildGeneratedItems(projectRoot);
  const existingItems = Array.isArray(existing?.items) ? existing.items : [];
  const items = mergeContextMapItems(existingItems, generated);

  return {
    doc: {
      version: 1,
      generated_by: 'context-curator',
      updated_at: new Date().toISOString(),
      items,
    },
    generatedItems: generated,
    existingItems,
  };
}

function validateContextMapDoc(projectRoot, sourceDoc = null) {
  const errors = [];
  const warnings = [];
  const filePath = join(projectRoot, MAP_REL_PATH);
  const sourceFile = rel(projectRoot, filePath);

  let parsed = sourceDoc;
  if (!parsed) {
    if (!existsSync(filePath)) {
      errors.push({ file: sourceFile, message: 'Arquivo ausente.' });
      return { errors, warnings };
    }

    try {
      parsed = YAML.parse(readFileSync(filePath, 'utf8'));
    } catch (error) {
      errors.push({ file: sourceFile, message: `YAML inválido: ${error.message}` });
      return { errors, warnings };
    }
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push({ file: sourceFile, message: 'O arquivo YAML deve conter um objeto no topo.' });
    return { errors, warnings };
  }

  const items = Array.isArray(parsed.items) ? parsed.items : null;
  if (!items) {
    errors.push({ file: sourceFile, message: 'Campo inválido: items deve ser uma lista.' });
    return { errors, warnings };
  }

  const seenIds = new Set();
  let needsReview = 0;

  for (const [index, item] of items.entries()) {
    const ref = `${sourceFile}#items[${index}]`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push({ file: ref, message: 'Cada item deve ser um objeto.' });
      continue;
    }

    const id = normalizeString(item.id);
    const title = normalizeString(item.title);
    const kind = normalizeString(item.kind);
    const relPath = normalizeString(item.file);
    const summary = normalizeString(item.summary);
    const confidence = normalizeString(item.confidence);
    const curationStatus = normalizeString(item.curation_status);
    const startLine = item.start_line;
    const endLine = item.end_line;

    if (!id) {
      errors.push({ file: ref, message: 'Campo obrigatório ausente: id.' });
    } else if (seenIds.has(id)) {
      errors.push({ file: ref, message: `ID duplicado em context-map: "${id}".` });
    } else {
      seenIds.add(id);
    }

    if (!title) errors.push({ file: ref, message: 'Campo obrigatório ausente: title.' });
    if (!kind) {
      errors.push({ file: ref, message: 'Campo obrigatório ausente: kind.' });
    } else if (!VALID_KINDS.has(kind)) {
      errors.push({ file: ref, message: `kind inválido: "${kind}".` });
    }
    if (!relPath) errors.push({ file: ref, message: 'Campo obrigatório ausente: file.' });
    if (!summary) errors.push({ file: ref, message: 'Campo obrigatório ausente: summary.' });
    if (!VALID_CONFIDENCE.has(confidence)) {
      errors.push({ file: ref, message: `confidence inválido: "${confidence || 'vazio'}".` });
    }
    if (!VALID_STATUS.has(curationStatus)) {
      errors.push({ file: ref, message: `curation_status inválido: "${curationStatus || 'vazio'}".` });
    }

    if (!Number.isInteger(startLine)) {
      errors.push({ file: ref, message: 'Campo obrigatório ausente ou inválido: start_line.' });
    }
    if (!Number.isInteger(endLine)) {
      errors.push({ file: ref, message: 'Campo obrigatório ausente ou inválido: end_line.' });
    }

    if (Number.isInteger(startLine) && Number.isInteger(endLine) && startLine > endLine) {
      errors.push({ file: ref, message: 'start_line não pode ser maior que end_line.' });
    }

    const absPath = join(projectRoot, PRODUCT.internalDir, relPath);
    const normalizedRel = relative(join(projectRoot, PRODUCT.internalDir), absPath);
    if (!relPath || normalizedRel.startsWith('..')) {
      errors.push({ file: ref, message: `Path fora do diretório interno: "${relPath}".` });
    } else if (!existsSync(absPath)) {
      errors.push({ file: ref, message: `Arquivo ausente em "${relPath}".` });
    } else if (statSync(absPath).isDirectory()) {
      errors.push({ file: ref, message: `Esperado um arquivo em "${relPath}".` });
    } else if (Number.isInteger(startLine) && Number.isInteger(endLine)) {
      const lineCount = countLines(readFileSync(absPath, 'utf8'));
      if (startLine < 1 || endLine < 1) {
        errors.push({ file: ref, message: 'start_line e end_line devem ser maiores que zero.' });
      }
      if (lineCount === 0) {
        errors.push({ file: ref, message: `Arquivo vazio em "${relPath}".` });
      } else if (startLine > lineCount || endLine > lineCount) {
        errors.push({ file: ref, message: `Range inválido em "${relPath}": o arquivo tem apenas ${lineCount} linha(s).` });
      }
    }

    if (curationStatus === 'needs-review') {
      needsReview += 1;
    }
  }

  if (items.length > 0 && needsReview / items.length > 0.4) {
    warnings.push({
      file: sourceFile,
      message: `Mais de 40% dos itens do context-map ainda estão em needs-review (${needsReview}/${items.length}).`,
    });
  }

  return { errors, warnings };
}

function renderReport(projectRoot, doc, validation, { writeMode = false, checkMode = false } = {}) {
  const lines = [];
  lines.push('# Context Map');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Mode: ${writeMode ? 'write' : checkMode ? 'check' : 'report'}`);
  lines.push(`- Generated by: ${doc.generated_by ?? 'context-curator'}`);
  lines.push(`- Updated at: ${doc.updated_at ?? 'null'}`);
  lines.push(`- Items: ${doc.items.length}`);
  lines.push(`- Errors: ${validation.errors.length}`);
  lines.push(`- Warnings: ${validation.warnings.length}`);
  lines.push('');
  lines.push('| Item | Kind | File | Lines | Summary | Status |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const item of doc.items) {
    lines.push(
      `| \`${item.id}\` | ${item.kind} | \`${item.file}\` | ${item.start_line}-${item.end_line} | ${String(item.summary ?? '').replace(/\|/g, '\\|')} | ${item.curation_status} |`,
    );
  }

  if (validation.errors.length > 0 || validation.warnings.length > 0) {
    lines.push('');
    lines.push('## Validation');
    lines.push('');
    for (const error of validation.errors) {
      lines.push(`- Error: \`${error.file}\` ${error.message}`);
    }
    for (const warning of validation.warnings) {
      lines.push(`- Warning: \`${warning.file}\` ${warning.message}`);
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function buildJsonPayload(projectRoot, doc, validation, { writeMode = false, checkMode = false } = {}) {
  return {
    project: basename(projectRoot),
    mode: writeMode ? 'write' : checkMode ? 'check' : 'report',
    generated_by: doc.generated_by ?? 'context-curator',
    updated_at: doc.updated_at ?? null,
    items: doc.items,
    validation,
  };
}

function writeContextMap(projectRoot, doc, report) {
  const mapPath = join(projectRoot, MAP_REL_PATH);
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'harness'), { recursive: true });
  writeFileSync(mapPath, `${YAML.stringify(doc).trim()}\n`, 'utf8');

  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'reports'), { recursive: true });
  writeFileSync(join(projectRoot, REPORT_REL_PATH), report, 'utf8');
}

export function buildContextMapForProject(projectRoot) {
  return buildContextMapDoc(projectRoot);
}

export function validateContextMapFile(projectRoot, sourceDoc = null) {
  return validateContextMapDoc(projectRoot, sourceDoc);
}

export default async function contextMap(args = []) {
  const { default: chalk } = await import('chalk');
  const projectRoot = process.cwd();

  const existing = checkExistingInstallation(projectRoot);
  if (!existing.installed) {
    console.log(chalk.yellow(`  ${PRODUCT.name} is not installed in this directory. Run npx ${PRODUCT.command} install.`));
    return 1;
  }

  const json = args.includes('--json');
  const writeMode = args.includes('--write');
  const checkMode = args.includes('--check');
  const { doc, generatedItems, existingItems } = buildContextMapForProject(projectRoot);
  const validation = writeMode
    ? validateContextMapFile(projectRoot, doc)
    : validateContextMapFile(projectRoot);

  if (writeMode) {
    const report = renderReport(projectRoot, doc, validation, { writeMode: true, checkMode: false });
    writeContextMap(projectRoot, doc, report);
    console.log(chalk.hex('#ffa203')(`  Context map written to ${MAP_REL_PATH}`));
    console.log(chalk.gray(`  Generated items: ${generatedItems.length}`));
    console.log(chalk.gray(`  Curated items preserved: ${existingItems.filter((item) => normalizeString(item?.curation_status) === 'curated').length}`));
    console.log(chalk.gray(`  Report: ${REPORT_REL_PATH}`));
    return validation.errors.length > 0 ? 1 : 0;
  }

  if (checkMode) {
    if (validation.errors.length > 0) {
      console.log(chalk.red(`  Context map has ${validation.errors.length} error(s).`));
      console.log(chalk.gray(`  See ${MAP_REL_PATH}`));
      return 1;
    }
    if (validation.warnings.length > 0) {
      console.log(chalk.yellow(`  Context map validated with ${validation.warnings.length} warning(s).`));
      return 0;
    }
    console.log(chalk.hex('#ffa203')('  Context map validated successfully.'));
    return 0;
  }

  const payload = buildJsonPayload(projectRoot, doc, validation, { writeMode: false, checkMode: false });
  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return validation.errors.length > 0 ? 1 : 0;
  }

  const report = renderReport(projectRoot, doc, validation, { writeMode: false, checkMode: false });
  console.log(report);
  return validation.errors.length > 0 ? 1 : 0;
}
