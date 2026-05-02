import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, extname, join, relative, sep } from 'path';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';

const SNAPSHOT_ROOT = join(PRODUCT.internalDir, 'imports', 'snapshots');
const CONTEXT_ROOT = join(PRODUCT.internalDir, 'context');
const FALLBACK_ENTRYPOINTS = ['AGENTS.md', 'CLAUDE.md'];
const ALWAYS_SCAN_PATHS = [
  '.cursor/rules',
  '.github/copilot-instructions.md',
  CONTEXT_ROOT,
  join(PRODUCT.internalDir, 'policies'),
  join(PRODUCT.internalDir, 'flows'),
  join(PRODUCT.internalDir, 'references'),
  join(PRODUCT.internalDir, 'skills'),
  join(PRODUCT.internalDir, 'memory'),
  join(PRODUCT.internalDir, 'agents'),
];

const CATEGORY_RULES = [
  {
    id: 'project-overview',
    label: 'project overview',
    patterns: [
      /\bproject overview\b/i,
      /\boverview\b/i,
      /\bobjective\b/i,
      /\bstack\b/i,
      /\bproject name\b/i,
      /\bsummary\b/i,
    ],
    target: '.agentforge/context/',
  },
  {
    id: 'architecture',
    label: 'architecture',
    patterns: [
      /\barchitecture\b/i,
      /\bc4\b/i,
      /\bcomponent(s)?\b/i,
      /\bcontainer(s)?\b/i,
      /\bdiagram\b/i,
      /\bsequence\b/i,
      /\bflow\b/i,
    ],
    target: '.agentforge/context/',
  },
  {
    id: 'coding-conventions',
    label: 'coding conventions',
    patterns: [
      /\bconventions?\b/i,
      /\bstyle guide\b/i,
      /\bnaming\b/i,
      /\bformatting\b/i,
      /\blint\b/i,
      /\btypecheck\b/i,
    ],
    target: '.agentforge/context/',
  },
  {
    id: 'testing-instructions',
    label: 'testing instructions',
    patterns: [
      /\btests?\b/i,
      /\bpytest\b/i,
      /\bvitest\b/i,
      /\bjest\b/i,
      /\bplaywright\b/i,
      /\bcoverage\b/i,
      /\btypecheck\b/i,
    ],
    target: '.agentforge/skills/run-tests/',
  },
  {
    id: 'deployment-instructions',
    label: 'deployment instructions',
    patterns: [
      /\bdeploy(ment)?\b/i,
      /\brelease\b/i,
      /\bproduction\b/i,
      /\bdocker compose\b/i,
      /\bpublish\b/i,
      /\bbuild\b/i,
    ],
    target: '.agentforge/flows/',
  },
  {
    id: 'policies',
    label: 'policies',
    patterns: [
      /\bpolic(y|ies)\b/i,
      /\bapproval\b/i,
      /\bpermission(s)?\b/i,
      /\bsafety\b/i,
      /\bguardrail(s)?\b/i,
    ],
    target: '.agentforge/policies/',
  },
  {
    id: 'protected-files',
    label: 'protected files',
    patterns: [
      /\bprotected files?\b/i,
      /\bnever modify\b/i,
      /\bdo not modify\b/i,
      /\bdo not touch\b/i,
      /\bread[- ]only\b/i,
      /\bnever overwrite\b/i,
    ],
    target: '.agentforge/policies/',
  },
  {
    id: 'workflows',
    label: 'workflows',
    patterns: [
      /\bworkflow(s)?\b/i,
      /\bflow(s)?\b/i,
      /\bphase(s)?\b/i,
      /\bsteps?\b/i,
      /\bprocess\b/i,
    ],
    target: '.agentforge/flows/',
  },
  {
    id: 'agent-roles',
    label: 'agent roles',
    patterns: [
      /\bagent(s)?\b/i,
      /\borchestrator\b/i,
      /\breviewer\b/i,
      /\barchitect\b/i,
      /\bresponsibilit(y|ies)\b/i,
      /\brole(s)?\b/i,
    ],
    target: '.agentforge/agents/',
  },
  {
    id: 'tool-mcp-instructions',
    label: 'tool/MCP instructions',
    patterns: [
      /\bmcp\b/i,
      /\bcontext7\b/i,
      /\btool(s)?\b/i,
      /\bcommand(s)?\b/i,
      /\buse the tool\b/i,
      /\buse .*? mcp\b/i,
    ],
    target: '.agentforge/harness/',
  },
  {
    id: 'references',
    label: 'references',
    patterns: [
      /\breference(s)?\b/i,
      /\bimportant files\b/i,
      /\bexternal docs?\b/i,
      /\blinks?\b/i,
      /\bcommands?\b/i,
    ],
    target: '.agentforge/references/',
  },
  {
    id: 'glossary',
    label: 'glossary',
    patterns: [
      /\bglossary\b/i,
      /\bterms?\b/i,
      /\bdefinitions?\b/i,
    ],
    target: '.agentforge/memory/',
  },
];

