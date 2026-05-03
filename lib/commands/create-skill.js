import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, fileStatus, loadManifest, saveManifest } from '../installer/manifest.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';

const SKILL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUGGESTION_DIR = join(PRODUCT.internalDir, 'suggestions', 'skills');
const LEGACY_SUGGESTION_DIR = join(PRODUCT.internalDir, 'skill-suggestions');

const SKILL_TASK_CONTEXTS = {
  'run-tests': ['feature', 'bugfix', 'review'],
  'run-lint': ['feature', 'refactor', 'review'],
  typecheck: ['feature', 'bugfix', 'refactor', 'review'],
  'database-migration': ['feature', 'bugfix'],
  'update-docs': ['documentation'],
  'ci-diagnosis': ['review', 'bugfix'],
  'release-checklist': ['feature', 'review'],
  'docker-compose-workflow': ['feature', 'bugfix'],
  'review-pr': ['review'],
  'review-changes': ['review'],
  'api-contract-review': ['review'],
  'security-review': ['review'],
  'frontend-component-review': ['feature', 'review'],
  'backend-endpoint-review': ['feature', 'bugfix', 'review'],
  'dependency-update': ['refactor', 'review'],
};

function toPosixPath(path) {
  return path.split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeString(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[\n,;]/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function parseSuggestionFile(filePath) {
  try {
    const doc = YAML.parse(readFileSync(filePath, 'utf8'));
    return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : null;
  } catch {
    return null;
  }
}

function resolveSuggestionPath(projectRoot, skillId) {
  const canonicalPath = join(projectRoot, SUGGESTION_DIR, `${skillId}.yaml`);
  if (existsSync(canonicalPath)) {
    return canonicalPath;
  }

  const legacyPath = join(projectRoot, LEGACY_SUGGESTION_DIR, `${skillId}.yaml`);
  if (existsSync(legacyPath)) {
    return legacyPath;
  }

  return canonicalPath;
}

function frontmatterToText(frontmatter) {
  return YAML.stringify(frontmatter).trimEnd();
}

function truncateSnippet(snippet, maxLength = 120) {
  const text = normalizeString(snippet);
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function formatList(items, emptyMessage) {
  if (!items || items.length === 0) return [`- ${emptyMessage}`];
  return items.map((item) => `- ${item}`);
}

function formatEvidenceItems(sourceEvidence = []) {
  if (!Array.isArray(sourceEvidence) || sourceEvidence.length === 0) {
    return ['- Nenhuma evidência explícita foi registrada na sugestão de origem.'];
  }

  return sourceEvidence.map((item) => {
    if (!item || typeof item !== 'object') {
      return `- ${truncateSnippet(item)}`;
    }

    const file = normalizeString(item.file) || 'origem desconhecida';
    const line = Number.isInteger(item.line) ? item.line : null;
    const snippet = truncateSnippet(item.snippet || item.content || '');
    const lineLabel = line ? `:${line}` : '';
    return snippet
      ? `- \`${file}${lineLabel}\` - ${snippet}`
      : `- \`${file}${lineLabel}\``;
  });
}

function renderSkillDocument(suggestion) {
  const frontmatter = {
    name: suggestion.name,
    description: suggestion.description,
    license: 'MIT',
    metadata: {
      framework: 'agentforge',
      type: 'project-skill',
      source: 'skill-suggestion',
      suggestion_id: suggestion.id,
      confidence: suggestion.confidence,
    },
  };

  const lines = [];
  lines.push('---');
  lines.push(frontmatterToText(frontmatter));
  lines.push('---');
  lines.push('');
  lines.push(`# ${suggestion.name}`);
  lines.push('');
  lines.push('## Quando usar');
  lines.push('');
  lines.push(`- ${suggestion.reason}`);
  for (const trigger of toArray(suggestion.triggers)) {
    lines.push(`- Gatilho: \`${trigger}\``);
  }
  lines.push('');
  lines.push('## Contexto necessário');
  lines.push('');
  lines.push(...formatList(toArray(suggestion.recommended_context).map((item) => `\`${item}\``), 'Nenhum contexto adicional foi identificado.'));
  lines.push('');
  lines.push('## Procedimento');
  lines.push('');
  const procedureSteps = toArray(suggestion.recommended_steps);
  if (procedureSteps.length === 0) {
    lines.push('1. Ler a sugestão de origem.');
    lines.push('2. Identificar o comando ou fluxo principal.');
    lines.push('3. Executar a tarefa de forma segura e revisável.');
  } else {
    procedureSteps.forEach((step, index) => {
      lines.push(`${index + 1}. ${step}`);
    });
  }
  lines.push('');
  lines.push('## Checklist');
  lines.push('');
  lines.push('- Frontmatter válido.');
  lines.push('- Procedimento legível e sequenciado.');
  lines.push('- Contexto e limites claros.');
  lines.push('- Evidências de origem incluídas.');
  lines.push('');
  lines.push('## Saída esperada');
  lines.push('');
  lines.push('- Skill pronta para uso humano e por agentes.');
  lines.push('- Próximos passos claros para aplicação da skill.');
  lines.push('- Limites e contexto explicitados.');
  lines.push('');
  lines.push('## Limites de segurança');
  lines.push('');
  lines.push(...formatList(toArray(suggestion.safety_limits), 'Nenhum limite adicional foi informado.'));
  lines.push('');
  lines.push('## Evidências de origem');
  lines.push('');
  lines.push(`- Sugestão de origem: \`.agentforge/suggestions/skills/${suggestion.id}.yaml\``);
  lines.push('- Compatível com sugestões legadas em `.agentforge/skill-suggestions/`.');
  lines.push(...formatEvidenceItems(suggestion.source_evidence));
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function validateSkillDocument(content, suggestion) {
  const errors = [];
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    errors.push('SKILL.md precisa começar com frontmatter YAML delimitado por `---`.');
    return errors;
  }

  let frontmatter;
  try {
    frontmatter = YAML.parse(match[1]);
  } catch {
    errors.push('Frontmatter YAML inválido.');
    return errors;
  }

  if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) {
    errors.push('Frontmatter deve ser um objeto YAML.');
    return errors;
  }

  if (normalizeString(frontmatter.name) !== suggestion.name) {
    errors.push('Frontmatter deve conter o nome da skill.');
  }
  if (normalizeString(frontmatter.description) !== suggestion.description) {
    errors.push('Frontmatter deve conter a descrição da skill.');
  }
  if (normalizeString(frontmatter.license) !== 'MIT') {
    errors.push('Frontmatter deve declarar license: MIT.');
  }

  const metadata = frontmatter.metadata;
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    errors.push('Frontmatter deve conter metadata estruturado.');
  } else {
    if (normalizeString(metadata.framework) !== 'agentforge') {
      errors.push('metadata.framework deve ser agentforge.');
    }
    if (normalizeString(metadata.type) !== 'project-skill') {
      errors.push('metadata.type deve ser project-skill.');
    }
    if (normalizeString(metadata.source) !== 'skill-suggestion') {
      errors.push('metadata.source deve ser skill-suggestion.');
    }
    if (normalizeString(metadata.suggestion_id) !== suggestion.id) {
      errors.push('metadata.suggestion_id deve corresponder ao skill-id.');
    }
    if (!['high', 'medium', 'low'].includes(normalizeString(metadata.confidence))) {
      errors.push('metadata.confidence deve ser high, medium ou low.');
    }
  }

  const body = match[2];
  if (!/^#\s+.+/m.test(body)) {
    errors.push('SKILL.md precisa ter um título `# ...`.');
  }
  if (!/##\s+Quando usar/m.test(body)) {
    errors.push('SKILL.md precisa descrever `Quando usar`.');
  }
  if (!/##\s+Procedimento/m.test(body)) {
    errors.push('SKILL.md precisa descrever `Procedimento`.');
  }
  if (!/^\s*(?:\d+\.|-)\s+.+/m.test(body)) {
    errors.push('SKILL.md precisa conter um procedimento em lista numerada ou com bullets.');
  }
  if (!/##\s+Checklist/m.test(body)) {
    errors.push('SKILL.md precisa conter `Checklist`.');
  }
  if (!/##\s+Saída esperada/m.test(body)) {
    errors.push('SKILL.md precisa conter `Saída esperada`.');
  }
  if (!/##\s+Limites de segurança/m.test(body)) {
    errors.push('SKILL.md precisa conter `Limites de segurança`.');
  }
  if (!/##\s+Evidências de origem/m.test(body)) {
    errors.push('SKILL.md precisa conter `Evidências de origem`.');
  }

  return errors;
}

function renderContextIndexRecommendation(suggestion, taskContexts) {
  const recommendation = {
    skills: [
      {
        id: suggestion.id,
        path: `skills/${suggestion.id}/SKILL.md`,
        purpose: suggestion.description,
      },
    ],
  };

  if (taskContexts.length > 0) {
    recommendation.task_contexts = Object.fromEntries(
      taskContexts.map((mode) => ([
        mode,
        { skills: [`skills/${suggestion.id}/SKILL.md`] },
      ])),
    );
  }

  return `\n${YAML.stringify(recommendation).trim()}\n`;
}

function updateContextIndex(projectRoot, manifest, suggestion, { force = false } = {}) {
  const contextIndexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
  if (!existsSync(contextIndexPath)) {
    return {
      updated: false,
      skipped: false,
      reason: null,
      content: null,
      recommendation: null,
      path: rel(projectRoot, contextIndexPath),
      taskContexts: [],
    };
  }

  let doc;
  try {
    doc = YAML.parse(readFileSync(contextIndexPath, 'utf8'));
  } catch {
    doc = null;
  }

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return {
      updated: false,
      skipped: false,
      reason: null,
      content: null,
      recommendation: null,
      path: rel(projectRoot, contextIndexPath),
      taskContexts: [],
    };
  }

  const relPath = rel(projectRoot, contextIndexPath);
  const status = manifest[relPath]
    ? fileStatus(projectRoot, relPath, manifest[relPath])
    : 'modified';
  if (status === 'modified' && !force) {
    const taskContexts = unique(SKILL_TASK_CONTEXTS[suggestion.id] ?? []);
    return {
      updated: false,
      skipped: true,
      reason: 'context-index-modified',
      content: null,
      recommendation: renderContextIndexRecommendation(suggestion, taskContexts),
      path: relPath,
      taskContexts,
    };
  }

  const nextDoc = { ...doc };
  const skills = Array.isArray(nextDoc.skills) ? [...nextDoc.skills] : [];
  const skillPath = `skills/${suggestion.id}/SKILL.md`;
  const skillEntry = {
    id: suggestion.id,
    path: skillPath,
    purpose: suggestion.description,
  };
  const existingSkillIndex = skills.findIndex((entry) => entry && typeof entry === 'object' && normalizeString(entry.id) === suggestion.id);
  if (existingSkillIndex >= 0) {
    skills[existingSkillIndex] = { ...skills[existingSkillIndex], ...skillEntry };
  } else {
    skills.push(skillEntry);
  }
  nextDoc.skills = skills;

  const taskContexts = unique(SKILL_TASK_CONTEXTS[suggestion.id] ?? []);
  const taskContextGroups = nextDoc.task_contexts && typeof nextDoc.task_contexts === 'object' && !Array.isArray(nextDoc.task_contexts)
    ? { ...nextDoc.task_contexts }
    : {};

  for (const mode of taskContexts) {
    const group = taskContextGroups[mode];
    const nextGroup = group && typeof group === 'object' && !Array.isArray(group) ? { ...group } : {};
    const groupSkills = Array.isArray(nextGroup.skills) ? [...nextGroup.skills] : [];
    if (!groupSkills.includes(skillPath)) {
      groupSkills.push(skillPath);
    }
    nextGroup.skills = groupSkills;
    taskContextGroups[mode] = nextGroup;
  }

  if (Object.keys(taskContextGroups).length > 0) {
    nextDoc.task_contexts = taskContextGroups;
  }

  return {
    updated: true,
    skipped: false,
    reason: null,
    content: `${YAML.stringify(nextDoc).trim()}\n`,
    recommendation: null,
    path: rel(projectRoot, contextIndexPath),
    taskContexts,
  };
}

