import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';
import { buildAiEvidenceBundle, renderAiEvidenceBrief } from '../ai/evidence-bundle.js';

const JSON_REL_PATH = '.agentforge/ai/evidence/project-evidence.json';
const BRIEF_REL_PATH = '.agentforge/ai/evidence/project-brief.md';
const REPORT_REL_PATH = '.agentforge/reports/ai-evidence.md';

function relPath(projectRoot, absPath) {
  return absPath.startsWith(projectRoot)
    ? absPath.slice(projectRoot.length).replace(/^[\\/]/, '')
    : absPath;
}

function parseArgs(args = []) {
  const parsed = {
    help: false,
    json: false,
    force: false,
  };

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      parsed.help = true;
      continue;
    }
    if (arg === '--json') {
      parsed.json = true;
      continue;
    }
    if (arg === '--force') {
      parsed.force = true;
    }
  }

  return parsed;
}

function renderReport(bundle, { jsonPath, briefPath, reportPath, writtenCount }) {
  const lines = [];
  lines.push('# AgentForge AI Evidence');
  lines.push('');
  lines.push('## Resumo');
  lines.push('');
  lines.push(`- Project: ${bundle.project?.name || 'unknown'}`);
  lines.push(`- Type: ${bundle.project?.type || 'unknown'}`);
  lines.push(`- Framework: ${bundle.stack?.framework || 'unknown'}`);
  lines.push(`- Evidence items: ${bundle.evidence?.length ?? 0}`);
  lines.push(`- Files written: ${writtenCount}`);
  lines.push('');
  lines.push('## Arquivos');
  lines.push('');
  lines.push(`- JSON bundle: \`${jsonPath}\``);
  lines.push(`- Brief: \`${briefPath}\``);
  lines.push(`- Report: \`${reportPath}\``);
  lines.push('');
  lines.push('## Brief');
  lines.push('');
  lines.push(renderAiEvidenceBrief(bundle).trimEnd());
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

function updateStateAndManifest(projectRoot, manifest, writtenPaths, bundle, paths) {
  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const createdFiles = Array.isArray(state.created_files) ? state.created_files : [];
  const nextState = {
    ...state,
    last_ai_evidence_at: new Date().toISOString(),
    ai_evidence: {
      project_name: bundle.project?.name ?? null,
      project_type: bundle.project?.type ?? null,
      framework: bundle.stack?.framework ?? null,
      evidence_count: bundle.evidence?.length ?? 0,
      files: {
        json: paths.jsonPath,
        brief: paths.briefPath,
        report: paths.reportPath,
      },
    },
    created_files: [...new Set([...createdFiles, ...writtenPaths, relPath(projectRoot, statePath)])],
  };

  writeFileSync(statePath, `${JSON.stringify(nextState, null, 2)}\n`, 'utf8');
  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, [...writtenPaths, relPath(projectRoot, statePath)]),
  });

  return nextState;
}

function renderHelp(chalk) {
  console.log(chalk.bold(`\n  ${PRODUCT.name}: AI Evidence\n`));
  console.log(`  Uso: npx ${PRODUCT.command} ai-evidence [--json] [--force]\n`);
  console.log('  Gera um pacote de evidências para a IA ativa sem criar sugestões heurísticas.');
  console.log('  Escreve JSON, brief em Markdown e um relatório resumido.');
  console.log('  Use --json para imprimir o bundle em stdout e --force para sobrescrever arquivos existentes.\n');
}

export function buildAiEvidenceArtifacts(projectRoot, { force = false } = {}) {
  const installation = checkExistingInstallation(projectRoot);
  if (!installation.installed) {
    return {
      ok: false,
      errors: ['AgentForge is not installed in this directory. Run npx agentforge install.'],
    };
  }

  const statePath = join(projectRoot, PRODUCT.internalDir, 'state.json');
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const bundle = buildAiEvidenceBundle(projectRoot, { state });
  const brief = renderAiEvidenceBrief(bundle);
  const jsonText = `${JSON.stringify(bundle, null, 2)}\n`;

  const writer = new Writer(projectRoot);
  const writtenPaths = [];

  const writeIfNeeded = (relTarget, content) => {
    const absTarget = join(projectRoot, relTarget);
    const wrote = writer.writeGeneratedFile(absTarget, content, { force });
    if (wrote) writtenPaths.push(relTarget);
    return wrote;
  };

  writeIfNeeded(JSON_REL_PATH, jsonText);
  writeIfNeeded(BRIEF_REL_PATH, brief);
  const reportWritten = writeIfNeeded(REPORT_REL_PATH, renderReport(bundle, {
    jsonPath: JSON_REL_PATH,
    briefPath: BRIEF_REL_PATH,
    reportPath: REPORT_REL_PATH,
    writtenCount: writtenPaths.length + 1,
  }));
  writer.saveCreatedFiles();

  const manifest = loadManifest(projectRoot);
  const nextState = updateStateAndManifest(projectRoot, manifest, reportWritten ? [...writtenPaths, REPORT_REL_PATH] : writtenPaths, bundle, {
    jsonPath: JSON_REL_PATH,
    briefPath: BRIEF_REL_PATH,
    reportPath: REPORT_REL_PATH,
  });

  return {
    ok: true,
    bundle,
    jsonPath: JSON_REL_PATH,
    briefPath: BRIEF_REL_PATH,
    reportPath: REPORT_REL_PATH,
    writtenPaths,
    state: nextState,
    report: renderReport(bundle, {
      jsonPath: JSON_REL_PATH,
      briefPath: BRIEF_REL_PATH,
      reportPath: REPORT_REL_PATH,
      writtenCount: writtenPaths.length + (reportWritten ? 1 : 0),
    }),
    jsonText,
    brief,
  };
}

export default async function aiEvidence(args = []) {
  const { default: chalk } = await import('chalk');
  const parsed = parseArgs(args);

  if (parsed.help) {
    renderHelp(chalk);
    return 0;
  }

  const result = buildAiEvidenceArtifacts(process.cwd(), { force: parsed.force });
  if (!result.ok) {
    console.log(chalk.red(`  ${result.errors[0]}`));
    return 1;
  }

  if (parsed.json) {
    console.log(result.jsonText.trimEnd());
    return 0;
  }

  console.log(chalk.hex('#ffa203')(`  AI evidence written to ${result.reportPath}`));
  console.log(chalk.gray(`  JSON: ${result.jsonPath}`));
  console.log(chalk.gray(`  Brief: ${result.briefPath}`));
  console.log(chalk.gray(`  Evidence items: ${result.bundle.evidence.length}`));
  return 0;
}
