import { existsSync, rmSync, unlinkSync, statSync, readdirSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import { loadManifest, fileStatus } from '../installer/manifest.js';
import { PRODUCT } from '../product.js';

const ROOT_ENTRY_FILES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  '.roorules',
  'CONVENTIONS.md',
]);

function toPosixPath(path) {
  return path.replace(/\\/g, '/');
}

function isInsidePath(relPath, prefix) {
  const normalizedPath = toPosixPath(relPath);
  const normalizedPrefix = toPosixPath(prefix).replace(/\/+$/, '');
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
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

  return files;
}

function pruneEmptyDirectories(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return false;

  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      pruneEmptyDirectories(join(dirPath, entry.name));
    }
  }

  if (readdirSync(dirPath).length === 0) {
    rmSync(dirPath, { recursive: true, force: true });
    return true;
  }

  return false;
}

function collectAncestorDirectories(relPath, internalDir, outputFolder) {
  const directories = [];
  const normalized = toPosixPath(relPath);

  if (!normalized || normalized === '.' || normalized === internalDir || normalized === outputFolder) {
    return directories;
  }

  let current = dirname(normalized);
  while (current && current !== '.' && current !== '/') {
    if (current === outputFolder || isInsidePath(current, outputFolder)) break;
    directories.push(current);
    if (current === internalDir) break;
    current = dirname(current);
  }

  return directories;
}

function isSkillPath(relPath) {
  const normalized = toPosixPath(relPath);
  return normalized.startsWith('.agents/skills/') || normalized.startsWith('.claude/skills/');
}

function skillRoot(relPath) {
  const parts = toPosixPath(relPath).split('/');
  if (parts.length < 4) return relPath;
  return parts.slice(0, 4).join('/');
}

function isExportPath(relPath) {
  const normalized = toPosixPath(relPath);
  return normalized === '.cursor/rules/agentforge.md'
    || normalized === '.github/copilot-instructions.md'
    || normalized.startsWith('.claude/agents/')
    || normalized.startsWith('.github/agents/');
}

function isEntryFile(relPath) {
  const normalized = toPosixPath(relPath);
  const base = basename(normalized);
  return ROOT_ENTRY_FILES.has(base)
    || normalized.startsWith('.kiro/steering/')
    || normalized.startsWith('.amazonq/rules/');
}

function isOutputPath(relPath, outputFolder) {
  return isInsidePath(relPath, outputFolder);
}

export function buildUninstallPlan(projectRoot, state, manifest, internalDir = PRODUCT.internalDir) {
  const outputFolder = toPosixPath(state.output_folder ?? PRODUCT.outputDir);
  const internalFiles = listFilesRecursive(join(projectRoot, internalDir))
    .map((absPath) => toPosixPath(absPath.replace(projectRoot, '').replace(/^[\\/]/, '')));
  const manifestFiles = Object.keys(manifest).map(toPosixPath);
  const candidateFiles = [...new Set([...internalFiles, ...manifestFiles])];

  const entryFiles = [];
  const skillFiles = [];
  const agentforgeFiles = [];
  const exportFiles = [];
  const outputFiles = [];
  const modifiedFiles = [];
  const fileRemovals = [];
  const folderCandidates = new Set([internalDir]);

  const recordFolders = (relPath) => {
    for (const dir of collectAncestorDirectories(relPath, internalDir, outputFolder)) {
      folderCandidates.add(dir);
    }
  };

  for (const relPath of candidateFiles) {
    if (isOutputPath(relPath, outputFolder)) {
      outputFiles.push(relPath);
      continue;
    }

    const absPath = join(projectRoot, relPath);
    if (!existsSync(absPath) || statSync(absPath).isDirectory()) {
      continue;
    }

    const hash = manifest[relPath];
    if (hash) {
      const status = fileStatus(projectRoot, relPath, hash);
      if (status === 'modified') {
        modifiedFiles.push(relPath);
        continue;
      }
      if (status === 'missing') {
        continue;
      }
    } else if (!isInsidePath(relPath, internalDir)) {
      continue;
    }

    fileRemovals.push(relPath);
    recordFolders(relPath);

    if (isInsidePath(relPath, internalDir)) {
      agentforgeFiles.push(relPath);
    } else if (isSkillPath(relPath)) {
      skillFiles.push(relPath);
    } else if (isEntryFile(relPath)) {
      entryFiles.push(relPath);
    } else if (isExportPath(relPath)) {
      exportFiles.push(relPath);
    } else {
      exportFiles.push(relPath);
    }
  }

  for (const created of state.created_files ?? []) {
    const relPath = toPosixPath(created);
    if (isOutputPath(relPath, outputFolder)) continue;

    const absPath = join(projectRoot, relPath);
    if (existsSync(absPath) && statSync(absPath).isDirectory()) {
      recordFolders(relPath);
    }
  }

  const normalizeList = (values) => [...new Set(values)];

  return {
    entryFiles: normalizeList(entryFiles),
    skillRoots: normalizeList(skillFiles.map(skillRoot)),
    agentforgeFiles: normalizeList(agentforgeFiles),
    exportFiles: normalizeList(exportFiles),
    outputFiles: normalizeList(outputFiles),
    modifiedFiles: normalizeList(modifiedFiles),
    fileRemovals: normalizeList(fileRemovals),
    folderCandidates: normalizeList([...folderCandidates]),
    outputFolder,
    hasOutputDir: existsSync(join(projectRoot, outputFolder)),
  };
}

