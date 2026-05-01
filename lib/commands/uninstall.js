import { existsSync, readFileSync, rmSync, unlinkSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import { loadManifest, fileStatus } from '../installer/manifest.js';
import { PRODUCT } from '../product.js';

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
  const createdFiles = state.created_files ?? [];
  const outputFolder = state.output_folder ?? PRODUCT.outputDir;
  const internalDir = existing.internalDir ?? PRODUCT.internalDir;

  // Classificar arquivos via manifest
  const manifest = loadManifest(projectRoot);
  const toRemove = [];
  const modifiedFiles = [];

  for (const relPath of createdFiles) {
    const hash = manifest[relPath];
    if (hash) {
      const status = fileStatus(projectRoot, relPath, hash);
      if (status === 'modified') {
        modifiedFiles.push(relPath);
        continue; // será tratado separadamente
      }
    }
    const absPath = join(projectRoot, relPath);
    if (existsSync(absPath)) toRemove.push(relPath);
  }

  // Separar em categorias para exibição
  const skillEntries = toRemove.filter(f => f.replace(/\\/g, '/').includes('skills'));
  const entryFiles   = toRemove.filter(f =>
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
  const otherFiles   = toRemove.filter(f => !skillEntries.includes(f) && !entryFiles.includes(f));

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

  console.log(chalk.bold('\n  Folders:'));
  console.log(chalk.red(`    ✗  ${internalDir}/`));

  const outputDir = join(projectRoot, outputFolder);
  const hasOutputDir = existsSync(outputDir);
  if (hasOutputDir) {
    console.log(chalk.yellow(`    ?  ${outputFolder}/  (asked separately)`));
  }

  // Warn about modified files
  if (modifiedFiles.length > 0) {
    console.log(chalk.yellow(`\n  ${modifiedFiles.length} file(s) modified by you will be kept:`));
    modifiedFiles.forEach(f => console.log(chalk.gray(`    ✎  ${f}`)));
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

  let removed = 0;
  let errors = 0;

  for (const relPath of toRemove) {
    const absPath = join(projectRoot, relPath);
    try {
      if (existsSync(absPath)) {
        if (statSync(absPath).isDirectory()) {
          rmSync(absPath, { recursive: true, force: true });
        } else {
          unlinkSync(absPath);
        }
        removed++;
      }
    } catch {
      console.error(chalk.red(`    Error removing: ${relPath}`));
      errors++;
    }
  }

  // Remove the active internal directory for the installed product.
  const productDir = join(projectRoot, internalDir);
  try {
    if (existsSync(productDir)) {
      rmSync(productDir, { recursive: true, force: true });
      removed++;
    }
  } catch {
    console.error(chalk.red(`    Error removing ${internalDir}/`));
    errors++;
  }

  // Pasta de saída — perguntar separadamente
  if (hasOutputDir) {
    console.log('');
    const { removeOutput } = await inquirer.prompt([{
      type: 'confirm',
      name: 'removeOutput',
      message: `Also remove the specifications folder ${chalk.cyan(outputFolder + '/')}?`,
      default: false,
    }]);
    if (removeOutput) {
      try {
        rmSync(outputDir, { recursive: true, force: true });
        console.log(chalk.red(`  ✗  ${outputFolder}/ removed.`));
      } catch {
        console.error(chalk.red(`  Error removing ${outputFolder}/`));
      }
    } else {
      console.log(chalk.gray(`  → ${outputFolder}/ kept.`));
    }
  }

  console.log('');
  if (errors === 0) {
    console.log(chalk.hex('#ffa203')(`  ${PRODUCT.name} removed successfully.\n`));
  } else {
    console.log(chalk.yellow(`  Completed with ${errors} error(s). Check the files above.\n`));
  }
}
