import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, extname, join, relative, sep } from 'path';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';
import { runIngest } from './ingest.js';
import { runContextAudit } from './audit-context.js';
import { runPatternResearch } from './pattern-research.js';
import { scanProjectSignals } from './project-signals.js';
import { applyCoreContextSynthesis } from './context-synthesis.js';

const ANALYSIS_REPORT_PATH = '.agentforge/reports/project-analysis.md';
const ANALYSIS_PLAN_PATH = '.agentforge/reports/analysis-plan.md';
const SUGGESTION_BASE_DIR = '.agentforge/suggestions';
const SUGGESTION_DIRS = {
  agents: join(SUGGESTION_BASE_DIR, 'agents'),
  skills: join(SUGGESTION_BASE_DIR, 'skills'),
  flows: join(SUGGESTION_BASE_DIR, 'flows'),
  policies: join(SUGGESTION_BASE_DIR, 'policies'),
  context: join(SUGGESTION_BASE_DIR, 'context'),
};

const AGENTIC_SURFACE_TARGETS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
  '.cursor/rules/agentforge.md',
  '.agents',
  '.claude/agents',
  '.claude/skills',
  '.github/agents',
];

const EXTRA_CODE_DIRS = ['lib', 'libs', 'modules', 'packages'];

const CONTEXT_TARGETS = [
  'project-overview.md',
  'architecture.md',
  'testing.md',
  'deployment.md',
  'conventions.md',
  'glossary.md',
];

function toPosixPath(path) {
  return String(path ?? '').split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function listFilesRecursive(dirPath, { markdownOnly = false } = {}) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, { markdownOnly }));
      continue;
    }
    if (markdownOnly && extname(fullPath).toLowerCase() !== '.md') continue;
    files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJson(filePath) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectAgenticSurface(projectRoot) {
  return AGENTIC_SURFACE_TARGETS
    .filter((target) => existsSync(join(projectRoot, target)))
    .map((target) => target);
}

function collectExtraCodeSurface(projectRoot) {
  return EXTRA_CODE_DIRS
    .filter((dir) => existsSync(join(projectRoot, dir)))
    .map((dir) => ({
      path: dir,
      fileCount: listFilesRecursive(join(projectRoot, dir)).length,
    }));
}

function inferFramework(signals) {
  const deps = new Set((signals.dependencyNames ?? []).map((name) => String(name).toLowerCase()));

  if (deps.has('next')) return 'Next.js';
  if (deps.has('react') || deps.has('react-dom')) return 'React';
  if (deps.has('vue')) return 'Vue';
  if (deps.has('svelte')) return 'Svelte';
  if (deps.has('solid-js')) return 'SolidJS';
  if (deps.has('@angular/core')) return 'Angular';
  if (deps.has('express')) return 'Express';
  if (deps.has('fastify')) return 'Fastify';
  if (deps.has('hono')) return 'Hono';
  if (deps.has('nestjs')) return 'NestJS';
  if (deps.has('koa')) return 'Koa';
  if (deps.has('nuxt')) return 'Nuxt';
  if (deps.has('prisma')) return 'Prisma';
  if (signals.pyproject || signals.requirements) return 'Python';
  if (signals.composerJson) return 'PHP';
  return signals.packageJson ? 'Node.js' : 'Unknown';
}

function inferProbableArchitecture(signals, extraSurface) {
  const layers = signals.architectureLayers?.length > 0 ? signals.architectureLayers : [];
  const areas = signals.mainAreas?.length > 0 ? signals.mainAreas.map((item) => item.label) : [];
  const roots = unique([
    ...(signals.appExists ? ['app/'] : []),
    ...(signals.srcExists ? ['src/'] : []),
    ...(signals.workerExists ? ['worker/'] : []),
    ...(signals.docsExists ? ['docs/'] : []),
    ...(signals.migrationsExists ? ['migrations/'] : []),
    ...(signals.workflowFiles?.length > 0 ? ['.github/workflows/'] : []),
    ...extraSurface.map((item) => item.path),
  ]);

  if (layers.length > 0 && roots.length > 0) {
    return `${layers.join(' + ')} com superfícies principais em ${roots.slice(0, 4).join(', ')}`;
  }

  if (roots.length > 0) {
    return `Projeto distribuído com superfícies em ${roots.slice(0, 4).join(', ')}`;
  }

  if (areas.length > 0) {
    return `Arquitetura inferida a partir das áreas ${areas.slice(0, 4).join(', ')}`;
  }

  return 'Arquitetura ainda pouco explícita nos sinais locais';
}

function detectAutomationSignals(signals) {
  const commands = signals.projectCommands ?? [];
  return unique([
    commands.some((entry) => /test|lint|typecheck|coverage/i.test(entry.command)) ? 'test/lint/typecheck scripts' : '',
    commands.some((entry) => /agentforge\s+(analyze|adopt|audit-context|suggest-skills|refactor-context|validate|compile|export)/i.test(entry.command)) ? 'AgentForge workflow commands' : '',
    (signals.workflowFiles ?? []).length > 0 ? 'GitHub Actions' : '',
    signals.dockerfile ? 'Dockerfile' : '',
    signals.composeFile ? signals.composeFile : '',
  ]);
}

function detectProductSignals(signals, audit) {
  return unique([
    signals.projectName ? `project=${signals.projectName}` : '',
    signals.projectType ? `type=${signals.projectType}` : '',
    signals.objectiveText ? signals.objectiveText : '',
    signals.audienceText ? signals.audienceText : '',
    (signals.docsFiles ?? []).length > 0 ? 'docs library' : '',
    (audit?.analysis?.missingReadmes ?? []).length > 0 ? 'documentation gaps' : '',
  ]);
}

function detectIntegrationSignals(signals) {
  return unique([
    signals.workflowFiles?.length > 0 ? '.github/workflows/' : '',
    signals.dockerfile ? 'Dockerfile' : '',
    signals.composeFile ? signals.composeFile : '',
    signals.authDetected ? 'auth' : '',
    signals.workflowFiles?.length > 0 || signals.dockerfile || signals.composeFile ? 'deployment automation' : '',
  ]);
}

