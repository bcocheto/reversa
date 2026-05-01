import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { PRODUCT } from '../product.js';
import { checkExistingInstallation } from '../installer/validator.js';

const MAX_LINES = 220;
const MAX_BYTES = 16000;

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

function analyzeDuplicateContent(tree) {
  const groups = new Map();
  for (const file of tree.files) {
    const group = groups.get(file.hash) ?? [];
    group.push(file.relPath);
    groups.set(file.hash, group);
  }

  return [...groups.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([hash, files]) => ({
      hash,
      files,
      reason: 'Conteúdo duplicado exato.',
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

  if (totalEntries <= 12) return [];

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
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Project: ${state.project ?? basename(projectRoot)}`);
  lines.push(`- Setup mode: ${state.setup_mode ?? 'bootstrap'}`);
  lines.push(`- Applied: ${applied ? 'yes' : 'no'}`);
  lines.push(`- Large files: ${analysis.largeFiles.length}`);
  lines.push(`- Missing READMEs: ${analysis.missingReadmes.length}`);
  lines.push(`- Duplicate groups: ${analysis.duplicateGroups.length}`);
  lines.push(`- Skills without clear trigger: ${analysis.skillsWithoutTrigger.length}`);
  lines.push(`- Context files with policy bleed: ${analysis.policiesMixedInContexts.length}`);
  lines.push(`- Flows hard to read: ${analysis.flowsHardToRead.length}`);
  lines.push(`- Unmarked generated files: ${analysis.unmarkedGeneratedFiles.length}`);
  lines.push(`- Context index issues: ${analysis.contextIndexIssues.length}`);
  lines.push(`- Contexts without examples: ${analysis.contextExamples.length}`);
  lines.push(`- Important references missing: ${analysis.importantReferences.length}`);
  lines.push('');

  lines.push('## Arquivos muito grandes');
  lines.push('');
  lines.push(summarizeIssues(analysis.largeFiles, 'Nenhum arquivo grande detectado.'));
  lines.push('');

  lines.push('## Pastas sem README');
  lines.push('');
  lines.push(summarizeIssues(analysis.missingReadmes, 'Nenhuma pasta sem README encontrada.'));
  lines.push('');

  lines.push('## Conteúdo duplicado');
  lines.push('');
  if (analysis.duplicateGroups.length === 0) {
    lines.push('- Nenhum conteúdo duplicado exato encontrado.');
  } else {
    for (const group of analysis.duplicateGroups) {
      lines.push(`- \`${group.files[0]}\` == ${group.files.slice(1).map((file) => `\`${file}\``).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Skills sem trigger claro');
  lines.push('');
  lines.push(summarizeIssues(analysis.skillsWithoutTrigger, 'Nenhuma skill sem gatilho detectada.'));
  lines.push('');

  lines.push('## Policies misturadas em contextos');
  lines.push('');
  lines.push(summarizeIssues(analysis.policiesMixedInContexts, 'Nenhuma mistura de políticas em contextos detectada.'));
  lines.push('');

  lines.push('## Flows difíceis de entender');
  lines.push('');
  lines.push(summarizeIssues(analysis.flowsHardToRead, 'Nenhum flow difícil de entender detectado.'));
  lines.push('');

  lines.push('## Arquivos gerados sem marcação');
  lines.push('');
  lines.push(summarizeIssues(analysis.unmarkedGeneratedFiles, 'Todos os arquivos gerados analisados têm marca explícita.'));
  lines.push('');

  lines.push('## Context-index carregando contexto demais');
  lines.push('');
  lines.push(summarizeIssues(analysis.contextIndexIssues, 'O índice de contexto está em um tamanho saudável.'));
  lines.push('');

  lines.push('## Contextos sem exemplos');
  lines.push('');
  lines.push(summarizeIssues(analysis.contextExamples, 'Todos os contextos analisados têm exemplos.'));
  lines.push('');

  lines.push('## Referências importantes ausentes');
  lines.push('');
  lines.push(summarizeIssues(analysis.importantReferences, 'As referências importantes estão destacadas.'));
  lines.push('');

  lines.push('## Safe actions');
  lines.push('');
  if (applied) {
    if (createdReadmes.length > 0) {
      lines.push('- READMEs criados:');
      for (const file of createdReadmes) {
        lines.push(`  - ${file}`);
      }
    } else {
      lines.push('- Nenhum README novo precisou ser criado.');
    }
    lines.push('- Índices ausentes seriam recriados apenas se faltassem.');
  } else {
    if (analysis.missingReadmes.length > 0) {
      lines.push('- `--apply` criará READMEs curtos nas pastas sem documentação.');
    } else {
      lines.push('- Nenhuma ação segura pendente foi identificada.');
    }
  }
  lines.push('');

  lines.push('## Recommended next steps');
  lines.push('');
  lines.push('- Revise os arquivos listados com conteúdo grande ou pouco claro.');
  lines.push('- Adicione exemplos aos contextos mais importantes.');
  lines.push('- Marque explicitamente arquivos gerados quando eles precisarem ser auditados.');
  lines.push('- Considere dividir `harness/context-index.yaml` se ele continuar crescendo.');

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

  const analysis = {
    state,
    largeFiles: analyzeLargeFiles(tree),
    missingReadmes: analyzeMissingReadmes(projectRoot, tree),
    duplicateGroups: analyzeDuplicateContent(tree),
    skillsWithoutTrigger: analyzeSkillsWithoutTrigger(tree),
    policiesMixedInContexts: analyzePoliciesMixedInContexts(tree),
    flowsHardToRead: analyzeFlows(tree),
    unmarkedGeneratedFiles: analyzeUnmarkedGeneratedFiles(tree),
    contextIndexIssues: analyzeContextIndex(tree),
    contextExamples: analyzeContextExamples(tree),
    importantReferences: analyzeImportantReferences(projectRoot),
  };

  return { ok: true, analysis, tree };
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

  const appliedAnalysis = {
    ...result.analysis,
    missingReadmes: result.analysis.missingReadmes.filter((item) => createdReadmes.includes(item.readme) === false),
  };
  const report = renderImprovementPlan(projectRoot, appliedAnalysis, { applied: true, createdReadmes });
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'improvement-plan.md');
  writer.writeGeneratedFile(reportPath, report, { force: true });
  writer.saveCreatedFiles();
  updateManifest(projectRoot, writer);

  return {
    ok: true,
    createdReadmes,
    reportPath: rel(projectRoot, reportPath),
    analysis: appliedAnalysis,
    report,
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

  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'improvement-plan.md');
  const writer = new Writer(projectRoot);
  writer.writeGeneratedFile(reportPath, result.report, { force: true });
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
