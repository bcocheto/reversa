import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, fileStatus, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';

const REPORT_REL_PATH = '.agentforge/reports/import-ai-suggestions.md';
const SUGGESTION_DIRS = {
  agents: '.agentforge/suggestions/agents',
  skills: '.agentforge/suggestions/skills',
  flows: '.agentforge/suggestions/flows',
  policies: '.agentforge/suggestions/policies',
  context: '.agentforge/suggestions/context',
};

const REQUEST_PATHS = {
  agents: '.agentforge/ai/requests/suggest-agents.md',
  skills: '.agentforge/ai/requests/suggest-skills.md',
  flows: '.agentforge/ai/requests/suggest-flows.md',
  policies: '.agentforge/ai/requests/suggest-policies.md',
  context: '.agentforge/ai/requests/suggest-context.md',
};

const VALID_KINDS = Object.freeze(['agents', 'skills', 'flows', 'policies', 'context']);
const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function toPosixPath(path) {
  return String(path ?? '').split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toArray(value) {
  if (Array.isArray(value)) return value.map((item) => normalizeString(item)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(/[\n,;]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function parseStructuredFile(content, filePath) {
  const trimmed = String(content ?? '').trim();
  const ext = extname(filePath).toLowerCase();
  const tryJsonFirst = ext === '.json' || trimmed.startsWith('{') || trimmed.startsWith('[');

  if (tryJsonFirst) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through to YAML.
    }
  }

  try {
    return YAML.parse(trimmed);
  } catch (yamlError) {
    if (!tryJsonFirst) {
      try {
        return JSON.parse(trimmed);
      } catch {
        throw yamlError;
      }
    }
    throw yamlError;
  }
}

function looksLikeItem(kind, doc) {
  if (!isPlainObject(doc)) return false;
  if (kind === 'context') {
    return Boolean(doc.id || doc.path || doc.target_path || doc.title || doc.purpose || doc.sections);
  }
  if (kind === 'agents') {
    return Boolean(doc.id || doc.name || doc.purpose || doc.responsibilities);
  }
  if (kind === 'skills') {
    return Boolean(doc.id || doc.name || doc.description || doc.recommended_steps);
  }
  if (kind === 'flows') {
    return Boolean(doc.id || doc.name || doc.purpose || doc.stages || doc.recommended_steps);
  }
  if (kind === 'policies') {
    return Boolean(doc.id || doc.name || doc.scope || doc.rule);
  }
  return false;
}

function normalizeRootDocument(kind, doc) {
  const meta = isPlainObject(doc)
    ? {
        source_request: normalizeString(doc.source_request || doc.request),
        generated_by: normalizeString(doc.generated_by),
      }
    : {};

  if (Array.isArray(doc)) {
    return { meta, items: doc };
  }

  if (!isPlainObject(doc)) {
    return { meta, items: [] };
  }

  const candidateKeys = ['items', 'suggestions', kind, `${kind.slice(0, -1)}s`, 'data'];
  for (const key of candidateKeys) {
    if (Array.isArray(doc[key])) {
      return { meta, items: doc[key] };
    }
  }

  if (looksLikeItem(kind, doc)) {
    return { meta, items: [doc] };
  }

  return { meta, items: [] };
}

function normalizeEvidenceItem(projectRoot, sourceFile, item) {
  if (!isPlainObject(item)) {
    return {
      ok: false,
      error: 'Cada item de source_evidence deve ser um objeto com path, kind, reason e snippet.',
    };
  }

  const pathValue = normalizeString(item.path || item.file);
  const kind = normalizeString(item.kind) || 'evidence';
  const reason = normalizeString(item.reason);
  const snippet = normalizeString(item.snippet);
  const line = Number.isInteger(item.line) ? item.line : null;

  if (!pathValue) {
    return { ok: false, error: 'Cada item de source_evidence precisa de path real.' };
  }
  if (!reason) {
    return { ok: false, error: `source_evidence em ${sourceFile} precisa de reason para ${pathValue}.` };
  }
  if (!snippet) {
    return { ok: false, error: `source_evidence em ${sourceFile} precisa de snippet para ${pathValue}.` };
  }

  const normalizedPath = pathValue.startsWith(projectRoot)
    ? rel(projectRoot, pathValue)
    : toPosixPath(pathValue);
  const absPath = pathValue.startsWith(projectRoot) ? pathValue : join(projectRoot, normalizedPath);

  if (!existsSync(absPath)) {
    return { ok: false, error: `source_evidence aponta para um caminho inexistente: ${normalizedPath}.` };
  }

  return {
    ok: true,
    value: {
      path: normalizedPath,
      kind,
      reason,
      snippet,
      ...(line ? { line } : {}),
    },
  };
}

function normalizeEvidence(projectRoot, sourceFile, value) {
  const evidence = Array.isArray(value) ? value : [];
  if (evidence.length === 0) {
    return {
      ok: true,
      warnings: ['Nenhuma evidência foi fornecida; a sugestão será revisada manualmente antes de qualquer promoção.'],
      value: [],
    };
  }

  const normalized = [];
  for (const item of evidence) {
    const result = normalizeEvidenceItem(projectRoot, sourceFile, item);
    if (!result.ok) return result;
    normalized.push(result.value);
  }

  return { ok: true, warnings: [], value: normalized };
}

function validateId(kind, id) {
  const normalizedId = normalizeString(id);
  if (!normalizedId) {
    return 'O id é obrigatório.';
  }
  if (!KEBAB_CASE_PATTERN.test(normalizedId)) {
    return 'O id deve estar em kebab-case.';
  }
  return null;
}

function deriveContextId(item) {
  const candidate = normalizeString(item.id || item.path || item.target_path);
  if (candidate && candidate.includes('/')) {
    return basename(candidate, extname(candidate));
  }
  if (candidate && candidate.endsWith('.md')) {
    return basename(candidate, '.md');
  }
  return candidate;
}

function deriveTargetPath(kind, id, item = {}) {
  const normalizedId = normalizeString(id);
  if (kind === 'agents') return normalizeString(item.target_path) || `.agentforge/agents/${normalizedId}.yaml`;
  if (kind === 'skills') return normalizeString(item.target_path) || `.agentforge/skills/${normalizedId}/SKILL.md`;
  if (kind === 'flows') return normalizeString(item.target_path) || `.agentforge/flows/${normalizedId}.yaml`;
  if (kind === 'policies') return normalizeString(item.target_path) || `.agentforge/policies/${normalizedId}.yaml`;
  return normalizeString(item.target_path) || `.agentforge/context/${normalizedId}.md`;
}

function normalizeSuggestion(projectRoot, kind, rawItem, meta, sourceFile, sourceRequest) {
  const item = isPlainObject(rawItem) ? rawItem : {};
  const warnings = [];
  const errors = [];

  let id = normalizeString(item.id);
  if (kind === 'context' && !id) {
    id = deriveContextId(item);
  }

  const idError = validateId(kind, id);
  if (idError) errors.push(idError);

  const confidence = normalizeString(item.confidence) || 'medium';
  if (!['low', 'medium', 'high'].includes(confidence)) {
    errors.push('confidence deve ser low, medium ou high.');
  }

  const sourceEvidenceResult = normalizeEvidence(projectRoot, sourceFile, item.source_evidence);
  if (!sourceEvidenceResult.ok) {
    errors.push(sourceEvidenceResult.error);
  } else {
    warnings.push(...sourceEvidenceResult.warnings);
  }

  const source_evidence = sourceEvidenceResult.ok ? sourceEvidenceResult.value : [];
  const source_request = normalizeString(item.source_request) || meta.source_request || sourceRequest;
  const generated_by = normalizeString(item.generated_by) || meta.generated_by || 'active-ai';
  const imported_at = new Date().toISOString();

  if (kind === 'agents') {
    const name = normalizeString(item.name || item.title || item.purpose);
    const purpose = normalizeString(item.purpose || item.description || item.reason);
    const responsibilities = unique(toArray(item.responsibilities));
    const reads = unique([...toArray(item.reads), ...toArray(item.recommended_context)]);
    const skills = unique(toArray(item.skills));
    const flows = unique(toArray(item.flows));
    const limits = unique([...toArray(item.limits), ...toArray(item.safety_limits)]);
    const recommended_context = unique(toArray(item.recommended_context));
    const safety_limits = unique(toArray(item.safety_limits));
    const category = normalizeString(item.category) || 'core';

    if (!name) errors.push('agents requer name.');
    if (!purpose) errors.push('agents requer purpose ou description.');
    if (responsibilities.length === 0) errors.push('agents requer responsibilities.');
    if (reads.length === 0 && recommended_context.length === 0) errors.push('agents requer reads ou recommended_context.');
    if (limits.length === 0 && safety_limits.length === 0) errors.push('agents requer limits ou safety_limits.');

    return {
      ok: errors.length === 0,
      warnings,
      errors,
      value: {
        id,
        kind: 'agent',
        name,
        title: normalizeString(item.title) || name,
        category,
        purpose,
        description: normalizeString(item.description) || purpose,
        reason: normalizeString(item.reason) || purpose,
        confidence,
        target_path: deriveTargetPath(kind, id, item),
        responsibilities,
        reads,
        skills,
        flows,
        limits,
        recommended_context,
        safety_limits,
        source_evidence,
        generated_by,
        imported_at,
        source_request,
        source_file: sourceFile,
      },
    };
  }

  if (kind === 'skills') {
    const name = normalizeString(item.name || item.title);
    const description = normalizeString(item.description || item.title || item.reason);
    const triggers = unique([...toArray(item.triggers), ...toArray(item.signals)]);
    const recommended_context = unique(toArray(item.recommended_context));
    const recommended_steps = unique(toArray(item.recommended_steps));
    const safety_limits = unique(toArray(item.safety_limits));

    if (!name) errors.push('skills requer name.');
    if (!description) errors.push('skills requer description.');
    if (triggers.length === 0) errors.push('skills requer triggers.');
    if (recommended_context.length === 0) errors.push('skills requer recommended_context.');
    if (recommended_steps.length === 0) errors.push('skills requer recommended_steps.');
    if (safety_limits.length === 0) errors.push('skills requer safety_limits.');

    return {
      ok: errors.length === 0,
      warnings,
      errors,
      value: {
        id,
        kind: 'skill',
        name,
        title: normalizeString(item.title) || name,
        description,
        reason: normalizeString(item.reason) || description,
        confidence,
        target_path: deriveTargetPath(kind, id, item),
        triggers,
        recommended_context,
        recommended_steps,
        safety_limits,
        source_evidence,
        generated_by,
        imported_at,
        source_request,
        source_file: sourceFile,
      },
    };
  }

  if (kind === 'flows') {
    const name = normalizeString(item.name || item.title);
    const purpose = normalizeString(item.purpose || item.description || item.reason);
    const stages = unique([...toArray(item.stages), ...toArray(item.recommended_steps)]);
    const recommended_context = unique(toArray(item.recommended_context));
    const safety_limits = unique(toArray(item.safety_limits));
    const signals = unique(toArray(item.signals));

    if (!name) errors.push('flows requer name.');
    if (!purpose) errors.push('flows requer purpose ou description.');
    if (stages.length === 0) errors.push('flows requer stages.');
    if (recommended_context.length === 0) errors.push('flows requer recommended_context.');
    if (safety_limits.length === 0) errors.push('flows requer safety_limits.');

    return {
      ok: errors.length === 0,
      warnings,
      errors,
      value: {
        id,
        kind: 'flow',
        name,
        title: normalizeString(item.title) || name,
        purpose,
        description: normalizeString(item.description) || purpose,
        reason: normalizeString(item.reason) || purpose,
        confidence,
        target_path: deriveTargetPath(kind, id, item),
        stages,
        recommended_steps: stages,
        recommended_context,
        safety_limits,
        signals,
        source_evidence,
        generated_by,
        imported_at,
        source_request,
        source_file: sourceFile,
      },
    };
  }

  if (kind === 'policies') {
    const name = normalizeString(item.name || item.title);
    const scope = normalizeString(item.scope || item.description || item.reason);
    const rule = normalizeString(item.rule || item.description || item.reason);
    const recommended_context = unique(toArray(item.recommended_context));
    const safety_limits = unique(toArray(item.safety_limits));
    const signals = unique(toArray(item.signals));

    if (!name) errors.push('policies requer name.');
    if (!scope) errors.push('policies requer scope.');
    if (!rule) errors.push('policies requer rule.');
    if (recommended_context.length === 0) errors.push('policies requer recommended_context.');
    if (safety_limits.length === 0) errors.push('policies requer safety_limits.');

    return {
      ok: errors.length === 0,
      warnings,
      errors,
      value: {
        id,
        kind: 'policy',
        name,
        title: normalizeString(item.title) || name,
        scope,
        rule,
        description: normalizeString(item.description) || rule,
        reason: normalizeString(item.reason) || rule,
        confidence,
        target_path: deriveTargetPath(kind, id, item),
        recommended_context,
        safety_limits,
        signals,
        source_evidence,
        generated_by,
        imported_at,
        source_request,
        source_file: sourceFile,
      },
    };
  }

  const path = normalizeString(item.path || item.target_path || item.id);
  const title = normalizeString(item.title || item.name || item.id);
  const purpose = normalizeString(item.purpose || item.description || item.reason);
  const sections = Array.isArray(item.sections) ? item.sections.filter(isPlainObject) : [];
  const recommended_context = unique(toArray(item.recommended_context));
  const safety_limits = unique(toArray(item.safety_limits));
  const signals = unique(toArray(item.signals));
  const target_path = normalizeString(item.target_path) || (path ? path : deriveTargetPath(kind, id, item));

  if (!title) errors.push('context requer title.');
  if (!purpose) errors.push('context requer purpose ou description.');
  if (!target_path) errors.push('context requer path ou target_path.');
  if (sections.length === 0) errors.push('context requer sections.');

  return {
    ok: errors.length === 0,
    warnings,
    errors,
    value: {
      id,
      kind: 'context',
      path: normalizeString(item.path) || target_path,
      title,
      purpose,
      description: normalizeString(item.description) || purpose,
      reason: normalizeString(item.reason) || purpose,
      confidence,
      target_path,
      sections,
      recommended_context,
      safety_limits,
      signals,
      source_evidence,
      generated_by,
      imported_at,
      source_request,
      source_file: sourceFile,
    },
  };
}

function renderReport({
  kind,
  sourceFile,
  sourceRequest,
  imported,
  skipped,
  warnings,
  errors,
  reportPath,
}) {
  const lines = [];
  lines.push('# AgentForge AI Suggestions Import');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Kind: ${kind}`);
  lines.push(`- Source file: \`${sourceFile}\``);
  lines.push(`- Source request: \`${sourceRequest}\``);
  lines.push(`- Imported: ${imported.length}`);
  lines.push(`- Skipped: ${skipped.length}`);
  lines.push(`- Warnings: ${warnings.length}`);
  lines.push(`- Errors: ${errors.length}`);
  lines.push(`- Report: \`${reportPath}\``);
  lines.push('');

  lines.push('## Imported items');
  lines.push('');
  if (imported.length === 0) {
    lines.push('- Nenhum item foi importado.');
    lines.push('');
  } else {
    for (const item of imported) {
      lines.push(`### ${item.id}`);
      lines.push('');
      lines.push(`- Target: \`${item.target_path}\``);
      lines.push(`- Confidence: ${item.confidence}`);
      lines.push(`- Source request: \`${item.source_request}\``);
      lines.push(`- Generated by: ${item.generated_by}`);
      lines.push(`- Imported at: ${item.imported_at}`);
      lines.push(`- Evidence items: ${item.source_evidence.length}`);
      if (item.warnings.length > 0) {
        lines.push(`- Warnings: ${item.warnings.join(' | ')}`);
      }
      lines.push('');
    }
  }

  lines.push('## Skipped items');
  lines.push('');
  if (skipped.length === 0) {
    lines.push('- Nenhum item foi ignorado.');
    lines.push('');
  } else {
    for (const item of skipped) {
      lines.push(`- ${item.id}: ${item.reason}`);
    }
    lines.push('');
  }

  lines.push('## Warnings');
  lines.push('');
  if (warnings.length === 0) {
    lines.push('- Nenhum warning.');
  } else {
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }
  lines.push('');

  lines.push('## Errors');
  lines.push('');
  if (errors.length === 0) {
    lines.push('- Nenhum erro.');
  } else {
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
  }
  lines.push('');

  lines.push('## Notes');
  lines.push('');
  lines.push('- As sugestões permanecem em `.agentforge/suggestions/` e não são promovidas automaticamente.');
  lines.push('- Promova ou aplique essas sugestões em um passo separado e revisável.');
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function parseArgs(args = []) {
  const parsed = {
    help: false,
    force: false,
    kind: '',
    file: '',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--force') {
      parsed.force = true;
      continue;
    }
    if (arg === '--kind') {
      parsed.kind = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }
    if (arg === '--file') {
      parsed.file = normalizeString(args[index + 1]);
      index += 1;
      continue;
    }
  }

  return parsed;
}

function renderHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: Import AI Suggestions\n`));
  console.log('  Uso: npx agentforge import-ai-suggestions --kind <agents|skills|flows|policies|context> --file <path> [--force]\n');
  console.log('  Importa YAML ou JSON produzidos pela IA ativa para .agentforge/suggestions/<kind>/.');
  console.log('  O comando valida o schema mínimo, preserva a revisão humana e não promove nada automaticamente.');
  console.log('  Use --force para sobrescrever sugestões intactas; arquivos modificados continuam protegidos.\n');
}

function ensureInstalled(projectRoot) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return { ok: false, errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'] };
  }
  return { ok: true, state: installation.state ?? {} };
}

function readStructuredFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  return parseStructuredFile(raw, filePath);
}

function writeReport(projectRoot, reportText) {
  const reportAbsPath = join(projectRoot, REPORT_REL_PATH);
  mkdirSync(dirname(reportAbsPath), { recursive: true });
  writeFileSync(reportAbsPath, reportText, 'utf8');
  return reportAbsPath;
}

function updateStateAndManifest(projectRoot, manifest, writtenRelPaths, statePatch) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const importedAiSuggestions = Array.isArray(state.imported_ai_suggestions) ? state.imported_ai_suggestions : [];
  const nextImportedAiSuggestions = Array.isArray(statePatch.imported_ai_suggestions)
    ? [...importedAiSuggestions, ...statePatch.imported_ai_suggestions]
    : importedAiSuggestions;
  const nextState = {
    ...state,
    ...statePatch,
    imported_ai_suggestions: nextImportedAiSuggestions,
    created_files: unique([...createdFiles, ...writtenRelPaths, rel(projectRoot, statePath)]),
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, [...writtenRelPaths, rel(projectRoot, statePath)]),
  });

  return nextState;
}

export function importAiSuggestions(projectRoot, { kind, filePath, force = false } = {}) {
  const installation = ensureInstalled(projectRoot);
  if (!installation.ok) return installation;

  const normalizedKind = normalizeString(kind);
  if (!VALID_KINDS.includes(normalizedKind)) {
    return {
      ok: false,
      errors: [`Kind inválido: ${normalizedKind || 'vazio'}. Use agents, skills, flows, policies ou context.`],
    };
  }

  const resolvedFilePath = filePath ? (isAbsolute(filePath) ? filePath : resolve(projectRoot, filePath)) : '';
  if (!resolvedFilePath || !existsSync(resolvedFilePath)) {
    return {
      ok: false,
      errors: [`Arquivo de entrada não encontrado: ${filePath || 'vazio'}.`],
    };
  }

  let parsed;
  try {
    parsed = readStructuredFile(resolvedFilePath);
  } catch {
    return {
      ok: false,
      errors: [`Não foi possível interpretar ${filePath} como YAML ou JSON.`],
    };
  }

  const { meta, items } = normalizeRootDocument(normalizedKind, parsed);
  if (items.length === 0) {
    return {
      ok: false,
      errors: [`Nenhum item válido foi encontrado em ${filePath}.`],
    };
  }

  const sourceFile = rel(projectRoot, resolvedFilePath);
  const sourceRequest = meta.source_request || REQUEST_PATHS[normalizedKind];
  const suggestionDirRel = SUGGESTION_DIRS[normalizedKind];
  const suggestionDirAbs = join(projectRoot, suggestionDirRel);
  mkdirSync(suggestionDirAbs, { recursive: true });

  const manifest = loadManifest(projectRoot);
  const writer = new Writer(projectRoot);
  const imported = [];
  const skipped = [];
  const warnings = [];
  const errors = [];
  const writtenRelPaths = [];

  for (const rawItem of items) {
    const normalized = normalizeSuggestion(projectRoot, normalizedKind, rawItem, meta, sourceFile, sourceRequest);
    if (!normalized.ok) {
      errors.push(...normalized.errors.map((error) => `${sourceFile}: ${error}`));
      continue;
    }

    warnings.push(...normalized.warnings.map((warning) => `${normalized.value.id}: ${warning}`));

    const relTarget = rel(projectRoot, join(projectRoot, suggestionDirRel, `${normalized.value.id}.yaml`));
    const absTarget = join(projectRoot, relTarget);
    const status = existsSync(absTarget) ? fileStatus(projectRoot, relTarget, manifest[relTarget]) : 'missing';

    if (status === 'modified' && !force) {
      skipped.push({
        id: normalized.value.id,
        reason: `arquivo existente foi modificado manualmente em ${relTarget}. Use --force para sobrescrever.`,
        status,
      });
      continue;
    }

    writer.writeGeneratedFile(absTarget, `${YAML.stringify(normalized.value).trim()}\n`, { force: true });
    writtenRelPaths.push(relTarget);
    imported.push({
      ...normalized.value,
      warnings: normalized.warnings,
    });
  }

  const reportText = renderReport({
    kind: normalizedKind,
    sourceFile,
    sourceRequest,
    imported,
    skipped,
    warnings,
    errors,
    reportPath: REPORT_REL_PATH,
  });

  const reportAbsPath = writeReport(projectRoot, reportText);
  writtenRelPaths.push(rel(projectRoot, reportAbsPath));
  writer.saveCreatedFiles();

  const nextState = updateStateAndManifest(projectRoot, manifest, writtenRelPaths, {
    last_import_ai_suggestions_at: new Date().toISOString(),
    import_ai_suggestions: {
      kind: normalizedKind,
      source_file: sourceFile,
      source_request: sourceRequest,
      imported_count: imported.length,
      skipped_count: skipped.length,
      warning_count: warnings.length,
      error_count: errors.length,
      report_path: REPORT_REL_PATH,
      status: errors.length > 0 ? 'partial' : 'ok',
    },
    imported_ai_suggestions: imported.map((item) => ({
      id: item.id,
      kind: item.kind,
      target_path: item.target_path,
      source_file: item.source_file,
      source_request: item.source_request,
      imported_at: item.imported_at,
      warnings: item.warnings.length,
    })),
  });

  return {
    ok: errors.length === 0,
    kind: normalizedKind,
    sourceFile,
    sourceRequest,
    reportPath: REPORT_REL_PATH,
    reportText,
    imported,
    skipped,
    warnings,
    errors,
    state: nextState,
  };
}

export default async function importAiSuggestionsCommand(args = []) {
  const { default: chalk } = await import('chalk');
  const parsed = parseArgs(args);

  if (parsed.help) {
    renderHelp(chalk);
    return 0;
  }

  const result = importAiSuggestions(process.cwd(), {
    kind: parsed.kind,
    filePath: parsed.file,
    force: parsed.force,
  });

  if (!result.ok) {
    console.log(chalk.red(`  ${result.errors?.[0] || 'Falha ao importar sugestões da IA.'}`));
    console.log(chalk.gray(`  Report: ${REPORT_REL_PATH}`));
    return 1;
  }

  console.log(chalk.hex('#ffa203')(`  Sugestões importadas para ${SUGGESTION_DIRS[result.kind]}`));
  console.log(chalk.gray(`  Importadas: ${result.imported.length}`));
  console.log(chalk.gray(`  Ignoradas: ${result.skipped.length}`));
  console.log(chalk.gray(`  Avisos: ${result.warnings.length}`));
  console.log(chalk.gray(`  Report: ${result.reportPath}`));
  return result.errors.length > 0 ? 1 : 0;
}
