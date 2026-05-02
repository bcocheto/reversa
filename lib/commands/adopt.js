import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';

import { buildManifest, loadManifest, saveManifest, fileStatus } from '../installer/manifest.js';
import { detectEngines } from '../installer/detector.js';
import { Writer } from '../installer/writer.js';
import { PRODUCT } from '../product.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { runIngest } from './ingest.js';
import { runImprovementAnalysis } from './improve.js';
import { runContextAudit, writeContextAudit } from './audit-context.js';
import { runRefactorContext, applyRefactorContext } from './refactor-context.js';
import { runSkillSuggestions } from './suggest-skills.js';
import { writeCoreContextFiles } from './bootstrap.js';
import { compileAgentForge } from '../exporter/index.js';
import { validateAgentForgeStructure } from './validate.js';
import { repairPhaseState } from './phase-engine.js';

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

function normalizeErrorMessage(error) {
  if (!error) return '';
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) return error.message.trim();
  return String(error).trim();
}

function uniquePaths(paths = []) {
  return [...new Set(paths.filter((entry) => typeof entry === 'string' && entry.length > 0))];
}

function renderAdoptionApplyReport({
  projectRoot,
  status,
  completedSteps,
  failedStep,
  errors,
  writtenPaths,
}) {
  const lines = [];
  lines.push('# AgentForge Adoption Apply Report');
  lines.push('');
  lines.push(`- Project: ${basename(projectRoot)}`);
  lines.push(`- Status: ${status}`);
  lines.push(`- Completed steps: ${completedSteps.length}`);
  lines.push(`- Failed step: ${failedStep ?? 'none'}`);
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
    ...buildManifest(projectRoot, writer.manifestPaths),
  });
  return rel(projectRoot, reportPath);
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
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, [join(PRODUCT.internalDir, 'state.json')]),
  });
  return state;
}

export async function runAdoptApply(projectRoot) {
  const errors = [];
  const completedSteps = [];
  const writtenPaths = [];
  let failedStep = null;

  let ingestResult;
  let auditResult;
  let refactorResult;
  let refactorApplyResult;
  let contextResult;
  let skillsResult;
  let compileResult;
  let validationResult;

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

    auditResult = runContextAudit(projectRoot);
    if (!auditResult.ok) {
      return fail('audit-context', auditResult.errors[0]);
    }
    const auditWriteResult = writeContextAudit(projectRoot, auditResult.analysis, auditResult.report);
    completedSteps.push('audit-context');
    writtenPaths.push(auditWriteResult.reportPath);

    const contextResultBeforeRefactor = writeCoreContextFiles(projectRoot);
    completedSteps.push('write-core-context-files');
    writtenPaths.push(...contextResultBeforeRefactor.written);

    refactorResult = await runRefactorContext(projectRoot, { apply: true });
    if (!refactorResult.ok) {
      return fail('refactor-context', refactorResult.errors[0]);
    }
    refactorApplyResult = await applyRefactorContext(projectRoot, refactorResult);
    completedSteps.push('refactor-context --apply');
    writtenPaths.push(...refactorApplyResult.writtenPaths, refactorApplyResult.reportPath);

    skillsResult = runSkillSuggestions(projectRoot);
    if (!skillsResult.ok) {
      return fail('suggest-skills', skillsResult.errors[0]);
    }
    completedSteps.push('suggest-skills');

    compileResult = await compileAgentForge(projectRoot, {
      takeoverEntrypoints: true,
      includeExistingEntrypoints: true,
    });
    writtenPaths.push(...compileResult.written);
    if (compileResult.errors.length > 0) {
      return fail('compile --takeover-entrypoints', compileResult.errors[0]);
    }
    completedSteps.push('compile --takeover-entrypoints');

    repairPhaseState(projectRoot);
    completedSteps.push('repair-phase-state');

    validationResult = validateAgentForgeStructure(projectRoot);
    mkdirSync(dirname(validationResult.reportPath), { recursive: true });
    writeFileSync(validationResult.reportPath, validationResult.reportContent, 'utf8');
    writtenPaths.push(rel(projectRoot, validationResult.reportPath));
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
      auditResult,
      refactorResult: refactorApplyResult,
      contextResult: contextResultBeforeRefactor,
      skillsResult,
      compileResult,
      validationResult,
      reportPath,
      completedSteps: [...completedSteps],
      writtenPaths: uniquePaths(writtenPaths),
    };
  } catch (error) {
    return fail(failedStep ?? 'unknown', error);
  }
}

export default async function adopt(args = []) {
  const { default: chalk } = await import('chalk');
  const help = args.includes('--help') || args.includes('-h');
  const apply = args.includes('--apply');

  if (help) {
    console.log(chalk.bold(`\n  ${PRODUCT.name}: Adopt\n`));
    console.log(`  Uso: npx ${PRODUCT.command} adopt [--apply]\n`);
    console.log('  Faz a ingestão e a auditoria read-only de um projeto já existente.');
    console.log('  Gera `.agentforge/reports/adoption-plan.md` com próximos passos sugeridos.');
    console.log('  Com --apply, executa ingest, audit-context, refactor-context --apply, suggest-skills, compile --takeover-entrypoints e validate.\n');
    return 0;
  }

  const projectRoot = process.cwd();
  if (apply) {
    const result = await runAdoptApply(projectRoot);
    if (!result.ok) {
      console.log(chalk.red(`  Adoção aplicada falhou em ${result.step}.`));
      for (const error of result.errors) {
        console.log(chalk.red(`  - ${error}`));
      }
      return 1;
    }

    console.log(chalk.hex('#ffa203')('  Adoção aplicada com sucesso.'));
    console.log(chalk.gray(`  Snapshots importados: ${result.ingestResult.imported.length}`));
    console.log(chalk.gray(`  Refatoração aplicada: ${result.refactorResult.writtenPaths.length}`));
    console.log(chalk.gray(`  Contexto gerado: ${result.contextResult.written.length}`));
    console.log(chalk.gray(`  Skills sugeridas: ${result.skillsResult.suggestions.length}`));
    console.log(chalk.gray(`  Entrypoints compilados: ${result.compileResult.written.filter((item) => item === 'AGENTS.md' || item === 'CLAUDE.md' || item === '.cursor/rules/agentforge.md' || item === '.github/copilot-instructions.md').length}`));
    console.log(chalk.gray(`  Relatório de validação: ${result.validationResult.reportPath}`));
    return 0;
  }

  const result = buildAdoptionPlan(projectRoot);

  if (!result.ok) {
    console.log(chalk.yellow(`  ${result.errors[0]}`));
    return 1;
  }

  const reportPath = writeAdoptionPlan(projectRoot, result.report);
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  state.last_adopt_at = new Date().toISOString();
  state.adoption_status = 'plan-generated';
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, [join(PRODUCT.internalDir, 'state.json'), join(PRODUCT.internalDir, 'reports', 'adoption-plan.md')]),
  });

  console.log(chalk.hex('#ffa203')(`  Plano de adoção gerado em ${reportPath}`));
  console.log(chalk.hex('#ffa203')('  Próximos comandos sugeridos:'));
  console.log(chalk.gray('    - agentforge audit-context'));
  console.log(chalk.gray('    - agentforge refactor-context'));
  console.log(chalk.gray('    - agentforge refactor-context --apply'));
  console.log(chalk.gray('    - agentforge suggest-skills'));
  console.log(chalk.gray('    - agentforge compile'));
  console.log(chalk.gray('    - agentforge validate'));

  return 0;
}
