import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { PRODUCT } from '../product.js';
import { checkExistingInstallation } from '../installer/validator.js';
import {
  ENTRYPOINT_TARGETS,
  buildEntrypointQualityMessage,
  inspectManagedEntrypointContent,
} from './entrypoint-quality.js';

const MAX_LINES = 220;
const MAX_BYTES = 16000;
const MAX_INDEX_ENTRIES = 12;

function toPosixPath(path) {
  return path.split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeContentForSimilarity(content) {
  return String(content ?? '')
    .replace(/^---[\s\S]*?---\s*/m, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^#{1,6}\s+.*$/gm, ' ')
    .replace(/^\s*[-*+]\s+/gm, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

function parseMarkdownLinks(content) {
  const links = [];
  const pattern = /(?<!\!)\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of String(content ?? '').matchAll(pattern)) {
    links.push(match[1].trim());
  }
  return links;
}

function hasFrontmatter(content) {
  return /^---\s*[\s\S]*?\s*---/m.test(String(content ?? ''));
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

function listDirectoriesRecursive(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const dirs = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (!entry.isDirectory()) continue;
    dirs.push(fullPath);
    dirs.push(...listDirectoriesRecursive(fullPath));
  }

  return dirs.sort((a, b) => a.localeCompare(b));
}

function hasMarkdownTitle(content) {
  const lines = String(content ?? '').split(/\r?\n/);
  return lines.some((line) => /^#\s+\S/.test(line));
}

function stripFrontmatter(content) {
  return String(content ?? '').replace(/^---[\s\S]*?---\s*/m, '').trim();
}

function collectTree(projectRoot) {
  const internalDir = join(projectRoot, PRODUCT.internalDir);
  const files = [];
  const dirs = new Set();

  for (const filePath of listFilesRecursive(internalDir)) {
    const content = readFileSync(filePath, 'utf8');
    const relPath = rel(projectRoot, filePath);
    const dirPath = dirname(filePath);
    dirs.add(rel(projectRoot, dirPath));
    files.push({
      absPath: filePath,
      relPath,
      dirRelPath: rel(projectRoot, dirPath),
      name: basename(filePath),
      ext: extname(filePath).toLowerCase(),
      content,
      bytes: Buffer.byteLength(content, 'utf8'),
      lines: content.split(/\r?\n/).length,
      hash: createHash('sha256').update(content).digest('hex'),
    });
  }

  for (const dirPath of listDirectoriesRecursive(internalDir)) {
    dirs.add(rel(projectRoot, dirPath));
  }

  return {
    internalDir,
    projectRoot,
    files,
    dirs: [...dirs].filter(Boolean).sort((a, b) => a.localeCompare(b)),
  };
}

function parseYamlFile(filePath) {
  try {
    const doc = YAML.parse(readFileSync(filePath, 'utf8'));
    return isPlainObject(doc) ? doc : null;
  } catch {
    return null;
  }
}

function titleFromDir(relDir) {
  const name = basename(relDir);
  return name
    .split(/[-_]/g)
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function shouldSkipReadmeDir(relDir) {
  const base = basename(relDir);
  if (!base || base === PRODUCT.internalDir) return true;
  if (base.startsWith('_')) return true;
  if (relDir === PRODUCT.internalDir) return true;
  return false;
}

function hasReadme(projectRoot, relDir) {
  return existsSync(join(projectRoot, relDir, 'README.md'));
}

function analyzeLargeFiles(tree) {
  return tree.files
    .filter((file) => file.lines > MAX_LINES || file.bytes > MAX_BYTES)
    .map((file) => ({
      file: file.relPath,
      lines: file.lines,
      bytes: file.bytes,
      reason: file.lines > MAX_LINES
        ? `Arquivo muito grande (${file.lines} linhas).`
        : `Arquivo muito grande (${file.bytes} bytes).`,
    }));
}

function analyzeMissingReadmes(projectRoot, tree) {
  return tree.dirs
    .filter((dirRelPath) => !shouldSkipReadmeDir(dirRelPath))
    .filter((dirRelPath) => hasReadme(projectRoot, dirRelPath) === false)
    .map((dirRelPath) => ({
      dir: dirRelPath,
      readme: join(dirRelPath, 'README.md').replace(/\\/g, '/'),
      reason: 'Pasta sem README.md.',
    }));
}

function analyzeDuplicateOrSimilarContent(tree) {
  const groups = new Map();
  for (const file of tree.files) {
    const signature = createHash('sha256').update(normalizeContentForSimilarity(file.content)).digest('hex');
    const group = groups.get(signature) ?? [];
    group.push(file.relPath);
    groups.set(signature, group);
  }

  return [...groups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([signature, files]) => ({
      signature,
      files,
      reason: 'Conteúdo duplicado ou muito semelhante.',
    }));
}

function analyzeSkillsWithoutTrigger(tree) {
  return tree.files
    .filter((file) => file.ext === '.md' && /(^|\/)skills\/[^/]+\/SKILL\.md$/i.test(file.relPath))
    .filter((file) => {
      const hasTrigger = /##\s*(when to use|trigger|mission|quando usar)/i.test(file.content);
      return !hasTrigger;
    })
    .map((file) => ({
      file: file.relPath,
      reason: 'Skill sem gatilho ou missão explícita.',
    }));
}

function analyzeSkillsWithoutProcedure(tree) {
  return tree.files
    .filter((file) => file.ext === '.md' && /(^|\/)skills\/[^/]+\/SKILL\.md$/i.test(file.relPath))
    .filter((file) => !/##\s*(procedure|steps|procedimento)/i.test(file.content))
    .map((file) => ({
      file: file.relPath,
      reason: 'Skill sem procedimento claro.',
    }));
}

function analyzeSkillsWithoutSafetyLimits(tree) {
  return tree.files
    .filter((file) => file.ext === '.md' && /(^|\/)skills\/[^/]+\/SKILL\.md$/i.test(file.relPath))
    .filter((file) => !/##\s*(limites de segurança|safety limits|safety|security|restrições)/i.test(file.content))
    .map((file) => ({
      file: file.relPath,
      reason: 'Skill sem limites de segurança explícitos.',
    }));
}

function analyzePoliciesMixedInContexts(tree) {
  return tree.files
    .filter((file) => file.relPath.startsWith(`${PRODUCT.internalDir}/context/`))
    .filter((file) => file.ext === '.md' && basename(file.relPath) !== 'README.md')
    .filter((file) => /approval|protected|policy|deny|safety|permission/i.test(file.content))
    .map((file) => ({
      file: file.relPath,
      reason: 'Conteúdo de política apareceu dentro de contexto.',
    }));
}

function analyzeFilesWithoutTitle(tree) {
  return tree.files
    .filter((file) => file.ext === '.md')
    .filter((file) => basename(file.relPath).toUpperCase() !== 'README.MD')
    .filter((file) => file.lines > 1)
    .filter((file) => !hasMarkdownTitle(file.content))
    .map((file) => ({
      file: file.relPath,
      reason: 'Arquivo Markdown sem título claro.',
    }));
}

function analyzeFlows(tree) {
  return tree.files
    .filter((file) => file.relPath.startsWith(`${PRODUCT.internalDir}/flows/`))
    .filter((file) => file.ext === '.md' && basename(file.relPath) !== 'README.md')
    .map((file) => {
      const hasObjective = /##\s*objective/i.test(file.content);
      const hasSteps = /##\s*steps/i.test(file.content);
      const hasCheckpoints = /##\s*checkpoints/i.test(file.content);
      const hasUse = /##\s*when to use/i.test(file.content);
      const tooLong = file.lines > 120;
      if (hasObjective && hasSteps && hasCheckpoints && hasUse && !tooLong) return null;
      return {
        file: file.relPath,
        reason: [
          !hasObjective ? 'falta seção Objective' : null,
          !hasUse ? 'falta seção When to use' : null,
          !hasSteps ? 'falta seção Steps' : null,
          !hasCheckpoints ? 'falta seção Checkpoints' : null,
          tooLong ? 'fluxo muito longo' : null,
        ].filter(Boolean).join('; '),
      };
    })
    .filter(Boolean);
}

function analyzeUnmarkedGeneratedFiles(tree) {
  const generatedRoots = [
    `${PRODUCT.internalDir}/agents/`,
    `${PRODUCT.internalDir}/subagents/`,
    `${PRODUCT.internalDir}/flows/`,
    `${PRODUCT.internalDir}/policies/`,
    `${PRODUCT.internalDir}/harness/`,
  ];

  return tree.files
    .filter((file) => generatedRoots.some((prefix) => file.relPath.startsWith(prefix)))
    .filter((file) => ['.yaml', '.yml'].includes(file.ext))
    .filter((file) => !/generated_by\s*:/i.test(file.content))
    .map((file) => ({
      file: file.relPath,
      reason: 'Arquivo gerado sem marcador explícito de origem.',
    }));
}

function analyzeEntryFilesWithoutManagedBlock(projectRoot) {
  return ENTRYPOINT_TARGETS
    .filter((target) => existsSync(join(projectRoot, target.path)))
    .filter((target) => {
      const content = readFileSync(join(projectRoot, target.path), 'utf8');
      return !content.includes('<!-- agentforge:start -->');
    })
    .map((target) => ({
      file: target.path,
      reason: 'Arquivo de entrada sem bloco gerenciado do AgentForge.',
    }));
}

function analyzeManagedEntrypointQuality(projectRoot) {
  const tooLong = [];
  const manualExcess = [];
  const missingReferences = [];
  const legacyReversa = [];

  for (const target of ENTRYPOINT_TARGETS) {
    const absPath = join(projectRoot, target.path);
    if (!existsSync(absPath)) continue;

    const content = readFileSync(absPath, 'utf8');
    const inspection = inspectManagedEntrypointContent(content);
    if (!inspection.hasBlock) continue;

    for (const message of buildEntrypointQualityMessage(inspection)) {
      if (message.startsWith('Conteúdo manual excessivo fora do bloco AgentForge')) {
        manualExcess.push({
          file: target.path,
          reason: message,
        });
        continue;
      }

      if (message.startsWith('Entrypoint gerenciado excede o limite de')) {
        tooLong.push({
          file: target.path,
          reason: message,
        });
        continue;
      }

      if (message.startsWith('Bloco AgentForge excede o limite de')) {
        tooLong.push({
          file: target.path,
          reason: message,
        });
        continue;
      }

      if (message.startsWith('Bootloader sem referências obrigatórias')) {
        missingReferences.push({
          file: target.path,
          reason: `${message} Mova o conteúdo de domínio para .agentforge/context ou references conforme necessário.`,
        });
        continue;
      }

      if (message.startsWith('Conteúdo legado Reversa detectado')) {
        legacyReversa.push({
          file: target.path,
          reason: `${message} Remova referências a Reversa legado e mantenha apenas o bootloader AgentForge.`,
        });
      }
    }
  }

  return {
    tooLong,
    manualExcess,
    missingReferences,
    legacyReversa,
  };
}

function analyzeContextIndex(tree) {
  const indexFile = tree.files.find((file) => file.relPath === `${PRODUCT.internalDir}/harness/context-index.yaml`);
  if (!indexFile) {
    return [{
      file: `${PRODUCT.internalDir}/harness/context-index.yaml`,
      reason: 'Índice de contexto ausente.',
    }];
  }

  const doc = parseYamlFile(indexFile.absPath);
  if (!doc) {
    return [{
      file: indexFile.relPath,
      reason: 'Índice de contexto inválido.',
    }];
  }

  const totalEntries =
    (Array.isArray(doc.items) ? doc.items.length : 0) +
    (Array.isArray(doc.skills) ? doc.skills.length : 0) +
    (Array.isArray(doc.flows) ? doc.flows.length : 0);

  if (totalEntries <= MAX_INDEX_ENTRIES) return [];

  return [{
    file: indexFile.relPath,
    reason: `Índice muito carregado (${totalEntries} entradas). Considere separar acesso rápido de catálogo completo.`,
  }];
}

function analyzeContextExamples(tree) {
  return tree.files
    .filter((file) => file.relPath.startsWith(`${PRODUCT.internalDir}/context/`))
    .filter((file) => file.ext === '.md' && basename(file.relPath) !== 'README.md')
    .filter((file) => !/##\s*(example|exemplo)/i.test(file.content) && !/```/.test(file.content))
    .map((file) => ({
      file: file.relPath,
      reason: 'Contexto sem exemplo explícito.',
    }));
}

function analyzeBrokenRelativeLinks(projectRoot, tree) {
  const issues = [];
  const filePaths = new Set(tree.files.map((file) => file.relPath));
  const dirPaths = new Set(tree.dirs);

  for (const file of tree.files.filter((entry) => entry.ext === '.md')) {
    for (const rawTarget of parseMarkdownLinks(file.content)) {
      if (!rawTarget || rawTarget.startsWith('#')) continue;
      if (/^[a-z]+:\/\//i.test(rawTarget) || rawTarget.startsWith('mailto:') || rawTarget.startsWith('app://')) continue;
      const [targetPath] = rawTarget.split('#');
      if (!targetPath || targetPath.startsWith('#')) continue;

      const absoluteTarget = join(dirname(file.absPath), targetPath);
      const normalized = rel(projectRoot, absoluteTarget);
      const exists = filePaths.has(normalized) || dirPaths.has(normalized) || existsSync(absoluteTarget);
      if (!exists) {
        issues.push({
          file: file.relPath,
          link: rawTarget,
          reason: `Link relativo possivelmente quebrado: ${rawTarget}.`,
        });
      }
    }
  }

  return issues;
}

function calculateImprovementScore(analysis) {
  const penalties = (
    analysis.largeFiles.length * 7 +
    analysis.missingReadmes.length * 5 +
    analysis.duplicateGroups.length * 5 +
    analysis.skillsWithoutTrigger.length * 6 +
    analysis.skillsWithoutProcedure.length * 6 +
    analysis.skillsWithoutSafetyLimits.length * 5 +
    analysis.policiesMixedInContexts.length * 7 +
    analysis.filesWithoutTitle.length * 4 +
    analysis.flowsHardToRead.length * 5 +
    analysis.unmarkedGeneratedFiles.length * 4 +
    analysis.contextIndexIssues.length * 6 +
    analysis.contextExamples.length * 2 +
    analysis.importantReferences.length * 5 +
    analysis.entryFilesWithoutManagedBlock.length * 6 +
    analysis.managedEntrypointsTooLong.length * 9 +
    analysis.managedEntrypointManualExcess.length * 8 +
    analysis.managedEntrypointMissingReferences.length * 7 +
    analysis.managedEntrypointLegacyReversa.length * 8 +
    analysis.brokenRelativeLinks.length * 4
  );

  return Math.max(0, Math.min(100, 100 - penalties));
}

function formatIssueList(items, emptyMessage, { limit = 20 } = {}) {
  if (items.length === 0) return [`- ${emptyMessage}`];
  return items.slice(0, limit).map((item) => {
    if (Array.isArray(item.files) && item.files.length > 1) {
      return `- \`${item.files[0]}\` == ${item.files.slice(1).map((file) => `\`${file}\``).join(', ')}: ${item.reason}`;
    }
    const subject = item.file ?? item.readme ?? item.dir ?? item.link ?? 'item';
    return `- \`${subject}\`: ${item.reason}`;
  });
}

function analyzeImportantReferences(projectRoot) {
  const filePath = join(projectRoot, PRODUCT.internalDir, 'references', 'important-files.md');
  if (!existsSync(filePath)) {
    return [{
      file: rel(projectRoot, filePath),
      reason: 'Arquivo de referências importantes ausente.',
    }];
  }

  const content = readFileSync(filePath, 'utf8');
  const requiredTokens = [
    'scope.md',
    'state.json',
    'config.toml',
    'manifest.yaml',
    'reports/bootstrap.md',
    'reports/validation.md',
    'AGENTS.md',
    'CLAUDE.md',
    '.cursor/rules/agentforge.md',
    '.github/copilot-instructions.md',
  ];

  const missing = requiredTokens.filter((token) => content.includes(token) === false);
  if (missing.length === 0) return [];

  return [{
    file: rel(projectRoot, filePath),
    reason: `Referências importantes não destacadas: ${missing.join(', ')}.`,
  }];
}

function summarizeIssues(items, emptyMessage) {
  if (items.length === 0) return `- ${emptyMessage}`;
  return items.map((item) => `- \`${item.file ?? item.dir}\`: ${item.reason}`).join('\n');
}

function renderImprovementPlan(projectRoot, analysis, { applied = false, createdReadmes = [] } = {}) {
  const state = analysis.state ?? {};
  const lines = [];
  lines.push('# Improvement Plan');
  lines.push('');
  lines.push('## Score geral');
  lines.push('');
  lines.push(`- Project: ${state.project ?? basename(projectRoot)}`);
  lines.push(`- Setup mode: ${state.setup_mode ?? 'bootstrap'}`);
  lines.push(`- Applied: ${applied ? 'yes' : 'no'}`);
  lines.push(`- Score: ${analysis.improvementScore}/100`);
  lines.push(`- Large files: ${analysis.largeFiles.length}`);
  lines.push(`- Missing READMEs: ${analysis.missingReadmes.length}`);
  lines.push(`- Duplicate or similar content groups: ${analysis.duplicateGroups.length}`);
  lines.push(`- Skills without clear trigger: ${analysis.skillsWithoutTrigger.length}`);
  lines.push(`- Skills without procedure: ${analysis.skillsWithoutProcedure.length}`);
  lines.push(`- Skills without safety limits: ${analysis.skillsWithoutSafetyLimits.length}`);
  lines.push(`- Context files with policy bleed: ${analysis.policiesMixedInContexts.length}`);
  lines.push(`- Files without title: ${analysis.filesWithoutTitle.length}`);
  lines.push(`- Flows hard to read: ${analysis.flowsHardToRead.length}`);
  lines.push(`- Unmarked generated files: ${analysis.unmarkedGeneratedFiles.length}`);
  lines.push(`- Entry files without AgentForge block: ${analysis.entryFilesWithoutManagedBlock.length}`);
  lines.push(`- Managed entrypoints too long: ${analysis.managedEntrypointsTooLong.length}`);
  lines.push(`- Managed entrypoints with manual excess: ${analysis.managedEntrypointManualExcess.length}`);
  lines.push(`- Managed entrypoints without required refs: ${analysis.managedEntrypointMissingReferences.length}`);
  lines.push(`- Managed entrypoints with Reversa legacy: ${analysis.managedEntrypointLegacyReversa.length}`);
  lines.push(`- Context index issues: ${analysis.contextIndexIssues.length}`);
  lines.push(`- Contexts without examples: ${analysis.contextExamples.length}`);
  lines.push(`- Broken relative links: ${analysis.brokenRelativeLinks.length}`);
  lines.push(`- Important references missing: ${analysis.importantReferences.length}`);
  lines.push('');

  lines.push('## Problemas críticos');
  lines.push('');
  const criticalIssues = [
    ...analysis.largeFiles,
    ...analysis.missingReadmes,
    ...analysis.duplicateGroups,
    ...analysis.skillsWithoutProcedure,
    ...analysis.skillsWithoutSafetyLimits,
    ...analysis.policiesMixedInContexts,
    ...analysis.filesWithoutTitle,
    ...analysis.flowsHardToRead,
    ...analysis.entryFilesWithoutManagedBlock,
    ...analysis.brokenRelativeLinks,
  ];
  lines.push(...formatIssueList(criticalIssues, 'Nenhum problema crítico detectado.'));
  lines.push('');

  lines.push('## Melhorias recomendadas');
  lines.push('');
  const recommendedImprovements = [
    analysis.largeFiles.length > 0 ? 'Divida arquivos grandes em blocos menores e mais fáceis de revisar.' : null,
    analysis.missingReadmes.length > 0 ? 'Crie READMEs curtos nas pastas sem documentação.' : null,
    analysis.duplicateGroups.length > 0 ? 'Consolide conteúdo duplicado ou muito semelhante em uma única fonte canônica.' : null,
    analysis.skillsWithoutTrigger.length > 0 ? 'Adicione gatilho e missão explícitos às skills apontadas.' : null,
    analysis.skillsWithoutProcedure.length > 0 ? 'Inclua uma seção Procedimento em cada skill listada.' : null,
    analysis.skillsWithoutSafetyLimits.length > 0 ? 'Inclua limites de segurança em cada skill listada.' : null,
    analysis.policiesMixedInContexts.length > 0 ? 'Mova regras de política para `policies/` para reduzir mistura de responsabilidades.' : null,
    analysis.filesWithoutTitle.length > 0 ? 'Adicione títulos claros a arquivos Markdown sem heading de abertura.' : null,
    analysis.flowsHardToRead.length > 0 ? 'Reescreva os flows mais longos em passos menores e com checkpoints mais claros.' : null,
    analysis.contextIndexIssues.length > 0 ? 'Reduza o peso do `harness/context-index.yaml` e separe acesso rápido de catálogo completo.' : null,
    analysis.contextExamples.length > 0 ? 'Adicione exemplos concretos aos contextos sem exemplos.' : null,
    analysis.importantReferences.length > 0 ? 'Atualize `references/important-files.md` com os arquivos centrais do projeto.' : null,
    analysis.entryFilesWithoutManagedBlock.length > 0 ? 'Use takeover ou refatore os entry files para restabelecer o bloco gerenciado do AgentForge.' : null,
    analysis.managedEntrypointsTooLong.length > 0 ? 'Use takeover ou refatore os entrypoints gerenciados para ficar abaixo de 150 linhas.' : null,
    analysis.managedEntrypointManualExcess.length > 0 ? 'Use takeover ou refatore os entrypoints gerenciados e mova o conteúdo manual excessivo para `.agentforge/context` ou `references`.' : null,
    analysis.managedEntrypointMissingReferences.length > 0 ? 'Garanta que cada bootloader cite router, context-index, policies, skills, flows e references.' : null,
    analysis.managedEntrypointLegacyReversa.length > 0 ? 'Remova blocos e referências legadas da Reversa dos entrypoints.' : null,
    analysis.brokenRelativeLinks.length > 0 ? 'Corrija links relativos quebrados antes de expandir o contexto.' : null,
  ].filter(Boolean);
  if (recommendedImprovements.length === 0) {
    lines.push('- Nenhuma melhoria adicional foi identificada.');
  } else {
    for (const item of recommendedImprovements) {
      lines.push(`- ${item}`);
    }
  }
  lines.push('');

  lines.push('## Melhorias seguras que podem ser aplicadas');
  lines.push('');
  const safeActions = [];
  if (analysis.missingReadmes.length > 0) {
    safeActions.push(`Criar READMEs curtos para ${analysis.missingReadmes.length} pasta(s) sem documentação.`);
  }
  safeActions.push('Atualizar este relatório sempre que a estrutura mudar.');
  if (createdReadmes.length > 0) {
    safeActions.push(`READMEs criados nesta execução: ${createdReadmes.join(', ')}.`);
  }
  lines.push(...safeActions.map((item) => `- ${item}`));
  lines.push('');

  lines.push('## Melhorias que exigem revisão humana');
  lines.push('');
  const humanReviewItems = [
    ...analysis.largeFiles,
    ...analysis.duplicateGroups,
    ...analysis.skillsWithoutTrigger,
    ...analysis.skillsWithoutProcedure,
    ...analysis.skillsWithoutSafetyLimits,
    ...analysis.policiesMixedInContexts,
    ...analysis.filesWithoutTitle,
    ...analysis.flowsHardToRead,
    ...analysis.unmarkedGeneratedFiles,
    ...analysis.entryFilesWithoutManagedBlock,
    ...analysis.managedEntrypointsTooLong,
    ...analysis.managedEntrypointManualExcess,
    ...analysis.managedEntrypointMissingReferences,
    ...analysis.managedEntrypointLegacyReversa,
    ...analysis.contextIndexIssues,
    ...analysis.contextExamples,
    ...analysis.brokenRelativeLinks,
    ...analysis.importantReferences,
  ];
  lines.push(...formatIssueList(humanReviewItems, 'Nenhum item precisou de revisão humana específica.'));
  lines.push('');

  lines.push('## Detalhamento');
  lines.push('');
  lines.push('### Arquivos muito grandes');
  lines.push('');
  lines.push(...formatIssueList(analysis.largeFiles, 'Nenhum arquivo grande detectado.'));
  lines.push('');

  lines.push('### Pastas sem README');
  lines.push('');
  lines.push(...formatIssueList(analysis.missingReadmes, 'Nenhuma pasta sem README encontrada.'));
  lines.push('');

  lines.push('### Conteúdo duplicado ou muito semelhante');
  lines.push('');
  if (analysis.duplicateGroups.length === 0) {
    lines.push('- Nenhum conteúdo duplicado ou muito semelhante encontrado.');
  } else {
    for (const group of analysis.duplicateGroups) {
      lines.push(`- \`${group.files[0]}\` == ${group.files.slice(1).map((file) => `\`${file}\``).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('### Skills sem trigger claro / procedimento / segurança');
  lines.push('');
  lines.push(...formatIssueList(analysis.skillsWithoutTrigger, 'Nenhuma skill sem gatilho detectada.'));
  lines.push(...formatIssueList(analysis.skillsWithoutProcedure, 'Nenhuma skill sem procedimento detectada.'));
  lines.push(...formatIssueList(analysis.skillsWithoutSafetyLimits, 'Nenhuma skill sem limites de segurança detectada.'));
  lines.push('');

  lines.push('### Entry files e links');
  lines.push('');
  lines.push(...formatIssueList(analysis.entryFilesWithoutManagedBlock, 'Todos os entry files possuem bloco AgentForge.'));
  lines.push(...formatIssueList(analysis.managedEntrypointsTooLong, 'Todos os entrypoints gerenciados estão abaixo do limite de 150 linhas.'));
  lines.push(...formatIssueList(analysis.managedEntrypointManualExcess, 'Nenhum entrypoint gerenciado com excesso de conteúdo manual.'));
  lines.push(...formatIssueList(analysis.managedEntrypointMissingReferences, 'Todos os bootloaders citam router, context-index, policies, skills, flows e references.'));
  lines.push(...formatIssueList(analysis.managedEntrypointLegacyReversa, 'Nenhum entrypoint contém legado Reversa.'));
  lines.push(...formatIssueList(analysis.brokenRelativeLinks, 'Nenhum link relativo quebrado detectado.'));
  lines.push('');

  lines.push('### Contexto e referências');
  lines.push('');
  lines.push(...formatIssueList(analysis.policiesMixedInContexts, 'Nenhuma mistura de políticas em contextos detectada.'));
  lines.push(...formatIssueList(analysis.contextIndexIssues, 'O índice de contexto está em um tamanho saudável.'));
  lines.push(...formatIssueList(analysis.contextExamples, 'Todos os contextos analisados têm exemplos.'));
  lines.push(...formatIssueList(analysis.unmarkedGeneratedFiles, 'Todos os arquivos gerados analisados têm marca explícita.'));
  lines.push(...formatIssueList(analysis.importantReferences, 'As referências importantes estão destacadas.'));

  lines.push('');
  lines.push('## Comandos sugeridos');
  lines.push('');
  if (applied) {
    lines.push('- `agentforge validate`');
    lines.push('- `agentforge compile`');
  } else {
    lines.push('- `agentforge improve --apply`');
    lines.push('- `agentforge validate`');
    lines.push('- `agentforge compile`');
  }
  return lines.join('\n');
}

function shouldCreateReadme(projectRoot, dirRelPath) {
  if (basename(dirRelPath).startsWith('_')) return false;
  if (dirRelPath === PRODUCT.internalDir) return false;
  if (dirRelPath.startsWith(`${PRODUCT.internalDir}/_`)) return false;
  return !existsSync(join(projectRoot, dirRelPath, 'README.md'));
}

function renderDirectoryReadme(projectRoot, dirRelPath) {
  const title = titleFromDir(dirRelPath);

  if (dirRelPath === `${PRODUCT.internalDir}/agents`) {
    const agentsDir = join(projectRoot, dirRelPath);
    const agents = existsSync(agentsDir)
      ? readdirSync(agentsDir)
          .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
          .sort((a, b) => a.localeCompare(b))
      : [];

    return [
      `# ${title}`,
      '',
      'Esta pasta contém os agentes internos ou customizados do projeto.',
      'Cada arquivo YAML representa um papel com responsabilidades e limites claros.',
      '',
      '## Como ler',
      '',
      '- Um agente por arquivo.',
      '- Mantenha o nome curto e o propósito explícito.',
      '- Prefira mudanças pequenas em vez de reescrever tudo.',
      '',
      '## Arquivos encontrados',
      '',
      ...(agents.length > 0 ? agents.map((entry) => `- \`${entry}\``) : ['- Nenhum agente YAML encontrado ainda.']),
      '',
      '## Observação',
      '',
      '- Se a pasta crescer, crie um índice mais específico antes de adicionarem mais responsabilidades.',
    ].join('\n');
  }

  if (dirRelPath === `${PRODUCT.internalDir}/subagents`) {
    const subagentsDir = join(projectRoot, dirRelPath);
    const subagents = existsSync(subagentsDir)
      ? readdirSync(subagentsDir)
          .filter((name) => name.endsWith('.yaml') || name.endsWith('.yml'))
          .sort((a, b) => a.localeCompare(b))
      : [];

    return [
      `# ${title}`,
      '',
      'Esta pasta guarda especialistas estreitos usados quando um fluxo precisa de mais foco.',
      '',
      '## Como ler',
      '',
      '- Cada subagente deve justificar por que existe.',
      '- Evite duplicar responsabilidades de agentes principais.',
      '',
      '## Arquivos encontrados',
      '',
      ...(subagents.length > 0 ? subagents.map((entry) => `- \`${entry}\``) : ['- Nenhum subagente YAML encontrado ainda.']),
      '',
      '## Observação',
      '',
      '- Subagentes são apoio, não o caminho principal da execução.',
    ].join('\n');
  }

  if (dirRelPath.startsWith(`${PRODUCT.internalDir}/skills/`)) {
    return [
      `# ${title}`,
      '',
      'Esta pasta contém uma skill reutilizável e um README curto para orientar humanos.',
      '',
      '## Arquivo principal',
      '',
      '- `SKILL.md`',
      '',
      '## Como usar',
      '',
      '- Leia o frontmatter primeiro.',
      '- Mantenha o gatilho e a missão explícitos.',
      '- Se a skill crescer, divida responsabilidades antes de adicionar mais texto.',
    ].join('\n');
  }

  return [
    `# ${title}`,
    '',
    'Esta pasta faz parte da base `.agentforge/` e foi preparada para humanos revisarem sem esforço.',
    '',
    '## O que colocar aqui',
    '',
    '- Uma breve descrição do propósito da pasta.',
    '- Exemplos curtos e uma referência aos arquivos principais.',
    '- Observações sobre o que é seguro editar manualmente.',
    '',
    '## Como manter',
    '',
    '- Mantenha o texto enxuto.',
    '- Evite duplicar documentação de outras pastas.',
    '- Atualize este README quando a pasta mudar de papel.',
  ].join('\n');
}

function applyReadmeChanges(projectRoot, tree, writer) {
  const created = [];
  for (const dirRelPath of tree.dirs) {
    if (!shouldCreateReadme(projectRoot, dirRelPath)) continue;
    const content = renderDirectoryReadme(projectRoot, dirRelPath);
    const dest = join(projectRoot, dirRelPath, 'README.md');
    if (writer.writeGeneratedFile(dest, content, { force: false })) {
      created.push(rel(projectRoot, dest));
    }
  }
  return created;
}

function analyzeAgentForge(projectRoot) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const state = installation.state ?? {};
  const tree = collectTree(projectRoot);
  const entrypointQuality = analyzeManagedEntrypointQuality(projectRoot);

  const analysis = {
    state,
    largeFiles: analyzeLargeFiles(tree),
    missingReadmes: analyzeMissingReadmes(projectRoot, tree),
    duplicateGroups: analyzeDuplicateOrSimilarContent(tree),
    skillsWithoutTrigger: analyzeSkillsWithoutTrigger(tree),
    skillsWithoutProcedure: analyzeSkillsWithoutProcedure(tree),
    skillsWithoutSafetyLimits: analyzeSkillsWithoutSafetyLimits(tree),
    policiesMixedInContexts: analyzePoliciesMixedInContexts(tree),
    filesWithoutTitle: analyzeFilesWithoutTitle(tree),
    flowsHardToRead: analyzeFlows(tree),
    unmarkedGeneratedFiles: analyzeUnmarkedGeneratedFiles(tree),
    entryFilesWithoutManagedBlock: analyzeEntryFilesWithoutManagedBlock(projectRoot),
    managedEntrypointsTooLong: entrypointQuality.tooLong,
    managedEntrypointManualExcess: entrypointQuality.manualExcess,
    managedEntrypointMissingReferences: entrypointQuality.missingReferences,
    managedEntrypointLegacyReversa: entrypointQuality.legacyReversa,
    contextIndexIssues: analyzeContextIndex(tree),
    contextExamples: analyzeContextExamples(tree),
    brokenRelativeLinks: analyzeBrokenRelativeLinks(projectRoot, tree),
    importantReferences: analyzeImportantReferences(projectRoot),
  };

  analysis.improvementScore = calculateImprovementScore(analysis);

  return { ok: true, analysis, tree };
}

function buildImprovementState(state, analysis, { applied = false, createdReadmes = [] } = {}) {
  const now = new Date().toISOString();
  return {
    ...state,
    last_improve_at: now,
    improvement_score: analysis.improvementScore,
    improvement: {
      at: now,
      applied,
      score: analysis.improvementScore,
      created_readmes: createdReadmes,
      missing_readmes: analysis.missingReadmes.length,
      large_files: analysis.largeFiles.length,
      duplicate_groups: analysis.duplicateGroups.length,
      skills_without_trigger: analysis.skillsWithoutTrigger.length,
      skills_without_procedure: analysis.skillsWithoutProcedure.length,
      skills_without_safety_limits: analysis.skillsWithoutSafetyLimits.length,
    },
  };
}

function persistImprovementState(projectRoot, writer, analysis, state, options = {}) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const nextState = buildImprovementState(state, analysis, options);
  writer.writeGeneratedFile(statePath, `${JSON.stringify(nextState, null, 2)}\n`, { force: true });
  return nextState;
}

function updateManifest(projectRoot, writer) {
  const existing = loadManifest(projectRoot);
  const next = {
    ...existing,
    ...buildManifest(projectRoot, writer.manifestPaths),
  };
  saveManifest(projectRoot, next);
}

export function runImprovementAnalysis(projectRoot) {
  const result = analyzeAgentForge(projectRoot);
  if (!result.ok) return result;
  const report = renderImprovementPlan(projectRoot, result.analysis, { applied: false });
  return {
    ok: true,
    analysis: result.analysis,
    report,
  };
}

export function applyImprovementActions(projectRoot) {
  const result = analyzeAgentForge(projectRoot);
  if (!result.ok) return result;

  const writer = new Writer(projectRoot);
  const createdReadmes = applyReadmeChanges(projectRoot, result.tree, writer);
  return {
    ok: true,
    createdReadmes,
    analysis: result.analysis,
    writer,
  };
}

export default async function improve(args = []) {
  const { default: chalk } = await import('chalk');

  const apply = args.includes('--apply');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(chalk.bold(`\n  ${PRODUCT.name}: Improve\n`));
    console.log(`  Uso: npx ${PRODUCT.command} improve [--apply]\n`);
    console.log('  Sem --apply: gera apenas o relatório de melhoria.');
    console.log('  Com --apply: cria apenas melhorias seguras, como READMEs e placeholders.\n');
    return 0;
  }

  const projectRoot = process.cwd();
  const result = apply ? applyImprovementActions(projectRoot) : runImprovementAnalysis(projectRoot);

  if (!result.ok) {
    console.log(chalk.yellow(`  ${result.errors[0]}`));
    return 1;
  }

  const state = checkExistingInstallation(projectRoot).state ?? {};
  const report = renderImprovementPlan(projectRoot, result.analysis, {
    applied: apply,
    createdReadmes: result.createdReadmes ?? [],
  });
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'improvement-plan.md');
  const writer = result.writer ?? new Writer(projectRoot);
  writer.writeGeneratedFile(reportPath, report, { force: true });
  persistImprovementState(projectRoot, writer, result.analysis, state, {
    applied: apply,
    createdReadmes: result.createdReadmes ?? [],
  });
  writer.saveCreatedFiles();
  updateManifest(projectRoot, writer);

  if (apply) {
    for (const file of result.createdReadmes ?? []) {
      console.log(chalk.hex('#ffa203')(`  Criado: ${file}`));
    }
  }

  console.log(chalk.hex('#ffa203')(`  Relatório gerado em ${reportPath}`));
  if (result.analysis?.missingReadmes?.length > 0 && !apply) {
    console.log(chalk.gray(`  ${result.analysis.missingReadmes.length} pasta(s) sem README podem ser completadas com --apply.`));
  }

  return 0;
}