function updateState(projectRoot, mutation) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const nextState = mutation(state);
  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  return { statePath, state: nextState };
}

function collectGeneratedSkillIds(projectRoot) {
  const skillsDir = join(projectRoot, PRODUCT.internalDir, 'skills');
  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) return [];

  const ids = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const skillDir = join(skillsDir, entry.name);
    if (existsSync(join(skillDir, 'SKILL.md'))) {
      ids.push(entry.name);
    }
  }
  return ids;
}

function renderHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: Create Skill\n`));
  console.log(`  Uso: npx ${PRODUCT.command} create-skill <skill-id> [--force]\n`);
  console.log('  Cria uma skill real a partir de uma sugestão em `.agentforge/suggestions/skills/`.');
  console.log('  Também aceita sugestões legadas em `.agentforge/skill-suggestions/`.\n');
  console.log('  Atualiza `.agentforge/skills/<skill-id>/SKILL.md`, `state.json` e `context-index.yaml`.\n');
}

export function createProjectSkill(projectRoot, skillId, { force = false } = {}) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const normalizedSkillId = normalizeString(skillId);
  if (!normalizedSkillId) {
    return {
      ok: false,
      errors: ['O skill-id é obrigatório. Use `agentforge suggest-skills` para gerar sugestões antes de criar uma skill.'],
    };
  }
  if (!SKILL_ID_PATTERN.test(normalizedSkillId)) {
    return {
      ok: false,
      errors: ['O skill-id deve estar em kebab-case.'],
    };
  }

  const suggestionPath = resolveSuggestionPath(projectRoot, normalizedSkillId);
  if (!existsSync(suggestionPath)) {
    return {
      ok: false,
      errors: [
        `Sugestão ausente em \`${rel(projectRoot, suggestionPath)}\`.`,
        'Execute `agentforge suggest-skills` para gerar a sugestão em `.agentforge/suggestions/skills/` antes de criar a skill.',
      ],
    };
  }

  const suggestion = parseSuggestionFile(suggestionPath);
  if (!suggestion) {
    return {
      ok: false,
      errors: [`Sugestão inválida em \`${rel(projectRoot, suggestionPath)}\`.`],
    };
  }

  const suggestionId = normalizeString(suggestion.id) || basename(suggestionPath, '.yaml');
  if (suggestionId !== normalizedSkillId) {
    return {
      ok: false,
      errors: [
        `A sugestão em \`${rel(projectRoot, suggestionPath)}\` tem id "${suggestionId}" e não "${normalizedSkillId}".`,
        'Corrija a sugestão ou execute `agentforge suggest-skills` novamente para regenerar `.agentforge/suggestions/skills/`.',
      ],
    };
  }

  const suggestionName = normalizeString(suggestion.name) || normalizeString(suggestion.title);
  const suggestionDescription = normalizeString(suggestion.description) || normalizeString(suggestion.purpose);
  const suggestionReason = normalizeString(suggestion.reason) || normalizeString(suggestion.purpose) || suggestionDescription;
  const confidence = normalizeString(suggestion.confidence);

  if (!suggestionName || !suggestionDescription || !suggestionReason) {
    return {
      ok: false,
      errors: ['A sugestão precisa conter name, description e reason.'],
    };
  }
  if (!['high', 'medium', 'low'].includes(confidence)) {
    return {
      ok: false,
      errors: ['A sugestão precisa conter confidence como high, medium ou low.'],
    };
  }

  const skillPath = join(projectRoot, PRODUCT.internalDir, 'skills', normalizedSkillId, 'SKILL.md');
  if (existsSync(skillPath) && !force) {
    return {
      ok: false,
      errors: [
        `Já existe uma skill em \`${rel(projectRoot, skillPath)}\`.`,
        'Use `--force` para sobrescrever explicitamente.',
      ],
    };
  }

  const skillDoc = renderSkillDocument({
    id: suggestionId,
    name: suggestionName,
    description: suggestionDescription,
    reason: suggestionReason,
    confidence,
    triggers: toArray(suggestion.triggers),
    recommended_context: toArray(suggestion.recommended_context),
    recommended_steps: toArray(suggestion.recommended_steps),
    safety_limits: toArray(suggestion.safety_limits),
    source_evidence: Array.isArray(suggestion.source_evidence) ? suggestion.source_evidence : [],
  });

  const validationErrors = validateSkillDocument(skillDoc, {
    id: suggestionId,
    name: suggestionName,
    description: suggestionDescription,
  });
  if (validationErrors.length > 0) {
    return {
      ok: false,
      errors: validationErrors,
    };
  }

  const manifest = loadManifest(projectRoot);
  const writer = {
    manifestPaths: [],
    createdFiles: [],
    writeGeneratedFile(filePath, content, { force: shouldForce = false } = {}) {
      if (!shouldForce && existsSync(filePath)) return false;
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(filePath, content, 'utf8');
      const relPath = rel(projectRoot, filePath);
      this.createdFiles.push(relPath);
      this.manifestPaths.push(relPath);
      return true;
    },
    saveCreatedFiles() {},
  };

  const contextIndexUpdate = updateContextIndex(
    projectRoot,
    manifest,
    {
      id: suggestionId,
      description: suggestionDescription,
    },
    { force },
  );

  writer.writeGeneratedFile(skillPath, skillDoc, { force: true });
  if (contextIndexUpdate.updated && contextIndexUpdate.content) {
    writer.writeGeneratedFile(join(projectRoot, contextIndexUpdate.path), contextIndexUpdate.content, { force: true });
  }

  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const nextStateResult = updateState(projectRoot, (state) => {
    const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
    const touchedFiles = [
      rel(projectRoot, statePath),
      rel(projectRoot, skillPath),
    ];
    if (contextIndexUpdate.updated && contextIndexUpdate.content) {
      touchedFiles.push(contextIndexUpdate.path);
    }

    return {
      ...state,
      generated_skills: collectGeneratedSkillIds(projectRoot),
      last_skill_created_at: new Date().toISOString(),
      created_files: unique([...createdFiles, ...touchedFiles]),
    };
  });

  const manifestPaths = [
    rel(projectRoot, statePath),
    rel(projectRoot, skillPath),
  ];
  if (contextIndexUpdate.updated && contextIndexUpdate.content) {
    manifestPaths.push(contextIndexUpdate.path);
  }

  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, manifestPaths),
  });

  return {
    ok: true,
    skill: {
      id: suggestionId,
      path: rel(projectRoot, skillPath),
      suggestionPath: rel(projectRoot, suggestionPath),
    },
    state: nextStateResult.state,
    warnings: contextIndexUpdate.skipped
      ? [{
          path: contextIndexUpdate.path,
          reason: contextIndexUpdate.reason,
          recommendation: contextIndexUpdate.recommendation,
        }]
      : [],
    contextIndex: contextIndexUpdate.skipped
      ? {
          path: contextIndexUpdate.path,
          taskContexts: contextIndexUpdate.taskContexts,
          skipped: true,
          reason: contextIndexUpdate.reason,
          recommendation: contextIndexUpdate.recommendation,
        }
      : contextIndexUpdate.updated
        ? {
            path: contextIndexUpdate.path,
            taskContexts: contextIndexUpdate.taskContexts,
            skipped: false,
          }
        : null,
  };
}