function detectDataSignals(signals) {
  return unique([
    signals.prismaExists ? 'Prisma' : '',
    signals.migrationsExists ? 'migrations/' : '',
    signals.dependencyNames?.some((name) => /^(pg|postgres|mysql|sqlite|sqlite3|better-sqlite3|mongodb|mongoose)/i.test(name)) ? 'database dependencies' : '',
    signals.stackDetails?.some((item) => /PostgreSQL|MySQL|SQLite/i.test(item)) ? 'database stack' : '',
  ]);
}

function detectSecuritySignals(signals) {
  const blob = normalizeText([
    signals.readmeText,
    signals.agentsText,
    signals.claudeText,
    ...(signals.instructionDocs ?? []).map((doc) => doc.content),
  ].join('\n'));

  return unique([
    /secret|token|credential|env|permissions|approval/.test(blob) ? 'security language in docs' : '',
    signals.dependencyNames?.some((name) => /^(auth\.js|next-auth|@auth\/core|@auth\/nextjs)/i.test(name)) ? 'auth dependency' : '',
    (signals.workflowFiles ?? []).length > 0 ? 'CI/CD surface' : '',
    signals.dockerfile ? 'containerized runtime' : '',
  ]);
}

function detectRisks(signals, audit, extraSurface) {
  const risks = [];
  const hasTestSignal = (signals.packageScripts ?? []).some((script) => script.name === 'test')
    || (signals.testingCommands ?? []).some((entry) => /test/i.test(entry.command));

  if (!signals.packageJson) {
    risks.push('package.json ausente reduz a confianca na detecao de stack e comandos.');
  }
  if (!hasTestSignal && !signals.testsExists) {
    risks.push('Nao ha sinais fortes de testes automatizados.');
  }
  if ((signals.workflowFiles ?? []).length === 0 && !signals.dockerfile && !signals.composeFile) {
    risks.push('Automacao de entrega e ambiente parecem pouco documentadas.');
  }
  if ((signals.migrationsExists || signals.prismaExists) && !detectDataSignals(signals).some((item) => /database/i.test(item) || /Prisma/i.test(item))) {
    risks.push('A camada de dados existe, mas os sinais de operacao ainda estao difusos.');
  }
  if ((audit?.analysis?.contextIndexIssues ?? []).length > 0) {
    risks.push(`Context index tem ${audit.analysis.contextIndexIssues.length} problema(s) de estrutura.`);
  }
  if ((audit?.analysis?.largeFiles ?? []).length > 0) {
    risks.push(`Ha ${audit.analysis.largeFiles.length} arquivo(s) grande(s) que podem dificultar manutencao.`);
  }
  if ((extraSurface ?? []).some((item) => item.path === 'modules' || item.path === 'libs') && (signals.mainAreas ?? []).length === 0) {
    risks.push('Existem superficies de codigo extras sem um mapa de areas claro.');
  }

  return unique(risks);
}

function detectLocalPatterns(signals, audit, extraSurface) {
  const patterns = [];

  if ((signals.projectCommands ?? []).length > 0) {
    patterns.push({
      id: 'command-driven-automation',
      title: 'Command-driven automation',
      evidence: 'package.json scripts and docs command references',
      implication: 'The project already depends on reproducible commands and should expose them clearly in context.',
    });
  }

  if ((signals.docsFiles ?? []).length > 0 || signals.readmeExists) {
    patterns.push({
      id: 'docs-as-product-surface',
      title: 'Docs as product surface',
      evidence: 'README/docs entries and planning language',
      implication: 'Context files should summarize the product before deeper refactors or new agents are created.',
    });
  }

  if ((signals.workflowFiles ?? []).length > 0 || signals.dockerfile || signals.composeFile) {
    patterns.push({
      id: 'automation-and-ops',
      title: 'Automation and ops overlap',
      evidence: '.github/workflows, Dockerfile, compose files',
      implication: 'DevOps and deployment guidance should be explicit before changing runtime behavior.',
    });
  }

  if ((signals.prismaExists || signals.migrationsExists || detectDataSignals(signals).length > 0)) {
    patterns.push({
      id: 'data-aware-surface',
      title: 'Data-aware surface',
      evidence: 'database dependencies or migration paths',
      implication: 'Data model, migration rules, and rollback guidance should be documented early.',
    });
  }

  if ((signals.agentsFiles ?? []).length > 0 || (signals.instructionDocs ?? []).some((doc) => /agent|policy|workflow/i.test(`${doc.path}\n${doc.content}`))) {
    patterns.push({
      id: 'agentic-instructions',
      title: 'Agentic instructions',
      evidence: 'AGENTS/CLAUDE/docs-based instruction surfaces',
      implication: 'Context files and policies should be kept in sync with the instruction surfaces.',
    });
  }

  if ((audit?.analysis?.contextIndexIssues ?? []).length > 0 || (audit?.analysis?.missingReadmes ?? []).length > 0) {
    patterns.push({
      id: 'context-gap-signal',
      title: 'Context gaps',
      evidence: 'missing READMEs or context-index issues',
      implication: 'Context refactor should happen before creating more specialization layers.',
    });
  }

  if ((extraSurface ?? []).some((item) => item.path === 'libs' || item.path === 'modules')) {
    patterns.push({
      id: 'multi-root-code-surface',
      title: 'Multi-root code surface',
      evidence: 'libs/modules directories',
      implication: 'Architecture guidance should explain where shared modules live and who owns them.',
    });
  }

  return patterns;
}

