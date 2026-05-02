import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, fileStatus, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';

const INPUT_DIRS = [
  '.agentforge/imports/snapshots',
  '.agentforge/context',
  '.github/workflows',
  'src',
  'tests',
  'test',
  'specs',
  'migrations',
  'apps',
  'packages',
  'docs',
];

const INPUT_FILES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursor/rules/agentforge.md',
  '.github/copilot-instructions.md',
  'package.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'package-lock.json',
  'pyproject.toml',
  'requirements.txt',
  'composer.json',
  'Dockerfile',
  'docker-compose.yml',
  'compose.yaml',
  '.agentforge/references/commands.md',
];

const SUGGESTION_FILES_DIR = '.agentforge/skill-suggestions';
const REPORT_REL_PATH = '.agentforge/reports/skill-suggestions.md';

const EXPORT_SURFACES = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursor/rules/agentforge.md',
  '.github/copilot-instructions.md',
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

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJson(filePath) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function safeReadText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function splitLines(content) {
  return String(content ?? '').split(/\r?\n/);
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function collectFiles(projectRoot) {
  const entries = [];
  const seen = new Set();

  const addFile = (absPath, kind) => {
    if (!existsSync(absPath) || statSync(absPath).isDirectory()) return;
    const relPath = rel(projectRoot, absPath);
    if (seen.has(relPath)) return;
    seen.add(relPath);
    entries.push({
      absPath,
      relPath,
      kind,
      content: safeReadText(absPath),
    });
  };

  for (const relPath of INPUT_FILES) {
    addFile(join(projectRoot, relPath), 'file');
  }

  for (const relDir of INPUT_DIRS) {
    const absDir = join(projectRoot, relDir);
    if (!existsSync(absDir)) continue;

    if (statSync(absDir).isFile()) {
      addFile(absDir, 'file');
      continue;
    }

    for (const absPath of listFilesRecursive(absDir)) {
      addFile(absPath, 'directory-file');
    }
  }

  return entries;
}

function parseSnapshotContent(file) {
  if (extname(file.absPath).toLowerCase() !== '.json') {
    return {
      sourcePath: file.relPath,
      content: file.content,
    };
  }

  try {
    const parsed = JSON.parse(file.content);
    if (!isPlainObject(parsed)) {
      return {
        sourcePath: file.relPath,
        content: file.content,
      };
    }
    return {
      sourcePath: typeof parsed.source_path === 'string' && parsed.source_path.trim().length > 0
        ? parsed.source_path.trim()
        : file.relPath,
      content: typeof parsed.content === 'string' ? parsed.content : file.content,
    };
  } catch {
    return {
      sourcePath: file.relPath,
      content: file.content,
    };
  }
}

function findEvidence(files, patterns, maxItems = 4) {
  const evidence = [];
  const seen = new Set();

  for (const file of files) {
    const lines = splitLines(file.content);
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      if (!patterns.some((pattern) => pattern.test(line))) continue;
      const key = `${file.relPath}:${index + 1}:${line.trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push({
        file: file.relPath,
        line: index + 1,
        snippet: line.trim(),
      });
      if (evidence.length >= maxItems) return evidence;
    }
  }

  return evidence;
}

function dedupeSuggestions(suggestions) {
  const merged = new Map();
  for (const suggestion of suggestions) {
    const current = merged.get(suggestion.id);
    if (!current) {
      merged.set(suggestion.id, suggestion);
      continue;
    }

    current.confidence = strongerConfidence(current.confidence, suggestion.confidence);
    current.triggers = [...new Set([...current.triggers, ...suggestion.triggers])];
    current.recommended_context = [...new Set([...current.recommended_context, ...suggestion.recommended_context])];
    current.recommended_steps = [...new Set([...current.recommended_steps, ...suggestion.recommended_steps])];
    current.safety_limits = [...new Set([...current.safety_limits, ...suggestion.safety_limits])];
    current.engine_exports = [...new Set([...current.engine_exports, ...suggestion.engine_exports])];
    current.source_evidence = [...current.source_evidence, ...suggestion.source_evidence].slice(0, 6);
  }

  return [...merged.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function strongerConfidence(a, b) {
  const rank = { low: 0, medium: 1, high: 2 };
  return rank[b] > rank[a] ? b : a;
}

function makeSuggestion({
  id,
  name,
  description,
  reason,
  confidence,
  triggers,
  recommended_context,
  recommended_steps,
  safety_limits,
  engine_exports,
  source_evidence,
}) {
  return {
    id,
    name,
    description,
    reason,
    confidence,
    triggers,
    recommended_context,
    recommended_steps,
    safety_limits,
    engine_exports,
    source_evidence,
  };
}

function buildPackageSignals(projectRoot) {
  const pkgPath = join(projectRoot, 'package.json');
  const pkg = existsSync(pkgPath) ? parseJson(pkgPath) : null;
  const scripts = isPlainObject(pkg?.scripts) ? pkg.scripts : {};
  const dependencies = {
    ...(isPlainObject(pkg?.dependencies) ? pkg.dependencies : {}),
    ...(isPlainObject(pkg?.devDependencies) ? pkg.devDependencies : {}),
  };

  return {
    pkg,
    scripts,
    dependencyNames: Object.keys(dependencies),
    hasPackageJson: Boolean(pkg),
    hasTestScript: typeof scripts.test === 'string',
    hasLintScript: typeof scripts.lint === 'string',
    hasTypecheckScript: typeof scripts.typecheck === 'string' || Object.values(scripts).some((value) => typeof value === 'string' && /\btsc\b/i.test(value)),
    scriptsText: Object.entries(scripts).map(([key, value]) => `${key}: ${value}`).join('\n'),
    dependencyText: Object.keys(dependencies).join('\n'),
  };
}

function collectStructureSignals(projectRoot) {
  const has = (relPath) => existsSync(join(projectRoot, relPath));
  return {
    migrations: has('migrations'),
    docs: has('docs'),
    workflows: has('.github/workflows'),
    dockerfile: has('Dockerfile'),
    compose: has('docker-compose.yml') || has('compose.yaml'),
    src: has('src'),
    tests: has('tests') || has('test') || has('specs'),
    apps: has('apps'),
    packages: has('packages'),
  };
}

function collectCorpus(projectRoot) {
  const files = collectFiles(projectRoot);
  return files.map((file) => {
    if (file.relPath.startsWith('.agentforge/imports/snapshots/')) {
      const parsed = parseSnapshotContent(file);
      return {
        ...file,
        sourcePath: parsed.sourcePath,
        content: parsed.content,
      };
    }
    return {
      ...file,
      sourcePath: file.relPath,
    };
  });
}

function buildSuggestions(projectRoot) {
  const corpus = collectCorpus(projectRoot);
  const packageSignals = buildPackageSignals(projectRoot);
  const structureSignals = collectStructureSignals(projectRoot);
  const normalizedCorpusText = normalizeText(corpus.map((file) => file.content).join('\n'));

  const suggestions = [];

  if (packageSignals.hasTestScript || structureSignals.tests) {
    suggestions.push(makeSuggestion({
      id: 'run-tests',
      name: 'Run Tests',
      description: 'Skill para executar e interpretar a suíte de testes do projeto.',
      reason: packageSignals.hasTestScript
        ? `package.json já expõe um script de teste (${packageSignals.scripts.test}).`
        : 'A estrutura do repositório já contém pastas de teste e isso sugere uma skill dedicada.',
      confidence: packageSignals.hasTestScript ? 'high' : 'medium',
      triggers: packageSignals.hasTestScript
        ? ['package.json scripts.test']
        : ['test/', 'tests/', 'specs/'],
      recommended_context: ['context/testing.md', 'references/commands.md'],
      recommended_steps: [
        'Mapear o comando de teste principal e seus aliases.',
        'Descrever quando rodar a suíte completa ou parcial.',
        'Registrar como interpretar falhas frequentes.',
      ],
      safety_limits: [
        'Não alterar arquivos de produção para validar testes.',
        'Usar diretórios temporários quando a suíte escrever artefatos.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/run-tests/SKILL.md'],
      source_evidence: findEvidence(corpus, [/npm\s+test/i, /\btest\b/i]),
    }));
  }

  if (packageSignals.hasLintScript) {
    suggestions.push(makeSuggestion({
      id: 'run-lint',
      name: 'Run Lint',
      description: 'Skill para executar e interpretar verificações de lint do projeto.',
      reason: `package.json contém o script \`${packageSignals.scripts.lint}\`.`,
      confidence: 'high',
      triggers: ['package.json scripts.lint'],
      recommended_context: ['context/coding-standards.md', 'references/commands.md'],
      recommended_steps: [
        'Explicar o comando de lint principal e suas variantes.',
        'Listar falhas comuns e como corrigi-las.',
        'Indicar quando o lint deve ser obrigatório.',
      ],
      safety_limits: [
        'Não aplicar autofix destrutivo sem confirmação.',
        'Evitar mudanças fora do escopo do lint reportado.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/run-lint/SKILL.md'],
      source_evidence: findEvidence(corpus, [/\blint\b/i]),
    }));
  }

  if (packageSignals.hasTypecheckScript) {
    suggestions.push(makeSuggestion({
      id: 'typecheck',
      name: 'Typecheck',
      description: 'Skill para executar verificações de tipos e interpretar erros de compilação.',
      reason: packageSignals.scripts.typecheck
        ? `package.json possui o script \`${packageSignals.scripts.typecheck}\`.`
        : 'Há sinais de TypeScript/tsc no projeto e isso sugere uma skill dedicada.',
      confidence: 'high',
      triggers: packageSignals.scripts.typecheck ? ['package.json scripts.typecheck'] : ['tsc', 'typescript'],
      recommended_context: ['context/coding-standards.md', 'context/testing.md'],
      recommended_steps: [
        'Documentar o comando de typecheck e os alvos principais.',
        'Mapear erros recorrentes e suas causas prováveis.',
        'Explicar quando rodar antes de publicar mudanças.',
      ],
      safety_limits: [
        'Não tocar em migrações nem em build artifacts para corrigir tipos.',
        'Manter as correções limitadas ao escopo do erro reportado.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/typecheck/SKILL.md'],
      source_evidence: findEvidence(corpus, [/\btypecheck\b/i, /\btsc\b/i, /\btypescript\b/i]),
    }));
  }

  if (structureSignals.migrations) {
    suggestions.push(makeSuggestion({
      id: 'database-migration',
      name: 'Database Migration',
      description: 'Skill para orientar migrações de banco e operações correlatas.',
      reason: 'A árvore do projeto contém uma pasta `migrations/`.',
      confidence: 'high',
      triggers: ['migrations/'],
      recommended_context: ['context/architecture.md', 'context/deployment.md', 'references/important-files.md'],
      recommended_steps: [
        'Listar o processo de criação e aplicação de migrações.',
        'Separar migrações seguras de migrações destrutivas.',
        'Registrar rollback e validação pós-migração.',
      ],
      safety_limits: [
        'Nunca executar migrações destrutivas automaticamente.',
        'Exigir confirmação humana para alterar dados existentes.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/database-migration/SKILL.md'],
      source_evidence: [{ file: 'migrations/', line: 1, snippet: 'directory exists' }],
    }));
  }

  if (structureSignals.docs || existsSync(join(projectRoot, 'README.md'))) {
    const evidence = findEvidence(corpus, [
      /\bdocumentation\b/i,
      /\bdocs?\b/i,
      /\bREADME\b/i,
      /\bupdate\b.*\bdocs?\b/i,
      /\bmaintain\b.*\bdocs?\b/i,
    ]);
    suggestions.push(makeSuggestion({
      id: 'update-docs',
      name: 'Update Docs',
      description: 'Skill para manter documentação do projeto atualizada e consistente.',
      reason: structureSignals.docs
        ? 'A pasta `docs/` existe e indica documentação viva.'
        : 'O `README.md` existe e é um ponto natural para manutenção de documentação.',
      confidence: structureSignals.docs ? 'high' : 'medium',
      triggers: structureSignals.docs ? ['docs/'] : ['README.md'],
      recommended_context: ['context/project-overview.md', 'references/important-files.md', 'references/external-docs.md'],
      recommended_steps: [
        'Separar visão geral, uso e manutenção em blocos curtos.',
        'Garantir links e exemplos coerentes com o repositório.',
        'Atualizar referências quando o fluxo de trabalho mudar.',
      ],
      safety_limits: [
        'Não reescrever documentação humana sem necessidade.',
        'Preservar exemplos e notas já aprovadas pela equipe.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/update-docs/SKILL.md'],
      source_evidence: evidence,
    }));
  }

  if (structureSignals.workflows) {
    const evidence = findEvidence(corpus, [/release/i, /\bci\b/i, /\bgithub actions\b/i, /\bworkflow\b/i, /\bdeploy\b/i]);
    suggestions.push(makeSuggestion({
      id: 'ci-diagnosis',
      name: 'CI Diagnosis',
      description: 'Skill para diagnosticar falhas e gargalos em pipelines de CI.',
      reason: 'A pasta `.github/workflows/` existe e indica automação contínua relevante.',
      confidence: 'high',
      triggers: ['.github/workflows/'],
      recommended_context: ['references/commands.md', 'context/testing.md', 'policies/safety.md'],
      recommended_steps: [
        'Mapear quais workflows existem e o que eles validam.',
        'Separar falhas de ambiente de falhas de código.',
        'Registrar passos de triagem e recuperação.',
      ],
      safety_limits: [
        'Não alterar segredos ou credenciais de CI automaticamente.',
        'Não disparar mudanças destrutivas em pipelines sem revisão.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/ci-diagnosis/SKILL.md'],
      source_evidence: evidence.length > 0 ? evidence : [{ file: '.github/workflows/', line: 1, snippet: 'directory exists' }],
    }));

    if (findEvidence(corpus, [/release/i, /\bpublish\b/i, /\brelease checklist\b/i]).length > 0) {
      suggestions.push(makeSuggestion({
        id: 'release-checklist',
        name: 'Release Checklist',
        description: 'Skill para preparar releases com etapas, validações e rollback.',
        reason: 'Os workflows e instruções encontradas sugerem atividade de release ou publicação.',
        confidence: 'medium',
        triggers: ['.github/workflows/', 'release-related instructions'],
        recommended_context: ['flows/review.md', 'policies/human-approval.md', 'context/deployment.md'],
        recommended_steps: [
          'Documentar checks mínimos antes do release.',
          'Listar aprovações e rollback.',
          'Indicar validações pós-deploy.',
        ],
        safety_limits: [
          'Não executar release automático sem aprovação explícita.',
          'Preservar etapas manuais obrigatórias quando existirem.',
        ],
        engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/release-checklist/SKILL.md'],
        source_evidence: findEvidence(corpus, [/release/i, /\bpublish\b/i]),
      }));
    }
  }

  if (structureSignals.dockerfile || structureSignals.compose) {
    suggestions.push(makeSuggestion({
      id: 'docker-compose-workflow',
      name: 'Docker Compose Workflow',
      description: 'Skill para operar imagens, compose files e ciclos de container local.',
      reason: structureSignals.compose
        ? 'O repositório contém arquivos de compose.'
        : 'O repositório contém um `Dockerfile`, o que sugere operações containerizadas recorrentes.',
      confidence: 'high',
      triggers: structureSignals.compose ? ['docker-compose.yml', 'compose.yaml'] : ['Dockerfile'],
      recommended_context: ['context/deployment.md', 'references/commands.md'],
      recommended_steps: [
        'Registrar comandos de build, up, down e logs.',
        'Separar fluxo local de fluxo de produção.',
        'Anotar dependências do ambiente containerizado.',
      ],
      safety_limits: [
        'Não remover volumes ou imagens sem confirmação humana.',
        'Não alterar portas, volumes ou variáveis sem registrar o impacto.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/docker-compose-workflow/SKILL.md'],
      source_evidence: findEvidence(corpus, [/docker/i, /\bcompose\b/i, /\bcontainer\b/i]),
    }));
  }

  if (normalizedCorpusText.includes('pull request') || /\bpr\b/.test(normalizedCorpusText) || normalizedCorpusText.includes('review changes')) {
    const evidence = findEvidence(corpus, [
      /pull request/i,
      /\bpr\b/i,
      /review changes/i,
      /code review/i,
      /approve/i,
    ]);
    suggestions.push(makeSuggestion({
      id: 'review-pr',
      name: 'Review PR',
      description: 'Skill para revisar pull requests e mudanças antes da integração.',
      reason: 'As instruções do repositório mencionam revisão de PRs ou mudanças.',
      confidence: evidence.length > 0 ? 'medium' : 'low',
      triggers: ['pull request', 'PR', 'review changes'],
      recommended_context: ['flows/review.md', 'context/coding-standards.md', 'policies/protected-files.md'],
      recommended_steps: [
        'Mapear o checklist de revisão humano.',
        'Separar segurança, regressão e clareza.',
        'Registrar como pedir mudanças e aprovações.',
      ],
      safety_limits: [
        'Não aprovar alterações automaticamente.',
        'Não marcar PRs como prontos sem revisão explícita.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/review-pr/SKILL.md'],
      source_evidence: evidence,
    }));
  }

  if (normalizedCorpusText.includes('review') || normalizedCorpusText.includes('coding standards')) {
    suggestions.push(makeSuggestion({
      id: 'review-changes',
      name: 'Review Changes',
      description: 'Skill para revisar mudanças com foco em risco, regressão e clareza.',
      reason: 'O contexto já contém padrões e instruções que beneficiam uma revisão estruturada.',
      confidence: structureSignals.src || structureSignals.tests ? 'medium' : 'low',
      triggers: ['review', 'coding standards', 'change review'],
      recommended_context: ['context/coding-standards.md', 'context/testing.md', 'flows/review.md'],
      recommended_steps: [
        'Listar riscos visíveis nas mudanças.',
        'Validar comportamento esperado e cobertura.',
        'Confirmar arquivos protegidos e escopo.',
      ],
      safety_limits: [
        'Não fazer alterações extensas durante uma tarefa de revisão.',
        'Priorizar leitura e apontamento de risco em vez de refatoração.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/review-changes/SKILL.md'],
      source_evidence: findEvidence(corpus, [/review/i, /coding standards/i, /regression/i]),
    }));
  }

  if (normalizedCorpusText.includes('openapi') || normalizedCorpusText.includes('swagger') || normalizedCorpusText.includes('contract')) {
    suggestions.push(makeSuggestion({
      id: 'api-contract-review',
      name: 'API Contract Review',
      description: 'Skill para revisar contratos de API, schemas e documentação associada.',
      reason: 'Há sinais de contratos ou documentação de API no repositório.',
      confidence: 'medium',
      triggers: ['OpenAPI', 'Swagger', 'contract'],
      recommended_context: ['context/architecture.md', 'references/external-docs.md', 'references/tools.md'],
      recommended_steps: [
        'Checar consistência entre endpoint, schema e exemplos.',
        'Mapear breaking changes e compatibilidade.',
        'Registrar regras de versionamento e validação.',
      ],
      safety_limits: [
        'Não alterar contratos sem alinhar impacto com consumidores.',
        'Não suprimir validações existentes durante a revisão.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/api-contract-review/SKILL.md'],
      source_evidence: findEvidence(corpus, [/openapi/i, /swagger/i, /contract/i, /schema/i]),
    }));
  }

  if (normalizedCorpusText.includes('security') || normalizedCorpusText.includes('safety') || normalizedCorpusText.includes('secret') || normalizedCorpusText.includes('token')) {
    suggestions.push(makeSuggestion({
      id: 'security-review',
      name: 'Security Review',
      description: 'Skill para revisar riscos, segredos, permissões e guardrails.',
      reason: 'O repositório já expõe conteúdo de segurança, aprovações ou guardrails.',
      confidence: 'medium',
      triggers: ['security', 'safety', 'secret', 'token'],
      recommended_context: ['policies/safety.md', 'policies/protected-files.md', 'policies/human-approval.md'],
      recommended_steps: [
        'Listar segredos, permissões e arquivos protegidos relevantes.',
        'Separar riscos de escrita, leitura e exposição.',
        'Descrever quando parar e pedir aprovação humana.',
      ],
      safety_limits: [
        'Nunca expor segredos ou tokens no relatório.',
        'Nunca alterar políticas de segurança automaticamente.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/security-review/SKILL.md'],
      source_evidence: findEvidence(corpus, [/security/i, /safety/i, /secret/i, /token/i, /protected files/i]),
    }));
  }

  if (packageSignals.dependencyNames.some((name) => /^(react|react-dom|vue|next|svelte|solid-js|@angular)/i.test(name)) || normalizeText(corpus.map((file) => file.relPath).join('\n')).includes('component')) {
    suggestions.push(makeSuggestion({
      id: 'frontend-component-review',
      name: 'Frontend Component Review',
      description: 'Skill para revisar componentes frontend, consistência visual e acessibilidade.',
      reason: 'Há dependências ou estrutura que apontam para trabalho de frontend/componentes.',
      confidence: 'medium',
      triggers: ['React', 'Vue', 'Next', 'components'],
      recommended_context: ['context/coding-standards.md', 'context/architecture.md', 'flows/review.md'],
      recommended_steps: [
        'Separar estrutura, estilo e comportamento.',
        'Revisar acessibilidade e consistência visual.',
        'Confirmar integração com testes existentes.',
      ],
      safety_limits: [
        'Não alterar design tokens globais sem avaliação.',
        'Evitar mudanças amplas de UI fora do componente alvo.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/frontend-component-review/SKILL.md'],
      source_evidence: findEvidence(corpus, [/\bcomponent\b/i, /\btsx\b/i, /\bjsx\b/i, /\breact\b/i, /\bvue\b/i, /\bnext\b/i]),
    }));
  }

  if (packageSignals.dependencyNames.some((name) => /^(express|fastify|hono|nestjs|koa|restify|openapi)/i.test(name)) || normalizedCorpusText.includes('endpoint') || normalizedCorpusText.includes('router')) {
    suggestions.push(makeSuggestion({
      id: 'backend-endpoint-review',
      name: 'Backend Endpoint Review',
      description: 'Skill para revisar endpoints, rotas e contratos de backend.',
      reason: 'Há sinais de backend orientado a endpoints ou rotas.',
      confidence: 'medium',
      triggers: ['endpoint', 'router', 'express', 'fastify', 'openapi'],
      recommended_context: ['context/architecture.md', 'context/coding-standards.md', 'references/commands.md'],
      recommended_steps: [
        'Mapear rota, handler e validações.',
        'Verificar compatibilidade do contrato com consumidores.',
        'Confirmar tratamento de erro e logs.',
      ],
      safety_limits: [
        'Não expor dados sensíveis em exemplos ou logs.',
        'Não alterar contratos de entrada/saída sem destacar o impacto.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/backend-endpoint-review/SKILL.md'],
      source_evidence: findEvidence(corpus, [/\bendpoint\b/i, /\brouter\b/i, /\broute\b/i, /\bhandler\b/i, /\bapi\b/i]),
    }));
  }

  if (packageSignals.hasPackageJson && (existsSync(join(projectRoot, 'package-lock.json')) || existsSync(join(projectRoot, 'pnpm-lock.yaml')) || existsSync(join(projectRoot, 'yarn.lock')))) {
    suggestions.push(makeSuggestion({
      id: 'dependency-update',
      name: 'Dependency Update',
      description: 'Skill para avaliar atualizações de dependências e seus impactos.',
      reason: 'O projeto usa gerenciador de dependências com lockfile, o que torna a atualização recorrente relevante.',
      confidence: 'low',
      triggers: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'],
      recommended_context: ['references/important-files.md', 'context/testing.md', 'policies/safety.md'],
      recommended_steps: [
        'Listar dependências críticas e riscos de upgrade.',
        'Separar major, minor e patch updates.',
        'Registrar validações necessárias após a atualização.',
      ],
      safety_limits: [
        'Não atualizar dependências automaticamente sem revisar breaking changes.',
        'Não alterar a árvore de lockfiles além do necessário.',
      ],
      engine_exports: [...EXPORT_SURFACES, '.agentforge/skills/dependency-update/SKILL.md'],
      source_evidence: findEvidence(corpus, [/package-lock/i, /pnpm-lock/i, /yarn.lock/i, /\bdependency\b/i, /\bupdate\b/i]),
    }));
  }

  return dedupeSuggestions(suggestions);
}

