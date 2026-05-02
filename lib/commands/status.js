import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT, normalizeSetupMode } from '../product.js';
import {
  readStateAndPlan,
  repairPhaseState,
  getNextPhase,
  summarizeStatePlan,
} from './project-plan.js';

const ENTRYPOINTS = [
  'AGENTS.md',
  'CLAUDE.md',
  '.cursorrules',
  '.cursor/rules/agentforge.md',
  '.github/copilot-instructions.md',
];

function formatList(values = []) {
  return values.length > 0 ? values.join(', ') : '(none)';
}

function parseArgs(args = []) {
  return {
    json: args.includes('--json'),
    repair: args.includes('--repair'),
  };
}

function getPoliciesStatus(projectRoot, internalDir) {
  const policyDir = join(projectRoot, internalDir, 'policies');
  const items = ['permissions.yaml', 'protected-files.yaml', 'human-approval.yaml'].map((file) => ({
    file,
    present: existsSync(join(policyDir, file)),
  }));

  return {
    items,
    overall: items.every((item) => item.present) ? 'OK' : 'MISSING',
  };
}

function getLastValidationStatus(projectRoot, internalDir) {
  const reportPath = join(projectRoot, internalDir, 'reports', 'validation.md');
  if (!existsSync(reportPath)) return null;

  const report = readFileSync(reportPath, 'utf8');
  const match = report.match(/^- Status:\s*(.+)$/m);
  return match?.[1]?.trim() ?? null;
}

function getEntrypointStatus(projectRoot) {
  return ENTRYPOINTS.map((entry) => {
    const content = existsSync(join(projectRoot, entry))
      ? readFileSync(join(projectRoot, entry), 'utf8')
      : '';
    return {
      entry,
      present: content.length > 0,
      managed: content.includes('<!-- agentforge:start -->') && content.includes('<!-- agentforge:end -->'),
    };
  });
}

function buildStatusPayload({
  state,
  summary,
  next,
  policiesStatus,
  lastValidationStatus,
  entrypointStatus,
  stateError = null,
  repairApplied = false,
}) {
  return {
    state_status: stateError ? `invalid: ${stateError}` : 'ok',
    setup_mode: normalizeSetupMode(state.setup_mode),
    active_engines: state.engines ?? [],
    current_phase: state.workflow?.current_phase ?? state.phase ?? null,
    completed_phases: state.workflow?.completed_phases ?? state.completed ?? [],
    pending_phases: state.workflow?.pending_phases ?? state.pending ?? [],
    next_phase: next?.nextPhase?.id ?? summary.nextRecommendedPhase,
    validation_status: lastValidationStatus ?? 'not run',
    plan_state_consistency: {
      warnings: summary.warnings,
      errors: summary.errors,
    },
    entrypoints: entrypointStatus,
    policies_status: policiesStatus,
    repair_applied: repairApplied,
  };
}

function printHumanStatus(chalk, payload) {
  console.log(chalk.bold(`\n  ${PRODUCT.name} status\n`));
  console.log(`  Setup mode:          ${chalk.cyan(payload.setup_mode)}`);
  console.log(`  State status:        ${payload.state_status === 'ok' ? chalk.green('ok') : chalk.red(payload.state_status)}`);
  console.log(`  Active engines:      ${chalk.cyan(formatList(payload.active_engines))}`);
  console.log(`  Current phase:       ${chalk.cyan(payload.current_phase ?? '(not set)')}`);
  console.log(`  Completed phases:    ${chalk.cyan(formatList(payload.completed_phases))}`);
  console.log(`  Pending phases:      ${chalk.cyan(formatList(payload.pending_phases))}`);
  console.log(`  Next phase:          ${chalk.cyan(payload.next_phase ?? '(not detected)')}`);
  console.log(`  Validation status:    ${chalk.cyan(payload.validation_status)}`);
  console.log(`  Policies status:      ${chalk.cyan(payload.policies_status.overall)}`);

  for (const item of payload.policies_status.items) {
    console.log(`    - ${item.file}: ${item.present ? chalk.green('present') : chalk.red('missing')}`);
  }

  console.log('  Entrypoints:');
  for (const item of payload.entrypoints) {
    const stateLabel = item.present ? chalk.green('present') : chalk.red('missing');
    const managedLabel = item.managed ? chalk.green('managed') : chalk.yellow('manual');
    console.log(`    - ${item.entry}: ${stateLabel}, ${managedLabel}`);
  }

  console.log(`  Plan/state consistency: ${payload.plan_state_consistency.errors.length > 0 || payload.plan_state_consistency.warnings.length > 0 ? chalk.yellow('issues detected') : chalk.green('OK')}`);
  if (payload.plan_state_consistency.errors.length > 0) {
    for (const message of payload.plan_state_consistency.errors) {
      console.log(`    - ${chalk.red(message)}`);
    }
  }
  if (payload.plan_state_consistency.warnings.length > 0) {
    for (const message of payload.plan_state_consistency.warnings) {
      console.log(`    - ${chalk.yellow(message)}`);
    }
  }

  if (payload.repair_applied) {
    console.log(`\n  ${chalk.green('Repair applied to state.json.')}`);
  }

  console.log();
}

export default async function status(args = []) {
  const { default: chalk } = await import('chalk');

  const projectRoot = process.cwd();
  const parsed = parseArgs(args);
  const existing = checkExistingInstallation(projectRoot);

  if (!existing.installed) {
    console.log('\nAgentForge is not installed in this directory. Run npx agentforge install.\n');
    return 1;
  }

  const internalDir = existing.internalDir ?? PRODUCT.internalDir;
  const stateAndPlan = readStateAndPlan(projectRoot);
  const state = existing.state ?? stateAndPlan.state ?? {};
  const summary = summarizeStatePlan({
    state,
    planContent: stateAndPlan.planContent,
  });
  const next = getNextPhase(projectRoot, state);
  const policiesStatus = getPoliciesStatus(projectRoot, internalDir);
  const lastValidationStatus = getLastValidationStatus(projectRoot, internalDir);
  const entrypointStatus = getEntrypointStatus(projectRoot);

  let repairApplied = false;
  let nextState = state;
  if (parsed.repair) {
    const repaired = repairPhaseState(projectRoot);
    repairApplied = true;
    nextState = repaired.state;
  }

  const effectiveSummary = repairApplied
    ? summarizeStatePlan({
        state: nextState,
        planContent: stateAndPlan.planContent,
      })
    : summary;

  const payload = buildStatusPayload({
    state: nextState,
    summary: effectiveSummary,
    next,
    policiesStatus,
    lastValidationStatus,
    entrypointStatus,
    stateError: stateAndPlan.stateError,
    repairApplied,
  });

  if (parsed.json) {
    console.log(JSON.stringify(payload, null, 2));
    return 0;
  }

  printHumanStatus(chalk, payload);
  return 0;
}
