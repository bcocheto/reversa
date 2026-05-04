import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, resolve, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest, fileStatus } from '../installer/manifest.js';
import { detectEngines } from '../installer/detector.js';
import { Writer } from '../installer/writer.js';
import { PRODUCT } from '../product.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { buildAiEvidenceArtifacts } from './ai-evidence.js';
import { buildAiEvidenceBundle } from '../ai/evidence-bundle.js';
import { renderAgenticBlueprintRequest, renderAgenticDossier } from '../ai/agentic-blueprint.js';
import { normalizeAgenticBlueprint, validateAgenticBlueprint } from '../ai/agentic-blueprint-schema.js';
import { buildContextMapForProject } from './context-map.js';
import { runIngest } from './ingest.js';
import { runImprovementAnalysis } from './improve.js';
import { runContextAudit, writeContextAudit } from './audit-context.js';
import { runRefactorContext, applyRefactorContext } from './refactor-context.js';
import { runSkillSuggestions } from './suggest-skills.js';
import { writeCoreContextFiles } from './bootstrap.js';
import { compileAgentForge } from '../exporter/index.js';
import { renderManagedEntrypoint } from '../exporter/bootloader.js';
import { validateAgentForgeStructure } from './validate.js';
import { finalizeAdoptionWorkflow, repairPhaseState, verifyAdoptionWorkflow } from './phase-engine.js';
import { takeOverAgenticEntrypoints } from '../adoption/agentic-surface.js';
import { writeImportedSnapshot } from './snapshots.js';

const ENTRYPOINT_TARGETS = [
  { path: 'AGENTS.md', label: 'Codex' },
  { path: 'CLAUDE.md', label: 'Claude Code' },
  { path: '.cursor/rules/agentforge.md', label: 'Cursor rules' },
  { path: '.github/copilot-instructions.md', label: 'GitHub Copilot' },
  { path: '.cursorrules', label: 'Cursor legacy' },
  { path: '.windsurfrules', label: 'Windsurf' },
  { path: '.clinerules', label: 'Cline' },
  { path: '.roorules', label: 'Roo Code' },
  { path: 'GEMINI.md', label: 'Gemini CLI' },
  { path: 'CONVENTIONS.md', label: 'Aider' },
  { path: '.kiro/steering/agentforge.md', label: 'Kiro' },
  { path: '.amazonq/rules/agentforge.md', label: 'Amazon Q' },
];

const AGENT_DOC_DIRS = [
  { path: '.agents', label: 'Legacy agent docs' },
  { path: '.claude/agents', label: 'Claude agent docs' },
  { path: '.github/agents', label: 'GitHub agent docs' },
];

const PROJECT_SURFACE_TARGETS = [
  { path: 'README.md', label: 'README' },
  { path: 'package.json', label: 'package.json' },
  { path: 'docs', label: 'docs' },
  { path: 'src', label: 'src' },
  { path: 'lib', label: 'lib' },
  { path: 'app', label: 'app' },
  { path: 'test', label: 'test' },
  { path: 'tests', label: 'tests' },
];

