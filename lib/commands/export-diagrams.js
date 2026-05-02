import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, statSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import { checkExistingInstallation } from '../installer/validator.js';
import { PRODUCT } from '../product.js';

export default async function exportDiagrams(args) {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');

  const format = args.find(a => a.startsWith('--format='))?.split('=')[1] || 'svg';
  const customOutput = args.find(a => a.startsWith('--output='))?.split('=')[1];

  if (!['svg', 'png'].includes(format)) {
    console.error(chalk.red(`\n  Invalid format: "${format}". Use --format=svg or --format=png\n`));
    process.exit(1);
  }

  const mmdc = findMmdc();
  if (!mmdc) {
    console.log(chalk.yellow('\n  @mermaid-js/mermaid-cli not found.'));
    console.log('  Install with: ' + chalk.bold('npm install -g @mermaid-js/mermaid-cli'));
    console.log('  Then run: ' + chalk.bold(`npx ${PRODUCT.command} export-diagrams\n`));
    process.exit(1);
  }

  const existing = checkExistingInstallation(process.cwd());
  if (!existing.installed) {
    console.log(chalk.yellow(`\n  ${PRODUCT.name} is not installed in this directory.`));
    console.log('  Run ' + chalk.bold(`npx ${PRODUCT.command} install`) + ' to install.\n');
    return;
  }

  const state = existing.state;
  const outputFolder = state.output_folder || PRODUCT.outputDir;
  const sddPath = join(process.cwd(), outputFolder);

  if (!existsSync(sddPath)) {
    console.log(chalk.yellow(`\n  Output folder not found: ${outputFolder}`));
    console.log('  Run the agents first to generate the artifacts.\n');
    return;
  }

  const diagramsDir = customOutput
    ? join(process.cwd(), customOutput)
    : join(sddPath, 'diagrams');

  mkdirSync(diagramsDir, { recursive: true });

  const spinner = ora(`Looking for diagrams in ${outputFolder}...`).start();
  const mdFiles = findMdFiles(sddPath);
  const blocks = [];

  for (const file of mdFiles) {
    const content = readFileSync(file, 'utf8');
    const found = extractMermaidBlocks(content);
    if (found.length > 0) {
      const rel = file.replace(sddPath, '').replace(/\\/g, '/').replace(/^\//, '');
      found.forEach((diagram, i) => blocks.push({ diagram, source: rel, index: i }));
    }
  }

  if (blocks.length === 0) {
    spinner.warn('No Mermaid diagrams found. Run the agents first.');
    console.log();
    return;
  }

  spinner.succeed(`${blocks.length} diagram(s) found.`);
  console.log();

  let success = 0;
  let failed = 0;

  for (const { diagram, source, index } of blocks) {
    const baseName = source
      .replace(/\.md$/, '')
      .replace(/\//g, '-')
      .replace(/[^a-zA-Z0-9-_]/g, '_');
    const countForSource = blocks.filter(b => b.source === source).length;
    const suffix = countForSource > 1 ? `-${index + 1}` : '';
    const outName = `${baseName}${suffix}.${format}`;
    const outPath = join(diagramsDir, outName);
    const tmpFile = join(tmpdir(), `${PRODUCT.id}-${Date.now()}-${index}.mmd`);
    const spin = ora(`  Exporting ${outName}...`).start();

    try {
      writeFileSync(tmpFile, diagram, 'utf8');
      execSync(`${mmdc} -i "${tmpFile}" -o "${outPath}"`, { stdio: 'pipe' });
      spin.succeed(chalk.hex('#ffa203')(`  ✓ ${outName}`));
      success++;
    } catch (err) {
      spin.fail(chalk.red(`  ✗ ${outName} — ${err.stderr?.toString().split('\n')[0] || err.message}`));
      failed++;
    } finally {
      try { unlinkSync(tmpFile); } catch {}
    }
  }

  console.log();
  console.log(chalk.bold('  Export complete:'));
  console.log(`  ${chalk.hex('#ffa203')(success + ' exported')}${failed > 0 ? '  ' + chalk.red(failed + ' error(s)') : ''}`);
  console.log(`  Folder: ${chalk.cyan(diagramsDir)}\n`);
}

function findMmdc() {
  try {
    execSync('mmdc --version', { stdio: 'pipe' });
    return 'mmdc';
  } catch {}

  const local = join(process.cwd(), 'node_modules', '.bin', 'mmdc');
  if (existsSync(local)) return `"${local}"`;

  return null;
}

function findMdFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...findMdFiles(full));
    } else if (entry.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

function extractMermaidBlocks(content) {
  const regex = /```mermaid\n([\s\S]*?)```/g;
  const blocks = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}