const SKILL_COMMAND_RULES = [
  { command: 'npm test', skillId: 'run-tests', patterns: [/\bnpm\s+test\b/i] },
  { command: 'npm run test', skillId: 'run-tests', patterns: [/\bnpm\s+run\s+test\b/i] },
  { command: 'npm run lint', skillId: 'quality-checks', patterns: [/\bnpm\s+run\s+lint\b/i] },
  { command: 'npm run typecheck', skillId: 'quality-checks', patterns: [/\bnpm\s+run\s+typecheck\b/i] },
  { command: 'pnpm test', skillId: 'run-tests', patterns: [/\bpnpm\s+test\b/i] },
  { command: 'yarn test', skillId: 'run-tests', patterns: [/\byarn\s+test\b/i] },
  { command: 'pytest', skillId: 'run-tests', patterns: [/\bpytest\b/i] },
  { command: 'uv run', skillId: 'python-runtime', patterns: [/\buv\s+run\b/i] },
  { command: 'docker compose', skillId: 'docker-compose', patterns: [/\bdocker\s+compose\b/i] },
  {
    command: 'migration command',
    skillId: 'migrations',
    patterns: [
      /\bprisma\s+migrate\b/i,
      /\btypeorm\s+migration\b/i,
      /\bknex\s+migrate\b/i,
      /\bsequelize\s+db:migrate\b/i,
      /\balembic\s+upgrade\b/i,
      /\bflyway\b/i,
      /\bliquibase\b/i,
    ],
  },
];

const CONFLICT_RULES = [
  {
    id: 'tests',
    title: 'always run tests vs do not run tests unless asked',
    positive: [
      /\balways\s+(run|execute)\s+tests?\b/i,
      /\bmust\s+(run|execute)\s+tests?\b/i,
      /\bshould\s+(run|execute)\s+tests?\b/i,
    ],
    negative: [
      /\bdo not\s+(run|execute)\s+tests?\b/i,
      /\bdon't\s+(run|execute)\s+tests?\b/i,
      /\bnever\s+(run|execute)\s+tests?\b/i,
      /\btests?\s+(only|unless)\s+asked\b/i,
      /\bonly\s+(run|execute)\s+tests?\s+when\s+asked\b/i,
    ],
  },
  {
    id: 'modify',
    title: 'never modify X vs you may modify X',
    positive: [
      /\byou may modify\b/i,
      /\bmay modify\b/i,
      /\bcan modify\b/i,
      /\ballowed to modify\b/i,
      /\bfeel free to modify\b/i,
    ],
    negative: [
      /\bnever modify\b/i,
      /\bdo not modify\b/i,
      /\bdon't modify\b/i,
      /\bnever change\b/i,
      /\bdo not change\b/i,
    ],
  },
  {
    id: 'approval',
    title: 'ask before changing vs change automatically',
    positive: [
      /\bask before (changing|modifying|editing)\b/i,
      /\brequest approval before\b/i,
    ],
    negative: [
      /\bchange automatically\b/i,
      /\bmodify automatically\b/i,
      /\bedit automatically\b/i,
      /\bwithout asking\b/i,
      /\bauto(?:matically)?\s+modify\b/i,
    ],
  },
];

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeComparableContent(content) {
  return normalizeText(content)
    .replace(/\b\d+\b/g, ' <n> ')
    .replace(/\s+/g, ' ')
    .trim();
}

function countLines(content) {
  if (!content) return 0;
  return content.split(/\r?\n/).length;
}

