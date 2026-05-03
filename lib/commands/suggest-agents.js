import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, fileStatus, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { renderAgentSuggestionRequest } from '../ai/request-renderer.js';
import { PRODUCT } from '../product.js';
import { runPatternResearch } from './pattern-research.js';
import { buildAiEvidenceArtifacts } from './ai-evidence.js';
import { scanProjectSignals } from './project-signals.js';

const AI_REQUEST_REL_PATH = '.agentforge/ai/requests/suggest-agents.md';
const REPORT_REL_PATH = '.agentforge/reports/agent-suggestions.md';
const SUGGESTION_DIR = '.agentforge/suggestions/agents';
const OPTIONAL_REPORTS = [
  '.agentforge/reports/project-analysis.md',
  '.agentforge/reports/pattern-research.md',
  '.agentforge/reports/analysis-plan.md',
];

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

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
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

function splitLines(content) {
  return String(content ?? '').split(/\r?\n/);
}

function collectSources(projectRoot, signals, patternResearch) {
  const sources = [];
  const seen = new Set();

  const addSource = (path, content, meta = {}) => {
    if (!path || seen.has(path)) return;
    seen.add(path);
    sources.push({
      path,
      content: String(content ?? ''),
      ...meta,
    });
  };

  const addFile = (relPath) => {
    const absPath = join(projectRoot, relPath);
    if (!existsSync(absPath) || statSync(absPath).isDirectory()) return;
    addSource(relPath, readText(absPath));
  };

  const addTree = (relDir) => {
    const absDir = join(projectRoot, relDir);
    if (!existsSync(absDir) || !statSync(absDir).isDirectory()) return;

    for (const filePath of listFilesRecursive(absDir)) {
      if (!statSync(filePath).isFile()) continue;
      addSource(rel(projectRoot, filePath), readText(filePath));
    }
  };

  if (signals.packageJson) {
    addSource('package.json', `${JSON.stringify(signals.packageJson, null, 2)}\n`);
  }
  addFile('README.md');
  addFile('AGENTS.md');
  addFile('CLAUDE.md');
  addTree(join(PRODUCT.internalDir, 'context'));
  addTree(join(PRODUCT.internalDir, 'references'));
  addTree(join(PRODUCT.internalDir, 'policies'));
  addTree(join(PRODUCT.internalDir, 'flows'));
  addTree(join(PRODUCT.internalDir, 'memory'));
  addFile(join(PRODUCT.internalDir, 'harness', 'context-map.yaml'));
  addFile(join(PRODUCT.internalDir, 'harness', 'context-index.yaml'));
  addFile(join(PRODUCT.internalDir, 'reports', 'refactor-plan.md'));
  addFile(join(PRODUCT.internalDir, 'reports', 'context-audit.md'));
  addFile('Dockerfile');
  addFile('docker-compose.yml');
  addFile('compose.yaml');
  addFile('pnpm-workspace.yaml');
  addFile('pyproject.toml');
  addFile('requirements.txt');

  for (const doc of signals.docsFiles ?? []) {
    addSource(doc.path, doc.content);
  }
  for (const doc of signals.agentsFiles ?? []) {
    addSource(doc.path, doc.content);
  }
  for (const doc of signals.instructionDocs ?? []) {
    addSource(doc.path, doc.content);
  }
  for (const file of signals.workflowFiles ?? []) {
    addSource(file, readText(join(projectRoot, file)));
  }
  for (const file of signals.testFiles ?? []) {
    addSource(file, readText(join(projectRoot, file)));
  }

  if (signals.packageJson?.scripts) {
    addSource('package.json#scripts', `${JSON.stringify(signals.packageJson.scripts, null, 2)}\n`);
  }
  if (signals.packageJson?.bin) {
    addSource('package.json#bin', `${JSON.stringify(signals.packageJson.bin, null, 2)}\n`);
  }
  if (signals.packageJson?.workspaces) {
    addSource('package.json#workspaces', `${JSON.stringify(signals.packageJson.workspaces, null, 2)}\n`);
  }

  for (const reportPath of OPTIONAL_REPORTS) {
    addFile(reportPath);
  }

  for (const pattern of patternResearch.observedPatterns ?? []) {
    addSource(`pattern:${pattern.id}`, [
      pattern.name,
      pattern.evidence_summary,
      ...(pattern.evidence ?? []).map((item) => `${item.path}: ${item.snippet}`),
    ].join('\n'), { patternId: pattern.id });
  }

  return sources;
}