function buildAgentSuggestions(analysis) {
  const suggestions = [];
  const signals = analysis.signals;
  const patterns = analysis.localPatterns;

  const push = (suggestion) => suggestions.push(suggestion);

  if (signals.projectType || analysis.productSignals.length > 0) {
    push({
      id: 'product-owner',
      title: 'Product Owner',
      description: 'Own the product vision, priorities, and acceptance criteria surfaced by the repository.',
      reason: 'README/docs and planning signals indicate a strong product layer.',
      confidence: 'high',
      target_path: '.agentforge/agents/product-owner.yaml',
      signals: ['README.md', 'docs/', 'planning language'],
      recommended_context: ['context/project-overview.md', 'context/glossary.md', 'context/conventions.md'],
      recommended_steps: [
        'Capture the project objective and audience.',
        'List the main product constraints visible in the repo.',
        'Describe the decision boundaries before adding new flows.',
      ],
      safety_limits: ['Do not invent roadmap decisions that the repository does not support.'],
      status: 'recommended',
    });
  }

  if ((signals.architectureLayers ?? []).length >= 2 || (analysis.extraCodeSurface ?? []).length > 0) {
    push({
      id: 'architect',
      title: 'Architect',
      description: 'Map architecture boundaries, shared modules, and cross-cutting dependencies.',
      reason: 'The project exposes multiple layers or code roots that need a structural view.',
      confidence: 'high',
      target_path: '.agentforge/agents/architect.yaml',
      signals: unique([
        ...(signals.architectureLayers ?? []),
        ...(analysis.extraCodeSurface ?? []).map((item) => item.path),
      ]),
      recommended_context: ['context/architecture.md', 'context/conventions.md', 'context/deployment.md'],
      recommended_steps: [
        'Document the main code boundaries.',
        'Explain what belongs in each root folder.',
        'Note integration points and ownership rules.',
      ],
      safety_limits: ['Do not blur module boundaries just to reduce file count.'],
      status: 'recommended',
    });
  }

  if ((signals.testsExists || (signals.testingCommands ?? []).length > 0) && (signals.projectCommands ?? []).some((entry) => /test/i.test(entry.command))) {
    push({
      id: 'qa',
      title: 'QA',
      description: 'Keep regression, smoke, and validation behavior visible before changes ship.',
      reason: 'Tests and validation commands are present and should be treated as a dedicated concern.',
      confidence: 'high',
      target_path: '.agentforge/agents/qa.yaml',
      signals: ['tests/', 'test commands'],
      recommended_context: ['context/testing.md', 'references/commands.md'],
      recommended_steps: [
        'Document the primary test command and scope.',
        'Note when to run full versus targeted validation.',
        'Record common failure modes and how to interpret them.',
      ],
      safety_limits: ['Do not rewrite production files when validating test behavior.'],
      status: 'recommended',
    });
  }

  if (analysis.automationSignals.some((item) => /GitHub Actions|Docker|compose|automation/i.test(item))) {
    push({
      id: 'devops',
      title: 'DevOps',
      description: 'Own deployment, environment, and workflow automation guidance.',
      reason: 'CI/CD or containerization signals indicate operational work that deserves a dedicated agent.',
      confidence: 'high',
      target_path: '.agentforge/agents/devops.yaml',
      signals: analysis.automationSignals,
      recommended_context: ['context/deployment.md', 'context/architecture.md', 'references/tools.md'],
      recommended_steps: [
        'List the automation surfaces and their ownership.',
        'Describe how to validate delivery changes safely.',
        'Document rollback and environment assumptions.',
      ],
      safety_limits: ['Do not change deployment credentials or pipeline secrets automatically.'],
      status: 'recommended',
    });
  }

  if (analysis.securitySignals.length > 0 || analysis.integrationSignals.length > 0) {
    push({
      id: 'security',
      title: 'Security',
      description: 'Review permissions, secrets, and high-risk changes before they are promoted.',
      reason: 'The repo shows security, auth, deployment, or protected-file signals.',
      confidence: 'medium',
      target_path: '.agentforge/agents/security.yaml',
      signals: unique([...analysis.securitySignals, ...analysis.integrationSignals]),
      recommended_context: ['policies/safety.md', 'policies/protected-files.md', 'policies/human-approval.md'],
      recommended_steps: [
        'Document what requires human approval.',
        'List protected files and secret-bearing surfaces.',
        'State the safe-by-default constraints clearly.',
      ],
      safety_limits: ['Never expose secrets or relax policy without explicit approval.'],
      status: 'recommended',
    });
  }

  if (analysis.dataSignals.length > 0) {
    push({
      id: 'data-master',
      title: 'Data Master',
      description: 'Own data model, migration, and rollback guidance for the project.',
      reason: 'Database or migration signals are present.',
      confidence: 'medium',
      target_path: '.agentforge/agents/data-master.yaml',
      signals: analysis.dataSignals,
      recommended_context: ['context/architecture.md', 'context/deployment.md', 'context/glossary.md'],
      recommended_steps: [
        'Describe the data model and migration flow.',
        'List rollback and backup expectations.',
        'Define how schema changes should be reviewed.',
      ],
      safety_limits: ['Do not infer destructive migration behavior from incomplete evidence.'],
      status: 'recommended',
    });
  }

  if (patterns.some((pattern) => ['documentation-heavy', 'automation-heavy', 'monorepo', 'api', 'cli'].includes(pattern.id))) {
    push({
      id: 'reviewer',
      title: 'Reviewer',
      description: 'Review the consolidated analysis and separate risks from recommendations.',
      reason: 'Documentation, automation, or structural patterns were detected and should be reviewed separately.',
      confidence: 'medium',
      target_path: '.agentforge/agents/reviewer.yaml',
      signals: patterns.map((pattern) => pattern.id),
      recommended_context: ['context/conventions.md', 'policies/human-approval.md'],
      recommended_steps: [
        'Turn risks into review checkpoints.',
        'Check that the analysis plan is actionable.',
        'Keep the review output concise and enforceable.',
      ],
      safety_limits: ['Do not approve a plan that still has open context gaps.'],
      status: 'recommended',
    });
  }

  return suggestions;
}