export default async function createSkill(args = []) {
  const { default: chalk } = await import('chalk');
  const projectRoot = process.cwd();
  const help = args.includes('--help') || args.includes('-h');
  const force = args.includes('--force');
  const skillId = args.find((arg) => !arg.startsWith('-'));

  if (help) {
    renderHelp(chalk);
    return 0;
  }

  const result = createProjectSkill(projectRoot, skillId, { force });
  if (!result.ok) {
    console.error(chalk.red('\n  Não foi possível criar a skill.\n'));
    for (const error of result.errors) {
      console.error(`  - ${error}`);
    }
    console.error('');
    return 1;
  }

  console.log(chalk.bold(`\n  ${PRODUCT.name}: Skill criada\n`));
  console.log(`  Skill: ${chalk.cyan(result.skill.id)}`);
  console.log(`  Arquivo: ${chalk.gray(result.skill.path)}`);
  console.log(`  Sugestão: ${chalk.gray(result.skill.suggestionPath)}`);
  console.log(`  Caminho canônico: ${chalk.gray(join(PRODUCT.internalDir, 'suggestions', 'skills', `${result.skill.id}.yaml`))}`);
  if (result.contextIndex?.path) {
    console.log(`  Context index: ${chalk.gray(result.contextIndex.path)}`);
    if (result.contextIndex.skipped) {
      console.log(chalk.yellow('  Context index preservado por modificação manual.'));
      if (result.contextIndex.recommendation) {
        console.log(chalk.gray(result.contextIndex.recommendation.trimEnd()));
      }
    }
  }
  if (Array.isArray(result.warnings) && result.warnings.length > 0) {
    for (const warning of result.warnings) {
      if (!warning || typeof warning !== 'object') continue;
      console.log(chalk.yellow(`  Aviso: ${warning.reason ?? 'context-index preservado'}`));
    }
  }
  console.log('');

  return 0;
}