function findEvidence(sources, patterns, maxItems = 4) {
  const evidence = [];
  const seen = new Set();

  for (const source of sources) {
    const lines = splitLines(source.content);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!patterns.some((pattern) => pattern.test(line))) continue;

      const key = `${source.path}:${index + 1}:${line.trim()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      evidence.push({
        path: source.path,
        line: index + 1,
        snippet: line.trim(),
      });
      if (evidence.length >= maxItems) return evidence;
    }
  }

  return evidence;
}

function evidenceFromPattern(patternResearch, patternId, maxItems = 4) {
  const pattern = (patternResearch.observedPatterns ?? []).find((entry) => entry.id === patternId)
    || (patternResearch.patterns ?? []).find((entry) => entry.id === patternId);
  if (!pattern) return [];

  return (pattern.evidence ?? [])
    .slice(0, maxItems)
    .map((item) => ({
      path: item.path,
      line: null,
      snippet: item.snippet,
      pattern: item.pattern,
      patternId,
    }));
}

function confidenceRank(confidence) {
  return { low: 0, medium: 1, high: 2 }[confidence] ?? 0;
}

function strongerConfidence(a, b) {
  return confidenceRank(b) > confidenceRank(a) ? b : a;
}

function mergeSuggestionEntries(entries) {
  const merged = new Map();

  for (const entry of entries) {
    const current = merged.get(entry.id);
    if (!current) {
      merged.set(entry.id, {
        ...entry,
        responsibilities: unique(entry.responsibilities),
        reads: unique(entry.reads),
        skills: unique(entry.skills),
        flows: unique(entry.flows),
        limits: unique(entry.limits),
        evidence: [...(entry.evidence ?? [])],
      });
      continue;
    }

    current.confidence = strongerConfidence(current.confidence, entry.confidence);
    current.reason = current.reason || entry.reason;
    current.responsibilities = unique([...current.responsibilities, ...(entry.responsibilities ?? [])]);
    current.reads = unique([...current.reads, ...(entry.reads ?? [])]);
    current.skills = unique([...current.skills, ...(entry.skills ?? [])]);
    current.flows = unique([...current.flows, ...(entry.flows ?? [])]);
    current.limits = unique([...current.limits, ...(entry.limits ?? [])]);
    current.evidence = [...current.evidence, ...(entry.evidence ?? [])].slice(0, 8);
  }

  return [...merged.values()].sort((a, b) => {
    if (a.category === b.category) return a.id.localeCompare(b.id);
    return a.category.localeCompare(b.category);
  });
}

function buildSuggestion(rule, context) {
  if (!rule.when(context)) return null;

  const evidence = unique([
    ...(rule.evidence ? rule.evidence(context) : []),
    ...(rule.extraEvidence ? rule.extraEvidence(context) : []),
  ]);

  return {
    id: rule.id,
    name: rule.name,
    category: rule.category,
    description: rule.description,
    reason: rule.reason(context),
    confidence: rule.confidence(context),
    evidence,
    responsibilities: rule.responsibilities,
    reads: rule.reads(context),
    skills: rule.skills(context),
    flows: rule.flows(context),
    limits: rule.limits,
  };
}

function buildAgentSuggestionRules(context) {
  const { signals, patternResearch } = context;
  const hasPattern = (id) => (patternResearch.observedPatterns ?? []).some((pattern) => pattern.id === id);
  const hasText = (regexes) => findEvidence(context.sources, regexes).length > 0;
  const manyAreas = (signals.mainAreas ?? []).length >= 3 || (signals.mainDirectories ?? []).length >= 3;
  const docsStrong = hasPattern('documentation-heavy') || ((signals.docsFiles ?? []).length >= 2 && signals.readmeExists);
  const automationStrong = hasPattern('automation-heavy') || (signals.workflowFiles ?? []).length > 0 || Boolean(signals.workerExists);
  const integrationStrong = hasPattern('nestjs') || hasPattern('api') || /nestjs|api|auth/i.test((signals.stackDetails ?? []).join(' '));
  const dataStrong = Boolean(signals.prismaExists || signals.migrationsExists || (signals.dependencyNames ?? []).some((name) => /^(pg|postgres|mysql|sqlite|mongodb|mongoose|prisma)/i.test(name)));
  const productStrong = Boolean(signals.objectiveText || signals.audienceText || /saas|product|roadmap|feature/i.test(`${signals.projectType} ${signals.objectiveText} ${signals.audienceText}`));
  const planningStrong = hasText([/\broadmap\b/i, /\bbacklog\b/i, /\brequirements?\b/i, /\bcriteria\b/i, /\bacceptance\b/i, /\bpriorit/i]);
  const supportStrong = hasText([/\bsupport\b/i, /\bfaq\b/i, /\bhelp desk\b/i, /\bticket\b/i, /\btroubleshoot/i]);
  const domainStrong = Boolean((signals.domainDocs ?? []).length > 0 || hasText([/\bdomain\b/i, /\bglossary\b/i, /\bvocabulary\b/i, /\bbusiness\b/i]));
  const securityStrong = Boolean((signals.dependencyNames ?? []).some((name) => /^(auth\.js|next-auth|@auth\/core|@auth\/nextjs)/i.test(name)) || hasText([/\bsecurity\b/i, /\bsecret\b/i, /\btoken\b/i, /\bpermission\b/i, /\bapproval\b/i]));
  const complianceStrong = hasText([/\bpolicy\b/i, /\bhuman approval\b/i, /\bprotected files\b/i, /\bcompliance\b/i, /\bgovernance\b/i]);
  const refactorPlanText = readText(join(context.projectRoot, PRODUCT.internalDir, 'reports', 'refactor-plan.md'));
  const contextMapText = readText(join(context.projectRoot, PRODUCT.internalDir, 'harness', 'context-map.yaml'));
  const refactorScoreMatch = refactorPlanText.match(/score de segregação:\s*(\d+)/i);
  const refactorScore = refactorScoreMatch ? Number(refactorScoreMatch[1]) : null;
  const refactorPlanWeak = Number.isFinite(refactorScore) ? refactorScore < 70 : false;
  const refactorHasUnclassified = /\btrechos não classificados\b/i.test(refactorPlanText) || /\bunclassified\b/i.test(refactorPlanText);
  const contextPressure = Boolean(
    docsStrong ||
    (signals.instructionDocs ?? []).length > 1 ||
    (signals.agentsFiles ?? []).length > 0 ||
    contextMapText.includes('needs-review') ||
    refactorPlanWeak ||
    refactorHasUnclassified
  );

  const rules = [
    {
      id: 'context-curator',
      name: 'Context Curator',
      category: 'knowledge',
      description: 'Curates, segregates, indexes, and maintains durable project context for AI engines.',
      when: () => contextPressure,
      reason: () => {
        if (refactorPlanWeak) return 'The refactor-context report shows low segregation quality and needs semantic curation.';
        if (refactorHasUnclassified) return 'The refactor-context report still contains unclassified context.';
        if (contextMapText.includes('needs-review')) return 'The context map already has items that need human or AI review.';
        return 'The repository has enough context surfaces to benefit from a dedicated curator.';
      },
      confidence: () => (refactorPlanWeak || refactorHasUnclassified ? 'high' : 'medium'),
      responsibilities: [
        'Audit existing context files and identify durable knowledge.',
        'Separate project context, architecture, domain, coding standards, testing, deployment, tools, policies, flows, and glossary.',
        'Maintain a granular context map with file paths and line ranges.',
        'Detect duplicated, stale, generic, or misplaced context.',
        'Suggest moves between context/, references/, policies/, flows/, memory/, and reports/.',
        'Keep glossary focused on domain terms, not generic stack terms.',
        'Preserve human-authored context unless explicitly approved.',
      ],
      reads: () => unique([
        '.agentforge/harness/context-index.yaml',
        '.agentforge/harness/context-map.yaml',
        '.agentforge/context/',
        '.agentforge/references/',
        '.agentforge/policies/',
        '.agentforge/flows/',
        '.agentforge/memory/',
        '.agentforge/reports/refactor-plan.md',
        '.agentforge/reports/context-audit.md',
        '.agentforge/reports/project-analysis.md',
        'AGENTS.md',
        'CLAUDE.md',
        'docs/',
      ]),
      skills: () => ['review-changes', 'create-implementation-plan', 'run-tests'],
      flows: () => ['review', 'refactor'],
      limits: [
        'Do not edit source code.',
        'Do not promote uncertain context as fact.',
        'Do not overwrite human-modified files without approval.',
      ],
      evidence: (ctx) => [
        ...findEvidence(ctx.sources, [/\bcontext-map\b/i, /\bcontext-curator\b/i, /\bneeds-review\b/i, /\brefactor-context\b/i, /\bsegregation\b/i, /\bunclassified\b/i]),
      ],
    },
    {
      id: 'orchestrator',
      name: 'Orchestrator',
      category: 'core',
      description: 'Coordinates work across product, engineering, quality, and operations.',
      when: () => manyAreas || docsStrong || automationStrong || integrationStrong,
      reason: () => 'The project spans multiple surfaces and needs a central coordination layer.',
      confidence: () => (manyAreas ? 'high' : 'medium'),
      responsibilities: [
        'Coordinate intake, sequencing, and handoffs.',
        'Keep scope, decisions, and approvals visible.',
        'Route work to the right specialist agent.',
      ],
      reads: () => unique([
        '.agentforge/state.json',
        '.agentforge/scope.md',
        '.agentforge/flows/',
        '.agentforge/context/project-overview.md',
        ...(docsStrong ? ['README.md', 'docs/'] : []),
      ]),
      skills: () => ['create-implementation-plan', 'review-changes'],
      flows: () => ['feature-development', 'review'],
      limits: ['Do not implement work that belongs to a specialist.', 'Do not change policies unilaterally.'],
      evidence: (ctx) => [
        ...evidenceFromPattern(ctx.patternResearch, 'documentation-heavy'),
        ...evidenceFromPattern(ctx.patternResearch, 'automation-heavy'),
        ...evidenceFromPattern(ctx.patternResearch, 'monorepo'),
      ],
    },
    {
      id: 'context-router',
      name: 'Context Router',
      category: 'core',
      description: 'Routes the right context surfaces to the right task or agent.',
      when: () => docsStrong || (signals.instructionDocs ?? []).length >= 2 || (signals.agentsFiles ?? []).length > 0,
      reason: () => 'The repository already has several context and instruction surfaces that should be kept aligned.',
      confidence: () => (signals.instructionDocs?.length >= 3 ? 'high' : 'medium'),
      responsibilities: [
        'Map which context files matter for each task.',
        'Keep agentic instructions consistent across surfaces.',
        'Identify when context is missing or duplicated.',
      ],
      reads: () => unique([
        'AGENTS.md',
        'CLAUDE.md',
        '.agents/',
        '.agentforge/context/',
        '.agentforge/references/',
        ...(docsStrong ? ['README.md', 'docs/'] : []),
      ]),
      skills: () => ['create-implementation-plan', 'review-changes'],
      flows: () => ['review'],
      limits: ['Do not rewrite canonical instructions without evidence.', 'Do not invent hidden context.'],
      evidence: (ctx) => [
        ...findEvidence(ctx.sources, [/\bAGENTS\b/i, /\bCLAUDE\b/i, /\bcontext\b/i, /\binstruction\b/i, /\bagent\b/i]),
      ],
    },
    {
      id: 'architect',
      name: 'Architect',
      category: 'engineering',
      description: 'Defines boundaries, shared modules, and system contracts.',
      when: () => integrationStrong || hasPattern('monorepo') || manyAreas || Boolean((signals.mainDirectories ?? []).some((dir) => /src|app|libs|modules|packages/i.test(dir))),
      reason: () => 'The codebase exposes enough structural complexity to benefit from explicit architecture guidance.',
      confidence: () => (integrationStrong || hasPattern('monorepo') ? 'high' : 'medium'),
      responsibilities: [
        'Define boundaries and module ownership.',
        'Document integration and dependency flows.',
        'Minimize accidental coupling.',
      ],
      reads: () => unique([
        '.agentforge/context/architecture.md',
        '.agentforge/context/conventions.md',
        '.agentforge/reports/project-analysis.md',
        'docs/architecture.md',
        ...(integrationStrong ? ['README.md', 'package.json'] : []),
      ]),
      skills: () => ['create-implementation-plan', 'review-changes'],
      flows: () => ['feature-development', 'refactor', 'review'],
      limits: ['Do not choose product scope.', 'Do not make implementation-only decisions.'],
      evidence: (ctx) => [
        ...evidenceFromPattern(ctx.patternResearch, 'nestjs'),
        ...evidenceFromPattern(ctx.patternResearch, 'monorepo'),
      ],
    },
    {
      id: 'engineer',
      name: 'Engineer',
      category: 'engineering',
      description: 'Implements changes with code, tests, and operational hygiene.',
      when: () => Boolean(signals.srcExists || signals.appExists || signals.workerExists || (signals.tsFiles ?? []).length > 0),
      reason: () => 'The repository has a direct implementation surface that benefits from a generalist builder.',
      confidence: () => 'high',
      responsibilities: [
        'Implement approved changes.',
        'Keep validation and docs up to date.',
        'Preserve the smallest useful change set.',
      ],
      reads: () => unique([
        '.agentforge/context/coding-standards.md',
        '.agentforge/context/testing.md',
        '.agentforge/reports/project-analysis.md',
        'README.md',
        'src/',
        'app/',
      ]),
      skills: () => ['run-tests', 'create-implementation-plan', 'review-changes'],
      flows: () => ['feature-development', 'bugfix'],
      limits: ['Do not widen the scope during implementation.', 'Do not rewrite protected context files.'],
      evidence: (ctx) => [
        ...findEvidence(ctx.sources, [/\bclass\b/i, /\bfunction\b/i, /\bexport\b/i, /\bimport\b/i, /\.ts\b/i, /\.tsx\b/i]),
      ],
    },
    {
      id: 'integration-specialist',
      name: 'Integration Specialist',
      category: 'integration',
      description: 'Owns API contracts, external services, and integration boundaries.',
      when: () => integrationStrong || Boolean((signals.dependencyNames ?? []).some((name) => /^(axios|fetch|nestjs|express|fastify|openapi|swagger|@auth\/core|pg|prisma)/i.test(name))),
      reason: () => 'The project shows API, NestJS, auth, or service integration signals.',
      confidence: () => (integrationStrong ? 'high' : 'medium'),
      responsibilities: [
        'Document service and API boundaries.',
        'Track external dependencies and compatibility.',
        'Keep integration changes explicit and reviewable.',
      ],
      reads: () => unique([
        '.agentforge/context/architecture.md',
        '.agentforge/context/conventions.md',
        '.agentforge/reports/pattern-research.md',
        'docs/architecture.md',
        'package.json',
      ]),
      skills: () => ['create-implementation-plan', 'review-changes', 'run-tests'],
      flows: () => ['feature-development', 'review', 'bugfix'],
      limits: ['Do not change contracts without signaling downstream impact.', 'Do not assume integrations are isolated.'],
      evidence: (ctx) => [
        ...evidenceFromPattern(ctx.patternResearch, 'nestjs'),
        ...evidenceFromPattern(ctx.patternResearch, 'api'),
        ...findEvidence(ctx.sources, [/\bendpoint\b/i, /\bcontroller\b/i, /\broute\b/i, /\bapi\b/i, /\bcontract\b/i]),
      ],
    },
    {
      id: 'automation-planner',
      name: 'Automation Planner',
      category: 'automation',
      description: 'Plans recurring automation, worker flows, and operational scripts.',
      when: () => automationStrong || Boolean(signals.projectCommands?.some((entry) => /release|deploy|workflow|worker|queue|cron/i.test(entry.command))),
      reason: () => 'The repository has recurring workflows, commands, or worker-style execution.',
      confidence: () => (automationStrong ? 'high' : 'medium'),
      responsibilities: [
        'Identify repeatable work that should be automated.',
        'Separate runtime work from orchestration work.',
        'Keep automation safe and observable.',
      ],
      reads: () => unique([
        '.github/workflows/',
        'Dockerfile',
        'docker-compose.yml',
        'worker/',
        'README.md',
        '.agentforge/reports/project-analysis.md',
      ]),
      skills: () => ['create-implementation-plan', 'run-tests', 'review-changes'],
      flows: () => ['release', 'review'],
      limits: ['Do not automate destructive operations by default.', 'Do not hide approvals behind scripts.'],
      evidence: (ctx) => [
        ...evidenceFromPattern(ctx.patternResearch, 'automation-heavy'),
        ...evidenceFromPattern(ctx.patternResearch, 'github-actions'),
        ...findEvidence(ctx.sources, [/\bworker\b/i, /\bcron\b/i, /\bqueue\b/i, /\bjob\b/i, /\bautomation\b/i]),
      ],
    },
    {
      id: 'workflow-automation-designer',
      name: 'Workflow Automation Designer',
      category: 'automation',
      description: 'Designs workflow graphs, triggers, and automation checkpoints.',
      when: () => (signals.workflowFiles ?? []).length > 0,
      reason: () => 'The repo already uses CI/CD or workflow automation surfaces.',
      confidence: () => 'high',
      responsibilities: [
        'Describe triggers, jobs, and approvals clearly.',
        'Keep workflow steps reproducible.',
        'Reduce accidental drift between docs and CI.',
      ],
      reads: () => unique([
        '.github/workflows/',
        '.agentforge/reports/pattern-research.md',
        'README.md',
        'docs/',
      ]),
      skills: () => ['create-implementation-plan', 'run-tests'],
      flows: () => ['release', 'review'],
      limits: ['Do not modify secrets or credentials.', 'Do not normalize away safety gates.'],
      evidence: (ctx) => [
        ...evidenceFromPattern(ctx.patternResearch, 'github-actions'),
      ],
    },
    {
      id: 'operations-coordinator',
      name: 'Operations Coordinator',
      category: 'operations',
      description: 'Coordinates runtime, deployment, and environment operations.',
      when: () => Boolean(signals.dockerfile || signals.composeFile || (signals.workflowFiles ?? []).length > 0 || hasPattern('docker') || hasPattern('github-actions')),
      reason: () => 'Docker and CI/CD surfaces indicate a strong operational layer.',
      confidence: () => 'high',
      responsibilities: [
        'Document runtime assumptions and deployment steps.',
        'Keep environment and release notes aligned.',
        'Surface operational risk early.',
      ],
      reads: () => unique([
        '.agentforge/context/deployment.md',
        '.agentforge/reports/pattern-research.md',
        '.github/workflows/',
        'Dockerfile',
        'docker-compose.yml',
      ]),
      skills: () => ['create-implementation-plan', 'run-tests'],
      flows: () => ['release', 'review'],
      limits: ['Do not change infrastructure without review.', 'Do not weaken operational safety.'],
      evidence: (ctx) => [
        ...evidenceFromPattern(ctx.patternResearch, 'docker'),
        ...evidenceFromPattern(ctx.patternResearch, 'github-actions'),
      ],
    },
    {
      id: 'release-coordinator',
      name: 'Release Coordinator',
      category: 'operations',
      description: 'Owns release gating, rollback notes, and publication readiness.',
      when: () => Boolean((signals.projectCommands ?? []).some((entry) => /release|deploy|publish|build/i.test(entry.command)) || (signals.workflowFiles ?? []).length > 0),
      reason: () => 'The project already exposes build/release workflows or release-oriented commands.',
      confidence: () => 'medium',
      responsibilities: [
        'Define release checkpoints and rollback paths.',
        'Validate delivery readiness before publish.',
        'Keep deployment notes human-readable.',
      ],
      reads: () => unique([
        '.agentforge/context/deployment.md',
        '.agentforge/reports/pattern-research.md',
        'README.md',
        '.github/workflows/',
      ]),
      skills: () => ['create-implementation-plan', 'run-tests', 'review-changes'],
      flows: () => ['release'],
      limits: ['Do not publish without explicit approval gates when needed.', 'Do not assume rollbacks are free.'],
      evidence: (ctx) => [
        ...findEvidence(ctx.sources, [/\brelease\b/i, /\bdeploy\b/i, /\bpublish\b/i, /\brollback\b/i]),
      ],
    },
    {
      id: 'data-analyst',
      name: 'Data Analyst',
      category: 'data',
      description: 'Analyzes data models, migrations, and database implications.',
      when: () => dataStrong,
      reason: () => 'The project has a database or migration surface that needs careful handling.',
      confidence: () => 'medium',
      responsibilities: [
        'Explain data model impacts and migration risk.',
        'Keep schema changes visible and testable.',
        'Highlight rollback and recovery concerns.',
      ],
      reads: () => unique([
        '.agentforge/context/architecture.md',
        '.agentforge/context/glossary.md',
        '.agentforge/context/testing.md',
        'migrations/',
        'prisma/',
      ]),
      skills: () => ['run-tests', 'review-changes', 'create-implementation-plan'],
      flows: () => ['feature-development', 'bugfix'],
      limits: ['Do not assume destructive migrations are acceptable.', 'Do not hide data loss risk.'],
      evidence: (ctx) => [
        ...findEvidence(ctx.sources, [/\bprisma\b/i, /\bmigrations?\b/i, /\bpostgres/i, /\bdatabase\b/i, /\bschema\b/i]),
      ],
    },
    {
      id: 'documentation-curator',
      name: 'Documentation Curator',
      category: 'knowledge',
      description: 'Keeps README, docs, and context surfaces aligned and useful.',
      when: () => docsStrong,
      reason: () => 'README and docs surfaces are strong enough to deserve a dedicated curator.',
      confidence: () => 'high',
      responsibilities: [
        'Maintain a clear project narrative.',
        'Align docs with runtime and command changes.',
        'Prevent drift across README, docs, and context files.',
      ],
      reads: () => unique([
        'README.md',
        'docs/',
        'AGENTS.md',
        'CLAUDE.md',
        '.agentforge/context/',
        '.agentforge/reports/project-analysis.md',
      ]),
      skills: () => ['create-implementation-plan', 'review-changes'],
      flows: () => ['review', 'feature-development'],
      limits: ['Do not rewrite approved wording without a reason.', 'Do not invent product decisions.'],
      evidence: (ctx) => [
        ...evidenceFromPattern(ctx.patternResearch, 'documentation-heavy'),
        ...findEvidence(ctx.sources, [/\bobjective\b/i, /\baudience\b/i, /\barchitecture\b/i, /\btesting\b/i, /\broadmap\b/i]),
      ],
    },
    {
      id: 'knowledge-manager',
      name: 'Knowledge Manager',
      category: 'knowledge',
      description: 'Organizes reusable project knowledge and context assets.',
      when: () => docsStrong || (signals.instructionDocs ?? []).length > 0 || (signals.agentsFiles ?? []).length > 0,
      reason: () => 'The repo already carries enough context to benefit from explicit knowledge management.',
      confidence: () => (docsStrong ? 'medium' : 'low'),
      responsibilities: [
        'Keep context files discoverable and coherent.',
        'Reduce duplication across docs and snapshots.',
        'Capture recurring decisions and terms.',
      ],
      reads: () => unique([
        '.agentforge/context/',
        '.agentforge/memory/',
        '.agentforge/reports/ingest.md',
        '.agentforge/reports/project-analysis.md',
        'docs/',
      ]),
      skills: () => ['review-changes', 'create-implementation-plan'],
      flows: () => ['review'],
      limits: ['Do not treat memory as a source of truth without verification.', 'Do not fragment canonical context.'],
      evidence: (ctx) => [
        ...findEvidence(ctx.sources, [/\bmemory\b/i, /\bcontext\b/i, /\bknowledge\b/i, /\bterms?\b/i, /\bvocabulary\b/i]),
      ],
    },
    {
      id: 'security-reviewer',
      name: 'Security Reviewer',
      category: 'security',
      description: 'Reviews auth, secrets, permissions, and security-sensitive changes.',
      when: () => securityStrong || complianceStrong,
      reason: () => 'Security, auth, or approval signals are present and should remain visible.',
      confidence: () => (securityStrong ? 'medium' : 'low'),
      responsibilities: [
        'Identify secrets and permission risks.',
        'Block unsafe assumptions around auth and access.',
        'Keep security-sensitive surfaces explicit.',
      ],
      reads: () => unique([
        '.agentforge/policies/safety.yaml',
        '.agentforge/policies/protected-files.yaml',
        '.agentforge/policies/human-approval.yaml',
        'AGENTS.md',
        'CLAUDE.md',
      ]),
      skills: () => ['review-changes', 'run-tests'],
      flows: () => ['review'],
      limits: ['Do not expose secrets in reports.', 'Do not reduce security controls without approval.'],
      evidence: (ctx) => [
        ...findEvidence(ctx.sources, [/\bsecurity\b/i, /\bauth\b/i, /\bsecret\b/i, /\btoken\b/i, /\bpermission\b/i, /\bapproval\b/i]),
      ],
    },
    {
      id: 'compliance-reviewer',
      name: 'Compliance Reviewer',
      category: 'compliance',
      description: 'Checks policy, approval, and protected-file requirements.',
      when: () => complianceStrong || Boolean((signals.agentsFiles ?? []).length > 0),
      reason: () => 'Policies and protected surfaces are present and benefit from a compliance lens.',
      confidence: () => (complianceStrong ? 'medium' : 'low'),
      responsibilities: [
        'Validate approval and protected-file rules.',
        'Keep policy language consistent.',
        'Highlight required human checkpoints.',
      ],
      reads: () => unique([
        '.agentforge/policies/',
        '.agentforge/context/conventions.md',
        '.agentforge/context/architecture.md',
      ]),
      skills: () => ['review-changes', 'create-implementation-plan'],
      flows: () => ['review'],
      limits: ['Do not dilute approval requirements.', 'Do not edit policy scopes casually.'],
      evidence: (ctx) => [
        ...findEvidence(ctx.sources, [/\bpolicy\b/i, /\bhuman approval\b/i, /\bprotected files\b/i, /\bcompliance\b/i, /\bgovernance\b/i]),
      ],
    },
    {
      id: 'domain-specialist',
      name: 'Domain Specialist',
      category: 'domain',
      description: 'Clarifies domain concepts, business terms, and vocabulary.',
      when: () => domainStrong,
      reason: () => 'The repo exposes domain language or glossary material that should be centralized.',
      confidence: () => 'medium',
      responsibilities: [
        'Capture domain terminology.',
        'Clarify business concepts and their relationships.',
        'Keep glossary terms aligned with the project.',
      ],
      reads: () => unique([
        '.agentforge/context/glossary.md',
        '.agentforge/context/project-overview.md',
        'docs/',
        'README.md',
      ]),
      skills: () => ['create-implementation-plan', 'review-changes'],
      flows: () => ['feature-development', 'review'],
      limits: ['Do not invent business semantics.', 'Do not conflate technical and domain terms.'],
      evidence: (ctx) => [
        ...evidenceFromPattern(ctx.patternResearch, 'saas'),
        ...findEvidence(ctx.sources, [/\bdomain\b/i, /\bglossary\b/i, /\bbusiness\b/i, /\bvocabulary\b/i, /\bterminolog/i]),
      ],
    },
    {
      id: 'support-ops',
      name: 'Support Ops',
      category: 'support',
      description: 'Turns support, troubleshooting, and escalation knowledge into a usable surface.',
      when: () => supportStrong,
      reason: () => 'Support-oriented terms or documentation were found in the project.',
      confidence: () => 'low',
      responsibilities: [
        'Document support paths and escalation clues.',
        'Keep troubleshooting steps current.',
        'Link product issues to the right support surface.',
      ],
      reads: () => unique([
        'docs/',
        'README.md',
        '.agentforge/context/project-overview.md',
        '.agentforge/context/glossary.md',
      ]),
      skills: () => ['review-changes', 'create-implementation-plan'],
      flows: () => ['bugfix', 'review'],
      limits: ['Do not promise support coverage not present in the repo.', 'Do not invent SLAs.'],
      evidence: (ctx) => findEvidence(ctx.sources, [/\bsupport\b/i, /\bfaq\b/i, /\bticket\b/i, /\btroubleshoot/i, /\bhelp\b/i]),
    },
    {
      id: 'qa-strategist',
      name: 'QA Strategist',
      category: 'quality',
      description: 'Plans test strategy, validation scope, and regression coverage.',
      when: () => Boolean(signals.testsExists || (signals.testingCommands ?? []).length > 0 || hasPattern('automation-heavy')),
      reason: () => 'The project has tests, validation commands, or automation that should be planned deliberately.',
      confidence: () => 'high',
      responsibilities: [
        'Define the right validation mix.',
        'Keep regression risk visible.',
        'Tie test scope to the change size.',
      ],
      reads: () => unique([
        '.agentforge/context/testing.md',
        '.agentforge/reports/project-analysis.md',
        'tests/',
        'test/',
        'specs/',
        'README.md',
      ]),
      skills: () => ['run-tests', 'create-implementation-plan', 'review-changes'],
      flows: () => ['bugfix', 'review'],
      limits: ['Do not rewrite production code as a testing shortcut.', 'Do not obscure failing tests.'],
      evidence: (ctx) => [
        ...findEvidence(ctx.sources, [/\btest\b/i, /\blint\b/i, /\btypecheck\b/i, /\bcoverage\b/i, /\bvalidate\b/i]),
      ],
    },
    {
      id: 'reviewer',
      name: 'Reviewer',
      category: 'quality',
      description: 'Checks consistency, risk, and scope before changes are accepted.',
      when: () => Boolean(signals.testsExists || (signals.workflowFiles ?? []).length > 0 || complianceStrong || docsStrong),
      reason: () => 'The project has enough surface area to benefit from a dedicated review gate.',
      confidence: () => 'medium',
      responsibilities: [
        'Separate risk from implementation detail.',
        'Check scope, coverage, and safety.',
        'Keep approvals objective and actionable.',
      ],
      reads: () => unique([
        '.agentforge/flows/review.yaml',
        '.agentforge/policies/human-approval.yaml',
        '.agentforge/policies/protected-files.yaml',
        '.agentforge/context/conventions.md',
      ]),
      skills: () => ['review-changes', 'run-tests'],
      flows: () => ['review'],
      limits: ['Do not approve without evidence.', 'Do not alter policy while reviewing.'],
      evidence: (ctx) => [
        ...evidenceFromPattern(ctx.patternResearch, 'automation-heavy'),
        ...findEvidence(ctx.sources, [/\breview\b/i, /\bapprove\b/i, /\brisk\b/i, /\bcoverage\b/i]),
      ],
    },
    {
      id: 'product-planner',
      name: 'Product Planner',
      category: 'product',
      description: 'Turns product intent into priorities and acceptance boundaries.',
      when: () => productStrong,
      reason: () => 'README or project metadata already carries product intent and audience signals.',
      confidence: () => 'high',
      responsibilities: [
        'Turn intent into a prioritized plan.',
        'Keep criteria of acceptance explicit.',
        'Reduce ambiguity before implementation starts.',
      ],
      reads: () => unique([
        '.agentforge/scope.md',
        '.agentforge/state.json',
        'README.md',
        'docs/',
      ]),
      skills: () => ['create-implementation-plan', 'review-changes'],
      flows: () => ['feature-development'],
      limits: ['Do not invent roadmap commitments.', 'Do not rewrite technical policies.'],
      evidence: (ctx) => [
        ...evidenceFromPattern(ctx.patternResearch, 'saas'),
        ...findEvidence(ctx.sources, [/\bobjective\b/i, /\baudience\b/i, /\bproduct\b/i, /\busers?\b/i, /\bgoal\b/i]),
      ],
    },
    {
      id: 'requirements-analyst',
      name: 'Requirements Analyst',
      category: 'planning',
      description: 'Clarifies requirements, acceptance criteria, and scope edges.',
      when: () => productStrong || planningStrong,
      reason: () => 'The repository contains planning language or scope hints that should be normalized.',
      confidence: () => (planningStrong ? 'high' : 'medium'),
      responsibilities: [
        'Extract requirements from source material.',
        'Identify ambiguous constraints.',
        'Translate scope into concrete criteria.',
      ],
      reads: () => unique([
        'README.md',
        'docs/',
        '.agentforge/scope.md',
        '.agentforge/reports/project-analysis.md',
      ]),
      skills: () => ['create-implementation-plan', 'review-changes'],
      flows: () => ['feature-development', 'review'],
      limits: ['Do not guess missing requirements.', 'Do not expand scope silently.'],
      evidence: (ctx) => findEvidence(ctx.sources, [/\brequirement/i, /\bacceptance\b/i, /\bcriteria\b/i, /\bscope\b/i, /\buser story\b/i]),
    },
    {
      id: 'roadmap-strategist',
      name: 'Roadmap Strategist',
      category: 'planning',
      description: 'Organizes roadmap slices, sequencing, and milestones.',
      when: () => productStrong && (planningStrong || docsStrong),
      reason: () => 'The repo has enough product and documentation signal to benefit from sequencing guidance.',
      confidence: () => 'medium',
      responsibilities: [
        'Sequence work into milestones.',
        'Keep delivery order visible.',
        'Separate immediate and future scope.',
      ],
      reads: () => unique([
        '.agentforge/scope.md',
        '.agentforge/state.json',
        'docs/',
        'README.md',
      ]),
      skills: () => ['create-implementation-plan'],
      flows: () => ['feature-development'],
      limits: ['Do not create roadmap promises from thin evidence.', 'Do not blur milestone boundaries.'],
      evidence: (ctx) => findEvidence(ctx.sources, [/\broadmap\b/i, /\bmilestone\b/i, /\bbacklog\b/i, /\bpriority\b/i, /\bplan\b/i]),
    },
    {
      id: 'content-planner',
      name: 'Content Planner',
      category: 'content',
      description: 'Plans content surfaces, narratives, and supporting text.',
      when: () => docsStrong || productStrong,
      reason: () => 'Documentation and product text are strong enough to warrant content planning.',
      confidence: () => 'medium',
      responsibilities: [
        'Keep narratives consistent across docs and READMEs.',
        'Plan what text belongs where.',
        'Avoid fragmented messaging.',
      ],
      reads: () => unique([
        'README.md',
        'docs/',
        '.agentforge/context/project-overview.md',
        '.agentforge/context/conventions.md',
      ]),
      skills: () => ['create-implementation-plan', 'review-changes'],
      flows: () => ['review', 'feature-development'],
      limits: ['Do not invent marketing claims.', 'Do not duplicate canonical text without need.'],
      evidence: (ctx) => findEvidence(ctx.sources, [/\bcontent\b/i, /\bnarrative\b/i, /\bdocumentation\b/i, /\btext\b/i, /\bcopy\b/i]),
    },
  ];

  return rules.map((rule) => buildSuggestion(rule, context)).filter(Boolean);
}

function buildReport(analysis) {
  const lines = [];
  lines.push('# AgentForge Agent Suggestions');
  lines.push('');
  lines.push('## Project');
  lines.push('');
  lines.push(`- Project: ${analysis.signals.projectName || basename(analysis.projectRoot)}`);
  lines.push(`- Package manager: ${analysis.signals.packageManager}`);
  lines.push(`- Project type: ${analysis.signals.projectType || 'unknown'}`);
  lines.push(`- Stack detected: ${analysis.detectedStack.join(', ') || 'none'}`);
  lines.push(`- Pattern research: ${analysis.patternResearch.recommendedPatterns.length} recommended patterns, ${analysis.patternResearch.observedPatterns.length} observed patterns`);
  lines.push('');

  lines.push('## Recommended agents');
  lines.push('');
  if (analysis.suggestions.length === 0) {
    lines.push('- No agents crossed the suggestion threshold.');
    lines.push('');
  } else {
    for (const suggestion of analysis.suggestions) {
      lines.push(`### ${suggestion.name} (${suggestion.id})`);
      lines.push('');
      lines.push(`- Category: ${suggestion.category}`);
      lines.push(`- Confidence: ${suggestion.confidence}`);
      lines.push(`- Description: ${suggestion.description}`);
      lines.push(`- Reason: ${suggestion.reason}`);
      lines.push('- Evidence:');
      for (const item of suggestion.evidence.length > 0 ? suggestion.evidence : [{ path: 'none', line: null, snippet: 'No direct evidence found.' }]) {
        const lineSuffix = item.line ? `:${item.line}` : '';
        lines.push(`  - [${item.path}${lineSuffix}] ${item.snippet}`);
      }
      lines.push(`- Responsibilities:`);
      for (const responsibility of suggestion.responsibilities) {
        lines.push(`  - ${responsibility}`);
      }
      lines.push(`- Reads: ${suggestion.reads.join(', ') || '—'}`);
      lines.push(`- Skills: ${suggestion.skills.join(', ') || '—'}`);
      lines.push(`- Flows: ${suggestion.flows.join(', ') || '—'}`);
      lines.push(`- Limits:`);
      for (const limit of suggestion.limits) {
        lines.push(`  - ${limit}`);
      }
      lines.push('');
    }
  }

  const categoryCounts = new Map();
  for (const suggestion of analysis.suggestions) {
    categoryCounts.set(suggestion.category, (categoryCounts.get(suggestion.category) ?? 0) + 1);
  }

  lines.push('## Category coverage');
  lines.push('');
  if (categoryCounts.size === 0) {
    lines.push('- No categories covered.');
  } else {
    for (const [category, count] of [...categoryCounts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      lines.push(`- ${category}: ${count}`);
    }
  }
  lines.push('');

  lines.push('## Notes');
  lines.push('');
  lines.push('- Mode: legacy heuristic.');
  lines.push('- Final agents were not created. This command only writes suggestions inside `.agentforge/`.');
  lines.push('- Update `state.json` and the manifest only when suggestions are persisted.');
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function suggestionToYaml(suggestion) {
  return `${YAML.stringify(suggestion).trim()}\n`;
}

function shouldWriteSuggestionFile(projectRoot, manifest, relPath, { force = false } = {}) {
  if (force) return 'write';
  const absPath = join(projectRoot, relPath);
  if (!existsSync(absPath)) return 'create';
  const hash = manifest[relPath];
  if (!hash) return 'skip';
  return fileStatus(projectRoot, relPath, hash) === 'intact' ? 'write' : 'skip';
}

function updateStateAndManifest(projectRoot, manifest, writtenPaths, suggestions) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const nextState = {
    ...state,
    last_agent_suggestions_at: new Date().toISOString(),
    suggested_agents: suggestions.map((suggestion) => ({
      id: suggestion.id,
      name: suggestion.name,
      category: suggestion.category,
      confidence: suggestion.confidence,
      file_path: join(SUGGESTION_DIR, `${suggestion.id}.yaml`),
      reason: suggestion.reason,
    })),
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, [...writtenPaths, rel(projectRoot, statePath)]),
  });

  return nextState;
}