const DATABASE_HINTS = ['prisma', 'knex', 'sequelize', 'typeorm', 'mongoose', 'mongodb', 'pg', 'mysql', 'sqlite', 'sqlite3', 'better-sqlite3'];
const API_HINTS = ['express', 'fastify', 'hono', 'nestjs', 'next', 'nuxt', 'openapi', 'swagger'];
const AI_EVIDENCE_JSON_REL_PATH = '.agentforge/ai/evidence/project-evidence.json';
const AI_EVIDENCE_BRIEF_REL_PATH = '.agentforge/ai/evidence/project-brief.md';
const AI_EVIDENCE_REPORT_REL_PATH = '.agentforge/reports/ai-evidence.md';
const AI_DOSSIER_REL_PATH = '.agentforge/reports/agentic-dossier.md';
const AI_BLUEPRINT_REQUEST_REL_PATH = '.agentforge/ai/requests/agentic-blueprint.md';
const ADOPTION_PLAN_REL_PATH = '.agentforge/reports/adoption-plan.md';
const ADOPTION_APPLY_REL_PATH = '.agentforge/reports/adoption-apply.md';
const BLUEPRINT_VALIDATION_REL_PATH = '.agentforge/reports/agentic-blueprint-validation.md';
const NEXT_REQUIRED_OUTPUT = '.agentforge/ai/outbox/agentic-blueprint.yaml';
const BLUEPRINT_REQUIRED_ENTRYPOINTS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursor/rules/agentforge.md',
  '.github/copilot-instructions.md',
];
const BLUEPRINT_REQUIRED_POLICIES = [
  'permissions',
  'protected-files',
  'human-approval',
];
function toPosixPath(path) {
  return path.split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
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

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function formatList(values = []) {
  const items = values.filter(Boolean);
  return items.length > 0 ? items.join(', ') : 'none';
}

function countLines(content) {
  const text = String(content ?? '').replace(/\r\n/g, '\n');
  if (!text) return 0;
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines.length;
}

function parseBlueprintFile(filePath) {
  if (!existsSync(filePath)) {
    return { ok: false, error: `Blueprint ausente em ${filePath}.` };
  }

  try {
    const text = readFileSync(filePath, 'utf8');
    const parsed = extname(filePath).toLowerCase() === '.json'
      ? JSON.parse(text)
      : YAML.parse(text);
    if (parsed === null || parsed === undefined) {
      return { ok: false, error: 'Blueprint vazio.' };
    }
    return { ok: true, doc: parsed, text };
  } catch (error) {
    return {
      ok: false,
      error: `Blueprint inválido em ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function loadBlueprintEvidenceBundle(projectRoot) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  return buildAiEvidenceBundle(projectRoot, { state });
}

function validateBlueprintForAdoptApply(projectRoot, blueprintDoc, evidenceBundle, blueprintPath) {
  const validation = validateAgenticBlueprint(blueprintDoc, evidenceBundle);
  const normalized = validation.normalized?.blueprint ?? normalizeAgenticBlueprint(blueprintDoc).blueprint;
  const completenessErrors = [];

  if (normalized.agents.length === 0) completenessErrors.push('Blueprint precisa declarar ao menos um agente.');
  if (normalized.skills.length === 0) completenessErrors.push('Blueprint precisa declarar ao menos uma skill.');
  if (normalized.context_documents.length === 0) completenessErrors.push('Blueprint precisa declarar ao menos um documento de contexto.');
  if (normalized.flows.length === 0) completenessErrors.push('Blueprint precisa declarar ao menos um flow.');
  if (normalized.policies.length === 0) completenessErrors.push('Blueprint precisa declarar ao menos uma policy.');
  if (normalized.entrypoints.length === 0) completenessErrors.push('Blueprint precisa declarar ao menos um entrypoint.');

  const missingEntrypoints = BLUEPRINT_REQUIRED_ENTRYPOINTS.filter(
    (entrypointPath) => !normalized.entrypoints.some((entrypoint) => entrypoint.path === entrypointPath),
  );
  if (missingEntrypoints.length > 0) {
    completenessErrors.push(`Blueprint precisa incluir os entrypoints obrigatórios: ${missingEntrypoints.join(', ')}.`);
  }

  const requiredPolicyIds = BLUEPRINT_REQUIRED_POLICIES.filter(
    (policyId) => !normalized.policies.some((policy) => policy.id === policyId || policy.name === policyId),
  );
  if (requiredPolicyIds.length > 0) {
    completenessErrors.push(`Blueprint precisa incluir as policies obrigatórias: ${requiredPolicyIds.join(', ')}.`);
  }

  const errors = [
    ...(validation.errors ?? []).map((entry) => `${entry.path}: ${entry.message}`),
    ...completenessErrors,
  ];

  return {
    valid: validation.valid && completenessErrors.length === 0,
    errors,
    warnings: [],
    normalized,
    validation,
    blueprintPath: rel(projectRoot, blueprintPath),
  };
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function truncateText(value, maxLength = 140) {
  const text = String(value ?? '').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function summarizeEvidenceItems(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return ['- Nenhuma evidência explícita foi registrada.'];
  }

  return items.map((item) => {
    if (!item || typeof item !== 'object') {
      return `- ${truncateText(item)}`;
    }

    const path = normalizeString(item.path) || normalizeString(item.file) || 'origem desconhecida';
    const reason = truncateText(item.reason || item.kind || 'evidência');
    const snippet = truncateText(item.snippet || item.content || '');
    return snippet
      ? `- \`${path}\` - ${reason}: ${snippet}`
      : `- \`${path}\` - ${reason}`;
  });
}

function evidenceSummaryFromSourceEvidence(sourceEvidence = []) {
  return summarizeEvidenceItems(sourceEvidence);
}

function blueprintPrimaryEvidenceList(section) {
  return Array.isArray(section?.source_evidence) ? section.source_evidence : [];
}

function blueprintArtifactLines(kind, docs) {
  return docs.map((doc) => `- ${kind}: ${doc}`);
}

function writeManagedArtifactWithSnapshot(writer, projectRoot, relPath, content, { sourceType = 'agentic-blueprint' } = {}) {
  const absPath = join(projectRoot, relPath);
  const existed = existsSync(absPath);
  const currentContent = existed ? readFileSync(absPath, 'utf8') : null;
  let snapshotPath = null;

  if (existed && currentContent !== content) {
    snapshotPath = writeImportedSnapshot(projectRoot, PRODUCT.internalDir, relPath, currentContent, { sourceType }).snapshotPath;
  }

  writer.writeGeneratedFile(absPath, content, { force: true });
  return {
    path: relPath,
    existed,
    snapshotPath,
    changed: !existed || currentContent !== content,
  };
}

function renderBlueprintAgentDocument(agent, blueprintPath) {
  const doc = {
    id: agent.id,
    name: agent.name,
    description: agent.purpose,
    purpose: agent.purpose,
    responsibilities: agent.responsibilities,
    boundaries: agent.safety_limits,
    triggers: agent.triggers,
    skills: agent.skills,
    context: agent.context,
    source_evidence: agent.source_evidence,
    generated_by: 'agentic-blueprint',
    blueprint_path: blueprintPath,
  };
  return `${YAML.stringify(doc).trim()}\n`;
}

function renderBlueprintSkillDocument(skill, blueprintPath) {
  const skillContext = Array.isArray(skill.context) ? skill.context : [];
  const safetyLimits = Array.isArray(skill.safety_limits) ? skill.safety_limits : [];
  const frontmatter = {
    name: skill.name,
    description: skill.description,
    license: 'MIT',
    metadata: {
      framework: 'agentforge',
      type: 'agentic-skill',
      source: 'agentic-blueprint',
      skill_id: skill.id,
      blueprint_path: blueprintPath,
      owner_agents: skill.owner_agents,
    },
  };

  const lines = [];
  lines.push('---');
  lines.push(YAML.stringify(frontmatter).trim());
  lines.push('---');
  lines.push('');
  lines.push(`# ${skill.name}`);
  lines.push('');
  lines.push('## Quando usar');
  lines.push('');
  lines.push(`- ${skill.description}`);
  lines.push('');
  lines.push('## Contexto necessário');
  lines.push('');
  lines.push(...(skillContext.length > 0 ? skillContext.map((entry) => `- \`${entry}\``) : ['- Nenhum contexto adicional.']));
  lines.push('');
  lines.push('## Procedimento');
  lines.push('');
  skill.steps.forEach((step, index) => {
    lines.push(`${index + 1}. ${step}`);
  });
  lines.push('');
  lines.push('## Limites de segurança');
  lines.push('');
  lines.push(...(safetyLimits.length > 0 ? safetyLimits.map((entry) => `- ${entry}`) : ['- Nenhum limite adicional.']));
  lines.push('');
  lines.push('## Evidências de origem');
  lines.push('');
  lines.push(...evidenceSummaryFromSourceEvidence(skill.source_evidence));
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderBlueprintContextDocument(contextDoc, blueprintPath) {
  const lines = [];
  lines.push(`# ${contextDoc.title}`);
  lines.push('');
  lines.push(contextDoc.purpose);
  lines.push('');
  lines.push(`- Owner agent: \`${contextDoc.owner_agent}\``);
  lines.push(`- Blueprint: \`${blueprintPath}\``);
  lines.push('');
  for (const section of contextDoc.sections) {
    lines.push(`## ${section.heading}`);
    lines.push('');
    if (section.bullets.length === 0) {
      lines.push('- Nenhum item registrado.');
    } else {
      for (const bullet of section.bullets) {
        lines.push(`- ${bullet}`);
      }
    }
    lines.push('');
  }
  lines.push('## Evidências de origem');
  lines.push('');
  lines.push(...evidenceSummaryFromSourceEvidence(contextDoc.source_evidence));
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderBlueprintFlowFiles(flow, blueprintPath) {
  const yamlDoc = {
    id: flow.id,
    name: flow.name,
    goal: flow.purpose,
    trigger: flow.purpose,
    steps: flow.steps.map((step, index) => ({
      id: `${flow.id}-step-${index + 1}`,
      agent: flow.owner_agents[Math.min(index, flow.owner_agents.length - 1)],
      description: step,
    })),
    checkpoints: ['Blueprint validado', 'Arquitetura materializada'],
    done_when: [flow.purpose],
    source_evidence: flow.source_evidence,
    generated_by: 'agentic-blueprint',
    blueprint_path: blueprintPath,
  };

  const mdLines = [];
  mdLines.push(`# ${flow.name}`);
  mdLines.push('');
  mdLines.push(flow.purpose);
  mdLines.push('');
  mdLines.push('## Etapas');
  mdLines.push('');
  flow.steps.forEach((step, index) => {
    mdLines.push(`${index + 1}. ${step}`);
  });
  mdLines.push('');
  mdLines.push('## Owners');
  mdLines.push('');
  flow.owner_agents.forEach((owner) => {
    mdLines.push(`- ${owner}`);
  });
  mdLines.push('');
  mdLines.push('## Evidências de origem');
  mdLines.push('');
  mdLines.push(...evidenceSummaryFromSourceEvidence(flow.source_evidence));
  mdLines.push('');

  return {
    yaml: `${YAML.stringify(yamlDoc).trim()}\n`,
    md: `${mdLines.join('\n').trimEnd()}\n`,
  };
}

function renderBlueprintPolicyFiles(policy, blueprintPath) {
  const yamlDoc = {
    name: policy.name,
    description: policy.rule,
    scope: policy.scope,
    rule: policy.rule,
    owner_agents: policy.owner_agents,
    notes: policy.source_evidence.map((item) => truncateText(item.reason || item.snippet || item.kind || 'evidence')),
    source_evidence: policy.source_evidence,
    generated_by: 'agentic-blueprint',
    blueprint_path: blueprintPath,
  };

  const mdLines = [];
  mdLines.push(`# ${policy.name}`);
  mdLines.push('');
  mdLines.push(`- Scope: ${policy.scope}`);
  mdLines.push(`- Rule: ${policy.rule}`);
  mdLines.push('');
  mdLines.push('## Owners');
  mdLines.push('');
  policy.owner_agents.forEach((owner) => {
    mdLines.push(`- ${owner}`);
  });
  mdLines.push('');
  mdLines.push('## Evidências de origem');
  mdLines.push('');
  mdLines.push(...evidenceSummaryFromSourceEvidence(policy.source_evidence));
  mdLines.push('');

  return {
    yaml: `${YAML.stringify(yamlDoc).trim()}\n`,
    md: `${mdLines.join('\n').trimEnd()}\n`,
  };
}

function renderBlueprintEntrypoint(entrypoint, blueprintPath) {
  const entrypointEngine = {
    entryFile: entrypoint.path,
    title: 'AgentForge',
  };

  if (entrypoint.path === '.cursor/rules/agentforge.md') {
    entrypointEngine.frontmatterLines = [
      '---',
      'description: AgentForge rules',
      'globs: "**/*"',
      'alwaysApply: true',
      '---',
    ];
  }

  entrypointEngine.activationText = {
    'AGENTS.md': 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.',
    'CLAUDE.md': 'Quando o usuário digitar `agentforge` ou usar `/agentforge`, ative o orquestrador AgentForge.',
    '.cursor/rules/agentforge.md': 'Quando o usuário usar `agentforge` ou `/agentforge`, siga estas regras.',
    '.github/copilot-instructions.md': 'Quando a sessão precisar de AgentForge, siga estas instruções e respeite `/agentforge` quando aplicável.',
  }[entrypoint.path] ?? 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.';

  entrypointEngine.activationHint = `Blueprint: ${blueprintPath}`;
  return renderManagedEntrypoint(entrypointEngine, {});
}

function renderBlueprintContextIndex(projectRoot, normalized, blueprintPath, filePaths) {
  const items = [
    {
      id: 'context-map',
      path: 'harness/context-map.yaml',
      purpose: 'Mapa granular do contexto materializado pela adoção agentic.',
    },
    ...normalized.context_documents.map((doc) => ({
      id: basename(doc.path, extname(doc.path)),
      path: doc.path,
      purpose: doc.purpose,
    })),
  ];

  const skills = normalized.skills.map((skill) => ({
    id: skill.id,
    path: `skills/${skill.id}/SKILL.md`,
    purpose: skill.description,
  }));

  const flows = normalized.flows.map((flow) => ({
    id: flow.id,
    path: `flows/${flow.id}.yaml`,
    purpose: flow.purpose,
  }));

  const policies = normalized.policies.map((policy) => ({
    id: policy.id,
    path: `policies/${policy.id}.yaml`,
    purpose: policy.rule,
  }));

  return `${YAML.stringify({
    version: 2,
    generated_by: 'agentic-blueprint',
    updated_at: new Date().toISOString(),
    blueprint_path: blueprintPath,
    always_load: [
      'harness/router.md',
      'harness/context-index.yaml',
      'harness/context-map.yaml',
      'harness/task-modes.yaml',
      'harness/load-order.yaml',
      'harness/engine-map.yaml',
    ],
    items,
    skills,
    flows,
    policies,
    context: normalized.context_documents.map((doc) => ({
      id: basename(doc.path, extname(doc.path)),
      path: doc.path,
      purpose: doc.purpose,
      owner_agent: doc.owner_agent,
    })),
    task_contexts: {
      adopt: {
        context: ['.agentforge/context/'],
        skills: ['.agentforge/skills/'],
        flows: ['.agentforge/flows/'],
        policies: ['.agentforge/policies/'],
        references: ['.agentforge/references/'],
        agents: ['.agentforge/agents/'],
      },
    },
    materialized_files: filePaths,
  }).trim()}\n`;
}

function renderBlueprintContextMap(projectRoot, normalized, blueprintPath, materializedFiles) {
  const items = [];
  const now = new Date().toISOString();

  const pushItem = (file, title, kind, summary, owner_agent, sourceEvidence) => {
    const absPath = join(projectRoot, PRODUCT.internalDir, file);
    const content = readFileSync(absPath, 'utf8');
    const itemId = file
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase();
    items.push({
      id: `${kind}-${itemId}`.replace(/-+/g, '-').replace(/^-+|-+$/g, ''),
      title,
      kind,
      file,
      start_line: 1,
      end_line: Math.max(1, countLines(content)),
      summary: truncateText(summary, 200),
      confidence: 'high',
      curation_status: 'curated',
      owner_agent,
      source: {
        type: 'agentic-blueprint',
        blueprint_path: blueprintPath,
        evidence: sourceEvidence.map((item) => normalizeString(item.path || item.file)).filter(Boolean),
      },
      updated_at: now,
    });
  };

  for (const agent of normalized.agents) {
    pushItem(
      `agents/${agent.id}.yaml`,
      agent.name,
      'unknown',
      agent.purpose,
      agent.id,
      agent.source_evidence,
    );
  }

  for (const skill of normalized.skills) {
    pushItem(
      `skills/${skill.id}/SKILL.md`,
      skill.name,
      'reference',
      skill.description,
      skill.owner_agents[0] ?? skill.id,
      skill.source_evidence,
    );
  }

  for (const contextDoc of normalized.context_documents) {
    pushItem(
      contextDoc.path,
      contextDoc.title,
      /architecture/i.test(contextDoc.path) ? 'architecture' : 'domain',
      contextDoc.purpose,
      contextDoc.owner_agent,
      contextDoc.source_evidence,
    );
  }

  for (const flow of normalized.flows) {
    pushItem(
      `flows/${flow.id}.yaml`,
      flow.name,
      'workflow',
      flow.purpose,
      flow.owner_agents[0] ?? flow.id,
      flow.source_evidence,
    );
  }

  for (const policy of normalized.policies) {
    pushItem(
      `policies/${policy.id}.yaml`,
      policy.name,
      'policy',
      policy.rule,
      policy.owner_agents[0] ?? policy.id,
      policy.source_evidence,
    );
  }

  return `${YAML.stringify({
    version: 1,
    generated_by: 'agentic-blueprint',
    updated_at: now,
    blueprint_path: blueprintPath,
    items,
    materialized_files: materializedFiles,
  }).trim()}\n`;
}

function renderBlueprintValidationReport({
  projectRoot,
  blueprintPath,
  validation,
  materializedCounts = null,
}) {
  const lines = [];
  lines.push('# Agentic Blueprint Validation');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Blueprint: ${blueprintPath}`);
  lines.push(`- Status: ${validation.valid ? 'valid' : 'invalid'}`);
  lines.push(`- Agents: ${validation.normalized.agents.length}`);
  lines.push(`- Skills: ${validation.normalized.skills.length}`);
  lines.push(`- Context documents: ${validation.normalized.context_documents.length}`);
  lines.push(`- Flows: ${validation.normalized.flows.length}`);
  lines.push(`- Policies: ${validation.normalized.policies.length}`);
  lines.push(`- Entrypoints: ${validation.normalized.entrypoints.length}`);
  lines.push('');
  lines.push('## Required checks');
  lines.push('');
  lines.push(`- Sections non-empty: ${validation.valid ? 'yes' : 'no'}`);
  lines.push(`- Required policies present: ${validation.valid ? 'yes' : 'no'}`);
  lines.push(`- Required entrypoints present: ${validation.valid ? 'yes' : 'no'}`);
  lines.push('');

  if (validation.errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const error of validation.errors) {
      lines.push(`- ${error}`);
    }
    lines.push('');
  }

  if (materializedCounts) {
    lines.push('## Materialization summary');
    lines.push('');
    lines.push(`- Agents: ${materializedCounts.agents}`);
    lines.push(`- Skills: ${materializedCounts.skills}`);
    lines.push(`- Context documents: ${materializedCounts.context_documents}`);
    lines.push(`- Flows: ${materializedCounts.flows}`);
    lines.push(`- Policies: ${materializedCounts.policies}`);
    lines.push(`- Entrypoints: ${materializedCounts.entrypoints}`);
    lines.push('');
  }

  lines.push('## Normalized blueprint');
  lines.push('');
  lines.push(`- Project: ${validation.normalized.project.name}`);
  lines.push(`- Objective: ${validation.normalized.project.objective}`);
  lines.push(`- Blueprint path: ${blueprintPath}`);
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function renderAdoptionApplyFromBlueprintReport({
  projectRoot,
  blueprintPath,
  validation,
  materialized,
  validationReportPath,
  status,
  errors = [],
}) {
  const lines = [];
  lines.push('# AgentForge Adoption Apply');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Status: ${status}`);
  lines.push(`- Blueprint: ${blueprintPath}`);
  lines.push(`- Validation report: ${validationReportPath}`);
  lines.push(`- Agents written: ${materialized.agents.length}`);
  lines.push(`- Skills written: ${materialized.skills.length}`);
  lines.push(`- Context docs written: ${materialized.context_documents.length}`);
  lines.push(`- Flows written: ${materialized.flows.length}`);
  lines.push(`- Policies written: ${materialized.policies.length}`);
  lines.push(`- Entrypoints written: ${materialized.entrypoints.length}`);
  lines.push(`- Snapshots preserved: ${materialized.snapshots.length}`);
  lines.push('');

  lines.push('## Materialized files');
  lines.push('');
  const materializedFiles = [
    ...materialized.agents,
    ...materialized.skills,
    ...materialized.context_documents,
    ...materialized.flows,
    ...materialized.policies,
    ...materialized.entrypoints,
  ];
  if (materializedFiles.length === 0) {
    lines.push('- None');
  } else {
    for (const relPath of materializedFiles) {
      lines.push(`- ${relPath}`);
    }
  }
  lines.push('');

  lines.push('## Snapshots');
  lines.push('');
  if (materialized.snapshots.length === 0) {
    lines.push('- None');
  } else {
    for (const relPath of materialized.snapshots) {
      lines.push(`- ${relPath}`);
    }
  }
  lines.push('');

  if (errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
    lines.push('');
  }

  lines.push('## Notes');
  lines.push('');
  lines.push('- The CLI materialized the architecture decided by the blueprint.');
  lines.push('- No heuristic fallback was used for blueprint selection.');
  lines.push('- Legacy surfaces were snapshotted before overwrite.');
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function collectTopLevelSurface(projectRoot) {
  return PROJECT_SURFACE_TARGETS
    .filter((target) => existsSync(join(projectRoot, target.path)))
    .map((target) => ({
      label: target.label,
      path: target.path,
      kind: statSync(join(projectRoot, target.path)).isDirectory() ? 'directory' : 'file',
    }));
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function collectPackageSignals(projectRoot) {
  const pkgPath = join(projectRoot, 'package.json');
  const pkg = existsSync(pkgPath) ? readJson(pkgPath) : null;
  const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const dependencies = {
    ...(pkg?.dependencies && typeof pkg.dependencies === 'object' ? pkg.dependencies : {}),
    ...(pkg?.devDependencies && typeof pkg.devDependencies === 'object' ? pkg.devDependencies : {}),
  };

  return {
    packageName: normalizeString(pkg?.name),
    scripts,
    dependencyNames: Object.keys(dependencies),
    hasTestScript: Boolean(scripts.test),
    hasBuildScript: Boolean(scripts.build),
    hasLintScript: Boolean(scripts.lint),
  };
}

function collectEntrypoints(projectRoot, manifest) {
  return ENTRYPOINT_TARGETS
    .filter((target) => existsSync(join(projectRoot, target.path)))
    .map((target) => {
      const status = fileStatus(projectRoot, target.path, manifest[target.path]);
      return {
        ...target,
        status,
        size: readFileSync(join(projectRoot, target.path), 'utf8').length,
      };
    });
}

function collectAgentDocs(projectRoot) {
  return AGENT_DOC_DIRS
    .filter((target) => existsSync(join(projectRoot, target.path)))
    .map((target) => {
      const files = listFilesRecursive(join(projectRoot, target.path)).filter((filePath) => extname(filePath).toLowerCase() === '.md');
      return {
        ...target,
        files: files.map((filePath) => rel(projectRoot, filePath)),
      };
    });
}

function buildAuditSummary(audit) {
  const lines = [];
  lines.push('## 2. Audit context');
  lines.push('');
  lines.push(`- Large files: ${audit.largeFiles.length}`);
  lines.push(`- Missing READMEs: ${audit.missingReadmes.length}`);
  lines.push(`- Duplicate content groups: ${audit.duplicateGroups.length}`);
  lines.push(`- Skills without a clear trigger: ${audit.skillsWithoutTrigger.length}`);
  lines.push(`- Policies mixed into context: ${audit.policiesMixedInContexts.length}`);
  lines.push(`- Hard-to-read flows: ${audit.flowsHardToRead.length}`);
  lines.push(`- Generated files without a marker: ${audit.unmarkedGeneratedFiles.length}`);
  lines.push(`- Context-index issues: ${audit.contextIndexIssues.length}`);
  lines.push(`- Contexts without examples: ${audit.contextExamples.length}`);
  lines.push(`- Missing important references: ${audit.importantReferences.length}`);
  lines.push('');

  if (audit.largeFiles.length > 0) {
    lines.push('### Large files');
    lines.push('');
    for (const item of audit.largeFiles.slice(0, 5)) {
      lines.push(`- \`${item.file}\` (${item.reason})`);
    }
    lines.push('');
  }

  if (audit.missingReadmes.length > 0) {
    lines.push('### Missing READMEs');
    lines.push('');
    for (const item of audit.missingReadmes.slice(0, 5)) {
      lines.push(`- \`${item.readme}\` (${item.reason})`);
    }
    lines.push('');
  }

  if (audit.contextIndexIssues.length > 0) {
    lines.push('### Context index');
    lines.push('');
    for (const item of audit.contextIndexIssues) {
      lines.push(`- \`${item.file}\`: ${item.reason}`);
    }
    lines.push('');
  }

  return lines;
}

function buildRefactorContextSection(audit) {
  const lines = [];
  lines.push('## 3. Refactor context (dry run)');
  lines.push('');
  lines.push('- No files were changed.');

  const nextSteps = [];
  if (audit.missingReadmes.length > 0) {
    nextSteps.push('Create the missing READMEs in `.agentforge/` with `agentforge improve --apply` or `agentforge refactor-context --apply`.');
  }
  if (audit.contextIndexIssues.length > 0) {
    nextSteps.push('Split `harness/context-index.yaml` into a slimmer quick index and a fuller catalog.');
  }
  if (audit.contextExamples.length > 0) {
    nextSteps.push('Add concrete examples to the listed contexts so humans can edit them faster.');
  }
  if (audit.importantReferences.length > 0) {
    nextSteps.push('Update `references/important-files.md` so the essential files stay visible.');
  }
  if (audit.largeFiles.length > 0) {
    nextSteps.push('Break very large files into smaller sections before adding more context.');
  }
  if (nextSteps.length === 0) {
    nextSteps.push('The current context is already reasonably structured. Keep it that way as new files are added.');
  }

  lines.push('');
  lines.push(nextSteps.map((item) => `- ${item}`).join('\n'));
  lines.push('');

  return lines;
}

function buildSkillSuggestions(projectRoot, surface, packageSignals, audit) {
  const suggestions = [];
  const hasTests = packageSignals.hasTestScript || surface.some((item) => item.path === 'test' || item.path === 'tests');
  const hasCodeSurface = surface.some((item) => ['src', 'lib', 'app'].includes(item.path));
  const dependencyBlob = packageSignals.dependencyNames.join(' ').toLowerCase();

  if (hasTests) {
    suggestions.push({
      id: 'run-tests',
      reason: 'The project already has a test surface and should have a dedicated testing skill.',
    });
  }

  if (hasCodeSurface || audit.largeFiles.length > 0 || audit.duplicateGroups.length > 0) {
    suggestions.push({
      id: 'review-changes',
      reason: 'The project has enough moving parts to benefit from a structured review skill.',
    });
  }

  if (audit.missingReadmes.length > 0 || audit.contextExamples.length > 0 || audit.contextIndexIssues.length > 0) {
    suggestions.push({
      id: 'create-implementation-plan',
      reason: 'Adoption/refactor work is easier when a planning skill can break changes into steps.',
    });
  }

  if (DATABASE_HINTS.some((hint) => dependencyBlob.includes(hint))) {
    suggestions.push({
      id: 'database-specialist',
      reason: 'Database-related dependencies suggest a dedicated data specialist skill.',
    });
  }

  if (API_HINTS.some((hint) => dependencyBlob.includes(hint))) {
    suggestions.push({
      id: 'api-contract-reviewer',
      reason: 'API-related dependencies suggest a contract-review skill.',
    });
  }

  return [...new Map(suggestions.map((item) => [item.id, item])).values()];
}

const ADOPTION_SURFACE_ROOT_FILES = ['AGENTS.md', 'CLAUDE.md'];
const ADOPTION_SURFACE_DIRS = ['.agents', '.claude', '.github/agents', '.agentforge/imports/snapshots'];

function hasAnyPattern(text, patterns = []) {
  const lower = String(text ?? '').toLowerCase();
  return patterns.some((pattern) => pattern.test(lower));
}

function rewriteTargetPath(itemPath, sourceSegment, targetSegment, fallbackName = null) {
  const normalized = normalizePathValue(itemPath);
  const lower = normalized.toLowerCase();
  const segment = sourceSegment.toLowerCase();
  const index = lower.indexOf(segment);
  if (index === -1) {
    return fallbackName ? `${targetSegment}/${fallbackName}` : targetSegment;
  }

  const suffix = normalized.slice(index + sourceSegment.length).replace(/^\/+/, '');
  if (!suffix) {
    return targetSegment;
  }

  return `${targetSegment}/${suffix}`;
}

function collectAdoptionSurface(projectRoot) {
  const entries = [];
  const seen = new Set();

  const addFile = (absPath, sourceRoot) => {
    if (!existsSync(absPath) || statSync(absPath).isDirectory()) return;
    const path = rel(projectRoot, absPath);
    if (seen.has(path)) return;
    seen.add(path);
    entries.push({
      path,
      sourceRoot,
      content: readFileSync(absPath, 'utf8'),
      size: readFileSync(absPath, 'utf8').length,
    });
  };

  for (const relPath of ADOPTION_SURFACE_ROOT_FILES) {
    addFile(join(projectRoot, relPath), 'entrypoint');
  }

  for (const relDir of ADOPTION_SURFACE_DIRS) {
    const absDir = join(projectRoot, relDir);
    if (!existsSync(absDir) || !statSync(absDir).isDirectory()) continue;
    for (const filePath of listFilesRecursive(absDir)) {
      addFile(filePath, relDir);
    }
  }

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

function classifyAdoptionSurfaceItem(item) {
  const lowerPath = item.path.toLowerCase();
  const content = item.content ?? '';
  const lowerContent = content.toLowerCase();

  if (lowerPath === 'agents.md' || lowerPath === 'claude.md') {
    return {
      classification: 'entrypoint',
      action: 'preserve',
      target: null,
      confidence: 'high',
      reason: 'root agent entrypoint',
    };
  }

  if (lowerPath.startsWith('.agentforge/imports/snapshots/')) {
    return {
      classification: 'memory',
      action: 'preserve',
      target: null,
      confidence: 'high',
      reason: 'imported snapshot evidence',
    };
  }

  if (
    hasAnyPattern(lowerContent, [/obsolete/, /deprecated/, /legacy/, /remove/, /do not use/, /migrate away/])
    || lowerPath.includes('/legacy/')
  ) {
    return {
      classification: 'obsolete',
      action: 'ignore',
      target: null,
      confidence: 'medium',
      reason: 'legacy or obsolete marker detected',
    };
  }

  if (lowerPath.includes('/skills/') && /skill\.md$/i.test(lowerPath)) {
    const skillTarget = rewriteTargetPath(item.path, '/skills/', '.agentforge/skills', 'SKILL.md');
    return {
      classification: 'skill',
      action: 'migrate',
      target: skillTarget,
      confidence: 'high',
      reason: 'skill definition',
    };
  }

  if (lowerPath.includes('/flows/')) {
    return {
      classification: 'flow',
      action: 'migrate',
      target: rewriteTargetPath(item.path, '/flows/', '.agentforge/flows', basename(item.path)),
      confidence: 'high',
      reason: 'workflow or flow surface',
    };
  }

  if (lowerPath.includes('/policies/')) {
    return {
      classification: 'policy',
      action: 'migrate',
      target: rewriteTargetPath(item.path, '/policies/', '.agentforge/policies', basename(item.path)),
      confidence: 'high',
      reason: 'policy surface',
    };
  }

  if (lowerPath.includes('/references/')) {
    return {
      classification: 'reference',
      action: 'migrate',
      target: rewriteTargetPath(item.path, '/references/', '.agentforge/references', basename(item.path)),
      confidence: 'high',
      reason: 'reference surface',
    };
  }

  if (lowerPath.includes('/memory/')) {
    const memoryId = basename(item.path, extname(item.path));
    return {
      classification: 'memory',
      action: 'preserve',
      target: `.agentforge/memory/${memoryId}.md`,
      confidence: 'high',
      reason: 'memory surface should remain evidence-oriented',
    };
  }

  if (lowerPath.includes('/context/')) {
    return {
      classification: 'durable-context',
      action: 'migrate',
      target: rewriteTargetPath(item.path, '/context/', '.agentforge/context', basename(item.path)),
      confidence: 'high',
      reason: 'durable context surface',
    };
  }

  if (lowerPath.includes('/agents/')) {
    const agentId = basename(item.path, extname(item.path));
    return {
      classification: 'agent',
      action: 'migrate',
      target: `.agentforge/agents/${agentId}.yaml`,
      confidence: 'medium',
      reason: 'agent definition surface',
    };
  }

  if (
    hasAnyPattern(lowerContent, [/approval/, /protected/, /do not modify/, /never modify/, /permission/, /confirm before/])
  ) {
    return {
      classification: 'policy',
      action: 'migrate',
      target: `.agentforge/policies/${basename(item.path, extname(item.path))}.md`,
      confidence: 'medium',
      reason: 'policy-like instruction detected',
    };
  }

  if (hasAnyPattern(lowerContent, [/workflow/, /handoff/, /checkpoint/, /phase/, /step/, /flow/])) {
    return {
      classification: 'flow',
      action: 'migrate',
      target: `.agentforge/flows/${basename(item.path, extname(item.path))}.md`,
      confidence: 'medium',
      reason: 'workflow-like instruction detected',
    };
  }

  if (hasAnyPattern(lowerContent, [/command/, /cli/, /tool/, /docs?/, /reference/, /link/, /path/])) {
    return {
      classification: 'reference',
      action: 'migrate',
      target: `.agentforge/references/${basename(item.path, extname(item.path))}.md`,
      confidence: 'medium',
      reason: 'reference-like instruction detected',
    };
  }

  if (hasAnyPattern(lowerContent, [/memory/, /lesson/, /glossary/, /decision/, /question/])) {
    return {
      classification: 'memory',
      action: 'preserve',
      target: `.agentforge/memory/${basename(item.path, extname(item.path))}.md`,
      confidence: 'medium',
      reason: 'memory-like instruction detected',
    };
  }

  return {
    classification: 'needs-review',
    action: 'review',
    target: null,
    confidence: 'low',
    reason: 'ambiguous agentic surface file',
  };
}

export function buildAdoptionSurfacePlan(projectRoot) {
  const surface = collectAdoptionSurface(projectRoot);
  const classified = surface.map((item) => ({
    ...item,
    ...classifyAdoptionSurfaceItem(item),
  }));

  const bySuggestionType = new Map();
  for (const item of classified) {
    if (item.action !== 'migrate' || !item.target) continue;
    const bucket = item.target.startsWith('.agentforge/skills/')
      ? 'skills'
      : item.target.startsWith('.agentforge/flows/')
        ? 'flows'
        : item.target.startsWith('.agentforge/policies/')
          ? 'policies'
          : 'context';
    const next = bySuggestionType.get(bucket) ?? [];
    next.push(item);
    bySuggestionType.set(bucket, next);
  }

  const suggestions = [...bySuggestionType.entries()].map(([kind, items]) => ({
    kind,
    path: `.agentforge/suggestions/${kind}/adoption-agentic-surface.yaml`,
    items,
  })).sort((a, b) => a.kind.localeCompare(b.kind));

  const summary = classified.reduce((acc, item) => {
    acc.total += 1;
    acc[item.classification] = (acc[item.classification] ?? 0) + 1;
    acc[item.action] = (acc[item.action] ?? 0) + 1;
    return acc;
  }, {
    total: 0,
    entrypoint: 0,
    agent: 0,
    skill: 0,
    flow: 0,
    policy: 0,
    'durable-context': 0,
    reference: 0,
    memory: 0,
    obsolete: 0,
    'needs-review': 0,
    migrate: 0,
    preserve: 0,
    ignore: 0,
    review: 0,
  });

  return {
    surface,
    classified,
    suggestions,
    summary,
  };
}

function renderAdoptionSurfacePlan(projectRoot, plan) {
  const lines = [];
  lines.push('# AgentForge Adoption Plan');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Total agentic surface files: ${plan.summary.total}`);
  lines.push(`- Migrate candidates: ${plan.summary.migrate}`);
  lines.push(`- Preserved: ${plan.summary.preserve}`);
  lines.push(`- Ignored: ${plan.summary.ignore}`);
  lines.push(`- Needs review: ${plan.summary.review}`);
  lines.push('');

  lines.push('## Classification');
  lines.push('');
  lines.push('| File | Classification | Action | Target | Reason |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const item of plan.classified) {
    lines.push(
      `| \`${item.path}\` | ${item.classification} | ${item.action} | ${item.target ? `\`${item.target}\`` : '—'} | ${String(item.reason).replace(/\|/g, '\\|')} |`,
    );
  }
  lines.push('');

  const renderSection = (title, predicate, emptyMessage) => {
    lines.push(`## ${title}`);
    lines.push('');
    const items = plan.classified.filter(predicate);
    if (items.length === 0) {
      lines.push(`- ${emptyMessage}`);
      lines.push('');
      return;
    }
    for (const item of items) {
      lines.push(`- \`${item.path}\` (${item.classification})${item.target ? ` → \`${item.target}\`` : ''}`);
    }
    lines.push('');
  };

  renderSection('What will be migrated', (item) => item.action === 'migrate', 'No migration candidates were identified.');
  renderSection('What will be preserved', (item) => item.action === 'preserve', 'No preserved surfaces were identified.');
  renderSection('What will be ignored', (item) => item.action === 'ignore', 'No ignored surfaces were identified.');
  renderSection('What requires human review', (item) => item.action === 'review', 'No review items were identified.');

  lines.push('## Suggestions');
  lines.push('');
  if (plan.suggestions.length === 0) {
    lines.push('- No suggestion files were written.');
  } else {
    for (const suggestion of plan.suggestions) {
      lines.push(`- \`${suggestion.path}\` (${suggestion.items.length} item(s))`);
    }
  }
  lines.push('');

  lines.push('## Guarantees');
  lines.push('');
  lines.push('- No files outside `.agentforge/reports/` and `.agentforge/suggestions/` were modified.');
  lines.push('- AGENTS.md and CLAUDE.md remain untouched in this mode.');
  lines.push('- Existing snapshots under `.agentforge/imports/snapshots/` are preserved as evidence.');

  return `${lines.join('\n').trimEnd()}\n`;
}

export function writeAdoptionSurfaceOutputs(projectRoot, plan) {
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-plan.md');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, renderAdoptionSurfacePlan(projectRoot, plan), 'utf8');

  for (const suggestion of plan.suggestions) {
    const absPath = join(projectRoot, suggestion.path);
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, `${YAML.stringify({
      version: 1,
      generated_by: 'adopt',
      kind: suggestion.kind,
      items: suggestion.items.map((item) => ({
        source_path: item.path,
        classification: item.classification,
        action: item.action,
        target_path: item.target,
        confidence: item.confidence,
        reason: item.reason,
      })),
    }).trim()}\n`, 'utf8');
  }

  return {
    reportPath: rel(projectRoot, reportPath),
    suggestionPaths: plan.suggestions.map((suggestion) => suggestion.path),
  };
}

function readYamlObject(filePath) {
  try {
    const doc = YAML.parse(readFileSync(filePath, 'utf8'));
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : null;
  } catch {
    return null;
  }
}

function normalizePathValue(value) {
  return typeof value === 'string' ? value.trim().replace(/\\/g, '/') : '';
}

function normalizeEntryId(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function firstMarkdownHeading(content, fallback) {
  const match = String(content ?? '').match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : fallback;
}

function buildPathEntry(relPath, {
  id = null,
  title = null,
  purpose = null,
} = {}) {
  const entry = {
    path: normalizePathValue(relPath),
  };
  if (normalizeEntryId(id)) entry.id = normalizeEntryId(id);
  if (normalizeEntryId(title)) entry.title = normalizeEntryId(title);
  if (normalizeEntryId(purpose)) entry.purpose = normalizeEntryId(purpose);
  return entry;
}

function mergePathObjects(existing = [], additions = []) {
  const result = [];
  const index = new Map();
  const keyFor = (entry) => normalizeEntryId(entry?.id) || normalizePathValue(entry?.path);

  for (const entry of Array.isArray(existing) ? existing : []) {
    const key = keyFor(entry);
    if (!key) continue;
    const clone = { ...entry };
    index.set(key, result.length);
    result.push(clone);
  }

  for (const entry of Array.isArray(additions) ? additions : []) {
    const key = keyFor(entry);
    if (!key) continue;
    const clone = { ...entry };
    if (index.has(key)) {
      const currentIndex = index.get(key);
      result[currentIndex] = {
        ...result[currentIndex],
        ...clone,
      };
      continue;
    }
    index.set(key, result.length);
    result.push(clone);
  }

  return result;
}

function loadContextIndexDoc(projectRoot) {
  const indexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
  if (!existsSync(indexPath)) return null;
  return readYamlObject(indexPath);
}

function buildDefaultContextIndexDoc(projectRoot, state = {}) {
  const projectName = normalizeEntryId(state.project) || basename(projectRoot);
  const userName = normalizeEntryId(state.user_name) || normalizeEntryId(state.user) || '';
  const projectType = normalizeEntryId(state.project_type) || '';
  const stack = normalizeEntryId(state.stack) || '';
  const goals = Array.isArray(state.primary_goals)
    ? state.primary_goals.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
  const workflow = normalizeEntryId(state.preferred_workflow) || normalizeEntryId(state.setup_mode) || 'feature-development';
  const qualityLevel = normalizeEntryId(state.quality_level) || 'balanced';
  const engines = Array.isArray(state.engines) ? state.engines.filter((entry) => typeof entry === 'string' && entry.trim()) : [];

  return {
    version: 2,
    always_load: [
      'harness/router.md',
      'harness/context-index.yaml',
      'harness/context-map.yaml',
      'harness/task-modes.yaml',
      'harness/load-order.yaml',
      'harness/engine-map.yaml',
    ],
    bootstrap: {
      project_name: projectName,
      user_name: userName || null,
      project_type: projectType || null,
      stack: stack || null,
      primary_goals: goals,
      preferred_workflow: workflow,
      quality_level: qualityLevel,
      engines,
      setup_mode: normalizeEntryId(state.setup_mode) || 'bootstrap',
      last_bootstrap_at: normalizeEntryId(state.last_bootstrap_at) || null,
    },
    items: [
      buildPathEntry('context/project-overview.md', {
        id: 'project-overview',
        purpose: 'Project summary, goals, and operating constraints.',
      }),
      buildPathEntry('context/architecture.md', {
        id: 'architecture',
        purpose: 'Architecture map and main delivery flow.',
      }),
      buildPathEntry('context/conventions.md', {
        id: 'conventions',
        purpose: 'Naming, structure, and team conventions.',
      }),
      buildPathEntry('context/coding-standards.md', {
        id: 'coding-standards',
        purpose: 'Code quality expectations and review baseline.',
      }),
      buildPathEntry('context/testing.md', {
        id: 'testing',
        purpose: 'Testing strategy and validation commands.',
      }),
      buildPathEntry('context/deployment.md', {
        id: 'deployment',
        purpose: 'Deployment and rollback notes.',
      }),
      buildPathEntry('context/glossary.md', {
        id: 'glossary',
        purpose: 'Project terminology and recurring terms.',
      }),
      buildPathEntry('harness/context-map.yaml', {
        id: 'context-map',
        purpose: 'Granular context map with file paths and line ranges.',
      }),
    ],
    skills: [
      buildPathEntry('skills/run-tests/SKILL.md', {
        id: 'run-tests',
        purpose: 'Execute and interpret the suite when validating generated changes.',
      }),
      buildPathEntry('skills/review-changes/SKILL.md', {
        id: 'review-changes',
        purpose: 'Review changes with focus on safety, regression, and clarity.',
      }),
      buildPathEntry('skills/create-implementation-plan/SKILL.md', {
        id: 'create-implementation-plan',
        purpose: 'Turn a request into a small, sequenced implementation plan.',
      }),
    ],
    flows: [
      buildPathEntry('flows/feature-development.md', {
        id: 'feature-development',
        purpose: 'Deliver a new capability with discovery, design, implementation, and review.',
      }),
      buildPathEntry('flows/bugfix.md', {
        id: 'bugfix',
        purpose: 'Resolve a reproducible problem with minimal scope.',
      }),
      buildPathEntry('flows/refactor.md', {
        id: 'refactor',
        purpose: 'Improve structure without changing expected behavior.',
      }),
      buildPathEntry('flows/review.md', {
        id: 'review',
        purpose: 'Review change sets before integration.',
      }),
      buildPathEntry('flows/context-curation.md', {
        id: 'context-curation',
        purpose: 'Organize, review, and index durable project context.',
      }),
      buildPathEntry('flows/release.md', {
        id: 'release',
        purpose: 'Promote a safe release-ready delivery.',
      }),
    ],
    task_contexts: {
      discovery: {
        context: [
          'context/project-overview.md',
          'context/architecture.md',
          'context/conventions.md',
        ],
        references: [
          'references/commands.md',
          'references/important-files.md',
        ],
        reports: [
          'reports/',
        ],
      },
      'agent-design': {
        agents: [
          'agents/',
        ],
        suggestions: [
          'suggestions/agents/',
        ],
        memory: [
          'memory/',
        ],
        reports: [
          'reports/',
        ],
      },
      'flow-design': {
        flows: [
          'flows/',
        ],
        always_load: [
          'harness/context-index.yaml',
        ],
        memory: [
          'memory/',
        ],
        reports: [
          'reports/',
        ],
      },
      policies: {
        policies: [
          'policies/',
        ],
        always_load: [
          'harness/context-index.yaml',
        ],
        reports: [
          'reports/',
        ],
      },
      export: {
        entrypoints: [
          'AGENTS.md',
          'CLAUDE.md',
          '.cursor/rules/agentforge.md',
          '.github/copilot-instructions.md',
        ],
        reports: [
          'reports/',
        ],
      },
      review: {
        reports: [
          'reports/',
        ],
      },
      adopt: {
        entrypoints: [
          'AGENTS.md',
          'CLAUDE.md',
        ],
        legacy: [
          '.agents/',
        ],
        context: [
          '.agentforge/context/',
        ],
        skills: [
          '.agentforge/skills/',
        ],
        flows: [
          '.agentforge/flows/',
        ],
        policies: [
          '.agentforge/policies/',
        ],
        references: [
          '.agentforge/references/',
        ],
        always_load: [
          'harness/context-index.yaml',
          'harness/context-map.yaml',
        ],
        reports: [
          'reports/',
        ],
      },
      feature: {
        context: [
          'context/project-overview.md',
          'context/architecture.md',
          'context/coding-standards.md',
        ],
        skills: [
          'skills/create-implementation-plan/SKILL.md',
          'skills/run-tests/SKILL.md',
        ],
        flows: [
          'flows/feature-development.md',
        ],
        policies: [
          'policies/protected-files.md',
          'policies/human-approval.md',
        ],
      },
      bugfix: {
        context: [
          'context/project-overview.md',
          'context/testing.md',
        ],
        skills: [
          'skills/run-tests/SKILL.md',
        ],
        flows: [
          'flows/bugfix.md',
        ],
        policies: [
          'policies/protected-files.md',
        ],
      },
      refactor: {
        context: [
          'context/architecture.md',
          'context/conventions.md',
        ],
        skills: [
          'skills/create-implementation-plan/SKILL.md',
        ],
        flows: [
          'flows/refactor.md',
        ],
        policies: [
          'policies/protected-files.md',
        ],
      },
      'context-curation': {
        always_load: [
          'harness/context-index.yaml',
          'harness/context-map.yaml',
        ],
        context: [
          'context/project-overview.md',
          'context/architecture.md',
          'context/domain.md',
          'context/content-flow.md',
          'context/conventions.md',
          'context/coding-standards.md',
          'context/testing.md',
          'context/worker.md',
          'context/deployment.md',
          'context/glossary.md',
        ],
        skills: [
          'skills/create-implementation-plan/SKILL.md',
          'skills/review-changes/SKILL.md',
          'skills/run-tests/SKILL.md',
        ],
        flows: [
          'flows/context-curation.md',
          'flows/review.md',
        ],
        policies: [
          'policies/protected-files.md',
          'policies/human-approval.md',
          'policies/safety.md',
        ],
        references: [
          'references/commands.md',
          'references/important-files.md',
          'references/domain.md',
          'references/external-docs.md',
          'references/tools.md',
        ],
      },
    },
  };
}

function buildAdoptionIndexEntry(item, content) {
  const baseName = basename(item.target, extname(item.target));
  const entryId = item.classification === 'skill'
    ? basename(dirname(item.target))
    : baseName;
  return buildPathEntry(item.target.replace(/^\.agentforge\//, ''), {
    id: entryId,
    title: firstMarkdownHeading(content, item.classification === 'skill' ? entryId : baseName),
    purpose: `Migrated from ${item.path}.`,
  });
}

function mergeContextIndexDoc(projectRoot, baseDoc, migrations) {
  const doc = baseDoc ?? buildDefaultContextIndexDoc(projectRoot, {});
  const nextDoc = {
    ...doc,
    always_load: Array.isArray(doc.always_load) ? [...doc.always_load] : [],
    bootstrap: doc.bootstrap && typeof doc.bootstrap === 'object' ? { ...doc.bootstrap } : {},
    items: Array.isArray(doc.items) ? [...doc.items] : [],
    skills: Array.isArray(doc.skills) ? [...doc.skills] : [],
    flows: Array.isArray(doc.flows) ? [...doc.flows] : [],
    task_contexts: doc.task_contexts && typeof doc.task_contexts === 'object' ? { ...doc.task_contexts } : {},
  };

  const skillEntries = [];
  const flowEntries = [];
  const itemEntries = [];

  for (const migration of migrations) {
    const entry = buildAdoptionIndexEntry(migration, migration.content);
    if (migration.classification === 'skill') {
      skillEntries.push(entry);
      continue;
    }
    if (migration.classification === 'flow') {
      flowEntries.push(entry);
      continue;
    }
    itemEntries.push(entry);
  }

  nextDoc.items = mergePathObjects(nextDoc.items, itemEntries);
  nextDoc.skills = mergePathObjects(nextDoc.skills, skillEntries);
  nextDoc.flows = mergePathObjects(nextDoc.flows, flowEntries);

  if (!Array.isArray(nextDoc.always_load) || nextDoc.always_load.length === 0) {
    nextDoc.always_load = [
      'harness/router.md',
      'harness/context-index.yaml',
      'harness/context-map.yaml',
      'harness/task-modes.yaml',
      'harness/load-order.yaml',
      'harness/engine-map.yaml',
    ];
  }

  return nextDoc;
}

function writeTextIfAllowed(projectRoot, manifest, relPath, content) {
  const absPath = join(projectRoot, relPath);
  const status = existsSync(absPath)
    ? (manifest[relPath] ? fileStatus(projectRoot, relPath, manifest[relPath]) : 'modified')
    : 'missing';

  if (status === 'modified') {
    return { written: false, skipped: true, reason: 'modified', path: relPath };
  }

  mkdirSync(dirname(absPath), { recursive: true });
  writeFileSync(absPath, content, 'utf8');
  return { written: true, skipped: false, reason: null, path: relPath, status };
}

function renderContextMapApplyReport(projectRoot, doc, { migratedCount = 0, skippedCount = 0 } = {}) {
  const lines = [];
  lines.push('# Context Map');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Mode: apply`);
  lines.push(`- Items: ${Array.isArray(doc?.items) ? doc.items.length : 0}`);
  lines.push(`- Generated items: ${Array.isArray(doc?.items) ? doc.items.length : 0}`);
  lines.push(`- Migrated files observed: ${migratedCount}`);
  lines.push(`- Skipped files: ${skippedCount}`);
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- The context map was refreshed from the canonical `.agentforge/` context, references, policies, and flows.');
  return `${lines.join('\n').trimEnd()}\n`;
}

function applyLegacyMigration(projectRoot, manifest, plan, state) {
  const result = {
    migrated: [],
    snapshots: [],
    skipped: [],
    entrypoints: [],
    contextIndexPath: null,
    contextMapPath: null,
  };
  const writtenMigrationItems = [];

  const entrypointResult = takeOverAgenticEntrypoints(projectRoot, state);
  if (entrypointResult.entrypoints.length > 0) {
    result.entrypoints.push(...entrypointResult.entrypoints);
  }
  if (entrypointResult.snapshotPaths.length > 0) {
    result.snapshots.push(...entrypointResult.snapshotPaths);
  }

  for (const item of plan.classified) {
    if (item.action !== 'migrate' || !item.target) continue;
    const writeResult = writeTextIfAllowed(projectRoot, manifest, item.target, item.content);
    if (writeResult.written) {
      result.migrated.push(item.target);
      writtenMigrationItems.push(item);
      continue;
    }
    if (writeResult.skipped) {
      result.skipped.push({
        source: item.path,
        target: item.target,
        reason: writeResult.reason,
      });
    }
  }

  const contextIndexTarget = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
  const contextIndexDoc = loadContextIndexDoc(projectRoot) ?? buildDefaultContextIndexDoc(projectRoot, state);
  const nextContextIndexDoc = mergeContextIndexDoc(projectRoot, contextIndexDoc, writtenMigrationItems);
  const contextIndexText = `${YAML.stringify(nextContextIndexDoc).trim()}\n`;
  const contextIndexResult = writeTextIfAllowed(projectRoot, manifest, rel(projectRoot, contextIndexTarget), contextIndexText);
  if (contextIndexResult.written) {
    result.contextIndexPath = contextIndexResult.path;
  } else if (contextIndexResult.skipped) {
    result.skipped.push({
      source: 'context-index',
      target: rel(projectRoot, contextIndexTarget),
      reason: contextIndexResult.reason,
    });
  }

  const nextContextMapDoc = buildContextMapForProject(projectRoot);
  const contextMapTarget = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-map.yaml');
  const contextMapText = `${YAML.stringify(nextContextMapDoc.doc).trim()}\n`;
  const contextMapResult = writeTextIfAllowed(projectRoot, manifest, rel(projectRoot, contextMapTarget), contextMapText);
  if (contextMapResult.written) {
    result.contextMapPath = contextMapResult.path;
    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-map.md');
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, renderContextMapApplyReport(projectRoot, nextContextMapDoc.doc, {
      migratedCount: writtenMigrationItems.length,
      skippedCount: result.skipped.length,
    }), 'utf8');
    result.contextMapReport = rel(projectRoot, reportPath);
  } else if (contextMapResult.skipped) {
    result.skipped.push({
      source: 'context-map',
      target: rel(projectRoot, contextMapTarget),
      reason: contextMapResult.reason,
    });
  }

  return result;
}

function renderAdoptionPlan({
  projectRoot,
  state,
  ingestResult,
  surface,
  entrypoints,
  agentDocs,
  packageSignals,
  detectedEngines,
  audit,
  skillSuggestions,
}) {
  const lines = [];
  lines.push('# AgentForge Adoption Plan');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Project: ${normalizeString(state.project) || basename(projectRoot)}`);
  lines.push(`- Setup mode: ${normalizeString(state.setup_mode) || 'bootstrap'}`);
  lines.push(`- Adoption status: ${normalizeString(state.adoption_status) || 'planned'}`);
  lines.push(`- Refactor applied: no`);
  lines.push(`- Detected engines: ${formatList(detectedEngines.map((engine) => engine.id))}`);
  lines.push(`- Original files modified by this command: none`);
  lines.push('');

  lines.push('## 1. Ingest');
  lines.push('');
  lines.push(`- Agentic sources found: ${ingestResult.found.length}`);
  lines.push(`- Snapshots imported: ${ingestResult.imported.length}`);
  lines.push(`- Sources already known: ${ingestResult.skipped.length}`);
  lines.push(`- Ingest report: .agentforge/reports/ingest.md`);
  lines.push('');
  if (ingestResult.imported.length > 0) {
    lines.push('### Imported snapshots');
    lines.push('');
    for (const item of ingestResult.imported.slice(0, 10)) {
      lines.push(`- \`${item.relPath}\` → \`${item.snapshotPath}\` (${item.type}, ${item.hash.slice(0, 12)}...)`);
    }
    if (ingestResult.imported.length > 10) {
      lines.push(`- ...and ${ingestResult.imported.length - 10} more`);
    }
    lines.push('');
  }

  lines.push('### Project surface');
  lines.push('');
  if (surface.length === 0) {
    lines.push('- No top-level project surface files or folders were found.');
  } else {
    for (const item of surface) {
      lines.push(`- \`${item.path}\` (${item.kind})`);
    }
  }
  lines.push('');

  lines.push('### Entry files');
  lines.push('');
  if (entrypoints.length === 0) {
    lines.push('- No known entry files were found.');
  } else {
    for (const item of entrypoints) {
      lines.push(`- \`${item.path}\` (${item.label}) - ${item.status}`);
    }
  }
  lines.push('');

  if (agentDocs.length > 0) {
    lines.push('### Agent docs');
    lines.push('');
    for (const dir of agentDocs) {
      lines.push(`- \`${dir.path}/\`: ${dir.files.length} file(s)`);
    }
    lines.push('');
  }

  lines.push('### Package signals');
  lines.push('');
  lines.push(`- package.json: ${packageSignals.packageName || 'not set'}`);
  lines.push(`- test script: ${packageSignals.hasTestScript ? 'present' : 'missing'}`);
  lines.push(`- build script: ${packageSignals.hasBuildScript ? 'present' : 'missing'}`);
  lines.push(`- lint script: ${packageSignals.hasLintScript ? 'present' : 'missing'}`);
  lines.push('');

  lines.push(...buildAuditSummary(audit));
  lines.push(...buildRefactorContextSection(audit));

  lines.push('## 4. Suggest skills');
  lines.push('');
  if (skillSuggestions.length === 0) {
    lines.push('- No new skill is strongly suggested yet.');
  } else {
    for (const skill of skillSuggestions) {
      lines.push(`- \`agentforge create-skill ${skill.id}\`: ${skill.reason}`);
    }
  }
  lines.push('');

  lines.push('## 5. Next commands');
  lines.push('');
  lines.push('- `agentforge audit-context`');
  lines.push('- `agentforge refactor-context`');
  lines.push('- `agentforge refactor-context --apply`');
  lines.push('- `agentforge suggest-skills`');
  lines.push('- `agentforge adopt --apply`');
  lines.push('- `agentforge compile`');
  lines.push('- `agentforge compile --takeover-entrypoints`');
  lines.push('- `agentforge validate`');
  lines.push('');

  lines.push('## Read-only guarantee');
  lines.push('');
  lines.push('- No original project files were modified.');
  lines.push('- Files under `.agentforge/` may have been created or updated to record the plan and imported evidence.');
  lines.push('- Canonical AgentForge surfaces must be changed through `agentforge adopt --apply`, not by manual YAML edits.');

  return lines.join('\n');
}

export function buildAdoptionPlan(projectRoot) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const ingestResult = runIngest(projectRoot);
  if (!ingestResult.ok) {
    return {
      ok: false,
      errors: [ingestResult.error],
    };
  }

  const manifest = loadManifest(projectRoot);
  const detectedEngines = detectEngines(projectRoot).filter((engine) => engine.detected);
  const surface = collectTopLevelSurface(projectRoot);
  const entrypoints = collectEntrypoints(projectRoot, manifest);
  const agentDocs = collectAgentDocs(projectRoot);
  const packageSignals = collectPackageSignals(projectRoot);
  const auditResult = runImprovementAnalysis(projectRoot);
  if (!auditResult.ok) {
    return auditResult;
  }

  const skillSuggestions = buildSkillSuggestions(projectRoot, surface, packageSignals, auditResult.analysis);
  const report = renderAdoptionPlan({
    projectRoot,
    state: ingestResult.state ?? installation.state ?? {},
    ingestResult,
    surface,
    entrypoints,
    agentDocs,
    packageSignals,
    detectedEngines,
    audit: auditResult.analysis,
    skillSuggestions,
  });

  return {
    ok: true,
    report,
    detectedEngines,
    surface,
    entrypoints,
    agentDocs,
    packageSignals,
    audit: auditResult.analysis,
    skillSuggestions,
  };
}