function buildSkillSuggestions(analysis) {
  const suggestions = [];
  const signals = analysis.signals;

  const add = (suggestion) => suggestions.push(suggestion);

  if (signals.testsExists || (signals.testingCommands ?? []).length > 0) {
    add({
      id: 'run-tests',
      title: 'Run Tests',
      description: 'Run and interpret the project test suite with the right scope.',
      reason: 'The repo has explicit test signals.',
      confidence: 'high',
      target_path: '.agentforge/skills/run-tests/SKILL.md',
      signals: ['tests', 'test commands'],
      recommended_context: ['context/testing.md', 'references/commands.md'],
      recommended_steps: ['Map the primary test command.', 'Describe partial versus full test runs.', 'Record common failure patterns.'],
      safety_limits: ['Avoid changing production code just to get a passing test without understanding the regression.'],
      status: 'recommended',
    });
  }

  if ((signals.docsFiles ?? []).length > 0 || signals.readmeExists) {
    add({
      id: 'update-docs',
      title: 'Update Docs',
      description: 'Keep project documentation aligned with the codebase and workflows.',
      reason: 'The project exposes a documentation surface.',
      confidence: 'high',
      target_path: '.agentforge/skills/update-docs/SKILL.md',
      signals: ['README.md', 'docs/'],
      recommended_context: ['context/project-overview.md', 'context/conventions.md'],
      recommended_steps: ['Separate overview, usage, and maintenance notes.', 'Keep examples aligned with commands.', 'Preserve approved wording.'],
      safety_limits: ['Do not rewrite documentation blindly when the repo already contains approved language.'],
      status: 'recommended',
    });
  }

  if ((signals.workflowFiles ?? []).length > 0) {
    add({
      id: 'ci-diagnosis',
      title: 'CI Diagnosis',
      description: 'Diagnose CI failures and automation problems in workflows.',
      reason: 'GitHub Actions or similar automation is present.',
      confidence: 'high',
      target_path: '.agentforge/skills/ci-diagnosis/SKILL.md',
      signals: ['.github/workflows/'],
      recommended_context: ['references/commands.md', 'context/testing.md', 'policies/safety.md'],
      recommended_steps: ['List workflows and their purpose.', 'Describe triage flow for failures.', 'Capture environment versus code failures.'],
      safety_limits: ['Do not edit secrets or workflow credentials automatically.'],
      status: 'recommended',
    });
  }

  if (analysis.dataSignals.length > 0) {
    add({
      id: 'database-migration',
      title: 'Database Migration',
      description: 'Plan schema changes, migrations, and rollback safety.',
      reason: 'Database and migration signals are present.',
      confidence: 'high',
      target_path: '.agentforge/skills/database-migration/SKILL.md',
      signals: analysis.dataSignals,
      recommended_context: ['context/architecture.md', 'context/deployment.md', 'references/important-files.md'],
      recommended_steps: ['Document the migration process.', 'Split destructive and safe changes.', 'Record rollback steps.'],
      safety_limits: ['Never execute destructive migrations automatically.'],
      status: 'recommended',
    });
  }

  if (analysis.securitySignals.length > 0) {
    add({
      id: 'security-review',
      title: 'Security Review',
      description: 'Review secrets, permissions, and high-risk changes.',
      reason: 'Security or protected-file signals are present.',
      confidence: 'medium',
      target_path: '.agentforge/skills/security-review/SKILL.md',
      signals: analysis.securitySignals,
      recommended_context: ['policies/safety.md', 'policies/protected-files.md', 'policies/human-approval.md'],
      recommended_steps: ['List risk-bearing surfaces.', 'Describe approval requirements.', 'Identify sensitive inputs and outputs.'],
      safety_limits: ['Do not expose secrets or tokens in the generated material.'],
      status: 'recommended',
    });
  }

  if (analysis.framework === 'Next.js' || analysis.framework === 'React' || analysis.signals.appExists || analysis.signals.srcExists) {
    add({
      id: 'frontend-component-review',
      title: 'Frontend Component Review',
      description: 'Review component structure, accessibility, and visual consistency.',
      reason: 'The project has a frontend component surface.',
      confidence: 'medium',
      target_path: '.agentforge/skills/frontend-component-review/SKILL.md',
      signals: ['app/', 'src/', analysis.framework],
      recommended_context: ['context/conventions.md', 'context/architecture.md', 'references/commands.md'],
      recommended_steps: ['Separate structure, style, and behavior.', 'Review accessibility.', 'Confirm test coverage for UI changes.'],
      safety_limits: ['Do not widen the UI scope while fixing a local component issue.'],
      status: 'recommended',
    });
  }

  if (analysis.framework === 'Express' || analysis.framework === 'Fastify' || analysis.framework === 'Hono' || analysis.framework === 'NestJS' || analysis.integrationSignals.some((item) => /api|deployment/i.test(item))) {
    add({
      id: 'backend-endpoint-review',
      title: 'Backend Endpoint Review',
      description: 'Review handlers, routes, and API contracts on the backend.',
      reason: 'Backend or integration signals suggest route-level work.',
      confidence: 'medium',
      target_path: '.agentforge/skills/backend-endpoint-review/SKILL.md',
      signals: ['api', 'routes', analysis.framework],
      recommended_context: ['context/architecture.md', 'context/conventions.md', 'references/commands.md'],
      recommended_steps: ['Map request and response shapes.', 'Note validation and error handling.', 'Record compatibility concerns.'],
      safety_limits: ['Do not change contract semantics without calling out the impact.'],
      status: 'recommended',
    });
  }

  if (analysis.automationSignals.some((item) => /GitHub Actions|Docker|compose/i.test(item))) {
    add({
      id: 'release-checklist',
      title: 'Release Checklist',
      description: 'Prepare release steps, validations, and rollback notes.',
      reason: 'The project has release or deployment automation signals.',
      confidence: 'medium',
      target_path: '.agentforge/skills/release-checklist/SKILL.md',
      signals: analysis.automationSignals,
      recommended_context: ['flows/review.md', 'policies/human-approval.md', 'context/deployment.md'],
      recommended_steps: ['Document release checks.', 'List approvals and rollback steps.', 'Record post-deploy validations.'],
      safety_limits: ['Do not assume release automation is safe without explicit approval gates.'],
      status: 'recommended',
    });
  }

  return suggestions;
}