function splitSections(content) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let current = { title: null, startLine: 1, lines: [] };

  const pushCurrent = () => {
    const sectionText = current.lines.join('\n').trim();
    if (sectionText.length === 0 && !current.title) return;
    sections.push({
      title: current.title,
      startLine: current.startLine,
      text: sectionText,
      lineCount: current.lines.length,
      charCount: sectionText.length,
      hasHeading: current.title !== null,
    });
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      pushCurrent();
      current = {
        title: heading[2].trim(),
        startLine: index + 1,
        lines: [line],
      };
      continue;
    }
    if (current.lines.length === 0) {
      current.startLine = index + 1;
    }
    current.lines.push(line);
  }

  pushCurrent();
  return sections;
}

function hasAnyPattern(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function classifySource(source) {
  const searchable = normalizeText([
    source.relPath,
    source.displayPath,
    source.content,
    source.sections.map((section) => section.title ?? '').join(' '),
  ].join(' '));

  return CATEGORY_RULES
    .filter((rule) => hasAnyPattern(searchable, rule.patterns))
    .map((rule) => ({ id: rule.id, label: rule.label, target: rule.target }));
}

function createSource({
  projectRoot,
  absPath,
  relPath,
  kind,
  displayPath,
  sourcePath,
  content,
  extra = {},
}) {
  const sections = splitSections(content);
  const lines = content.split(/\r?\n/);
  return {
    projectRoot,
    absPath,
    relPath,
    displayPath,
    kind,
    sourcePath,
    content,
    lines,
    lineCount: lines.length,
    bytes: Buffer.byteLength(content, 'utf8'),
    sections,
    categories: [],
    ...extra,
  };
}

function safeParseJson(content) {
  try {
    const parsed = JSON.parse(content);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectSnapshotSources(projectRoot) {
  const snapshotRoot = join(projectRoot, SNAPSHOT_ROOT);
  if (!existsSync(snapshotRoot)) return [];

  const sources = [];
  for (const filePath of listFilesRecursive(snapshotRoot)) {
    if (extname(filePath).toLowerCase() !== '.json') continue;
    const raw = readFileSync(filePath, 'utf8');
    const parsed = safeParseJson(raw);
    const content = typeof parsed?.content === 'string' ? parsed.content : raw;
    const sourceType = typeof parsed?.source_type === 'string' ? parsed.source_type : 'snapshot';
    const sourcePath = typeof parsed?.source_path === 'string' && parsed.source_path.trim().length > 0
      ? parsed.source_path.trim()
      : rel(projectRoot, filePath);
    sources.push(createSource({
      projectRoot,
      absPath: filePath,
      relPath: rel(projectRoot, filePath),
      kind: 'snapshot',
      displayPath: `${rel(projectRoot, filePath)} ← ${sourcePath}`,
      sourcePath,
      content,
      extra: {
        snapshotMeta: parsed,
        sourceType,
      },
    }));
  }

  return sources;
}

function collectFallbackEntrypoints(projectRoot) {
  const sources = [];
  for (const relPath of FALLBACK_ENTRYPOINTS) {
    const absPath = join(projectRoot, relPath);
    if (!existsSync(absPath) || statSync(absPath).isDirectory()) continue;
    const content = readFileSync(absPath, 'utf8');
    sources.push(createSource({
      projectRoot,
      absPath,
      relPath,
      kind: 'entrypoint',
      displayPath: relPath,
      sourcePath: relPath,
      content,
    }));
  }
  return sources;
}

function collectAlwaysScannedSources(projectRoot) {
  const sources = [];

  for (const target of ALWAYS_SCAN_PATHS) {
    const absPath = join(projectRoot, target);
    if (!existsSync(absPath)) continue;

    if (statSync(absPath).isFile()) {
      sources.push(createSource({
        projectRoot,
        absPath,
        relPath: rel(projectRoot, absPath),
        kind: absPath.endsWith('copilot-instructions.md') ? 'copilot-instruction' : 'context-file',
        displayPath: rel(projectRoot, absPath),
        sourcePath: rel(projectRoot, absPath),
        content: readFileSync(absPath, 'utf8'),
      }));
      continue;
    }

    for (const filePath of listFilesRecursive(absPath)) {
      sources.push(createSource({
        projectRoot,
        absPath: filePath,
        relPath: rel(projectRoot, filePath),
        kind: absPath.includes('/.cursor/rules') ? 'cursor-rule' : 'context-file',
        displayPath: rel(projectRoot, filePath),
        sourcePath: rel(projectRoot, filePath),
        content: readFileSync(filePath, 'utf8'),
      }));
    }
  }

  return sources;
}

function collectSources(projectRoot) {
  const snapshots = collectSnapshotSources(projectRoot);
  const sources = snapshots.length > 0
    ? [...snapshots, ...collectAlwaysScannedSources(projectRoot)]
    : [...collectFallbackEntrypoints(projectRoot), ...collectAlwaysScannedSources(projectRoot)];

  return sources.map((source) => ({
    ...source,
    categories: classifySource(source),
  }));
}

function findSectionIssues(source) {
  const issues = [];
  if (source.sections.length === 0) return issues;

  for (const section of source.sections) {
    const hasHeading = section.title !== null && section.title.length > 0;
    const isLarge = section.lineCount >= 60 || section.charCount >= 4500;
    const hasHugeList = section.text.split(/\r?\n/).filter((line) => /^(\s*[-*+]\s+|\s*\d+\.\s+)/.test(line)).length >= 16;

    if (isLarge) {
      issues.push({
        file: source.displayPath,
        section: section.title ?? '(sem título)',
        line: section.startLine,
        reason: hasHeading
          ? `Seção muito grande (${section.lineCount} linhas).`
          : `Bloco único muito grande (${section.lineCount} linhas) e sem títulos claros.`,
      });
    }

    if (!hasHeading && section.lineCount >= 24) {
      issues.push({
        file: source.displayPath,
        section: '(sem título)',
        line: section.startLine,
        reason: 'Trecho longo sem títulos internos claros.',
      });
    }

    if (hasHugeList) {
      issues.push({
        file: source.displayPath,
        section: section.title ?? '(sem título)',
        line: section.startLine,
        reason: 'Lista extensa sem divisão aparente.',
      });
    }
  }

  return issues;
}

function analyzeSourceReadability(source) {
  const issues = [];
  const sectionIssues = findSectionIssues(source);
  issues.push(...sectionIssues);

  const headingCount = source.sections.filter((section) => section.hasHeading).length;
  if (source.sections.length <= 1 && source.lineCount >= 32) {
    issues.push({
      file: source.displayPath,
      section: '(arquivo inteiro)',
      line: 1,
      reason: 'Arquivo longo sem estrutura aparente de seções.',
    });
  }

  if (headingCount === 0 && source.lineCount >= 24) {
    issues.push({
      file: source.displayPath,
      section: '(arquivo inteiro)',
      line: 1,
      reason: 'Ausência de títulos explícitos para orientar a leitura.',
    });
  }

  if (source.categories.length >= 4) {
    issues.push({
      file: source.displayPath,
      section: '(conteúdo geral)',
      line: 1,
      reason: `Mistura de muitos tipos de conteúdo (${source.categories.map((item) => item.label).join(', ')}).`,
    });
  }

  return issues;
}

function lineSimilarity(a, b) {
  const linesA = new Set(a.lines.map((line) => normalizeText(line)).filter(Boolean));
  const linesB = new Set(b.lines.map((line) => normalizeText(line)).filter(Boolean));
  if (linesA.size === 0 || linesB.size === 0) return 0;

  let overlap = 0;
  for (const line of linesA) {
    if (linesB.has(line)) overlap++;
  }

  const union = new Set([...linesA, ...linesB]).size;
  return union === 0 ? 0 : overlap / union;
}

function detectDuplicates(sources) {
  const groups = new Map();
  for (const source of sources) {
    const key = normalizeComparableContent(source.content);
    const bucket = groups.get(key) ?? [];
    bucket.push(source);
    groups.set(key, bucket);
  }

  const exact = [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      kind: 'exact',
      score: 1,
      files: group.map((source) => source.displayPath),
      reason: 'Conteúdo exatamente duplicado após normalização.',
    }));

  const seenPairs = new Set();
  const similarGroups = [];
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i];
      const b = sources[j];
      const pairKey = [a.displayPath, b.displayPath].sort().join('::');
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);

      if (normalizeComparableContent(a.content) === normalizeComparableContent(b.content)) {
        continue;
      }

      const score = lineSimilarity(a, b);
      if (score < 0.75) continue;
      similarGroups.push({
        kind: 'similar',
        score,
        files: [a.displayPath, b.displayPath],
        reason: `Conteúdo muito semelhante (${Math.round(score * 100)}%).`,
      });
    }
  }

  return [...exact, ...similarGroups];
}