export function writeAdoptionPlan(projectRoot, report) {
  const writer = new Writer(projectRoot);
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-plan.md');
  writer.writeGeneratedFile(reportPath, report, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, writer.manifestPaths),
  });
  return rel(projectRoot, reportPath);
}

export function runAdoptPrepare(projectRoot) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const ingestResult = runIngest(projectRoot);
  if (!ingestResult.ok) {
    return {
      ok: false,
      errors: [ingestResult.error],
    };
  }

  const outputs = writeAdoptionPrepareOutputs(projectRoot, ingestResult);

  return {
    ok: true,
    ingestResult,
    ...outputs,
  };
}

function writeAdoptionPrepareOutputs(projectRoot, ingestResult) {
  const evidenceArtifacts = buildAiEvidenceArtifacts(projectRoot, { force: true });
  const dossierContent = renderAgenticDossier(evidenceArtifacts.bundle, {
    suggestions: {
      agents: [],
      skills: [],
      flows: [],
      policies: [],
      context: [],
    },
  });
  const requestContent = renderAgenticBlueprintRequest(evidenceArtifacts.bundle);
  const reportContent = renderAdoptionPreparePlan({
    projectRoot,
    ingestResult,
    evidenceArtifacts,
  });

  const writer = new Writer(projectRoot);
  writer.writeGeneratedFile(join(projectRoot, AI_DOSSIER_REL_PATH), dossierContent, { force: true });
  writer.writeGeneratedFile(join(projectRoot, AI_BLUEPRINT_REQUEST_REL_PATH), requestContent, { force: true });
  writer.writeGeneratedFile(join(projectRoot, ADOPTION_PLAN_REL_PATH), reportContent, { force: true });
  writer.saveCreatedFiles();

  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const currentState = JSON.parse(readFileSync(statePath, 'utf8'));
  const createdFiles = Array.isArray(currentState.created_files) ? currentState.created_files : [];
  const nextState = {
    ...currentState,
    adoption: {
      ...(currentState.adoption ?? {}),
      status: 'evidence_ready',
      next_required_output: NEXT_REQUIRED_OUTPUT,
      prepare_report_path: ADOPTION_PLAN_REL_PATH,
      evidence_bundle_path: evidenceArtifacts.jsonPath,
      evidence_brief_path: evidenceArtifacts.briefPath,
      evidence_report_path: evidenceArtifacts.reportPath,
      dossier_path: AI_DOSSIER_REL_PATH,
      request_path: AI_BLUEPRINT_REQUEST_REL_PATH,
      ingest_report_path: ingestResult.reportPath,
      apply_status: 'not-run',
    },
    adoption_status: 'evidence_ready',
    next_required_output: NEXT_REQUIRED_OUTPUT,
    created_files: [...new Set([
      ...createdFiles,
      AI_DOSSIER_REL_PATH,
      AI_BLUEPRINT_REQUEST_REL_PATH,
      ADOPTION_PLAN_REL_PATH,
    ])],
  };

  updateStateAndManifest(projectRoot, nextState, [
    AI_DOSSIER_REL_PATH,
    AI_BLUEPRINT_REQUEST_REL_PATH,
    ADOPTION_PLAN_REL_PATH,
    AI_EVIDENCE_JSON_REL_PATH,
    AI_EVIDENCE_BRIEF_REL_PATH,
    AI_EVIDENCE_REPORT_REL_PATH,
    ingestResult.reportPath,
  ]);

  return {
    evidenceArtifacts,
    reportPath: ADOPTION_PLAN_REL_PATH,
    dossierPath: AI_DOSSIER_REL_PATH,
    requestPath: AI_BLUEPRINT_REQUEST_REL_PATH,
    nextState,
  };
}

