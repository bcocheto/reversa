import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import YAML from 'yaml';

import { buildManifest, fileStatus, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { PRODUCT } from '../product.js';
import { runContextAudit } from './audit-context.js';
import { repairPhaseState } from './phase-engine.js';

const TARGET_DEFINITIONS = [
  {
    path: '.agentforge/context/project-overview.md',
    title: 'Project Overview',
    intro: 'Conhecimento durável sobre o produto, objetivo, público e estado atual.',
    patterns: {
      title: [/\bproject\b/i, /\boverview\b/i, /\bsummary\b/i, /\bobjetiv/i, /\bgoal\b/i],
      body: [/\bproject\b/i, /\boverview\b/i, /\bobjective\b/i, /\bsummary\b/i, /\bstack\b/i, /\busers?\b/i],
    },
    categoryBoosts: ['project-overview'],
  },
  {
    path: '.agentforge/context/architecture.md',
    title: 'Architecture',
    intro: 'Mapa do sistema, fronteiras e fluxo principal.',
    patterns: {
      title: [/\barchitecture\b/i, /\barch\b/i],
      body: [/\barchitecture\b/i, /\bcomponent(s)?\b/i, /\blayer(s)?\b/i, /\bflow\b/i, /\bdiagram\b/i, /\bsequence\b/i],
    },
    categoryBoosts: ['architecture'],
  },
  {
    path: '.agentforge/context/domain.md',
    title: 'Domain',
    intro: 'Conhecimento durável sobre o domínio do produto, vocabulário e regras estáveis.',
    patterns: {
      title: [/\bdomain\b/i, /\bdomínio\b/i],
      body: [/\bdomain\b/i, /\bdomínio\b/i, /\bbusiness rule(s)?\b/i, /\bvocabulary\b/i, /\bterm(s)?\b/i, /\bglossary\b/i],
    },
    categoryBoosts: ['project-overview', 'glossary'],
  },
  {
    path: '.agentforge/context/content-flow.md',
    title: 'Content Flow',
    intro: 'Fluxo de conteúdo, etapas de transformação e circulação de informação ou artefatos.',
    patterns: {
      title: [/\bcontent[- ]flow\b/i, /\bflow\b/i, /\bpipeline\b/i],
      body: [/\bcontent\b/i, /\bflow\b/i, /\bstage(s)?\b/i, /\bstep(s)?\b/i, /\bhand[- ]?off\b/i, /\bdraft\b/i, /\breview\b/i, /\bpublish\b/i],
    },
    categoryBoosts: ['workflows'],
  },
  {
    path: '.agentforge/context/conventions.md',
    title: 'Conventions',
    intro: 'Convenções de estrutura, nomes, organização e escolhas recorrentes.',
    patterns: {
      title: [/\bconvention(s)?\b/i, /\bnaming\b/i],
      body: [/\bconvention(s)?\b/i, /\bnaming\b/i, /\bstructure\b/i, /\bfolder(s)?\b/i, /\bdirectory\b/i, /\blayout\b/i],
    },
    categoryBoosts: ['coding-conventions'],
  },
  {
    path: '.agentforge/context/coding-standards.md',
    title: 'Coding Standards',
    intro: 'Padrões de código, qualidade e revisão.',
    patterns: {
      title: [/\bcoding\b/i, /\bstandard(s)?\b/i, /\bstyle\b/i],
      body: [/\blint\b/i, /\btypecheck\b/i, /\bformat(ting)?\b/i, /\bstyle\b/i, /\breview\b/i, /\btypescript\b/i, /\beslint\b/i],
    },
    categoryBoosts: ['coding-conventions'],
  },
  {
    path: '.agentforge/context/testing.md',
    title: 'Testing',
    intro: 'Estratégia de testes, validações e comandos relacionados.',
    patterns: {
      title: [/\btest(s|ing)?\b/i, /\bqa\b/i, /\bvalidation\b/i],
      body: [/\btest(s|ing)?\b/i, /\bpytest\b/i, /\bvitest\b/i, /\bjest\b/i, /\bcoverage\b/i, /\bassert/i, /\bnpm\s+test\b/i],
    },
    categoryBoosts: ['testing-instructions'],
  },
  {
    path: '.agentforge/context/worker.md',
    title: 'Worker',
    intro: 'Instruções para a persona executora, responsabilidades e critérios de entrega.',
    patterns: {
      title: [/\bworker\b/i, /\bexecutor\b/i, /\bimplementer\b/i],
      body: [/\bworker\b/i, /\bexecutor\b/i, /\bresponsibilit(y|ies)\b/i, /\bhand[- ]?off\b/i, /\bimplement\b/i, /\bdeliver\b/i, /\bdone\b/i],
    },
    categoryBoosts: ['workflows'],
  },
  {
    path: '.agentforge/context/deployment.md',
    title: 'Deployment',
    intro: 'Notas de deploy, release, rollback e operação.',
    patterns: {
      title: [/\bdeploy(ment)?\b/i, /\brelease\b/i, /\bproduction\b/i],
      body: [/\bdeploy(ment)?\b/i, /\brelease\b/i, /\bproduction\b/i, /\brollback\b/i, /\bdocker\s+compose\b/i, /\bpublish\b/i],
    },
    categoryBoosts: ['deployment-instructions'],
  },
  {
    path: '.agentforge/context/glossary.md',
    title: 'Glossary',
    intro: 'Termos recorrentes, siglas e definições úteis para o projeto.',
    patterns: {
      title: [/\bglossary\b/i, /\bglossário\b/i],
      body: [/\bglossary\b/i, /\bglossário\b/i, /\bterm(s)?\b/i, /\bdefinition(s)?\b/i, /\bacronym(s)?\b/i, /\babbreviation(s)?\b/i],
    },
    categoryBoosts: ['glossary'],
  },
  {
    path: '.agentforge/context/unclassified.md',
    title: 'Unclassified',
    intro: 'Trechos importados que ainda não tiveram confiança suficiente para uma classificação melhor.',
    patterns: {
      title: [],
      body: [],
    },
    categoryBoosts: [],
  },
  {
    path: '.agentforge/policies/protected-files.md',
    title: 'Protected Files',
    intro: 'Caminhos e arquivos que não devem ser modificados automaticamente.',
    patterns: {
      title: [/\bprotected\b/i, /\bfiles\b/i],
      body: [/\bnever modify\b/i, /\bdo not modify\b/i, /\bdo not touch\b/i, /\bread[- ]only\b/i, /\bprotected\b/i, /\bnever overwrite\b/i],
    },
    categoryBoosts: ['protected-files', 'policies'],
  },
  {
    path: '.agentforge/policies/human-approval.md',
    title: 'Human Approval',
    intro: 'Situações em que a mudança precisa de confirmação humana.',
    patterns: {
      title: [/\bapproval\b/i, /\bhuman\b/i, /\bconfirm\b/i],
      body: [/\bask before\b/i, /\brequest approval\b/i, /\bconfirm before\b/i, /\bhuman approval\b/i, /\bpermission\b/i],
    },
    categoryBoosts: ['policies'],
  },
  {
    path: '.agentforge/policies/safety.md',
    title: 'Safety',
    intro: 'Regras de segurança, risco e cuidado ao alterar o projeto.',
    patterns: {
      title: [/\bsafety\b/i, /\bguardrail(s)?\b/i],
      body: [/\bsafety\b/i, /\brisk\b/i, /\bsecret(s)?\b/i, /\btoken(s)?\b/i, /\bdanger\b/i, /\bdestructive\b/i, /\bguardrail(s)?\b/i],
    },
    categoryBoosts: ['policies'],
  },
  {
    path: '.agentforge/flows/feature-development.md',
    title: 'Feature Development',
    intro: 'Fluxo para entregar novas capacidades com escopo claro.',
    patterns: {
      title: [/\bfeature\b/i, /\bdevelopment\b/i],
      body: [/\bfeature\b/i, /\bdevelop\b/i, /\bimplement\b/i, /\bdiscovery\b/i, /\bdesign\b/i, /\breview\b/i, /\bdelivery\b/i],
    },
    categoryBoosts: ['workflows'],
  },
  {
    path: '.agentforge/flows/bugfix.md',
    title: 'Bugfix',
    intro: 'Fluxo para corrigir problemas reproduzíveis com escopo mínimo.',
    patterns: {
      title: [/\bbug\b/i, /\bfix\b/i],
      body: [/\bbug\b/i, /\bfix\b/i, /\breproduc/i, /\bregression\b/i, /\bminimal scope\b/i, /\binvestigate\b/i],
    },
    categoryBoosts: ['workflows'],
  },
  {
    path: '.agentforge/flows/refactor.md',
    title: 'Refactor',
    intro: 'Fluxo para melhorar estrutura sem alterar o comportamento esperado.',
    patterns: {
      title: [/\brefactor\b/i],
      body: [/\brefactor\b/i, /\brestructur/i, /\bsimplif/i, /\bwithout changing\b/i, /\bpreserv(e|ing)\s+behavior\b/i],
    },
    categoryBoosts: ['workflows'],
  },
  {
    path: '.agentforge/flows/review.md',
    title: 'Review',
    intro: 'Fluxo para revisar mudanças com foco em risco, regressão e clareza.',
    patterns: {
      title: [/\breview\b/i],
      body: [/\breview\b/i, /\bapprove\b/i, /\bpull request\b/i, /\bregression\b/i, /\bclarity\b/i, /\brisk\b/i],
    },
    categoryBoosts: ['workflows'],
  },
  {
    path: '.agentforge/references/commands.md',
    title: 'Commands',
    intro: 'Comandos úteis, exemplos de uso e atalhos operacionais.',
    patterns: {
      title: [/\bcommand(s)?\b/i, /\bcli\b/i, /\busage\b/i],
      body: [/\bnpx\b/i, /\bnpm\s+run\b/i, /\bnpm\s+test\b/i, /\bpnpm\s+test\b/i, /\byarn\s+test\b/i, /\bpytest\b/i, /\buv\s+run\b/i, /\bdocker\s+compose\b/i, /\b--[a-z-]+\b/i],
    },
    categoryBoosts: ['references', 'testing-instructions', 'deployment-instructions', 'tool-mcp-instructions'],
  },
  {
    path: '.agentforge/references/important-files.md',
    title: 'Important Files',
    intro: 'Arquivos e diretórios que costumam ser consultados com frequência.',
    patterns: {
      title: [/\bimportant\b/i, /\bfiles\b/i],
      body: [/\.[a-z0-9]+/i, /[A-Za-z0-9._/-]+\.(md|yaml|yml|json|toml|ts|js|py|sh)\b/i, /\bAGENTS\.md\b/i, /\bCLAUDE\.md\b/i, /\bharness\//i, /\bcontext\//i, /\breferences\//i, /\bpolicies\//i, /\bflows\//i],
    },
    categoryBoosts: ['references'],
  },
  {
    path: '.agentforge/references/domain.md',
    title: 'Domain Reference',
    intro: 'Referências operacionais sobre o domínio, termos e atalhos recorrentes.',
    patterns: {
      title: [/\bdomain\b/i, /\breference\b/i],
      body: [/\breference\b/i, /\blink\b/i, /\bterm(s)?\b/i, /\bexample(s)?\b/i, /\bglossary\b/i, /\bcheat sheet\b/i],
    },
    categoryBoosts: ['references', 'glossary'],
  },
  {
    path: '.agentforge/references/external-docs.md',
    title: 'External Docs',
    intro: 'Links externos e documentação fora do repositório.',
    patterns: {
      title: [/\bexternal\b/i, /\bdocs?\b/i, /\bdocumentation\b/i],
      body: [/https?:\/\//i, /\bdocs?\b/i, /\bdocumentation\b/i, /\bofficial\b/i, /\breference\b/i, /\bwebsite\b/i, /\blink\b/i],
    },
    categoryBoosts: ['references'],
  },
  {
    path: '.agentforge/references/tools.md',
    title: 'Tools',
    intro: 'Ferramentas, MCPs, CLIs e instruções operacionais recorrentes.',
    patterns: {
      title: [/\btool(s)?\b/i, /\bmcp\b/i],
      body: [/\bmcp\b/i, /\bcontext7\b/i, /\btool(s)?\b/i, /\bconnector(s)?\b/i, /\bplugin(s)?\b/i, /\bcli\b/i, /\buse the tool\b/i, /\bautomation\b/i],
    },
    categoryBoosts: ['references', 'tool-mcp-instructions'],
  },
];

const REFACTOR_CONTEXT_JSON_REL_PATH = '.agentforge/reports/refactor-context.json';
const CONTEXT_CURATION_INPUT_REL_PATH = '.agentforge/reports/context-curation-input.md';

const CATEGORY_BOOSTS = {
  'project-overview': {
    '.agentforge/context/project-overview.md': 4,
    '.agentforge/context/domain.md': 2,
  },
  architecture: {
    '.agentforge/context/architecture.md': 4,
  },
  domain: {
    '.agentforge/context/domain.md': 4,
    '.agentforge/references/domain.md': 2,
  },
  'content-flow': {
    '.agentforge/context/content-flow.md': 4,
  },
  'coding-conventions': {
    '.agentforge/context/conventions.md': 3,
    '.agentforge/context/coding-standards.md': 3,
  },
  'testing-instructions': {
    '.agentforge/context/testing.md': 4,
    '.agentforge/references/commands.md': 2,
  },
  'deployment-instructions': {
    '.agentforge/context/deployment.md': 4,
    '.agentforge/references/commands.md': 2,
  },
  policies: {
    '.agentforge/policies/protected-files.md': 2,
    '.agentforge/policies/human-approval.md': 2,
    '.agentforge/policies/safety.md': 2,
  },
  'protected-files': {
    '.agentforge/policies/protected-files.md': 5,
  },
  workflows: {
    '.agentforge/flows/feature-development.md': 1,
    '.agentforge/flows/bugfix.md': 1,
    '.agentforge/flows/refactor.md': 1,
    '.agentforge/flows/review.md': 1,
    '.agentforge/context/content-flow.md': 1,
  },
  references: {
    '.agentforge/references/commands.md': 2,
    '.agentforge/references/important-files.md': 2,
    '.agentforge/references/external-docs.md': 2,
    '.agentforge/references/tools.md': 2,
    '.agentforge/references/domain.md': 2,
  },
  glossary: {
    '.agentforge/context/glossary.md': 5,
    '.agentforge/context/domain.md': 1,
    '.agentforge/references/domain.md': 1,
  },
  'tool-mcp-instructions': {
    '.agentforge/references/tools.md': 5,
    '.agentforge/references/commands.md': 1,
  },
  'agent-roles': {
    '.agentforge/context/worker.md': 2,
  },
};

const SOURCE_PATH_BOOSTS = [
  {
    pattern: /^\.agents\/architecture\.md$/i,
    boosts: {
      '.agentforge/context/architecture.md': 10,
    },
  },
  {
    pattern: /^\.agents\/domain\.md$/i,
    boosts: {
      '.agentforge/context/domain.md': 10,
      '.agentforge/references/domain.md': 4,
    },
  },
  {
    pattern: /^\.agents\/content[-_]flow\.md$/i,
    boosts: {
      '.agentforge/context/content-flow.md': 10,
      '.agentforge/flows/feature-development.md': 2,
      '.agentforge/flows/refactor.md': 1,
    },
  },
  {
    pattern: /^\.agents\/testing\.md$/i,
    boosts: {
      '.agentforge/context/testing.md': 10,
      '.agentforge/references/commands.md': 2,
    },
  },
  {
    pattern: /^\.agents\/security\.md$/i,
    boosts: {
      '.agentforge/policies/safety.md': 10,
    },
  },
  {
    pattern: /^\.agents\/worker\.md$/i,
    boosts: {
      '.agentforge/context/worker.md': 10,
      '.agentforge/flows/bugfix.md': 3,
      '.agentforge/flows/refactor.md': 3,
    },
  },
  {
    pattern: /^\.agents\/search\.md$/i,
    boosts: {
      '.agentforge/references/tools.md': 10,
      '.agentforge/references/domain.md': 2,
    },
  },
  {
    pattern: /^\.agents\/references\/domain\.md$/i,
    boosts: {
      '.agentforge/references/domain.md': 10,
      '.agentforge/context/domain.md': 4,
    },
  },
  {
    pattern: /^\.agents\/references\/.*\.md$/i,
    boosts: {
      '.agentforge/references/domain.md': 2,
      '.agentforge/references/tools.md': 4,
    },
  },
  {
    pattern: /^\.agents\/skills\/.*\/skill\.md$/i,
    boosts: {
      '.agentforge/references/tools.md': 1,
      '.agentforge/context/testing.md': 1,
    },
  },
];

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function isParagraphHeading(line) {
  return /^(#{1,6})\s+(.*)$/.test(line);
}

function getSectionBody(section) {
  const lines = String(section.text ?? '').split(/\r?\n/);
  if (section.hasHeading && lines.length > 0 && isParagraphHeading(lines[0])) {
    return lines.slice(1).join('\n').trim();
  }
  return String(section.text ?? '').trim();
}

function countMatches(text, patterns, weight = 1) {
  let count = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) count += weight;
  }
  return count;
}

function countCommandLikeLines(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  return lines.filter((line) => /(\bnpm\b|\bpnpm\b|\byarn\b|\bnpx\b|\bpytest\b|\buv\b|\bdocker\s+compose\b|\bagentforge\b)/i.test(line)).length;
}

function scoreTarget(snippet, target, source) {
  const title = normalizeText(snippet.sectionTitle ?? '');
  const body = normalizeText(snippet.body ?? '');
  const combined = normalizeText([snippet.sectionTitle, snippet.body, source.relPath, source.displayPath].join(' '));
  const sourcePath = String(source.sourcePath ?? source.relPath ?? '');
  let score = 0;

  score += countMatches(title, target.patterns.title, 3);
  score += countMatches(body, target.patterns.title, 1);
  score += countMatches(body, target.patterns.body, 2);

  for (const category of source.categories ?? []) {
    const boosts = CATEGORY_BOOSTS[category.id];
    if (boosts && boosts[target.path]) {
      score += boosts[target.path];
    }
  }

  if (target.path === '.agentforge/references/commands.md') {
    score += countCommandLikeLines(snippet.body) >= 2 ? 3 : 0;
  }

  if (target.path === '.agentforge/context/testing.md' && /\btest(s|ing)?\b/i.test(combined)) {
    score += 2;
  }

  if (target.path === '.agentforge/context/coding-standards.md' && /\blint\b|\btypecheck\b|\bformat\b/i.test(combined)) {
    score += 2;
  }

  if (target.path === '.agentforge/context/project-overview.md' && /\bproject\b|\bobjective\b|\bsummary\b/i.test(combined)) {
    score += 2;
  }

  for (const hint of SOURCE_PATH_BOOSTS) {
    if (!hint.pattern.test(sourcePath)) continue;
    if (hint.boosts[target.path]) {
      score += hint.boosts[target.path];
    }
  }

  return score;
}

function classifySnippet(snippet, source) {
  const scores = TARGET_DEFINITIONS
    .filter((target) => target.path !== '.agentforge/context/unclassified.md')
    .map((target) => ({
      target,
      score: scoreTarget(snippet, target, source),
    }))
    .sort((a, b) => b.score - a.score || a.target.path.localeCompare(b.target.path));

  const best = scores[0] ?? { target: null, score: 0 };
  const second = scores[1] ?? { target: null, score: 0 };
  const body = normalizeText(snippet.body);
  const title = normalizeText(snippet.sectionTitle);
  const commandLike = countCommandLikeLines(snippet.body) >= 1 || /\bnpm\s+test\b/i.test(snippet.body);
  const sourcePath = String(source.sourcePath ?? source.relPath ?? '');

  if (!best.target || best.score < 2 || best.score === second.score) {
    return {
      targetPath: '.agentforge/context/unclassified.md',
      targetTitle: 'Unclassified',
      confidence: best.score,
      reason: best.target
        ? `Baixa confiança para classificar como ${best.target.title.toLowerCase()} (score ${best.score}, runner-up ${second.score}).`
        : 'Nenhuma regra de classificação encontrou correspondência suficiente.',
    };
  }

  if (best.target.path === '.agentforge/context/testing.md' && !sourcePath.endsWith('/testing.md') && !/\btest(s|ing)?\b/i.test(title + ' ' + body) && commandLike) {
    return {
      targetPath: '.agentforge/references/commands.md',
      targetTitle: 'Commands',
      confidence: 2,
      reason: 'Seção parece uma lista de comandos, não apenas instruções de teste.',
    };
  }

  return {
    targetPath: best.target.path,
    targetTitle: best.target.title,
    confidence: best.score,
    reason: `Correspondeu melhor a ${best.target.title.toLowerCase()} (score ${best.score}).`,
  };
}

function buildSnippet(source, section) {
  const body = getSectionBody(section);
  if (!body) return null;

  const title = section.title?.trim() ?? '';
  return {
    sourcePath: source.displayPath,
    originalSourcePath: source.sourcePath,
    sourceKind: source.kind,
    sourceKindLabel: source.kind,
    sectionTitle: title,
    sectionStartLine: section.startLine ?? 1,
    sectionEndLine: (section.startLine ?? 1) + Math.max(0, (section.lineCount ?? 1) - 1),
    body,
  };
}

function collectSnippets(analysis) {
  const snippets = [];
  for (const source of analysis.sources ?? []) {
    const sections = Array.isArray(source.sections) && source.sections.length > 0
      ? source.sections
      : [{
        title: null,
        startLine: 1,
        lineCount: source.lineCount ?? String(source.content ?? '').split(/\r?\n/).length,
        text: String(source.content ?? ''),
        hasHeading: false,
      }];

    for (const section of sections) {
      const snippet = buildSnippet(source, section);
      if (!snippet) continue;
      const classification = classifySnippet(snippet, source);
      snippets.push({
        ...snippet,
        ...classification,
      });
    }
  }

  return snippets;
}

function dedupeSnippets(snippets) {
  const byTarget = new Map();
  for (const snippet of snippets) {
    const key = normalizeText([snippet.sectionTitle, snippet.body].join('\n'));
    const targetBucket = byTarget.get(snippet.targetPath) ?? new Map();
    const existing = targetBucket.get(key);
    const sourceLabels = [snippet.sourcePath];
    if (snippet.originalSourcePath && snippet.originalSourcePath !== snippet.sourcePath) {
      sourceLabels.push(snippet.originalSourcePath);
    }

    if (existing) {
      for (const sourceLabel of sourceLabels) {
        existing.sourceLabels.add(sourceLabel);
      }
      existing.sources.add(snippet.sourcePath);
      continue;
    }

    targetBucket.set(key, {
      ...snippet,
      sourceLabels: new Set(sourceLabels),
      sources: new Set([snippet.sourcePath]),
    });
    byTarget.set(snippet.targetPath, targetBucket);
  }

  return byTarget;
}

function renderMarkdownBlock(snippet) {
  const lines = [];
  const sourceComments = [...snippet.sourceLabels].sort((a, b) => a.localeCompare(b));

  for (const source of sourceComments) {
    lines.push(`<!-- Source: ${source} -->`);
  }

  if (snippet.sectionTitle) {
    lines.push(`## ${snippet.sectionTitle}`);
  } else {
    lines.push('## Trecho importado');
  }
  lines.push('');
  lines.push(snippet.body.trim());
  lines.push('');
  return lines.join('\n');
}

function buildTargetDocument(target, snippets, analysis) {
  const lines = [
    `# ${target.title}`,
    '',
    target.intro,
    '',
  ];
  const snippetRanges = [];

  for (const snippet of snippets) {
    const blockLines = renderMarkdownBlock(snippet).trimEnd().split(/\r?\n/);
    const startLine = lines.length + 1;
    lines.push(...blockLines);
    const endLine = startLine + blockLines.length - 1;
    snippetRanges.push({
      id: snippet.id,
      source_path: snippet.sourcePath,
      source_start_line: snippet.sectionStartLine,
      source_end_line: snippet.sectionEndLine,
      target_path: target.path.replace(/^\.agentforge\//, ''),
      target_start_line: startLine,
      target_end_line: endLine,
      confidence: snippet.confidence,
      reason: snippet.reason,
      curation_status: 'needs-review',
      title: snippet.sectionTitle || target.title,
    });
    lines.push('');
  }

  lines.push('## Observações');
  lines.push('');
  lines.push(`- Extraído por ` + '`agentforge refactor-context`' + ` a partir de ${snippets.length} trecho(s) classificado(s).`);
  lines.push(`- Score de classificação: ${snippetScore(snippets)}/100`);
  lines.push('');

  if (analysis.sources.length === 0) {
    lines.push('- Nenhuma fonte de entrada foi encontrada.');
  }

  return {
    content: `${lines.join('\n').trimEnd()}\n`,
    snippetRanges,
  };
}

function flattenSnippetRecords(targetDocuments) {
  const records = [];
  for (const [, value] of targetDocuments) {
    for (const snippet of value.snippetRanges) {
      records.push(snippet);
    }
  }
  return records.sort((a, b) => {
    if (a.target_path === b.target_path) {
      return a.target_start_line - b.target_start_line || a.id.localeCompare(b.id);
    }
    return a.target_path.localeCompare(b.target_path) || a.id.localeCompare(b.id);
  });
}

function renderTargetDocument(target, snippetMap, analysis) {
  const snippets = [...(snippetMap.get(target.path) ?? new Map()).values()]
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.sectionStartLine - b.sectionStartLine);

  if (snippets.length === 0) return null;

  const lines = [
    `# ${target.title}`,
    '',
    target.intro,
    '',
  ];

  for (const snippet of snippets) {
    lines.push(renderMarkdownBlock(snippet).trimEnd());
    lines.push('');
  }

  lines.push('## Observações');
  lines.push('');
  lines.push(`- Extraído por ` + '`agentforge refactor-context`' + ` a partir de ${snippets.length} trecho(s) classificado(s).`);
  lines.push(`- Score de classificação: ${snippetScore(snippets)}/100`);
  lines.push('');

  if (analysis.sources.length === 0) {
    lines.push('- Nenhuma fonte de entrada foi encontrada.');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function snippetScore(snippets) {
  if (snippets.length === 0) return 100;
  const avgConfidence = snippets.reduce((sum, snippet) => sum + (snippet.confidence ?? 0), 0) / snippets.length;
  return Math.max(0, Math.min(100, Math.round(avgConfidence * 10)));
}

function normalizeInternalContextPath(path) {
  return String(path ?? '').replace(/^\.agentforge\//, '');
}

const FLOW_PURPOSES = {
  'feature-development': 'Deliver a new capability with discovery, design, implementation, and review.',
  bugfix: 'Corrigir um problema reproduzível com escopo mínimo.',
  refactor: 'Melhorar a estrutura sem alterar o comportamento esperado.',
  review: 'Revisar mudanças antes da integração.',
  release: 'Promover uma entrega segura e rastreável.',
};

function uniqueByKey(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function renderContextIndexDoc(analysis, writtenPaths, existingContextIndex, { stateFlows = [], taskModes = new Set() } = {}) {
  const currentPaths = new Set(writtenPaths.map(normalizeInternalContextPath));
  currentPaths.add('harness/context-map.yaml');
  const existingItems = Array.isArray(existingContextIndex?.items) ? existingContextIndex.items : [];
  for (const item of existingItems) {
    if (typeof item?.path === 'string') {
      currentPaths.add(normalizeInternalContextPath(item.path));
    }
  }

  const keepExistingPaths = (paths = []) => paths.filter((path) => currentPaths.has(path));

  const existingFlows = Array.isArray(existingContextIndex?.flows) ? existingContextIndex.flows : [];
  const flowCandidates = [...existingFlows];
  for (const flowId of stateFlows) {
    const normalizedId = normalizeText(flowId);
    const path = `flows/${normalizedId}.md`;
    if (!flowCandidates.some((entry) => normalizeText(entry?.id) === normalizedId || normalizeInternalContextPath(entry?.path) === path)) {
      flowCandidates.push({
        id: normalizedId,
        path,
        purpose: FLOW_PURPOSES[normalizedId] ?? `Fluxo operacional ${normalizedId}.`,
      });
    }
  }

  const flows = uniqueByKey(
    flowCandidates
      .filter((entry) => isPlainObject(entry))
      .map((entry) => {
        const id = normalizeString(entry.id) || normalizeInternalContextPath(entry.path).replace(/^flows\//, '').replace(/\.md$/, '');
        return {
          id,
          path: normalizeInternalContextPath(entry.path),
          purpose: normalizeString(entry.purpose) || (FLOW_PURPOSES[id] ?? `Fluxo operacional ${id}.`),
        };
      })
      .filter((entry) => entry.path.startsWith('flows/')),
    (entry) => entry.id,
  );

  const preservedTaskContexts = {};
  const existingTaskContexts = isPlainObject(existingContextIndex?.task_contexts) ? existingContextIndex.task_contexts : {};
  for (const [modeName, group] of Object.entries(existingTaskContexts)) {
    if (taskModes.size > 0 && !taskModes.has(modeName)) continue;
    preservedTaskContexts[modeName] = group;
  }

  const existingItemsByPath = new Map(
    existingItems
      .filter((item) => isPlainObject(item) && typeof item.path === 'string')
      .map((item) => [normalizeInternalContextPath(item.path), item]),
  );

  const items = [
    {
      id: 'context-map',
      path: 'harness/context-map.yaml',
      purpose: 'Mapa granular de contexto com arquivos, ranges e estado de curadoria.',
    },
    ...existingItemsByPath.values(),
    ...TARGET_DEFINITIONS
      .filter((target) => target.path !== '.agentforge/context/unclassified.md')
      .filter((target) => currentPaths.has(normalizeInternalContextPath(target.path)))
      .map((target) => ({
        id: normalizeInternalContextPath(target.path).replace(/\.md$/, '').replace(/\//g, '-'),
        path: normalizeInternalContextPath(target.path),
        purpose: target.intro,
      })),
  ];

  const uniqueItems = uniqueByKey(
    items.filter((item) => currentPaths.has(normalizeInternalContextPath(item.path))),
    (item) => normalizeInternalContextPath(item.path),
  );

  const doc = {
    version: 2,
    always_load: [
      'harness/router.md',
      'harness/context-index.yaml',
      'harness/context-map.yaml',
      'harness/task-modes.yaml',
      'harness/load-order.yaml',
      'harness/engine-map.yaml',
    ],
    items: uniqueItems,
    skills: [
      {
        id: 'run-tests',
        path: 'skills/run-tests/SKILL.md',
        purpose: 'Execute and interpret the suite when validating generated changes.',
      },
      {
        id: 'review-changes',
        path: 'skills/review-changes/SKILL.md',
        purpose: 'Review changes with focus on safety, regression, and clarity.',
      },
      {
        id: 'create-implementation-plan',
        path: 'skills/create-implementation-plan/SKILL.md',
        purpose: 'Turn a request into a small, sequenced implementation plan.',
      },
    ],
    flows,
    task_contexts: preservedTaskContexts,
  };

  return `${YAML.stringify(doc).trim()}\n`;
}

function renderPlanReport({ projectRoot, analysis, plan, mode }) {
  const lines = [];
  lines.push('# AgentForge Context Refactor Plan');
  lines.push('');
  lines.push('## Resumo executivo');
  lines.push('');
  lines.push(`- Projeto: ${basename(projectRoot)}`);
  lines.push(`- Modo: ${mode === 'apply' ? 'apply' : 'dry-run'}`);
  lines.push(`- Score de segregação: ${plan.score}/100`);
  lines.push(`- Fontes analisadas: ${analysis.sources.length}`);
  lines.push(`- Trechos classificados: ${plan.classifiedCount}`);
  lines.push(`- Trechos não classificados: ${plan.unclassifiedSnippets.length}`);
  lines.push(`- Arquivos a criar: ${plan.createPaths.length}`);
  lines.push(`- Arquivos a atualizar: ${plan.updatePaths.length}`);
  lines.push(`- Arquivos preservados por modificação manual: ${plan.skippedPaths.length}`);
  lines.push('');

  lines.push('## Fontes analisadas');
  lines.push('');
  if (analysis.sources.length === 0) {
    lines.push('- Nenhuma fonte encontrada. O relatório continua informativo.');
  } else {
    for (const source of analysis.sources) {
      lines.push(`- \`${source.displayPath}\` (${source.kind}, ${source.lineCount} linhas)`);
    }
  }
  lines.push('');

  lines.push('## Arquivos que seriam criados');
  lines.push('');
  if (plan.createPaths.length === 0) {
    lines.push('- Nenhum arquivo novo seria criado.');
  } else {
    for (const relPath of plan.createPaths) {
      lines.push(`- \`${relPath}\``);
    }
  }
  lines.push('');

  lines.push('## Arquivos que seriam atualizados');
  lines.push('');
  if (plan.updatePaths.length === 0) {
    lines.push('- Nenhum arquivo existente seria atualizado.');
  } else {
    for (const relPath of plan.updatePaths) {
      lines.push(`- \`${relPath}\``);
    }
  }
  lines.push('');

  lines.push('## Trechos classificados por categoria');
  lines.push('');
  if (plan.classifiedGroups.length === 0) {
    lines.push('- Nenhum trecho foi classificado com confiança suficiente.');
  } else {
    for (const group of plan.classifiedGroups) {
      lines.push(`### \`${group.path}\``);
      lines.push('');
      for (const item of group.items) {
        lines.push(`- \`${item.sourcePath}:${item.sectionStartLine}-${item.sectionEndLine}\``);
        if (item.sectionTitle) {
          lines.push(`  - Seção: ${item.sectionTitle}`);
        }
        lines.push(`  - Confiança: ${item.confidence}`);
        lines.push(`  - Exemplo: ${truncate(item.body.replace(/\s+/g, ' '), 180)}`);
      }
      lines.push('');
    }
  }

  lines.push('## Trechos não classificados');
  lines.push('');
  if (plan.unclassifiedSnippets.length === 0) {
    lines.push('- Nenhum trecho ficou sem classificação.');
  } else {
    for (const item of plan.unclassifiedSnippets) {
      lines.push(`- \`${item.sourcePath}:${item.sectionStartLine}-${item.sectionEndLine}\``);
      if (item.sectionTitle) {
        lines.push(`  - Seção: ${item.sectionTitle}`);
      }
      lines.push(`  - Motivo: ${item.reason}`);
      lines.push(`  - Exemplo: ${truncate(item.body.replace(/\s+/g, ' '), 180)}`);
    }
  }
  lines.push('');

  lines.push('## Riscos');
  lines.push('');
  const riskLines = [];
  if (plan.skippedPaths.length > 0) {
    riskLines.push('Alguns arquivos canônicos já tinham modificações humanas e foram preservados.');
  }
  if (plan.unclassifiedSnippets.length > 0) {
    riskLines.push('Parte do conteúdo ainda não tem confiança suficiente para separação definitiva.');
  }
  if (analysis.sources.length === 0) {
    riskLines.push('Sem fontes de entrada, a refatoração não cria estrutura útil.');
  }
  if (riskLines.length === 0) {
    riskLines.push('Nenhum risco adicional detectado pelas heurísticas atuais.');
  }
  for (const line of riskLines) {
    lines.push(`- ${line}`);
  }
  lines.push('');

  lines.push('## Instrução');
  lines.push('');
  lines.push('Para aplicar a segregação nos arquivos canônicos, execute:');
  lines.push('');
  lines.push('```bash');
  lines.push('npx agentforge refactor-context --apply');
  lines.push('```');
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function truncate(text, limit) {
  const normalized = String(text ?? '').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

function shouldWriteManagedFile(projectRoot, manifest, relPath, { force = false } = {}) {
  const absPath = join(projectRoot, relPath);
  if (!existsSync(absPath)) return 'create';
  if (force) return 'write';

  const hash = manifest[relPath];
  if (!hash) return 'skip';
  return fileStatus(projectRoot, relPath, hash) === 'intact' ? 'write' : 'skip';
}

function writeManagedFile(writer, projectRoot, manifest, relPath, content, options = {}) {
  const decision = shouldWriteManagedFile(projectRoot, manifest, relPath, options);
  if (decision === 'skip') return 'skipped';

  writer.writeGeneratedFile(join(projectRoot, relPath), content, { force: true });
  return decision === 'create' ? 'created' : 'updated';
}

function buildRefactorPlan(analysis, snippetsByTarget) {
  const plan = {
    createPaths: [],
    updatePaths: [],
    skippedPaths: [],
    classifiedGroups: [],
    unclassifiedSnippets: [],
    classifiedCount: 0,
    score: 100,
  };

  const targetMaps = new Map();
  for (const target of TARGET_DEFINITIONS) {
    const snippets = [...(snippetsByTarget.get(target.path) ?? new Map()).values()]
      .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.sectionStartLine - b.sectionStartLine);
    if (snippets.length === 0) continue;

    const targetMap = new Map();
    for (const snippet of snippets) {
      const key = normalizeText([snippet.sectionTitle, snippet.body].join('\n'));
      targetMap.set(key, snippet);
    }
    targetMaps.set(target.path, targetMap);
  }

  for (const target of TARGET_DEFINITIONS.filter((entry) => entry.path !== '.agentforge/context/unclassified.md')) {
    const relPath = target.path;
    const snippets = [...(targetMaps.get(relPath) ?? new Map()).values()];
    if (snippets.length === 0) continue;
    plan.classifiedCount += snippets.length;
    plan.classifiedGroups.push({
      path: relPath,
      items: snippets,
    });
  }

  const unclassified = [...(snippetsByTarget.get('.agentforge/context/unclassified.md') ?? new Map()).values()]
    .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.sectionStartLine - b.sectionStartLine);
  plan.unclassifiedSnippets = unclassified;

  const totalSnippets = plan.classifiedCount + unclassified.length;
  plan.score = totalSnippets === 0 ? 100 : Math.round((plan.classifiedCount / totalSnippets) * 100);

  return { plan, targetMaps };
}

function loadTaskModeNames(projectRoot) {
  const taskModesPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'task-modes.yaml');
  if (!existsSync(taskModesPath)) return new Set();

  try {
    const parsed = YAML.parse(readFileSync(taskModesPath, 'utf8'));
    if (!isPlainObject(parsed)) return new Set();
    return new Set(Object.keys(parsed).filter((key) => normalizeString(key)));
  } catch {
    return new Set();
  }
}

function buildTargetDocuments(projectRoot, analysis, targetMaps) {
  const documents = new Map();
  for (const target of TARGET_DEFINITIONS) {
    const snippets = [...(targetMaps.get(target.path) ?? new Map()).values()]
      .sort((a, b) => a.sourcePath.localeCompare(b.sourcePath) || a.sectionStartLine - b.sectionStartLine);
    if (snippets.length === 0) continue;
    documents.set(target.path, buildTargetDocument(target, snippets, analysis));
  }
  return documents;
}

function buildRefactorReports({
  projectRoot,
  analysis,
  plan,
  targetMaps,
  safeWrites,
  existingContextIndex,
  stateFlows = [],
}) {
  const targetDocuments = buildTargetDocuments(projectRoot, analysis, targetMaps);
  const snippets = [
    ...flattenSnippetRecords(targetDocuments),
    ...plan.unclassifiedSnippets.map((item, index) => ({
      id: `unclassified-${String(index + 1).padStart(3, '0')}`,
      source_path: item.sourcePath,
      source_start_line: item.sectionStartLine,
      source_end_line: item.sectionEndLine,
      target_path: 'context/unclassified.md',
      target_start_line: item.sectionStartLine,
      target_end_line: item.sectionEndLine,
      confidence: item.confidence,
      reason: item.reason,
      curation_status: 'needs-review',
      title: item.sectionTitle || 'Unclassified',
    })),
  ].sort((a, b) => a.target_path.localeCompare(b.target_path) || a.source_path.localeCompare(b.source_path) || a.source_start_line - b.source_start_line);
  const taskModes = loadTaskModeNames(projectRoot);

  const reportJson = {
    score: plan.score,
    sources_analyzed: analysis.sources.length,
    classified_snippets: plan.classifiedCount,
    unclassified_snippets: plan.unclassifiedSnippets.length,
    created_files: safeWrites.created,
    updated_files: safeWrites.updated,
    preserved_files: safeWrites.skipped,
    snippets,
  };

  const curationInput = renderContextCurationInput({
    projectRoot,
    analysis,
    plan,
    safeWrites,
    snippets,
    targetDocuments,
  });

  const contextIndex = existingContextIndex
    ? renderContextIndexDoc(analysis, safeWrites.writes, existingContextIndex, { stateFlows, taskModes })
    : null;

  return {
    targetDocuments,
    reportJson,
    curationInput,
    contextIndex,
  };
}

function renderContextCurationInput({
  projectRoot,
  analysis,
  plan,
  safeWrites,
  snippets,
  targetDocuments,
}) {
  const lines = [];
  lines.push('# Context Curation Input');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Score: ${plan.score}/100`);
  lines.push(`- Sources analyzed: ${analysis.sources.length}`);
  lines.push(`- Classified snippets: ${plan.classifiedCount}`);
  lines.push(`- Unclassified snippets: ${plan.unclassifiedSnippets.length}`);
  lines.push(`- Created files: ${safeWrites.created.length}`);
  lines.push(`- Updated files: ${safeWrites.updated.length}`);
  lines.push(`- Preserved files: ${safeWrites.skipped.length}`);
  lines.push('');

  lines.push('## Needs review');
  lines.push('');
  lines.push('| Snippet | Source | Lines | Suggested target | Confidence | Reason |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  const reviewSnippets = snippets.filter((item) => item.curation_status === 'needs-review');
  if (reviewSnippets.length === 0) {
    lines.push('| — | — | — | — | — | Nenhum trecho requer revisão. |');
  } else {
    for (const item of reviewSnippets) {
      lines.push(
        `| \`${item.id}\` | \`${item.source_path}\` | ${item.source_start_line}-${item.source_end_line} | \`${item.target_path}\` | ${item.confidence} | ${escapeMarkdownCell(item.reason)} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Classified by destination');
  lines.push('');
  for (const [targetPath, doc] of targetDocuments.entries()) {
    lines.push(`### \`${targetPath.replace(/^\.agentforge\//, '')}\``);
    lines.push('');
    for (const snippet of doc.snippetRanges) {
      lines.push(`- \`${snippet.id}\` (\`${snippet.source_path}:${snippet.source_start_line}-${snippet.source_end_line}\`)`);
    }
    lines.push('');
  }

  lines.push('## Unclassified');
  lines.push('');
  if (plan.unclassifiedSnippets.length === 0) {
    lines.push('- Nenhum trecho ficou sem classificação.');
  } else {
    for (const item of plan.unclassifiedSnippets) {
      lines.push(`- \`${item.sourcePath}:${item.sectionStartLine}-${item.sectionEndLine}\` - ${item.reason}`);
    }
  }
  lines.push('');

  lines.push('## Low confidence');
  lines.push('');
  const lowConfidence = snippets.filter((item) => item.confidence <= 3 || item.target_path === 'context/unclassified.md');
  if (lowConfidence.length === 0) {
    lines.push('- Nenhum trecho de baixa confiança foi identificado.');
  } else {
    for (const item of lowConfidence) {
      lines.push(`- \`${item.id}\` -> \`${item.target_path}\` (${item.confidence})`);
    }
  }
  lines.push('');

  lines.push('## Conflicts');
  lines.push('');
  const duplicateGroups = analysis.duplicateGroups ?? [];
  if (duplicateGroups.length === 0) {
    lines.push('- Nenhum conflito ou duplicação provável foi identificado.');
  } else {
    for (const group of duplicateGroups.slice(0, 10)) {
      lines.push(`- ${group.kind ?? 'duplicate'}: ${(group.files ?? []).map((file) => `\`${file}\``).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Preserved human files');
  lines.push('');
  if (safeWrites.skipped.length === 0) {
    lines.push('- Nenhum arquivo humano precisou ser preservado.');
  } else {
    for (const path of safeWrites.skipped) {
      lines.push(`- \`${path}\``);
    }
  }
  lines.push('');

  lines.push('## Recommendations');
  lines.push('');
  lines.push('- Use o agente `context-curator` para revisar este relatório.');
  lines.push('- Promova apenas itens com evidência consistente e ranges válidos.');
  lines.push('- Atualize `.agentforge/harness/context-map.yaml` após a curadoria semântica.');
  lines.push('- Reclassifique como `unclassified` qualquer trecho com baixa confiança ou conflito.');
  lines.push('');

  lines.push('## Suggested next step');
  lines.push('');
  lines.push('Use the `context-curator` agent to review this report and update `harness/context-map.yaml`.');
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function escapeMarkdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function summarizeTargetFiles(targetMaps, projectRoot, manifest, force = false) {
  const writes = [];
  const skipped = [];
  const created = [];
  const updated = [];

  for (const target of TARGET_DEFINITIONS) {
    const snippets = targetMaps.get(target.path);
    if (!snippets || snippets.size === 0) continue;

    const relPath = target.path;
    const status = shouldWriteManagedFile(projectRoot, manifest, relPath, { force });
    if (status === 'skip') {
      skipped.push(relPath);
      continue;
    }

    if (status === 'create') created.push(relPath);
    else updated.push(relPath);
    writes.push(relPath);
  }

  return { writes, skipped, created, updated };
}

function readExistingContextIndex(projectRoot) {
  const contextIndexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
  if (!existsSync(contextIndexPath)) return null;
  try {
    return YAML.parse(readFileSync(contextIndexPath, 'utf8'));
  } catch {
    return null;
  }
}

function updateStateAndManifest(projectRoot, manifest, writtenPaths, plan, mode) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const timestamp = new Date().toISOString();
  const nextState = {
    ...state,
    last_refactor_context_at: timestamp,
    refactor_context_score: plan.score,
    refactor_context: {
      mode,
      score: plan.score,
      classified_count: plan.classifiedCount,
      unclassified_count: plan.unclassifiedSnippets.length,
      created: plan.createPaths,
      updated: plan.updatePaths,
      skipped: plan.skippedPaths,
    },
    created_files: [...new Set([...createdFiles, ...writtenPaths])],
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');

  const touchedRelPaths = [...new Set([...writtenPaths, rel(projectRoot, statePath)])];
  const mergedManifest = {
    ...manifest,
    ...buildManifest(projectRoot, touchedRelPaths),
  };
  saveManifest(projectRoot, mergedManifest);

  return { statePath, nextState };
}

function rel(projectRoot, absPath) {
  return absPath.replace(projectRoot + '/', '').replace(projectRoot + '\\', '');
}

export async function runRefactorContext(projectRoot, { apply = false, force = false } = {}) {
  const audit = runContextAudit(projectRoot);
  if (!audit.ok) {
    return audit;
  }

  const manifest = loadManifest(projectRoot);
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : {};
  const snippets = collectSnippets(audit.analysis);
  const deduped = dedupeSnippets(snippets);
  const { plan, targetMaps } = buildRefactorPlan(audit.analysis, deduped);
  const safeWrites = summarizeTargetFiles(targetMaps, projectRoot, manifest, force);
  const existingContextIndex = readExistingContextIndex(projectRoot);
  const reports = buildRefactorReports({
    projectRoot,
    analysis: audit.analysis,
    plan,
    targetMaps,
    safeWrites,
    existingContextIndex,
    stateFlows: Array.isArray(state.flows) ? state.flows : [],
  });

  plan.createPaths = safeWrites.created;
  plan.updatePaths = safeWrites.updated;
  plan.skippedPaths = safeWrites.skipped;

  const report = renderPlanReport({ projectRoot, analysis: audit.analysis, plan, mode: apply ? 'apply' : 'dry-run' });
  return {
    ok: true,
    analysis: audit.analysis,
    plan,
    report,
    targetMaps,
    snippets,
    safeWrites,
    targetDocuments: reports.targetDocuments,
    refactorContextJson: reports.reportJson,
    contextCurationInput: reports.curationInput,
    contextIndex: reports.contextIndex,
  };
}

export async function applyRefactorContext(projectRoot, result, { force = false } = {}) {
  const manifest = loadManifest(projectRoot);
  const writer = new Writer(projectRoot);
  const writtenPaths = [];
  const createdPaths = [];
  const updatedPaths = [];
  const skippedPaths = [];

  for (const target of TARGET_DEFINITIONS) {
    const snippets = result.targetMaps.get(target.path);
    if (!snippets || snippets.size === 0) continue;

    const relPath = target.path;
    const decision = shouldWriteManagedFile(projectRoot, manifest, relPath, { force });
    if (decision === 'skip') {
      skippedPaths.push(relPath);
      continue;
    }

    const content = renderTargetDocument(target, result.targetMaps, result.analysis);
    if (!content) continue;

    const outcome = writeManagedFile(writer, projectRoot, manifest, relPath, content, { force });
    if (outcome === 'skipped') {
      skippedPaths.push(relPath);
      continue;
    }

    writtenPaths.push(relPath);
    if (outcome === 'created') createdPaths.push(relPath);
    else updatedPaths.push(relPath);
  }

  const contextIndexPath = join(projectRoot, PRODUCT.internalDir, 'harness', 'context-index.yaml');
  if (result.contextIndex !== null) {
    const relPath = rel(projectRoot, contextIndexPath);
    const decision = shouldWriteManagedFile(projectRoot, manifest, relPath, { force });
    if (decision !== 'skip') {
      const outcome = writeManagedFile(writer, projectRoot, manifest, relPath, result.contextIndex, { force });
      if (outcome !== 'skipped') {
        writtenPaths.push(relPath);
        if (outcome === 'created') createdPaths.push(relPath);
        else updatedPaths.push(relPath);
      } else {
        skippedPaths.push(relPath);
      }
    } else {
      skippedPaths.push(relPath);
    }
  }

  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'refactor-plan.md');
  mkdirSync(join(projectRoot, PRODUCT.internalDir, 'reports'), { recursive: true });
  writeFileSync(reportPath, result.report, 'utf8');
  writtenPaths.push(rel(projectRoot, reportPath));
  if (!existsSync(reportPath) || !manifest[rel(projectRoot, reportPath)]) {
    createdPaths.push(rel(projectRoot, reportPath));
  } else if (fileStatus(projectRoot, rel(projectRoot, reportPath), manifest[rel(projectRoot, reportPath)]) === 'intact') {
    updatedPaths.push(rel(projectRoot, reportPath));
  }

  const refactorContextJsonPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'refactor-context.json');
  writeFileSync(refactorContextJsonPath, `${JSON.stringify(result.refactorContextJson, null, 2)}\n`, 'utf8');
  writtenPaths.push(rel(projectRoot, refactorContextJsonPath));

  const curationInputPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-curation-input.md');
  writeFileSync(curationInputPath, result.contextCurationInput, 'utf8');
  writtenPaths.push(rel(projectRoot, curationInputPath));

  const stateAndManifest = updateStateAndManifest(projectRoot, manifest, [...new Set([...writtenPaths])], result.plan, 'apply');
  repairPhaseState(projectRoot);

  return {
    reportPath: rel(projectRoot, reportPath),
    refactorContextJsonPath: rel(projectRoot, refactorContextJsonPath),
    curationInputPath: rel(projectRoot, curationInputPath),
    writtenPaths: [...new Set(writtenPaths)],
    createdPaths: [...new Set(createdPaths)],
    updatedPaths: [...new Set(updatedPaths)],
    skippedPaths: [...new Set(skippedPaths)],
    state: stateAndManifest.nextState,
  };
}

export default async function refactorContext(args = []) {
  const { default: chalk } = await import('chalk');
  const help = args.includes('--help') || args.includes('-h');
  const curationInputOnly = args.includes('--curation-input');
  const apply = args.includes('--apply') && !curationInputOnly;
  const force = args.includes('--force');

  if (help) {
    console.log(chalk.bold(`\n  ${PRODUCT.name}: Refactor Context\n`));
    console.log(`  Uso: npx ${PRODUCT.command} refactor-context [--apply] [--force] [--curation-input]\n`);
    console.log('  Prepara candidatos, ranges e relatórios para curadoria semântica pelo agente `context-curator`.');
    console.log('  Sem --apply, gera os relatórios de preparação e não altera o contexto canônico.\n');
    return 0;
  }

  const projectRoot = process.cwd();
  const result = await runRefactorContext(projectRoot, { apply, force });
  if (!result.ok) {
    console.log(chalk.yellow(`  ${result.errors[0]}`));
    return 1;
  }

  if (!apply) {
    const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'refactor-plan.md');
    mkdirSync(join(projectRoot, PRODUCT.internalDir, 'reports'), { recursive: true });
    writeFileSync(reportPath, result.report, 'utf8');
    writeFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'refactor-context.json'), `${JSON.stringify(result.refactorContextJson, null, 2)}\n`, 'utf8');
    writeFileSync(join(projectRoot, PRODUCT.internalDir, 'reports', 'context-curation-input.md'), result.contextCurationInput, 'utf8');
    console.log(chalk.hex('#ffa203')(`  Plano gerado em ${rel(projectRoot, reportPath)}`));
    console.log(chalk.gray(`  Score: ${result.plan.score}/100`));
    return 0;
  }

  const applyResult = await applyRefactorContext(projectRoot, result, { force });
  console.log(chalk.hex('#ffa203')(`  Refatoração aplicada em ${applyResult.reportPath}`));
  console.log(chalk.gray(`  Criados: ${applyResult.createdPaths.length}`));
  console.log(chalk.gray(`  Atualizados: ${applyResult.updatedPaths.length}`));
  console.log(chalk.gray(`  Preservados: ${applyResult.skippedPaths.length}`));
  return 0;
}