function updateAiFirstStateAndManifest(projectRoot, manifest, writtenPaths, bundle, artifacts) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const nextState = {
    ...state,
    last_agent_suggestion_request_at: new Date().toISOString(),
    agent_suggestion_request: {
      mode: 'ai-first',
      request_file: artifacts.requestPath,
      report_file: artifacts.reportPath,
      evidence_json_file: artifacts.evidenceJsonPath,
      evidence_brief_file: artifacts.evidenceBriefPath,
      evidence_report_file: artifacts.evidenceReportPath,
      evidence_count: bundle.evidence?.length ?? 0,
      status: 'pending_ai_response',
    },
    created_files: [...new Set([...createdFiles, ...writtenPaths, rel(projectRoot, statePath)])],
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, [...writtenPaths, rel(projectRoot, statePath)]),
  });

  return nextState;
}

function renderHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: Suggest Agents\n`));
  console.log(`  Uso: npx ${PRODUCT.command} suggest-agents [--heuristic] [--force]\n`);
  console.log('  Modo padrão: gera um request formal para a IA ativa sugerir agentes a partir do evidence bundle.');
  console.log('  Modo legado: use --heuristic ou --legacy-heuristic para manter as sugestões determinísticas e os YAMLs em `.agentforge/suggestions/agents/`.');
  console.log('  O modo padrão escreve `.agentforge/ai/requests/suggest-agents.md` e `.agentforge/reports/agent-suggestions.md`.\n');
}

export function runAgentSuggestions(projectRoot) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const state = installation.state ?? {};
  const signals = scanProjectSignals(projectRoot, { state });
  const patternResearch = runPatternResearch(projectRoot, { state, signals });
  const sources = collectSources(projectRoot, signals, patternResearch);
  const detectedStack = unique([
    ...signals.stackDetails,
    ...(patternResearch.detectedStack ?? []),
  ]);
  const context = { projectRoot, state, signals, patternResearch, sources, detectedStack };
  const suggestions = mergeSuggestionEntries(buildAgentSuggestionRules(context));

  return {
    ok: true,
    state,
    signals,
    patternResearch,
    sources,
    detectedStack,
    suggestions,
    report: buildReport({
      projectRoot,
      signals,
      patternResearch,
      suggestions,
      detectedStack,
    }),
  };
}

function persistAgentSuggestions(projectRoot, result, { force = false } = {}) {
  const writer = new Writer(projectRoot);
  const manifest = loadManifest(projectRoot);
  const writtenPaths = [];

  for (const suggestion of result.suggestions) {
    const relPath = join(SUGGESTION_DIR, `${suggestion.id}.yaml`);
    const decision = shouldWriteSuggestionFile(projectRoot, manifest, relPath, { force });
    if (decision === 'skip') continue;

    suggestion.file_path = relPath;
    const payload = {
      id: suggestion.id,
      name: suggestion.name,
      category: suggestion.category,
      description: suggestion.description,
      reason: suggestion.reason,
      confidence: suggestion.confidence,
      evidence: suggestion.evidence,
      responsibilities: suggestion.responsibilities,
      reads: suggestion.reads,
      skills: suggestion.skills,
      flows: suggestion.flows,
      limits: suggestion.limits,
    };
    writer.writeGeneratedFile(join(projectRoot, relPath), suggestionToYaml(payload), { force: true });
    writtenPaths.push(relPath);
  }

  writer.writeGeneratedFile(join(projectRoot, REPORT_REL_PATH), result.report, { force: true });
  writtenPaths.push(REPORT_REL_PATH);

  writer.saveCreatedFiles();
  const nextState = updateStateAndManifest(projectRoot, manifest, writtenPaths, result.suggestions);

  return {
    writtenPaths,
    state: nextState,
  };
}

function renderAiFirstReport({ bundle, requestPath, reportPath, evidenceArtifacts }) {
  const lines = [];
  lines.push('# AgentForge Agent Suggestions');
  lines.push('');
  lines.push('## Mode');
  lines.push('');
  lines.push('- Mode: AI-first');
  lines.push('- This command generated a formal request for the active AI instead of pretending a local heuristic judged the project.');
  lines.push('- The next step is for the active AI to read the request and produce the actual agent suggestions.');
  lines.push('');
  lines.push('## Artifacts');
  lines.push('');
  lines.push(`- Request: \`${requestPath}\``);
  lines.push(`- Agent evidence JSON: \`${evidenceArtifacts.jsonPath}\``);
  lines.push(`- Agent evidence brief: \`${evidenceArtifacts.briefPath}\``);
  lines.push(`- Agent evidence report: \`${evidenceArtifacts.reportPath}\``);
  lines.push(`- Report: \`${reportPath}\``);
  lines.push('');
  lines.push('## Project');
  lines.push('');
  lines.push(`- Project: ${bundle.project?.name || basename(bundle.projectRoot || '.')}`);
  lines.push(`- Type: ${bundle.project?.type || 'unknown'}`);
  lines.push(`- Framework: ${bundle.stack?.framework || 'unknown'}`);
  lines.push(`- Evidence items: ${bundle.evidence?.length ?? 0}`);
  lines.push('');
  lines.push('## Next step');
  lines.push('');
  lines.push(`- Open \`${requestPath}\` and have the active AI return YAML suggestions that satisfy the schema documented there.`);
  lines.push('- Do not create agent YAMLs unless the AI response is reviewed and applied deliberately.');
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function buildAiFirstAgentSuggestionArtifacts(projectRoot, { force = false } = {}) {
  const evidenceArtifacts = buildAiEvidenceArtifacts(projectRoot, { force });
  if (!evidenceArtifacts.ok) {
    return evidenceArtifacts;
  }

  const bundle = evidenceArtifacts.bundle;
  const requestText = renderAgentSuggestionRequest(bundle);
  const reportText = renderAiFirstReport({
    bundle,
    requestPath: AI_REQUEST_REL_PATH,
    reportPath: REPORT_REL_PATH,
    evidenceArtifacts,
  });

  const writer = new Writer(projectRoot);
  const writtenPaths = [];
  const writeIfNeeded = (relTarget, content) => {
    const absTarget = join(projectRoot, relTarget);
    const wrote = writer.writeGeneratedFile(absTarget, content, { force });
    if (wrote) writtenPaths.push(relTarget);
    return wrote;
  };

  writeIfNeeded(AI_REQUEST_REL_PATH, requestText);
  writeIfNeeded(REPORT_REL_PATH, reportText);
  writer.saveCreatedFiles();

  const manifest = loadManifest(projectRoot);
  const nextState = updateAiFirstStateAndManifest(projectRoot, manifest, writtenPaths, bundle, {
    requestPath: AI_REQUEST_REL_PATH,
    reportPath: REPORT_REL_PATH,
    evidenceJsonPath: evidenceArtifacts.jsonPath,
    evidenceBriefPath: evidenceArtifacts.briefPath,
    evidenceReportPath: evidenceArtifacts.reportPath,
  });

  return {
    ok: true,
    mode: 'ai-first',
    bundle,
    evidenceArtifacts,
    requestPath: AI_REQUEST_REL_PATH,
    reportPath: REPORT_REL_PATH,
    requestText,
    reportText,
    writtenPaths,
    state: nextState,
  };
}