export function applyUninstallPlan(projectRoot, plan, { removeOutput = false } = {}) {
  let removed = 0;
  let errors = 0;

  for (const relPath of plan.fileRemovals) {
    const absPath = join(projectRoot, relPath);
    try {
      if (existsSync(absPath) && !statSync(absPath).isDirectory()) {
        unlinkSync(absPath);
        removed++;
      }
    } catch {
      errors++;
    }
  }

  const sortedFolders = [...plan.folderCandidates]
    .sort((a, b) => b.split('/').length - a.split('/').length);

  for (const relPath of sortedFolders) {
    const absPath = join(projectRoot, relPath);
    try {
      if (pruneEmptyDirectories(absPath)) {
        removed++;
      }
    } catch {
      errors++;
    }
  }

  if (removeOutput && plan.hasOutputDir) {
    const outputDir = join(projectRoot, plan.outputFolder);
    try {
      rmSync(outputDir, { recursive: true, force: true });
      removed++;
    } catch {
      errors++;
    }
  }

  return { removed, errors };
}

function printSection(chalk, title, items, formatter) {
  console.log(chalk.bold(`  ${title}:`));
  if (items.length === 0) {
    console.log(chalk.gray('    (none)'));
    return;
  }

  for (const item of items) {
    console.log(chalk.red(`    ✗  ${formatter(item)}`));
  }
}

export async function runUninstall(projectRoot, { prompt } = {}) {
  const { default: chalk } = await import('chalk');
  const { default: inquirer } = await import('inquirer');
  const ask = prompt ?? inquirer.prompt.bind(inquirer);

  console.log(chalk.bold(`\n  ${PRODUCT.name}: Uninstall\n`));

  const existing = checkExistingInstallation(projectRoot);
  if (!existing.installed) {
    console.log('  AgentForge is not installed in this directory. Run npx agentforge install.\n');
    return { removed: 0, errors: 0, cancelled: true };
  }

  const state = existing.state;
  const internalDir = existing.internalDir ?? PRODUCT.internalDir;
  const manifest = loadManifest(projectRoot);
  const plan = buildUninstallPlan(projectRoot, state, manifest, internalDir);

  console.log('  Files scheduled for removal:\n');
  printSection(chalk, 'Entry files', plan.entryFiles, (item) => item);
  printSection(chalk, 'Internal skills', plan.skillRoots.map((item) => `${item}/`), (item) => item);
  printSection(chalk, 'AgentForge files', plan.agentforgeFiles, (item) => item);
  printSection(chalk, 'Engine exports', plan.exportFiles, (item) => item);

  console.log(chalk.bold('\n  Folders to prune if empty:'));
  if (plan.folderCandidates.length === 0) {
    console.log(chalk.gray('    (none)'));
  } else {
    for (const folder of plan.folderCandidates) {
      console.log(chalk.red(`    ✗  ${folder}/`));
    }
  }

  if (plan.outputFiles.length > 0) {
    console.log(chalk.bold('\n  Output folder files (kept unless you confirm removal):'));
    for (const file of plan.outputFiles) {
      console.log(chalk.cyan(`    •  ${file}`));
    }
  }

  console.log(chalk.bold('\n  Output folder:'));
  console.log(`    ${chalk.cyan(`${plan.outputFolder}/`)}${plan.hasOutputDir ? '' : chalk.gray(' (not present)')}`);

  if (plan.modifiedFiles.length > 0) {
    console.log(chalk.yellow(`\n  ${plan.modifiedFiles.length} modified file(s) will be preserved:`));
    for (const file of plan.modifiedFiles) {
      console.log(chalk.gray(`    ✎  ${file}`));
    }
  }

  const { confirmed } = await ask([{
    type: 'input',
    name: 'confirmed',
    message: `Type ${chalk.red('"remove"')} to confirm uninstallation:`,
    validate: (value) => value === 'remove' || 'Type exactly "remove" to confirm.',
  }]);

  if (confirmed !== 'remove') {
    console.log(chalk.gray('\n  Uninstallation cancelled.\n'));
    return { removed: 0, errors: 0, cancelled: true };
  }

  let removeOutput = false;
  if (plan.hasOutputDir) {
    const answer = await ask([{
      type: 'confirm',
      name: 'removeOutput',
      message: `Also remove the specifications folder ${chalk.cyan(`${plan.outputFolder}/`)}?`,
      default: false,
    }]);
    removeOutput = Boolean(answer.removeOutput);
  }

  const result = applyUninstallPlan(projectRoot, plan, { removeOutput });

  console.log('');
  if (removeOutput && plan.hasOutputDir) {
    console.log(chalk.red(`  ✗  ${plan.outputFolder}/ removed.`));
  } else if (plan.hasOutputDir) {
    console.log(chalk.gray(`  → ${plan.outputFolder}/ kept.`));
  }

  if (result.errors === 0) {
    console.log(chalk.hex('#ffa203')(`\n  ${PRODUCT.name} removed successfully.\n`));
  } else {
    console.log(chalk.yellow(`\n  Completed with ${result.errors} error(s). Check the files above.\n`));
  }

  return { removed: result.removed, errors: result.errors, cancelled: false };
}

export default async function uninstall() {
  const projectRoot = resolve(process.cwd());
  return runUninstall(projectRoot);
}