function buildFlowSuggestions(analysis) {
  const suggestions = [];
  const push = (suggestion) => suggestions.push(suggestion);

  if (analysis.productSignals.length > 0 || analysis.mainAreas.length > 0) {
    push({
      id: 'feature-development',
      title: 'Feature Development',
      description: 'Main flow for safe, incremental feature delivery.',
      reason: 'The repo exposes product and code surfaces that need a standard feature path.',
      confidence: 'high',
      target_path: '.agentforge/flows/feature-development.yaml',
      signals: analysis.productSignals,
      recommended_context: ['context/project-overview.md', 'context/architecture.md', 'context/testing.md'],
      recommended_steps: ['Define intake and scope.', 'List implementation checkpoints.', 'Require validation before delivery.'],
      safety_limits: ['Do not skip the validation step when new code paths are added.'],
      status: 'recommended',
    });
  }

  if (analysis.risks.some((risk) => /test|validation/i.test(risk))) {
    push({
      id: 'bugfix',
      title: 'Bugfix',
      description: 'Flow for small, safe fixes with validation checkpoints.',
      reason: 'Validation or testing risks indicate a dedicated bugfix path is useful.',
      confidence: 'high',
      target_path: '.agentforge/flows/bugfix.yaml',
      signals: analysis.risks,
      recommended_context: ['context/testing.md', 'policies/human-approval.md'],
      recommended_steps: ['Describe the bug and reproduction.', 'Apply the smallest fix possible.', 'Validate the regression path.'],
      safety_limits: ['Do not mix unrelated refactors into a bugfix flow.'],
      status: 'recommended',
    });
  }

  if (analysis.localPatterns.some((pattern) => ['documentation-heavy', 'automation-heavy', 'monorepo', 'api', 'cli', 'nestjs'].includes(pattern.id))) {
    push({
      id: 'review',
      title: 'Review',
      description: 'Flow for reviewing changes, risks, and approval boundaries.',
      reason: 'The repo shows documentation, automation, or structural patterns that benefit from a review path.',
      confidence: 'medium',
      target_path: '.agentforge/flows/review.yaml',
      signals: analysis.localPatterns.map((pattern) => pattern.id),
      recommended_context: ['context/conventions.md', 'policies/human-approval.md', 'policies/protected-files.md'],
      recommended_steps: ['Summarize the change set.', 'Separate risk from recommendations.', 'Define the approval path.'],
      safety_limits: ['Do not auto-approve a review flow with open risks.'],
      status: 'recommended',
    });
  }

  if (analysis.automationSignals.some((item) => /GitHub Actions|Docker|compose|deployment/i.test(item)) || analysis.dataSignals.length > 0) {
    push({
      id: 'release',
      title: 'Release',
      description: 'Flow for publishing or shipping changes with operational checks.',
      reason: 'Deployment, CI, or data changes need a release-focused path.',
      confidence: 'medium',
      target_path: '.agentforge/flows/release.yaml',
      signals: unique([...analysis.automationSignals, ...analysis.dataSignals]),
      recommended_context: ['context/deployment.md', 'policies/human-approval.md', 'policies/safety.md'],
      recommended_steps: ['List release gates.', 'Call out rollback conditions.', 'Include post-release verification.'],
      safety_limits: ['Never assume a release is safe without a rollback plan.'],
      status: 'recommended',
    });
  }

  return suggestions;
}

function buildPolicySuggestions(analysis) {
  const suggestions = [];
  const push = (suggestion) => suggestions.push(suggestion);

  if (analysis.securitySignals.length > 0 || analysis.integrationSignals.length > 0) {
    push({
      id: 'safety',
      title: 'Safety Policy',
      description: 'Define the safe-by-default rules for risky or destructive actions.',
      reason: 'Security, deployment, or operational signals indicate explicit safety rules are needed.',
      confidence: 'high',
      target_path: '.agentforge/policies/safety.yaml',
      signals: unique([...analysis.securitySignals, ...analysis.integrationSignals]),
      recommended_context: ['context/conventions.md', 'context/deployment.md'],
      recommended_steps: ['List destructive actions.', 'Name safe alternatives.', 'Keep the policy concise and enforceable.'],
      safety_limits: ['Do not turn the safety policy into a vague checklist.'],
      status: 'recommended',
    });
  }

  if ((analysis.risks ?? []).length > 0 || analysis.auditScore < 80) {
    push({
      id: 'human-approval',
      title: 'Human Approval',
      description: 'Describe when a human must review or approve a change.',
      reason: 'The analysis surface contains enough risk to justify explicit approval gates.',
      confidence: 'medium',
      target_path: '.agentforge/policies/human-approval.yaml',
      signals: analysis.risks,
      recommended_context: ['policies/safety.md', 'context/conventions.md'],
      recommended_steps: ['Name approval-triggering actions.', 'Describe the approval payload.', 'Clarify who approves what.'],
      safety_limits: ['Do not weaken approval requirements without project agreement.'],
      status: 'recommended',
    });
  }

  if (analysis.signals.agentsPath || analysis.signals.claudePath || (analysis.signals.instructionDocs ?? []).length > 0) {
    push({
      id: 'protected-files',
      title: 'Protected Files',
      description: 'Document files that should not be rewritten without explicit review.',
      reason: 'The repository already uses instruction surfaces that should stay stable.',
      confidence: 'high',
      target_path: '.agentforge/policies/protected-files.yaml',
      signals: ['AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md', '.cursor/rules/agentforge.md'],
      recommended_context: ['context/conventions.md', 'context/architecture.md'],
      recommended_steps: ['Enumerate protected entrypoints.', 'List the rewrite policy.', 'State the review requirement for each category.'],
      safety_limits: ['Do not treat protected files as mutable defaults.'],
      status: 'recommended',
    });
  }

  return suggestions;
}