function findFirstMatch(source, patterns) {
  const lines = source.lines;
  for (const pattern of patterns) {
    for (let index = 0; index < lines.length; index++) {
      if (pattern.test(lines[index])) {
        return {
          line: index + 1,
          snippet: lines[index].trim(),
          pattern: pattern.toString(),
        };
      }
    }
  }

  return null;
}

function detectConflictGroup(sources, rule) {
  const positives = [];
  const negatives = [];

  for (const source of sources) {
    const positive = findFirstMatch(source, rule.positive);
    if (positive) positives.push({ file: source.displayPath, ...positive });
    const negative = findFirstMatch(source, rule.negative);
    if (negative) negatives.push({ file: source.displayPath, ...negative });
  }

  if (positives.length === 0 || negatives.length === 0) return null;

  return {
    id: rule.id,
    title: rule.title,
    positives,
    negatives,
  };
}

function detectConflicts(sources) {
  return CONFLICT_RULES
    .map((rule) => detectConflictGroup(sources, rule))
    .filter(Boolean);
}

function detectSkillCandidates(sources) {
  const candidates = new Map();

  for (const source of sources) {
    for (const rule of SKILL_COMMAND_RULES) {
      if (!hasAnyPattern(source.content, rule.patterns)) continue;

      const existing = candidates.get(rule.command) ?? {
        command: rule.command,
        skill_id: rule.skillId,
        source_paths: [],
        reason: `Comando recorrente que pode virar uma skill: ${rule.command}.`,
      };

      existing.source_paths.push(source.displayPath);
      candidates.set(rule.command, existing);
    }
  }

  return [...candidates.values()]
    .map((candidate) => ({
      ...candidate,
      source_paths: [...new Set(candidate.source_paths)].sort((a, b) => a.localeCompare(b)),
    }))
    .sort((a, b) => a.command.localeCompare(b.command));
}