function materializeBlueprintApply(projectRoot, blueprintPath, blueprintDoc, validation) {
  const normalized = validation.normalized;
  const blueprintRelPath = rel(projectRoot, blueprintPath);
  const writer = new Writer(projectRoot);
  const currentState = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
  const manifest = loadManifest(projectRoot);
  const materialized = {
    agents: [],
    skills: [],
    context_documents: [],
    flows: [],
    policies: [],
    entrypoints: [],
    snapshots: [],
    context_index_path: null,
    context_map_path: null,
  };

  const record = (result, category, path) => {
    materialized[category].push(path);
    if (result.snapshotPath) {
      materialized.snapshots.push(result.snapshotPath);
    }
  };

  for (const agent of normalized.agents) {
    const relPath = `.agentforge/agents/${agent.id}.yaml`;
    const result = writeManagedArtifactWithSnapshot(
      writer,
      projectRoot,
      relPath,
      renderBlueprintAgentDocument(agent, blueprintRelPath),
      { sourceType: 'agent-definition' },
    );
    record(result, 'agents', relPath);
  }

  for (const skill of normalized.skills) {
    const relPath = `.agentforge/skills/${skill.id}/SKILL.md`;
    const result = writeManagedArtifactWithSnapshot(
      writer,
      projectRoot,
      relPath,
      renderBlueprintSkillDocument(skill, blueprintRelPath),
      { sourceType: 'skill-definition' },
    );
    record(result, 'skills', relPath);
  }

  for (const contextDoc of normalized.context_documents) {
    const relPath = join(PRODUCT.internalDir, contextDoc.path);
    const result = writeManagedArtifactWithSnapshot(
      writer,
      projectRoot,
      relPath,
      renderBlueprintContextDocument(contextDoc, blueprintRelPath),
      { sourceType: 'context-document' },
    );
    record(result, 'context_documents', relPath);
  }

  for (const flow of normalized.flows) {
    const flowYamlRelPath = `.agentforge/flows/${flow.id}.yaml`;
    const flowMdRelPath = `.agentforge/flows/${flow.id}.md`;
    const rendered = renderBlueprintFlowFiles(flow, blueprintRelPath);
    const yamlResult = writeManagedArtifactWithSnapshot(
      writer,
      projectRoot,
      flowYamlRelPath,
      rendered.yaml,
      { sourceType: 'flow-definition' },
    );
    const mdResult = writeManagedArtifactWithSnapshot(
      writer,
      projectRoot,
      flowMdRelPath,
      rendered.md,
      { sourceType: 'flow-document' },
    );
    record(yamlResult, 'flows', flowYamlRelPath);
    record(mdResult, 'flows', flowMdRelPath);
  }

  for (const policy of normalized.policies) {
    const policyYamlRelPath = `.agentforge/policies/${policy.id}.yaml`;
    const policyMdRelPath = `.agentforge/policies/${policy.id}.md`;
    const rendered = renderBlueprintPolicyFiles(policy, blueprintRelPath);
    const yamlResult = writeManagedArtifactWithSnapshot(
      writer,
      projectRoot,
      policyYamlRelPath,
      rendered.yaml,
      { sourceType: 'policy-definition' },
    );
    const mdResult = writeManagedArtifactWithSnapshot(
      writer,
      projectRoot,
      policyMdRelPath,
      rendered.md,
      { sourceType: 'policy-document' },
    );
    record(yamlResult, 'policies', policyYamlRelPath);
    record(mdResult, 'policies', policyMdRelPath);
  }

  for (const entrypoint of normalized.entrypoints) {
    if (!BLUEPRINT_REQUIRED_ENTRYPOINTS.includes(entrypoint.path)) continue;
    const result = writeManagedArtifactWithSnapshot(
      writer,
      projectRoot,
      entrypoint.path,
      renderBlueprintEntrypoint(entrypoint, blueprintRelPath),
      {
        sourceType: entrypoint.path === 'AGENTS.md'
          ? 'codex-entrypoint'
          : entrypoint.path === 'CLAUDE.md'
            ? 'claude-entrypoint'
            : entrypoint.path === '.cursor/rules/agentforge.md'
              ? 'cursor-rule'
              : 'copilot-instruction',
      },
    );
    record(result, 'entrypoints', entrypoint.path);
  }

  const contextIndexRelPath = '.agentforge/harness/context-index.yaml';
  const contextMapRelPath = '.agentforge/harness/context-map.yaml';
  const contextIndexResult = writeManagedArtifactWithSnapshot(
    writer,
    projectRoot,
    contextIndexRelPath,
    renderBlueprintContextIndex(projectRoot, normalized, blueprintRelPath, [
      ...materialized.agents,
      ...materialized.skills,
      ...materialized.context_documents,
      ...unique(materialized.flows),
      ...unique(materialized.policies),
      ...materialized.entrypoints,
    ]),
    { sourceType: 'context-index' },
  );
  const contextMapResult = writeManagedArtifactWithSnapshot(
    writer,
    projectRoot,
    contextMapRelPath,
    renderBlueprintContextMap(projectRoot, normalized, blueprintRelPath, [
      ...materialized.agents,
      ...materialized.skills,
      ...materialized.context_documents,
      ...unique(materialized.flows),
      ...unique(materialized.policies),
      ...materialized.entrypoints,
    ]),
    { sourceType: 'context-map' },
  );
  materialized.context_index_path = contextIndexRelPath;
  materialized.context_map_path = contextMapRelPath;
  if (contextIndexResult.snapshotPath) materialized.snapshots.push(contextIndexResult.snapshotPath);
  if (contextMapResult.snapshotPath) materialized.snapshots.push(contextMapResult.snapshotPath);

  const importsReadmePath = rel(projectRoot, join(projectRoot, PRODUCT.internalDir, 'imports', 'README.md'));
  if (existsSync(join(projectRoot, importsReadmePath))) {
    materialized.snapshots.push(importsReadmePath);
  }

  writer.saveCreatedFiles();

  return {
    currentState,
    manifest,
    materialized,
    blueprintRelPath,
  };
}