export default async function suggestAgents(args = []) {
  const { default: chalk } = await import('chalk');
  const parsed = {
    help: false,
    force: false,
    heuristic: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--force') {
      parsed.force = true;
      continue;
    }
    if (arg === '--heuristic' || arg === '--legacy-heuristic') {
      parsed.heuristic = true;
    }
  }

  if (parsed.help) {
    renderHelp(chalk);
    return 0;
  }

  const projectRoot = process.cwd();
  if (parsed.heuristic) {
    const result = runAgentSuggestions(projectRoot);
    if (!result.ok) {
      console.log(chalk.yellow(`  ${result.errors[0]}`));
      return 1;
    }

    const persisted = persistAgentSuggestions(projectRoot, result, { force: parsed.force });

    console.log(chalk.hex('#ffa203')(`  Agentes sugeridos em ${REPORT_REL_PATH}`));
    console.log(chalk.gray(`  Sugestões: ${result.suggestions.length}`));
    console.log(chalk.gray(`  YAML gerados/atualizados: ${persisted.writtenPaths.filter((path) => path !== REPORT_REL_PATH).length}`));
    console.log(chalk.gray(`  Stack detectada: ${persisted.state.detected_stack?.join(', ') || 'none'}`));
    return 0;
  }

  const result = buildAiFirstAgentSuggestionArtifacts(projectRoot, { force: parsed.force });
  if (!result.ok) {
    console.log(chalk.yellow(`  ${result.errors[0]}`));
    return 1;
  }

  console.log(chalk.hex('#ffa203')(`  Request written to ${result.requestPath}`));
  console.log(chalk.gray(`  Report: ${result.reportPath}`));
  console.log(chalk.gray(`  Evidence bundle: ${result.evidenceArtifacts.reportPath}`));
  console.log(chalk.gray(`  Next step: active AI should answer ${result.requestPath}`));
  return 0;
}