function buildRecommendations(analysis) {
  const recommendations = [];
  const categories = new Set();

  for (const source of analysis.sources) {
    for (const category of source.categories) {
      categories.add(category.id);
    }
  }

  if (categories.has('policies') || categories.has('protected-files')) {
    recommendations.push('Mover regras de permissão, aprovação e arquivos protegidos para `.agentforge/policies/`.');
  }

  if (categories.has('references')) {
    recommendations.push('Separar inventários, comandos e listas de links em `.agentforge/references/`.');
  }

  if (categories.has('glossary')) {
    recommendations.push('Manter definições e termos em `.agentforge/memory/` para evitar mistura com instruções operacionais.');
  }

  if (categories.has('testing-instructions') || analysis.skillCandidates.some((item) => item.skill_id === 'run-tests')) {
    recommendations.push('Extrair comandos de teste recorrentes para uma skill dedicada, em vez de repetir o mesmo bloco em várias entradas.');
  }

  if (categories.has('workflows')) {
    recommendations.push('Colocar playbooks e passos operacionais em `.agentforge/flows/` com seções curtas e claras.');
  }

  if (categories.has('agent-roles') || categories.has('tool-mcp-instructions')) {
    recommendations.push('Separar papéis de agentes e instruções de ferramentas em arquivos distintos para reduzir mistura de responsabilidades.');
  }

  if (categories.has('project-overview') || categories.has('architecture')) {
    recommendations.push('Manter visão geral e arquitetura em `.agentforge/context/` com arquivos menores e com títulos explícitos.');
  }

  if (analysis.sourceCounts.legacyAgentSources > 0) {
    recommendations.push('Canonicalizar os snapshots legados importados de `.agents/` com `agentforge refactor-context --apply`.');
  }

  if (recommendations.length === 0) {
    recommendations.push('A estrutura atual está relativamente enxuta. Preserve a separação de contexto por papel quando novos arquivos forem adicionados.');
  }

  return recommendations;
}