function applyBlueprintStatePatch(projectRoot, currentState, materialized, blueprintRelPath, validationReportPath, applyReportPath) {
  const createdFiles = Array.isArray(currentState.created_files) ? currentState.created_files : [];
  const existingPolicies = Array.isArray(currentState.policies) ? currentState.policies : [];
  const existingContextDocuments = Array.isArray(currentState.context_documents) ? currentState.context_documents : [];
  const filesystemCollections = collectAdoptApplyStateCollections(projectRoot);
  const nextState = {
    ...currentState,
    adoption: {
      ...(currentState.adoption ?? {}),
      status: 'applied',
      blueprint_path: blueprintRelPath,
      validation_report_path: validationReportPath,
      apply_report_path: applyReportPath,
      apply_status: 'applied',
      applied_at: new Date().toISOString(),
      next_required_output: undefined,
      materialized_agents: materialized.agents,
      materialized_skills: materialized.skills,
      materialized_context_documents: materialized.context_documents,
      materialized_flows: unique(materialized.flows),
      materialized_policies: unique(materialized.policies),
      materialized_entrypoints: materialized.entrypoints,
      snapshot_paths: materialized.snapshots,
    },
    adoption_status: 'applied',
    generated_agents: filesystemCollections.generated_agents,
    generated_skills: filesystemCollections.generated_skills,
    flows: filesystemCollections.flows,
    policies: unique([
      ...existingPolicies,
      ...materialized.policies.map((path) => basename(path, extname(path))),
    ]),
    context_documents: unique([
      ...existingContextDocuments,
      ...materialized.context_documents,
    ]),
    last_adopt_at: new Date().toISOString(),
    next_required_output: undefined,
    created_files: unique([
      ...createdFiles,
      ...materialized.agents,
      ...materialized.skills,
      ...materialized.context_documents,
      ...materialized.flows,
      ...materialized.policies,
      ...materialized.entrypoints,
      ...materialized.snapshots,
      materialized.context_index_path,
      materialized.context_map_path,
      validationReportPath,
      applyReportPath,
    ]),
  };

  delete nextState.adoption.next_required_output;
  delete nextState.next_required_output;

  return nextState;
}