function buildContextSuggestions(analysis) {
  const suggestions = [];
  const push = (suggestion) => suggestions.push(suggestion);

  push({
    id: 'project-overview',
    title: 'Project Overview',
    description: 'Summarize the project purpose, audience, and primary moving parts.',
    reason: 'A project analysis should produce a concise top-level view for future agents.',
    confidence: 'high',
    target_path: '.agentforge/context/project-overview.md',
    signals: analysis.productSignals,
    recommended_steps: ['Capture what the project does.', 'Document the audience.', 'List the major subsystems.'],
    status: 'recommended',
  });

  if ((analysis.mainAreas ?? []).length > 0 || analysis.extraCodeSurface.length > 0) {
    push({
      id: 'architecture',
      title: 'Architecture',
      description: 'Explain the probable architecture and how the code roots relate.',
      reason: 'Multiple code roots or layers exist and deserve a shared map.',
      confidence: 'high',
      target_path: '.agentforge/context/architecture.md',
      signals: unique([
        ...(analysis.mainAreas ?? []).map((item) => item.label),
        ...(analysis.extraCodeSurface ?? []).map((item) => item.path),
      ]),
      recommended_steps: ['Describe the layer boundaries.', 'List the main roots and ownership.', 'Note the integration points.'],
      status: 'recommended',
    });
  }

  if ((analysis.signals.testsExists ?? false) || (analysis.signals.testingCommands ?? []).length > 0) {
    push({
      id: 'testing',
      title: 'Testing',
      description: 'Describe the test command matrix and validation expectations.',
      reason: 'The repository exposes test or validation commands.',
      confidence: 'high',
      target_path: '.agentforge/context/testing.md',
      signals: analysis.signals.testingCommands.map((entry) => entry.command),
      recommended_steps: ['Document the main test commands.', 'Explain when to run them.', 'Record common failure modes.'],
      status: 'recommended',
    });
  }

  if (analysis.integrationSignals.length > 0) {
    push({
      id: 'deployment',
      title: 'Deployment',
      description: 'Summarize deployment and environment assumptions.',
      reason: 'CI/CD or containerization signals indicate deployment context is important.',
      confidence: 'medium',
      target_path: '.agentforge/context/deployment.md',
      signals: analysis.integrationSignals,
      recommended_steps: ['Describe runtime and build expectations.', 'List release assumptions.', 'Call out rollback notes.'],
      status: 'recommended',
    });
  }

  if (analysis.productSignals.length > 0) {
    push({
      id: 'conventions',
      title: 'Conventions',
      description: 'Record repository conventions, naming, and operational habits.',
      reason: 'Product and docs signals suggest rules should be written down.',
      confidence: 'medium',
      target_path: '.agentforge/context/conventions.md',
      signals: analysis.productSignals,
      recommended_steps: ['Document naming conventions.', 'Capture write safety rules.', 'List command and doc conventions.'],
      status: 'recommended',
    });
  }

  if ((analysis.dataSignals ?? []).length > 0) {
    push({
      id: 'glossary',
      title: 'Glossary',
      description: 'Define domain terms, entities, and technical vocabulary.',
      reason: 'Data and product signals suggest a domain vocabulary is useful.',
      confidence: 'low',
      target_path: '.agentforge/context/glossary.md',
      signals: analysis.dataSignals,
      recommended_steps: ['List domain terms.', 'Clarify technical vocabulary.', 'Keep terms aligned with the repository.'],
      status: 'recommended',
    });
  }

  return suggestions;
}

function buildSuggestionPayload(category, suggestion) {
  const kindByCategory = {
    agents: 'agent',
    skills: 'skill',
    flows: 'flow',
    policies: 'policy',
    context: 'context',
  };

  return {
    id: suggestion.id,
    kind: kindByCategory[category] ?? category,
    title: suggestion.title,
    description: suggestion.description,
    reason: suggestion.reason,
    confidence: suggestion.confidence,
    status: suggestion.status ?? 'recommended',
    target_path: suggestion.target_path,
    signals: suggestion.signals ?? [],
    recommended_context: suggestion.recommended_context ?? [],
    recommended_steps: suggestion.recommended_steps ?? [],
    safety_limits: suggestion.safety_limits ?? [],
  };
}

function writeSuggestionGroup(writer, projectRoot, category, suggestions) {
  const writtenPaths = [];
  const baseDir = SUGGESTION_DIRS[category];

  for (const suggestion of suggestions) {
    const relPath = join(baseDir, `${suggestion.id}.yaml`);
    const payload = buildSuggestionPayload(category, suggestion);
    writer.writeGeneratedFile(join(projectRoot, relPath), `${YAML.stringify(payload).trim()}\n`, { force: true });
    writtenPaths.push(relPath);
  }

  return writtenPaths;
}