function scoreAudit(analysis) {
  let score = 100;
  score -= analysis.largeSections.length * 4;
  score -= analysis.readabilityIssues.length * 2;
  score -= analysis.duplicateGroups.filter((group) => group.kind === 'exact').length * 10;
  score -= analysis.duplicateGroups.filter((group) => group.kind === 'similar').length * 6;
  score -= analysis.conflicts.length * 15;
  score -= analysis.mixedCategoryFiles.length * 5;
  score -= analysis.commandFiles.length * 2;
  if (analysis.sources.length === 0) score = 100;
  return Math.max(0, Math.min(100, score));
}

function analyzeContext(projectRoot) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const sources = collectSources(projectRoot);
  const largeSections = [];
  const readabilityIssues = [];
  const mixedCategoryFiles = [];
  const commandFiles = [];

  for (const source of sources) {
    const sourceReadability = analyzeSourceReadability(source);
    readabilityIssues.push(...sourceReadability);

    if (source.categories.length >= 3) {
      mixedCategoryFiles.push({
        file: source.displayPath,
        categories: source.categories.map((category) => category.label),
        reason: `Mistura de ${source.categories.length} categorias de conteúdo.`,
      });
    }

    for (const section of source.sections) {
      if (section.lineCount >= 60 || section.charCount >= 4500) {
        largeSections.push({
          file: source.displayPath,
          section: section.title ?? '(sem título)',
          line: section.startLine,
          lines: section.lineCount,
          reason: section.title
            ? `Seção muito grande (${section.lineCount} linhas).`
            : `Bloco sem título muito grande (${section.lineCount} linhas).`,
        });
      }
    }

    if (source.lineCount >= 80 && source.categories.length > 0) {
      commandFiles.push(source.displayPath);
    }
  }

  const duplicateGroups = detectDuplicates(sources);
  const conflicts = detectConflicts(sources);
  const skillCandidates = detectSkillCandidates(sources);

  const analysis = {
    state: installation.state ?? {},
    sources,
    largeSections,
    readabilityIssues,
    duplicateGroups,
    conflicts,
    skillCandidates,
    mixedCategoryFiles,
    commandFiles: [...new Set(commandFiles)].sort((a, b) => a.localeCompare(b)),
    sourceCounts: {
      snapshots: sources.filter((source) => source.kind === 'snapshot').length,
      entrypoints: sources.filter((source) => source.kind === 'entrypoint').length,
      cursorRules: sources.filter((source) => source.kind === 'cursor-rule').length,
      copilot: sources.filter((source) => source.kind === 'copilot-instruction').length,
      contextFiles: sources.filter((source) => source.kind === 'context-file').length,
      legacyAgentSources: sources.filter((source) => String(source.sourceType ?? '').startsWith('legacy-')).length,
      legacyReferenceSources: sources.filter((source) => source.sourceType === 'legacy-reference').length,
      legacySkillSources: sources.filter((source) => source.sourceType === 'legacy-skill').length,
    },
  };

  analysis.recommendations = buildRecommendations(analysis);
  analysis.score = scoreAudit(analysis);
  analysis.mixedCategoryFiles = [...mixedCategoryFiles].sort((a, b) => a.file.localeCompare(b.file));
  analysis.readabilityIssues = [...readabilityIssues].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  analysis.largeSections = [...largeSections].sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  analysis.duplicateGroups = [...duplicateGroups].sort((a, b) => b.score - a.score || a.files[0].localeCompare(b.files[0]));
  analysis.conflicts = [...conflicts].sort((a, b) => a.title.localeCompare(b.title));
  analysis.skillCandidates = [...skillCandidates].sort((a, b) => a.command.localeCompare(b.command));

  return {
    ok: true,
    analysis,
  };
}

function formatSourceKind(source) {
  const legacySuffix = source.kind === 'snapshot' && typeof source.sourceType === 'string' && source.sourceType.startsWith('legacy-')
    ? `/${source.sourceType}`
    : '';
  switch (source.kind) {
    case 'snapshot':
      return `snapshot${legacySuffix}`;
    case 'entrypoint':
      return 'entrypoint fallback';
    case 'cursor-rule':
      return 'cursor rules';
    case 'copilot-instruction':
      return 'copilot instruction';
    case 'context-file':
      return 'context file';
    default:
      return source.kind;
  }
}