function renderAdoptionPreparePlan({
  projectRoot,
  ingestResult,
  evidenceArtifacts,
}) {
  const lines = [];
  lines.push('# AgentForge Adoption Prepare');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Adoption status: evidence_ready`);
  lines.push(`- Next required output: ${NEXT_REQUIRED_OUTPUT}`);
  lines.push(`- Ingest report: ${ingestResult.reportPath}`);
  lines.push(`- Evidence bundle: ${evidenceArtifacts.jsonPath}`);
  lines.push(`- Evidence brief: ${evidenceArtifacts.briefPath}`);
  lines.push(`- Evidence report: ${evidenceArtifacts.reportPath}`);
  lines.push(`- Dossier: ${AI_DOSSIER_REL_PATH}`);
  lines.push(`- Blueprint request: ${AI_BLUEPRINT_REQUEST_REL_PATH}`);
  lines.push(`- Adoption plan: ${ADOPTION_PLAN_REL_PATH}`);
  lines.push('');

  lines.push('## Ingest');
  lines.push('');
  lines.push(`- Found: ${ingestResult.found.length}`);
  lines.push(`- Imported: ${ingestResult.imported.length}`);
  lines.push(`- Skipped: ${ingestResult.skipped.length}`);
  lines.push('');

  lines.push('## Guarantees');
  lines.push('');
  lines.push('- No final agents were created.');
  lines.push('- No final skills were created.');
  lines.push('- AGENTS.md, CLAUDE.md, and .agents/ were not modified by this step.');
  lines.push('- Heuristic suggestions were not promoted to final artifacts.');
  lines.push('- The next manual step is to fill `.agentforge/ai/outbox/agentic-blueprint.yaml`.');
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function normalizeErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) return error.message.trim();
  return String(error).trim();
}

function uniquePaths(paths = []) {
  return [...new Set(paths.filter((entry) => typeof entry === 'string' && entry.length > 0))];
}

function collectAdoptApplyStateCollections(projectRoot) {
  const internalRoot = join(projectRoot, PRODUCT.internalDir);
  const agentFiles = listFilesRecursive(join(internalRoot, 'agents'))
    .filter((filePath) => {
      const extension = extname(filePath).toLowerCase();
      return extension === '.yaml' || extension === '.yml';
    })
    .map((filePath) => basename(filePath, extname(filePath)));

  const skillFiles = listFilesRecursive(join(internalRoot, 'skills'))
    .filter((filePath) => extname(filePath).toLowerCase() === '.md' && basename(filePath) === 'SKILL.md')
    .map((filePath) => basename(dirname(filePath)));

  const flowFiles = listFilesRecursive(join(internalRoot, 'flows'))
    .filter((filePath) => {
      const extension = extname(filePath).toLowerCase();
      return extension === '.yaml' || extension === '.yml';
    })
    .map((filePath) => basename(filePath, extname(filePath)));

  return {
    generated_agents: unique(agentFiles),
    generated_skills: unique(skillFiles),
    flows: unique(flowFiles),
  };
}

function renderAdoptionApplyReport({
  projectRoot,
  status,
  completedSteps,
  failedStep,
  errors,
  writtenPaths,
  migratedPaths = [],
  snapshotPaths = [],
  skippedPaths = [],
  entrypoints = [],
  contextIndexPath = null,
  contextMapPath = null,
}) {
  const lines = [];
  lines.push('# AgentForge Adoption Apply Report');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Status: ${status}`);
  lines.push(`- Completed steps: ${completedSteps.length}`);
  lines.push(`- Failed step: ${failedStep ?? 'none'}`);
  lines.push(`- Migrated files: ${migratedPaths.length}`);
  lines.push(`- Snapshots preserved: ${snapshotPaths.length}`);
  lines.push(`- Skipped files: ${skippedPaths.length}`);
  lines.push(`- Entry points taken over: ${entrypoints.length}`);
  lines.push(`- Context index updated: ${contextIndexPath ? 'yes' : 'no'}`);
  lines.push(`- Context map updated: ${contextMapPath ? 'yes' : 'no'}`);
  lines.push('');

  lines.push('## Completed steps');
  lines.push('');
  if (completedSteps.length === 0) {
    lines.push('- None');
  } else {
    for (const step of completedSteps) {
      lines.push(`- ${step}`);
    }
  }
  lines.push('');

  lines.push('## Migrated files');
  lines.push('');
  if (migratedPaths.length === 0) {
    lines.push('- None');
  } else {
    for (const relPath of migratedPaths) {
      lines.push(`- ${relPath}`);
    }
  }
  lines.push('');

  lines.push('## Snapshots preserved');
  lines.push('');
  if (snapshotPaths.length === 0) {
    lines.push('- None');
  } else {
    for (const relPath of snapshotPaths) {
      lines.push(`- ${relPath}`);
    }
  }
  lines.push('');

  lines.push('## Skipped files');
  lines.push('');
  if (skippedPaths.length === 0) {
    lines.push('- None');
  } else {
    for (const item of skippedPaths) {
      lines.push(`- \`${item.source}\` → \`${item.target}\` (${item.reason})`);
    }
  }
  lines.push('');

  lines.push('## Entrypoints');
  lines.push('');
  if (entrypoints.length === 0) {
    lines.push('- None');
  } else {
    for (const relPath of entrypoints) {
      lines.push(`- ${relPath}`);
    }
  }
  lines.push('');

  lines.push('## Context files');
  lines.push('');
  lines.push(`- Context index: ${contextIndexPath ?? 'not updated'}`);
  lines.push(`- Context map: ${contextMapPath ?? 'not updated'}`);
  lines.push('');

  lines.push('## Failed step');
  lines.push('');
  lines.push(`- ${failedStep ?? 'none'}`);
  lines.push('');

  if (errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const error of errors) {
      lines.push(`- ${error}`);
    }
    lines.push('');
  }

  lines.push('## Written files');
  lines.push('');
  if (writtenPaths.length === 0) {
    lines.push('- None');
  } else {
    for (const relPath of writtenPaths) {
      lines.push(`- ${relPath}`);
    }
  }
  lines.push('');

  lines.push('## Notes');
  lines.push('');
  lines.push('- This report records the partial apply trail for the latest adoption run.');
  lines.push('- AGENTS.md and CLAUDE.md are tracked in the manifest when adopt writes or refreshes them.');
  lines.push('- Final takeover of existing entrypoints remains the job of `agentforge compile --takeover-entrypoints --include-existing-entrypoints`.');

  return `${lines.join('\n').trimEnd()}\n`;
}