function shouldWriteSuggestionFile(projectRoot, manifest, relPath, { force = false } = {}) {
  const absPath = join(projectRoot, relPath);
  if (!existsSync(absPath)) return 'create';
  if (force) return 'write';

  const hash = manifest[relPath];
  if (!hash) return 'skip';
  return fileStatus(projectRoot, relPath, hash) === 'intact' ? 'write' : 'skip';
}

function renderSkillSuggestionsReport({ projectRoot, suggestions, writtenPaths, skippedPaths, sourceCount }) {
  const lines = [];
  lines.push('# AgentForge Skill Suggestions');
  lines.push('');
  lines.push('## Resumo executivo');
  lines.push('');
  lines.push(`- Projeto: ${basename(projectRoot)}`);
  lines.push(`- Fontes analisadas: ${sourceCount}`);
  lines.push(`- Sugestões encontradas: ${suggestions.length}`);
  lines.push(`- Arquivos YAML gerados: ${writtenPaths.length}`);
  lines.push(`- Sugestões preservadas por edição manual: ${skippedPaths.length}`);
  lines.push('- Skills finais não foram criadas; esta etapa gera apenas sugestões.');
  lines.push('');

  lines.push('## Sugestões');
  lines.push('');
  if (suggestions.length === 0) {
    lines.push('- Nenhuma skill nova foi sugerida com confiança suficiente.');
  } else {
    for (const suggestion of suggestions) {
      lines.push(`### ${suggestion.name} (${suggestion.id})`);
      lines.push('');
      lines.push(`- Confidence: ${suggestion.confidence}`);
      lines.push(`- Description: ${suggestion.description}`);
      lines.push(`- Reason: ${suggestion.reason}`);
      lines.push(`- Triggers: ${suggestion.triggers.join(', ') || '—'}`);
      lines.push(`- Recommended context: ${suggestion.recommended_context.join(', ') || '—'}`);
      lines.push(`- Recommended steps: ${suggestion.recommended_steps.join(' | ') || '—'}`);
      lines.push(`- Safety limits: ${suggestion.safety_limits.join(' | ') || '—'}`);
      lines.push(`- Engine exports: ${suggestion.engine_exports.join(', ') || '—'}`);
      lines.push(`- Source evidence: ${suggestion.source_evidence.map((item) => `${item.file}:${item.line}`).join(', ') || '—'}`);
      lines.push('');
    }
  }

  lines.push('## Próximos comandos sugeridos');
  lines.push('');
  lines.push('- `agentforge refactor-context`');
  lines.push('- `agentforge validate`');
  lines.push('- `agentforge audit-context`');
  lines.push('');

  lines.push('## Regra');
  lines.push('');
  lines.push('- As sugestões são separadas de skills reais em `.agentforge/skill-suggestions/`.');
  lines.push('- Para converter uma sugestão em skill de fato, faça isso em um passo posterior e revisável.');
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function suggestionToYaml(suggestion) {
  return `${YAML.stringify(suggestion).trim()}\n`;
}

function updateStateAndManifest(projectRoot, manifest, writtenPaths, suggestions) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const nextState = {
    ...state,
    last_skill_suggestions_at: new Date().toISOString(),
    suggested_skills: suggestions.map((suggestion) => ({
      id: suggestion.id,
      name: suggestion.name,
      confidence: suggestion.confidence,
      file_path: suggestion.file_path ?? null,
      status: suggestion.status,
      reason: suggestion.reason,
    })),
    created_files: [...new Set([...createdFiles, ...writtenPaths])],
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, [...writtenPaths, rel(projectRoot, statePath)]),
  });

  return nextState;
}

function renderHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: Suggest Skills\n`));
  console.log(`  Uso: npx ${PRODUCT.command} suggest-skills [--force]\n`);
  console.log('  Analisa imports, contexto, package files e estrutura do repositório para sugerir skills de projeto.');
  console.log('  Gera `.agentforge/reports/skill-suggestions.md` e arquivos YAML em `.agentforge/skill-suggestions/`.\n');
}

export function runSkillSuggestions(projectRoot, { force = false } = {}) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const manifest = loadManifest(projectRoot);
  const suggestions = buildSuggestions(projectRoot);
  const writer = new Writer(projectRoot);
  const writtenPaths = [];
  const skippedPaths = [];

  for (const suggestion of suggestions) {
    const relPath = join(SUGGESTION_FILES_DIR, `${suggestion.id}.yaml`);
    const decision = shouldWriteSuggestionFile(projectRoot, manifest, relPath, { force });
    suggestion.file_path = relPath;
    suggestion.status = decision === 'skip' ? 'skipped' : decision === 'create' ? 'created' : 'updated';

    if (decision === 'skip') {
      skippedPaths.push(relPath);
      continue;
    }

    const content = suggestionToYaml(suggestion);
    writer.writeGeneratedFile(join(projectRoot, relPath), content, { force: true });
    writtenPaths.push(relPath);
  }

  const report = renderSkillSuggestionsReport({
    projectRoot,
    suggestions,
    writtenPaths,
    skippedPaths,
    sourceCount: collectCorpus(projectRoot).length,
  });
  const reportPath = join(projectRoot, REPORT_REL_PATH);
  writer.writeGeneratedFile(reportPath, report, { force: true });
  writtenPaths.push(REPORT_REL_PATH);

  writer.saveCreatedFiles();
  const state = updateStateAndManifest(projectRoot, manifest, writtenPaths, suggestions);

  return {
    ok: true,
    reportPath: REPORT_REL_PATH,
    suggestions,
    writtenPaths,
    skippedPaths,
    state,
    report,
  };
}

export default async function suggestSkills(args = []) {
  const { default: chalk } = await import('chalk');
  const help = args.includes('--help') || args.includes('-h');
  const force = args.includes('--force');

  if (help) {
    renderHelp(chalk);
    return 0;
  }

  const projectRoot = process.cwd();
  const result = runSkillSuggestions(projectRoot, { force });
  if (!result.ok) {
    console.log(chalk.yellow(`  ${result.errors[0]}`));
    return 1;
  }

  console.log(chalk.hex('#ffa203')(`  Sugestões geradas em ${result.reportPath}`));
  console.log(chalk.gray(`  Sugestões: ${result.suggestions.length}`));
  console.log(chalk.gray(`  Criadas/atualizadas: ${result.writtenPaths.length}`));
  console.log(chalk.gray(`  Preservadas: ${result.skippedPaths.length}`));
  return 0;
}