function renderSectionList(items, emptyMessage, renderItem) {
  if (items.length === 0) return [`- ${emptyMessage}`];
  return items.map((item) => `- ${renderItem(item)}`);
}

function renderReport(projectRoot, analysis) {
  const lines = [];
  const state = analysis.state ?? {};
  const projectName = state.project || basename(projectRoot);

  lines.push('# AgentForge Context Audit');
  lines.push('');
  lines.push('## Resumo executivo');
  lines.push('');
  lines.push(`- Projeto: ${projectName}`);
  lines.push(`- Score de organização: ${analysis.score}/100`);
  lines.push(`- Arquivos analisados: ${analysis.sources.length}`);
  lines.push(`- Snapshots: ${analysis.sourceCounts.snapshots}`);
  lines.push(`- Entrypoints fallback: ${analysis.sourceCounts.entrypoints}`);
  lines.push(`- Cursor rules: ${analysis.sourceCounts.cursorRules}`);
  lines.push(`- Copilot instructions: ${analysis.sourceCounts.copilot}`);
  lines.push(`- Context files: ${analysis.sourceCounts.contextFiles}`);
  lines.push(`- Legacy agent snapshots: ${analysis.sourceCounts.legacyAgentSources}`);
  lines.push(`- Legacy reference snapshots: ${analysis.sourceCounts.legacyReferenceSources}`);
  lines.push(`- Legacy skill snapshots: ${analysis.sourceCounts.legacySkillSources}`);
  lines.push(`- Seções grandes: ${analysis.largeSections.length}`);
  lines.push(`- Conflitos potenciais: ${analysis.conflicts.length}`);
  lines.push(`- Duplicações ou similaridades: ${analysis.duplicateGroups.length}`);
  lines.push(`- Candidatos a skill: ${analysis.skillCandidates.length}`);
  lines.push('');

  lines.push('## Arquivos analisados');
  lines.push('');
  if (analysis.sources.length === 0) {
    lines.push('- Nenhum arquivo de entrada foi encontrado. O relatório é apenas informativo.');
  } else {
    for (const source of analysis.sources) {
      const categoryList = source.categories.length > 0
        ? source.categories.map((category) => category.label).join(', ')
        : 'sem categoria clara';
      lines.push(`- \`${source.displayPath}\` (${formatSourceKind(source)}, ${source.lineCount} linhas, ${source.bytes} bytes)`);
      lines.push(`  - Tipos detectados: ${categoryList}`);
    }
  }
  lines.push('');

  lines.push('## Achados principais');
  lines.push('');
  const mainFindings = [];
  if (analysis.sources.length === 0) {
    mainFindings.push('Nenhuma fonte foi encontrada para auditagem. Isso é útil apenas para confirmar que o comando não falha sem entradas.');
  }
  if (analysis.largeSections.length > 0) {
    mainFindings.push(`Há ${analysis.largeSections.length} seção(ões) grande(s) demais para leitura confortável.`);
  }
  if (analysis.mixedCategoryFiles.length > 0) {
    mainFindings.push(`Há ${analysis.mixedCategoryFiles.length} arquivo(s) com muitos tipos de conteúdo misturados.`);
  }
  if (analysis.conflicts.length > 0) {
    mainFindings.push(`Foram encontrados ${analysis.conflicts.length} conflito(s) potencial(is) de instrução.`);
  }
  if (analysis.duplicateGroups.length > 0) {
    mainFindings.push(`Foram encontradas ${analysis.duplicateGroups.length} duplicações ou similaridades relevantes.`);
  }
  if (analysis.skillCandidates.length > 0) {
    mainFindings.push(`Foram detectados ${analysis.skillCandidates.length} comandos recorrentes que poderiam virar skills.`);
  }
  if (mainFindings.length === 0) {
    mainFindings.push('O conjunto analisado está relativamente organizado e não mostrou problemas evidentes.');
  }
  for (const item of mainFindings) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  lines.push('## Conflitos');
  lines.push('');
  if (analysis.conflicts.length === 0) {
    lines.push('- Nenhum conflito claro encontrado.');
  } else {
    for (const conflict of analysis.conflicts) {
      lines.push(`- ${conflict.title}`);
      lines.push(`  - Fontes positivas: ${conflict.positives.map((item) => `\`${item.file}:${item.line}\``).join(', ')}`);
      lines.push(`  - Fontes negativas: ${conflict.negatives.map((item) => `\`${item.file}:${item.line}\``).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Duplicações');
  lines.push('');
  if (analysis.duplicateGroups.length === 0) {
    lines.push('- Nenhuma duplicação ou similaridade forte encontrada.');
  } else {
    for (const group of analysis.duplicateGroups) {
      lines.push(`- ${group.reason}`);
      lines.push(`  - Arquivos: ${group.files.map((file) => `\`${file}\``).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Possíveis skills');
  lines.push('');
  if (analysis.skillCandidates.length === 0) {
    lines.push('- Nenhum comando recorrente forte o bastante para sugerir skill.');
  } else {
    for (const candidate of analysis.skillCandidates) {
      lines.push(`- \`${candidate.command}\` → \`${candidate.skill_id}\``);
      lines.push(`  - Fontes: ${candidate.source_paths.map((file) => `\`${file}\``).join(', ')}`);
    }
  }
  lines.push('');

  lines.push('## Recomendações de segregação');
  lines.push('');
  for (const item of analysis.recommendations) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  lines.push('## Score');
  lines.push('');
  lines.push(`- ${analysis.score}/100`);
  lines.push('');

  lines.push('## Próximos comandos sugeridos');
  lines.push('');
  if (analysis.sources.some((source) => source.kind === 'snapshot')) {
    lines.push('- `agentforge refactor-context`');
    lines.push('- `agentforge suggest-skills`');
    lines.push('- `agentforge validate`');
  } else {
    lines.push('- `agentforge ingest`');
    lines.push('- `agentforge refactor-context`');
    lines.push('- `agentforge suggest-skills`');
    lines.push('- `agentforge validate`');
  }
  lines.push('');

  return lines.join('\n');
}

function writeAuditResult(projectRoot, analysis, report) {
  const writer = new Writer(projectRoot);
  const reportPath = join(projectRoot, PRODUCT.internalDir, 'reports', 'context-audit.md');
  writer.writeGeneratedFile(reportPath, report, { force: true });

  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const nextState = {
    ...state,
    last_context_audit_at: new Date().toISOString(),
    context_audit_score: analysis.score,
    detected_skill_candidates: analysis.skillCandidates,
    created_files: [...new Set([...createdFiles, rel(projectRoot, reportPath)])],
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, [rel(projectRoot, statePath), rel(projectRoot, reportPath)]),
  });

  return {
    reportPath: rel(projectRoot, reportPath),
    state: nextState,
  };
}

export function runContextAudit(projectRoot) {
  const result = analyzeContext(projectRoot);
  if (!result.ok) return result;

  const report = renderReport(projectRoot, result.analysis);
  return {
    ok: true,
    analysis: result.analysis,
    report,
  };
}

export function writeContextAudit(projectRoot, analysis, report) {
  return writeAuditResult(projectRoot, analysis, report);
}

export default async function auditContext(args = []) {
  const { default: chalk } = await import('chalk');
  const help = args.includes('--help') || args.includes('-h');

  if (help) {
    console.log(chalk.bold(`\n  ${PRODUCT.name}: Audit Context\n`));
    console.log(`  Uso: npx ${PRODUCT.command} audit-context\n`);
    console.log('  Analisa snapshots importados e entradas existentes para diagnosticar a organização do contexto.');
    console.log('  Gera `.agentforge/reports/context-audit.md` sem modificar os arquivos de entrada.\n');
    return 0;
  }

  const projectRoot = process.cwd();
  const result = runContextAudit(projectRoot);

  if (!result.ok) {
    console.log(chalk.yellow(`  ${result.errors[0]}`));
    return 1;
  }

  const writeResult = writeAuditResult(projectRoot, result.analysis, result.report);
  console.log(chalk.hex('#ffa203')(`  Relatório gerado em ${writeResult.reportPath}`));
  console.log(chalk.gray(`  Score: ${result.analysis.score}/100`));

  return 0;
}