function writeAdoptionApplyReport(projectRoot, summary) {
  const writer = new Writer(projectRoot);
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-apply.md');
  const report = renderAdoptionApplyReport({ projectRoot, ...summary });
  writer.writeGeneratedFile(reportPath, report, { force: true });
  writer.saveCreatedFiles();
  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, uniquePaths([rel(projectRoot, reportPath), ...(summary.writtenPaths ?? [])])),
  });
  return rel(projectRoot, reportPath);
}

export async function runAdoptApplyFromBlueprint(projectRoot, blueprintPath, { writeReportsOnError = true } = {}) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
      reportPath: ADOPTION_APPLY_REL_PATH,
      validationReportPath: BLUEPRINT_VALIDATION_REL_PATH,
    };
  }

  const resolvedBlueprintPath = resolve(projectRoot, blueprintPath);
  if (!existsSync(resolvedBlueprintPath)) {
    return {
      ok: false,
      errors: [`Blueprint ausente em ${rel(projectRoot, resolvedBlueprintPath)}.`],
      reportPath: ADOPTION_APPLY_REL_PATH,
      validationReportPath: BLUEPRINT_VALIDATION_REL_PATH,
    };
  }

  const parsed = parseBlueprintFile(resolvedBlueprintPath);
  const blueprintRelPath = rel(projectRoot, resolvedBlueprintPath);
  if (!parsed.ok) {
    const emptyValidation = {
      valid: false,
      errors: [parsed.error],
      normalized: normalizeAgenticBlueprint({}),
    };
    if (writeReportsOnError) {
      const validationReport = renderBlueprintValidationReport({
        projectRoot,
        blueprintPath: blueprintRelPath,
        validation: emptyValidation,
      });
      const applyReport = renderAdoptionApplyFromBlueprintReport({
        projectRoot,
        blueprintPath: blueprintRelPath,
        validation: emptyValidation,
        materialized: {
          agents: [],
          skills: [],
          context_documents: [],
          flows: [],
          policies: [],
          entrypoints: [],
          snapshots: [],
        },
        validationReportPath: BLUEPRINT_VALIDATION_REL_PATH,
        status: 'aborted',
        errors: [parsed.error],
      });

      const reportWriter = new Writer(projectRoot);
      reportWriter.writeGeneratedFile(join(projectRoot, BLUEPRINT_VALIDATION_REL_PATH), validationReport, { force: true });
      reportWriter.writeGeneratedFile(join(projectRoot, ADOPTION_APPLY_REL_PATH), applyReport, { force: true });
      reportWriter.saveCreatedFiles();
      saveManifest(projectRoot, {
        ...loadManifest(projectRoot),
        ...buildManifest(projectRoot, [BLUEPRINT_VALIDATION_REL_PATH, ADOPTION_APPLY_REL_PATH]),
      });
    }

    return {
      ok: false,
      errors: [parsed.error],
      reportPath: ADOPTION_APPLY_REL_PATH,
      validationReportPath: BLUEPRINT_VALIDATION_REL_PATH,
    };
  }

  const evidenceBundle = loadBlueprintEvidenceBundle(projectRoot);
  const validation = validateBlueprintForAdoptApply(projectRoot, parsed.doc, evidenceBundle, resolvedBlueprintPath);

  if (!validation.valid) {
    if (writeReportsOnError) {
      const validationReport = renderBlueprintValidationReport({
        projectRoot,
        blueprintPath: blueprintRelPath,
        validation,
      });
      const applyReport = renderAdoptionApplyFromBlueprintReport({
        projectRoot,
        blueprintPath: blueprintRelPath,
        validation,
        materialized: {
          agents: [],
          skills: [],
          context_documents: [],
          flows: [],
          policies: [],
          entrypoints: [],
          snapshots: [],
        },
        validationReportPath: BLUEPRINT_VALIDATION_REL_PATH,
        status: 'aborted',
        errors: validation.errors,
      });

      const reportWriter = new Writer(projectRoot);
      reportWriter.writeGeneratedFile(join(projectRoot, BLUEPRINT_VALIDATION_REL_PATH), validationReport, { force: true });
      reportWriter.writeGeneratedFile(join(projectRoot, ADOPTION_APPLY_REL_PATH), applyReport, { force: true });
      reportWriter.saveCreatedFiles();
      saveManifest(projectRoot, {
        ...loadManifest(projectRoot),
        ...buildManifest(projectRoot, [BLUEPRINT_VALIDATION_REL_PATH, ADOPTION_APPLY_REL_PATH]),
      });
    }

    return {
      ok: false,
      errors: validation.errors,
      reportPath: ADOPTION_APPLY_REL_PATH,
      validationReportPath: BLUEPRINT_VALIDATION_REL_PATH,
    };
  }

  const materialization = materializeBlueprintApply(projectRoot, resolvedBlueprintPath, parsed.doc, validation);
  const provisionalState = applyBlueprintStatePatch(
    projectRoot,
    materialization.currentState,
    materialization.materialized,
    materialization.blueprintRelPath,
    null,
    null,
  );
  provisionalState.adoption = {
    ...(provisionalState.adoption ?? {}),
    status: 'materialized',
    apply_status: 'materialized',
    verification_status: 'pending',
  };
  const provisionalWrittenPaths = unique([
    ...materialization.materialized.agents,
    ...materialization.materialized.skills,
    ...materialization.materialized.context_documents,
    ...materialization.materialized.flows,
    ...materialization.materialized.policies,
    ...materialization.materialized.entrypoints,
    materialization.materialized.context_index_path,
    materialization.materialized.context_map_path,
    ...materialization.materialized.snapshots,
  ]);
  updateStateAndManifest(projectRoot, provisionalState, provisionalWrittenPaths);

  const structureValidation = validateAgentForgeStructure(projectRoot);
  mkdirSync(dirname(structureValidation.reportPath), { recursive: true });
  writeFileSync(structureValidation.reportPath, structureValidation.reportContent, 'utf8');

  const validationReport = renderBlueprintValidationReport({
    projectRoot,
    blueprintPath: blueprintRelPath,
    validation,
    materializedCounts: {
      agents: materialization.materialized.agents.length,
      skills: materialization.materialized.skills.length,
      context_documents: materialization.materialized.context_documents.length,
      flows: unique(materialization.materialized.flows).length,
      policies: unique(materialization.materialized.policies).length,
      entrypoints: materialization.materialized.entrypoints.length,
    },
  });

  const applyReport = renderAdoptionApplyFromBlueprintReport({
    projectRoot,
    blueprintPath: blueprintRelPath,
    validation,
    materialized: materialization.materialized,
    validationReportPath: BLUEPRINT_VALIDATION_REL_PATH,
    status: structureValidation.valid ? 'applied' : 'apply-validation-failed',
    errors: structureValidation.valid ? [] : structureValidation.errors.map((error) => `${error.file}: ${error.message}`),
  });

  const reportWriter = new Writer(projectRoot);
  reportWriter.writeGeneratedFile(join(projectRoot, BLUEPRINT_VALIDATION_REL_PATH), validationReport, { force: true });
  reportWriter.writeGeneratedFile(join(projectRoot, ADOPTION_APPLY_REL_PATH), applyReport, { force: true });
  reportWriter.saveCreatedFiles();

  const finalWrittenPaths = unique([
    ...provisionalWrittenPaths,
    rel(projectRoot, structureValidation.reportPath),
    BLUEPRINT_VALIDATION_REL_PATH,
    ADOPTION_APPLY_REL_PATH,
  ]);

  const finalState = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));
  finalState.adoption = {
    ...(finalState.adoption ?? {}),
    status: structureValidation.valid ? 'applied' : 'apply-validation-failed',
    apply_status: structureValidation.valid ? 'applied' : 'failed',
    verification_status: structureValidation.valid ? 'verified' : 'failed',
    verification_report_path: rel(projectRoot, structureValidation.reportPath),
    validation_report_path: BLUEPRINT_VALIDATION_REL_PATH,
    apply_report_path: ADOPTION_APPLY_REL_PATH,
    applied_at: finalState.adoption?.applied_at ?? new Date().toISOString(),
  };
  if (!structureValidation.valid) {
    finalState.adoption_status = 'apply-validation-failed';
    finalState.adoption.last_error = structureValidation.errors[0]?.message ?? 'Validation failed.';
    finalState.adoption_failed_step = 'validate';
  } else {
    finalState.adoption_status = 'applied';
  }

  updateStateAndManifest(projectRoot, finalState, finalWrittenPaths);

  if (!structureValidation.valid) {
    return {
      ok: false,
      errors: structureValidation.errors.map((error) => `${error.file}: ${error.message}`),
      reportPath: ADOPTION_APPLY_REL_PATH,
      validationReportPath: BLUEPRINT_VALIDATION_REL_PATH,
      materialized: materialization.materialized,
    };
  }

  return {
    ok: true,
    reportPath: ADOPTION_APPLY_REL_PATH,
    validationReportPath: BLUEPRINT_VALIDATION_REL_PATH,
    materialized: materialization.materialized,
    blueprintPath: materialization.blueprintRelPath,
  };
}