function buildProjectAnalysisReport(analysis, ingestSummary) {
  const lines = [];
  lines.push('# AgentForge Project Analysis');
  lines.push('');
  lines.push('## Overview');
  lines.push('');
  lines.push(`- Project: ${analysis.signals.projectName || basename(analysis.projectRoot)}`);
  lines.push(`- Package manager: ${analysis.signals.packageManager}`);
  lines.push(`- Framework: ${analysis.framework}`);
  lines.push(`- Probable architecture: ${analysis.architecture}`);
  lines.push(`- Detected stack: ${analysis.detectedStack.join(', ') || 'none'}`);
  lines.push(`- Commands available: ${analysis.availableCommands.length}`);
  lines.push(`- Main areas: ${analysis.mainAreas.map((item) => `${item.label} (${item.path})`).join(', ') || 'none'}`);
  lines.push(`- Ingest: ${ingestSummary.ran ? `${ingestSummary.imported} imported, ${ingestSummary.skipped} skipped` : 'skipped'}`);
  lines.push(`- Context score: ${analysis.auditScore}/100`);
  lines.push('');

  lines.push('## Product signals');
  lines.push('');
  for (const item of analysis.productSignals.length > 0 ? analysis.productSignals : ['none']) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  lines.push('## Automation signals');
  lines.push('');
  for (const item of analysis.automationSignals.length > 0 ? analysis.automationSignals : ['none']) {
    lines.push(`- ${item}`);
  }
  lines.push('');

  lines.push('## Integration and data');
  lines.push('');
  lines.push(`- Integration: ${analysis.integrationSignals.join(', ') || 'none'}`);
  lines.push(`- Data: ${analysis.dataSignals.join(', ') || 'none'}`);
  lines.push(`- Security: ${analysis.securitySignals.join(', ') || 'none'}`);
  lines.push('');

  lines.push('## Risks');
  lines.push('');
  if (analysis.risks.length === 0) {
    lines.push('- No high-signal risks detected from the local scan.');
  } else {
    for (const risk of analysis.risks) {
      lines.push(`- ${risk}`);
    }
  }
  lines.push('');

  lines.push('## Local research patterns');
  lines.push('');
  if (analysis.localPatterns.length === 0) {
    lines.push('- No strong reusable patterns were detected.');
  } else {
    for (const pattern of analysis.localPatterns) {
      lines.push(`### ${pattern.title}`);
      lines.push('');
      lines.push(`- Evidence: ${pattern.evidence}`);
      lines.push(`- Implication: ${pattern.implication}`);
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function buildAnalysisPlanReport(analysis, suggestions, ingestSummary) {
  const lines = [];
  lines.push('# AgentForge Analysis Plan');
  lines.push('');
  lines.push('## Immediate next steps');
  lines.push('');
  lines.push('- Review the generated suggestions in `.agentforge/suggestions/`.');
  lines.push('- Promote the highest-priority agents, skills, flows, policies, and context files in a separate, explicit pass.');
  lines.push('- Keep the analysis result read-only outside `.agentforge/`.');
  lines.push('- Run `agentforge refactor-context --apply` only after the context suggestions look correct.');
  lines.push('- Run `agentforge validate` before any promotion step.');
  lines.push('');

  lines.push('## Suggested order');
  lines.push('');
  lines.push(`1. Analysis score: ${analysis.auditScore}/100`);
  lines.push(`2. Ingest: ${ingestSummary.ran ? `${ingestSummary.imported} imported` : 'skipped'}`);
  lines.push(`3. Agents: ${suggestions.agents.length}`);
  lines.push(`4. Skills: ${suggestions.skills.length}`);
  lines.push(`5. Flows: ${suggestions.flows.length}`);
  lines.push(`6. Policies: ${suggestions.policies.length}`);
  lines.push(`7. Context files: ${suggestions.context.length}`);
  lines.push('');

  lines.push('## Promotion guidance');
  lines.push('');
  lines.push('- Promote agents when the repo has a recurring ownership or governance need.');
  lines.push('- Promote skills when a command, test, review, or operational pattern repeats.');
  lines.push('- Promote flows when the repo has a repeatable delivery path.');
  lines.push('- Promote policies when safe-by-default behavior needs explicit enforcement.');
  lines.push('- Promote context files when people or agents need a compact source of truth.');
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function applyStateUpdate(state, analysis, suggestions, ingestSummary) {
  return {
    ...state,
    last_analysis_at: new Date().toISOString(),
    detected_stack: analysis.detectedStack,
    detected_framework: analysis.framework,
    detected_package_manager: analysis.signals.packageManager,
    analysis_architecture: analysis.architecture,
    analysis_risks: analysis.risks,
    analysis_patterns: analysis.localPatterns.map((pattern) => pattern.id),
    analysis_product_signals: analysis.productSignals,
    analysis_automation_signals: analysis.automationSignals,
    analysis_integration_signals: analysis.integrationSignals,
    analysis_data_signals: analysis.dataSignals,
    analysis_context_score: analysis.auditScore,
    analysis_ingest: ingestSummary,
    suggested_agents: suggestions.agents.map((suggestion) => ({
      id: suggestion.id,
      path: suggestion.target_path,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
    })),
    suggested_skills: suggestions.skills.map((suggestion) => ({
      id: suggestion.id,
      path: suggestion.target_path,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
    })),
    suggested_flows: suggestions.flows.map((suggestion) => ({
      id: suggestion.id,
      path: suggestion.target_path,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
    })),
    suggested_policies: suggestions.policies.map((suggestion) => ({
      id: suggestion.id,
      path: suggestion.target_path,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
    })),
    suggested_context_files: suggestions.context.map((suggestion) => ({
      id: suggestion.id,
      path: suggestion.target_path,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
    })),
  };
}

export function buildAnalysis(projectRoot, state, { ingestSummary, skipContextAudit = false, auditResult = null } = {}) {
  const signals = scanProjectSignals(projectRoot, { state });
  const effectiveAuditResult = auditResult
    ?? (skipContextAudit
      ? {
          ok: true,
          analysis: {
            score: 100,
            contextIndexIssues: [],
            missingReadmes: [],
            largeFiles: [],
          },
          warnings: [],
          errors: [],
        }
      : runContextAudit(projectRoot));
  const extraCodeSurface = collectExtraCodeSurface(projectRoot);
  const framework = inferFramework(signals);
  const architecture = inferProbableArchitecture(signals, extraCodeSurface);
  const patternResearch = runPatternResearch(projectRoot, { state, signals });
  const detectedStack = unique([
    ...signals.stackDetails,
    framework,
    ...extraCodeSurface.map((item) => `code:${item.path}`),
    ...patternResearch.detectedStack,
  ]);
  const productSignals = detectProductSignals(signals, effectiveAuditResult);
  const automationSignals = detectAutomationSignals(signals);
  const integrationSignals = detectIntegrationSignals(signals);
  const dataSignals = detectDataSignals(signals);
  const securitySignals = detectSecuritySignals(signals);
  const risks = detectRisks(signals, effectiveAuditResult, extraCodeSurface);
  const availableCommands = unique([
    ...(signals.projectCommands ?? []).map((entry) => entry.command),
    ...(signals.testingCommands ?? []).map((entry) => entry.command),
  ]);

  const analysis = {
    projectRoot,
    signals,
    auditResult,
    extraCodeSurface,
    framework,
    architecture,
    detectedStack,
    productSignals,
    automationSignals,
    integrationSignals,
    dataSignals,
    securitySignals,
    risks,
    localPatterns: patternResearch.legacyPatterns,
    availableCommands,
    mainAreas: unique([
      ...(signals.mainAreas ?? []),
      ...extraCodeSurface.map((item) => ({
        label: item.path,
        path: `${item.path}/`,
        reason: `Extra code surface with ${item.fileCount} file(s).`,
      })),
    ]),
    auditScore: typeof effectiveAuditResult.analysis?.score === 'number'
      ? effectiveAuditResult.analysis.score
      : (skipContextAudit ? 100 : 0),
  };

  const suggestions = {
    agents: buildAgentSuggestions(analysis),
    skills: buildSkillSuggestions(analysis),
    flows: buildFlowSuggestions(analysis),
    policies: buildPolicySuggestions(analysis),
    context: buildContextSuggestions(analysis),
  };

  return {
    analysis,
    patternResearch,
    suggestions,
    reports: {
      projectAnalysis: buildProjectAnalysisReport(analysis, ingestSummary ?? { ran: false }),
      analysisPlan: buildAnalysisPlanReport(analysis, suggestions, ingestSummary ?? { ran: false }),
    },
  };
}

function shouldRunIngest(projectRoot) {
  return AGENTIC_SURFACE_TARGETS.some((target) => existsSync(join(projectRoot, target)));
}

export function persistAnalysis(projectRoot, state, analysisBundle, ingestSummary) {
  const writer = new Writer(projectRoot);
  const manifest = loadManifest(projectRoot);
  const writtenPaths = [];

  for (const [category, suggestions] of Object.entries(analysisBundle.suggestions)) {
    if (suggestions.length === 0) continue;
    const paths = writeSuggestionGroup(writer, projectRoot, category, suggestions);
    writtenPaths.push(...paths);
  }

  writer.writeGeneratedFile(join(projectRoot, ANALYSIS_REPORT_PATH), analysisBundle.reports.projectAnalysis, { force: true });
  writer.writeGeneratedFile(join(projectRoot, ANALYSIS_PLAN_PATH), analysisBundle.reports.analysisPlan, { force: true });
  writtenPaths.push(ANALYSIS_REPORT_PATH, ANALYSIS_PLAN_PATH);

  const nextState = applyStateUpdate(state, analysisBundle.analysis, analysisBundle.suggestions, ingestSummary);
  writer.writeGeneratedFile(join(projectRoot, PRODUCT.internalDir, 'state.json'), `${JSON.stringify(nextState, null, 2)}\n`, { force: true });
  writtenPaths.push(join(PRODUCT.internalDir, 'state.json'));

  writer.saveCreatedFiles();
  const nextManifest = {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, writtenPaths),
  };
  saveManifest(projectRoot, nextManifest);

  return {
    writtenPaths,
    state: nextState,
  };
}

function renderAnalyzeHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: Analyze\n`));
  console.log(`  Uso: npx ${PRODUCT.command} analyze [--write-context]\n`);
  console.log('  Analisa o projeto antes de criar ou modificar agentes, skills, flows, policies e contexto.');
  console.log('  Gera relatórios consolidados e sugestões somente dentro de `.agentforge/`.');
  console.log('  Com --write-context, escreve a primeira versão útil do contexto central canônico.\n');
}

export function runProjectAnalysis(projectRoot) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const currentState = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : installation.state ?? {};
  const ingestSummary = {
    ran: false,
    imported: 0,
    skipped: 0,
    reportPath: null,
  };

  if (shouldRunIngest(projectRoot)) {
    const ingestResult = runIngest(projectRoot);
    if (ingestResult?.ok) {
      ingestSummary.ran = true;
      ingestSummary.imported = ingestResult.imported.length;
      ingestSummary.skipped = ingestResult.skipped.length;
      ingestSummary.reportPath = ingestResult.reportPath ?? null;
    }
  }

  const refreshedState = existsSync(statePath) ? JSON.parse(readFileSync(statePath, 'utf8')) : currentState;
  const analysisBundle = buildAnalysis(projectRoot, refreshedState, { ingestSummary });
  return {
    ok: true,
    analysisBundle,
    state: refreshedState,
    ingestSummary,
  };
}

export default async function analyze(args = []) {
  const { default: chalk } = await import('chalk');
  const help = args.includes('--help') || args.includes('-h');
  const writeContext = args.includes('--write-context');

  if (help) {
    renderAnalyzeHelp(chalk);
    return 0;
  }

  const projectRoot = process.cwd();
  const result = runProjectAnalysis(projectRoot);
  if (!result.ok) {
    console.log(chalk.yellow(`  ${result.errors[0]}`));
    return 1;
  }

  const persistResult = persistAnalysis(projectRoot, result.state, result.analysisBundle, result.ingestSummary);
  const contextResult = writeContext
    ? applyCoreContextSynthesis(projectRoot, persistResult.state, result.analysisBundle)
    : null;

  console.log(chalk.hex('#ffa203')(`  Análise consolidada em ${ANALYSIS_REPORT_PATH}`));
  console.log(chalk.hex('#ffa203')(`  Plano de ação em ${ANALYSIS_PLAN_PATH}`));
  console.log(chalk.gray(`  Stack detectada: ${persistResult.state.detected_stack.join(', ') || 'none'}`));
  console.log(chalk.gray(`  Sugestões: ${persistResult.state.suggested_agents.length} agentes, ${persistResult.state.suggested_skills.length} skills, ${persistResult.state.suggested_flows.length} flows`));
  console.log(chalk.gray(`  Policies e contexto: ${persistResult.state.suggested_policies.length} policies, ${persistResult.state.suggested_context_files.length} context files`));
  if (contextResult) {
    console.log(chalk.gray(`  Contexto central escrito: ${contextResult.writtenPaths.filter((path) => path !== '.agentforge/state.json').length} arquivo(s)`));
  }

  if (result.ingestSummary.ran) {
    console.log(chalk.gray(`  Ingest reaproveitado: ${result.ingestSummary.imported} importado(s), ${result.ingestSummary.skipped} pulado(s)`));
  }

  return 0;
}
