import { existsSync, rmSync, unlinkSync, statSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import { loadManifest, fileStatus } from '../installer/manifest.js';
import { PRODUCT } from '../product.js';

function pruneEmptyDirectories(dirPath) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return false;

  const entries = readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
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

export function buildUninstallPlan(projectRoot, state, manifest, internalDir = PRODUCT.internalDir) {
  const createdFiles = state.created_files ?? [];
  const outputFolder = state.output_folder ?? PRODUCT.outputDir;
  const fileRemovals = [];
  const dirCandidates = [];
  const modifiedFiles = [];

  for (const relPath of createdFiles) {
    const hash = manifest[relPath];
    if (hash) {
      const status = fileStatus(projectRoot, relPath, hash);
      if (status === 'modified') {
        modifiedFiles.push(relPath);
        continue;
      }
    }

    const absPath = join(projectRoot, relPath);
    if (existsSync(absPath)) {
      if (statSync(absPath).isDirectory()) dirCandidates.push(relPath);
      else fileRemovals.push(relPath);
    }
  }

  const folderCandidates = [...new Set([internalDir, ...dirCandidates])];

  return {
    fileRemovals,
    dirCandidates,
    modifiedFiles,
    folderCandidates,
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
      if (existsSync(absPath)) {
        unlinkSync(absPath);
        removed++;
      }
    } catch {
      errors++;
    }
  }

  for (const relPath of plan.folderCandidates.sort((a, b) => b.split(/[/\\]/).length - a.split(/[/\\]/).length)) {
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

export default async function uninstall(args) {
  const { default: chalk } = await import('chalk');
  const { default: inquirer } = await import('inquirer');

  const projectRoot = resolve(process.cwd());

  console.log(chalk.bold(`\n  ${PRODUCT.name}: Uninstall\n`));

  const existing = checkExistingInstallation(projectRoot);
  if (!existing.installed) {
    console.log(chalk.yellow(`  ${PRODUCT.name} is not installed in this directory.\n`));
    return;
  }

  const state = existing.state;
  const internalDir = existing.internalDir ?? PRODUCT.internalDir;

  const manifest = loadManifest(projectRoot);
  const plan = buildUninstallPlan(projectRoot, state, manifest, internalDir);

  // Separar em categorias para exibição
  const skillEntries = plan.fileRemovals.filter(f => f.replace(/\\/g, '/').includes('skills'));
  const entryFiles   = plan.fileRemovals.filter(f =>
    [
      'CLAUDE.md',
      'AGENTS.md',
      'GEMINI.md',
      '.cursorrules',
      '.windsurfrules',
      '.gitignore',
      'agentforge.md',
    ]
      .some(name => f.endsWith(name))
  );
  const otherFiles   = plan.fileRemovals.filter(f => !skillEntries.includes(f) && !entryFiles.includes(f));

  console.log('  Files to be removed:\n');

  if (entryFiles.length > 0) {
    console.log(chalk.bold('  Entry files:'));
    entryFiles.forEach(f => console.log(chalk.red(`    ✗  ${f}`)));
  }
  if (skillEntries.length > 0) {
    const skillDirs = [...new Set(skillEntries.map(f =>
      f.replace(/\\/g, '/').split('/').slice(0, 3).join('/')
    ))];
    console.log(chalk.bold(`\n  Skills:`));
    skillDirs.forEach(d => console.log(chalk.red(`    ✗  ${d}/`)));
  }
  if (otherFiles.length > 0) {
    console.log(chalk.bold('\n  Other:'));
    otherFiles.forEach(f => console.log(chalk.red(`    ✗  ${f}`)));
  }

  console.log(chalk.bold('\n  Folders to prune if empty:'));
  plan.folderCandidates.forEach(f => console.log(chalk.red(`    ✗  ${f}/`)));

  const outputDir = join(projectRoot, plan.outputFolder);
  if (plan.hasOutputDir) {
    console.log(chalk.yellow(`    ?  ${plan.outputFolder}/  (asked separately)`));
  }

  // Warn about modified files
  if (plan.modifiedFiles.length > 0) {
    console.log(chalk.yellow(`\n  ${plan.modifiedFiles.length} file(s) modified by you will be kept:`));
    plan.modifiedFiles.forEach(f => console.log(chalk.gray(`    ✎  ${f}`)));
  }

  console.log('');

  // Confirmação explícita
  const { confirmed } = await inquirer.prompt([{
    type: 'input',
    name: 'confirmed',
    message: `Type ${chalk.red('"remove"')} to confirm uninstallation:`,
    validate: (v) => v === 'remove' || 'Type exactly "remove" to confirm.',
  }]);

  if (confirmed !== 'remove') {
    console.log(chalk.gray('\n  Uninstallation cancelled.\n'));
    return;
  }

  const { errors } = applyUninstallPlan(projectRoot, plan);

  // Pasta de saída — perguntar separadamente
  if (plan.hasOutputDir) {
    console.log('');
    const { removeOutput } = await inquirer.prompt([{
      type: 'confirm',
      name: 'removeOutput',
      message: `Also remove the specifications folder ${chalk.cyan(plan.outputFolder + '/')}?`,
      default: false,
    }]);
    if (removeOutput) {
      try {
        rmSync(outputDir, { recursive: true, force: true });
        console.log(chalk.red(`  ✗  ${plan.outputFolder}/ removed.`));
      } catch {
        console.error(chalk.red(`  Error removing ${plan.outputFolder}/`));
      }
    } else {
      console.log(chalk.gray(`  → ${plan.outputFolder}/ kept.`));
    }
  }

  console.log('');
  if (errors === 0) {
    console.log(chalk.hex('#ffa203')(`  ${PRODUCT.name} removed successfully.\n`));
  } else {
    console.log(chalk.yellow(`  Completed with ${errors} error(s). Check the files above.\n`));
  }
}