function updateStateAndManifest(projectRoot, nextState, relPaths = []) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, uniquePaths([rel(projectRoot, statePath), ...relPaths])),
  });
  return nextState;
}

function updateAdoptionState(projectRoot, { status, failedStep = null, lastError = null } = {}) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.last_adopt_at = new Date().toISOString();
  state.adoption_status = status;
  if (failedStep) state.adoption_failed_step = failedStep;
  else delete state.adoption_failed_step;
  if (lastError) state.last_adopt_error = lastError;
  else delete state.last_adopt_error;
  return updateStateAndManifest(projectRoot, state);
}

export async function runAdoptApply(projectRoot) {
  const errors = [];
  const completedSteps = [];
  const writtenPaths = [];
  const migratedPaths = [];
  const snapshotPaths = [];
  const skippedPaths = [];
  const entrypoints = [];
  let contextIndexPath = null;
  let contextMapPath = null;
  let failedStep = null;
  let ingestResult = null;
  let applyResult = null;
  let planResult = null;
  let validationResult = null;
  let stateSnapshot = null;

  const finalizer = ({ status, failedStep: nextFailedStep = null, lastError = null } = {}) => {
    const reportRelPath = rel(projectRoot, join(projectRoot, PRODUCT.internalDir, 'reports', 'adoption-apply.md'));
    writtenPaths.push(reportRelPath);
    updateAdoptionState(projectRoot, {
      status,
      failedStep: nextFailedStep,
      lastError,
    });
    const reportPath = writeAdoptionApplyReport(projectRoot, {
      status,
      completedSteps,
      failedStep: nextFailedStep,
      errors,
      writtenPaths: uniquePaths(writtenPaths),
      migratedPaths,
      snapshotPaths,
      skippedPaths,
      entrypoints,
      contextIndexPath,
      contextMapPath,
    });
    return reportPath;
  };

  const fail = (step, error) => {
    failedStep = step;
    const message = normalizeErrorMessage(error) || 'Adoption apply failed.';
    errors.push(message);
    const reportPath = finalizer({
      status: 'apply-failed',
      failedStep: step,
      lastError: message,
    });
    return {
      ok: false,
      errors,
      step,
      reportPath,
      completedSteps: [...completedSteps],
      writtenPaths: uniquePaths(writtenPaths),
    };
  };

  try {
    ingestResult = runIngest(projectRoot);
    if (!ingestResult.ok) {
      return fail('ingest', ingestResult.error);
    }
    completedSteps.push('ingest');
    writtenPaths.push(
      ...(Array.isArray(ingestResult.imported) ? ingestResult.imported.map((item) => item.snapshotPath).filter(Boolean) : []),
      ...(ingestResult.reportPath ? [rel(projectRoot, ingestResult.reportPath)] : []),
    );
    if (ingestResult.imports?.readmePath) {
      writtenPaths.push(rel(projectRoot, ingestResult.imports.readmePath));
    }

    stateSnapshot = JSON.parse(readFileSync(join(projectRoot, PRODUCT.internalDir, 'state.json'), 'utf8'));

    planResult = buildAdoptionSurfacePlan(projectRoot);
    const planOutputs = writeAdoptionSurfaceOutputs(projectRoot, planResult);
    completedSteps.push('adoption-plan');
    writtenPaths.push(planOutputs.reportPath, ...planOutputs.suggestionPaths);

    applyResult = applyLegacyMigration(projectRoot, loadManifest(projectRoot), planResult, stateSnapshot);
    completedSteps.push('adoption-migration');
    migratedPaths.push(...applyResult.migrated);
    snapshotPaths.push(...applyResult.snapshots);
    skippedPaths.push(...applyResult.skipped);
    if (applyResult.entrypoints.length > 0) {
      entrypoints.push(...applyResult.entrypoints);
      writtenPaths.push(...applyResult.entrypoints);
    }
    if (applyResult.contextIndexPath) {
      contextIndexPath = applyResult.contextIndexPath;
      writtenPaths.push(contextIndexPath);
    }
    if (applyResult.contextMapPath) {
      contextMapPath = applyResult.contextMapPath;
      writtenPaths.push(contextMapPath);
    }
    if (applyResult.contextMapReport) {
      writtenPaths.push(applyResult.contextMapReport);
    }
    writtenPaths.push(...migratedPaths, ...snapshotPaths);

    repairPhaseState(projectRoot);
    completedSteps.push('repair-phase-state');
    writtenPaths.push(
      rel(projectRoot, join(projectRoot, PRODUCT.internalDir, 'state.json')),
      rel(projectRoot, join(projectRoot, PRODUCT.internalDir, 'plan.md')),
    );

    validationResult = validateAgentForgeStructure(projectRoot);
    mkdirSync(dirname(validationResult.reportPath), { recursive: true });
    writeFileSync(validationResult.reportPath, validationResult.reportContent, 'utf8');
    writtenPaths.push(rel(projectRoot, validationResult.reportPath));
    saveManifest(projectRoot, {
      ...loadManifest(projectRoot),
      ...buildManifest(projectRoot, uniquePaths(writtenPaths)),
    });
    if (!validationResult.valid) {
      return fail('validate', validationResult.errors[0]?.message ?? 'Validation failed.');
    }
    completedSteps.push('validate');

    const reportPath = finalizer({
      status: 'applied',
      failedStep: null,
      lastError: null,
    });

    return {
      ok: true,
      ingestResult,
      planResult,
      applyResult,
      validationResult,
      reportPath,
      completedSteps: [...completedSteps],
      writtenPaths: uniquePaths(writtenPaths),
      migratedPaths: [...migratedPaths],
      snapshotPaths: [...snapshotPaths],
      skippedPaths: [...skippedPaths],
      entrypoints: [...entrypoints],
    };
  } catch (error) {
    return fail(failedStep ?? 'unknown', error);
  }
}

export default async function adopt(args = []) {
  const { default: chalk } = await import('chalk');
  const help = args.includes('--help') || args.includes('-h');
  const prepare = args.includes('--prepare');
  const apply = args.includes('--apply');
  const fromAiIndex = args.findIndex((arg) => arg === '--from-ai' || arg.startsWith('--from-ai='));
  let fromAiPath = '';
  if (fromAiIndex >= 0) {
    const arg = args[fromAiIndex];
    if (arg.includes('=')) {
      fromAiPath = arg.slice(arg.indexOf('=') + 1).trim();
    } else {
      fromAiPath = normalizeString(args[fromAiIndex + 1] ?? '');
    }
  }

  if (help) {
    console.log(chalk.bold(`\n  ${PRODUCT.name}: Adopt\n`));
    console.log(`  Uso: npx ${PRODUCT.command} adopt [--prepare] [--apply] [--from-ai <path>]\n`);
    console.log('  Gera o plano da superfície agentic existente.');
    console.log('  Com --prepare, o comando roda ingest, gera evidence bundle, dossier humano, request de blueprint e o adoption-plan sem materializar decisões finais.');
    console.log('  Com --apply, o comando preserva snapshots, migra arquivos canônicos, assume AGENTS.md/CLAUDE.md quando preciso e atualiza context-index/context-map.');
    console.log('  Com --from-ai, o comando lê um blueprint da IA e materializa a arquitetura agentic sem heurísticas.');
    console.log('  O takeover final dos entrypoints continua em `agentforge compile --takeover-entrypoints --include-existing-entrypoints`.\n');
    return 0;
  }

  const projectRoot = process.cwd();
  if (prepare && apply) {
    console.log(chalk.red('  Use apenas um modo: --prepare ou --apply.\n'));
    return 1;
  }
  if (fromAiIndex >= 0 && !apply) {
    console.log(chalk.red('  Use --from-ai apenas com --apply.\n'));
    return 1;
  }
  if (fromAiIndex >= 0 && !fromAiPath) {
    console.log(chalk.red('  Informe um caminho para --from-ai.\n'));
    return 1;
  }

  if (prepare) {
    const result = runAdoptPrepare(projectRoot);
    if (!result.ok) {
      console.log(chalk.red(`\n  Adoption prepare failed: ${result.errors[0]}\n`));
      return 1;
    }

    console.log(chalk.hex('#ffa203')('  Evidência pronta para a IA ativa.'));
    console.log(chalk.gray(`  Ingest report: ${result.ingestResult.reportPath}`));
    console.log(chalk.gray(`  Evidence bundle: ${result.evidenceArtifacts.jsonPath}`));
    console.log(chalk.gray(`  Dossier: ${result.dossierPath}`));
    console.log(chalk.gray(`  Blueprint request: ${result.requestPath}`));
    console.log(chalk.gray(`  Adoption plan: ${result.reportPath}`));
    return 0;
  }

  if (apply) {
    if (fromAiIndex >= 0) {
      const result = await runAdoptApplyFromBlueprint(projectRoot, fromAiPath);
      if (!result.ok) {
        console.log(chalk.red(`\n  Adoption apply failed: ${result.errors[0]}\n`));
        console.log(chalk.gray(`  Blueprint validation report: ${result.validationReportPath}`));
        console.log(chalk.gray(`  Relatório: ${result.reportPath}`));
        return 1;
      }

      console.log(chalk.hex('#ffa203')('  Blueprint da IA materializado com sucesso.'));
      console.log(chalk.gray(`  Blueprint: ${result.blueprintPath}`));
      console.log(chalk.gray(`  Validation report: ${result.validationReportPath}`));
      console.log(chalk.gray(`  Report: ${result.reportPath}`));
      return 0;
    }

    const result = await runAdoptApply(projectRoot);
    if (!result.ok) {
      console.log(chalk.red(`\n  Adoption apply failed at ${result.step}: ${result.errors[0]}\n`));
      console.log(chalk.gray(`  Relatório: ${result.reportPath}`));
      return 1;
    }

    console.log(chalk.gray('  Compilando entrypoints...'));
    const compileResult = await compileAgentForge(projectRoot, {
      force: true,
      takeoverEntrypoints: true,
      includeExistingEntrypoints: true,
      persistState: false,
    });

    if (compileResult.errors.length > 0) {
      console.log(chalk.red('  Erro durante a compilação da adoção.'));
      for (const error of compileResult.errors) {
        console.log(chalk.red(`  - ${error}`));
      }
      console.log(chalk.gray(`  Relatório de compilação: ${compileResult.reportPath}`));
      return 1;
    }

    repairPhaseState(projectRoot);

    const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
    if (existsSync(statePath)) {
      const currentState = JSON.parse(readFileSync(statePath, 'utf8'));
      const validationResult = validateAgentForgeStructure(projectRoot);
      mkdirSync(dirname(validationResult.reportPath), { recursive: true });
      writeFileSync(validationResult.reportPath, validationResult.reportContent, 'utf8');

      const verificationResult = verifyAdoptionWorkflow(projectRoot, currentState, {
        planResult: result.planResult ?? null,
        applyResult: result.applyResult ?? null,
        validationResult,
        adoptionApplyPath: result.reportPath,
      });
      finalizeAdoptionWorkflow(projectRoot, currentState, {
        validationResult,
        verificationResult,
        adoptionApplyPath: result.reportPath,
      });
      if (!verificationResult.ok) {
        console.log(chalk.red('  A aplicação da adoção agentic foi concluída, mas a verificação falhou.'));
        for (const check of verificationResult.checks.filter((entry) => !entry.passed)) {
          console.log(chalk.red(`  - ${check.name}: ${check.details}`));
        }
        console.log(chalk.gray(`  Relatório de verificação: ${verificationResult.reportPath}`));
        return 1;
      }
    }

    console.log(chalk.hex('#ffa203')(`\n  Adoption apply concluído: ${result.migratedPaths.length} arquivo(s) migrado(s), ${result.snapshotPaths.length} snapshot(s) preservado(s).\n`));
    console.log(chalk.gray(`  Relatório: ${result.reportPath}`));
    console.log(chalk.gray(`  Context index: ${result.applyResult?.contextIndexPath ?? 'not updated'}`));
    console.log(chalk.gray(`  Context map: ${result.applyResult?.contextMapPath ?? 'not updated'}`));
    return 0;
  }

  const plan = buildAdoptionSurfacePlan(projectRoot);
  const outputs = writeAdoptionSurfaceOutputs(projectRoot, plan);

  console.log(chalk.hex('#ffa203')(`  Plano de adoção gerado em ${outputs.reportPath}`));
  console.log(chalk.gray(`  Surface files classified: ${plan.summary.total}`));
  console.log(chalk.gray(`  Migrate candidates: ${plan.summary.migrate}`));
  console.log(chalk.gray(`  Preserved: ${plan.summary.preserve}`));
  console.log(chalk.gray(`  Ignored: ${plan.summary.ignore}`));
  console.log(chalk.gray(`  Needs review: ${plan.summary.review}`));
  if (outputs.suggestionPaths.length > 0) {
    console.log(chalk.gray('  Suggestion files:'));
    for (const path of outputs.suggestionPaths) {
      console.log(chalk.gray(`    - ${path}`));
    }
  }

  return 0;
}
