import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { checkExistingInstallation } from '../installer/validator.js';
import {
  loadManifest,
  saveManifest,
  buildManifest,
  fileStatus,
  mergeUpdateManifest,
} from '../installer/manifest.js';
import { Writer, CANONICAL_STRUCTURE_FILES } from '../installer/writer.js';
import { ENGINES } from '../installer/detector.js';
import { applyOrangeTheme, ORANGE_PREFIX } from '../installer/orange-prompts.js';
import { PRODUCT } from '../product.js';

async function fetchLatestVersion(packageName) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.version ?? null;
  } catch {
    return null;
  }
}

export default async function update(args) {
  const { default: chalk } = await import('chalk');
  const { default: ora } = await import('ora');
  const { default: semver } = await import('semver');

  const projectRoot = resolve(process.cwd());

  console.log(chalk.bold(`\n  ${PRODUCT.name}: Atualização\n`));

  const existing = checkExistingInstallation(projectRoot);
  if (!existing.installed) {
    console.log(chalk.yellow(`  ${PRODUCT.name} is not installed in this directory.`));
    console.log(`  Run ${chalk.bold(`npx ${PRODUCT.command} install`)} to install.\n`);
    return;
  }

  const installedVersion = existing.version;

  // Validate installed version before comparing
  if (!semver.valid(installedVersion)) {
    console.log(chalk.yellow(`  Invalid installed version: "${installedVersion}". Run npx ${PRODUCT.command} install to fix it.\n`));
    return;
  }

  // Check version on npm
  const spinner = ora({ text: 'Verificando a versão mais recente...', color: 'cyan' }).start();
  const latestVersion = await fetchLatestVersion(PRODUCT.packageName);
  spinner.stop();

  if (latestVersion && semver.valid(latestVersion)) {
    if (!semver.lt(installedVersion, latestVersion)) {
      console.log(chalk.hex('#ffa203')(`  Você já está na versão mais recente (v${installedVersion}).\n`));
      return;
    }
    console.log(`  Versão instalada:   ${chalk.yellow('v' + installedVersion)}`);
    console.log(`  Versão disponível:   ${chalk.hex('#ffa203')('v' + latestVersion)}\n`);
  } else {
    console.log(chalk.gray(`  Versão instalada: v${installedVersion}`));
    console.log(chalk.gray('  Não foi possível verificar a versão no npm. Continuando offline.\n'));
  }

  // Carregar manifest e classificar arquivos
  const manifest = loadManifest(projectRoot);
  const state = existing.state;
  const internalDir = existing.internalDir ?? PRODUCT.internalDir;
  const installedAgents = state.internal_agents ?? [];
  const installedEngineIds = state.engines ?? [];
  const installedEngines = ENGINES.filter(e => installedEngineIds.includes(e.id));

  const modified = [];
  const intact = [];
  const missing = [];

  for (const [relPath, hash] of Object.entries(manifest)) {
    const status = fileStatus(projectRoot, relPath, hash);
    if (status === 'modified') modified.push(relPath);
    else if (status === 'missing') missing.push(relPath);
    else intact.push(relPath);
  }

  if (modified.length > 0) {
    console.log(chalk.yellow(`  ${modified.length} arquivo(s) modificado(s) por você serão preservados:`));
    modified.forEach(f => console.log(chalk.gray(`    ✎  ${f}`)));
    console.log('');
  }
  if (missing.length > 0) {
    console.log(chalk.cyan(`  ${missing.length} arquivo(s) ausente(s) serão restaurados:`));
    missing.forEach(f => console.log(chalk.gray(`    +  ${f}`)));
    console.log('');
  }

  const toUpdate = intact.length + missing.length;
  console.log(`  ${toUpdate} arquivo(s) serão atualizados.`);
  if (toUpdate === 0 && !latestVersion) {
    console.log(chalk.gray('  Nenhum arquivo para atualizar.\n'));
    return;
  }

  const { default: inquirer } = await import('inquirer');
  applyOrangeTheme();
  const { confirm } = await inquirer.prompt([{
    prefix: ORANGE_PREFIX,
    type: 'confirm',
    name: 'confirm',
    message: 'Confirmar atualização?',
    default: true,
  }]);
  if (!confirm) {
    console.log(chalk.gray('\n  Atualização cancelada.\n'));
    return;
  }

  const writer = new Writer(projectRoot);
  const updateSpinner = ora({ text: 'Atualizando agentes...', color: 'cyan' }).start();

  try {
    // Reinstalar skills (intactos + ausentes; pular modificados)
    for (const agent of installedAgents) {
      for (const engine of installedEngines) {
        const relDir = join(engine.skillsDir, agent).replace(/\\/g, '/');
        const isModified = modified.some(f => f.replace(/\\/g, '/').startsWith(relDir));
        if (!isModified) {
          const { rmSync } = await import('fs');
          const dest = join(projectRoot, engine.skillsDir, agent);
          if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
          await writer.installSkill(agent, engine.skillsDir);
        }

        if (engine.universalSkillsDir && engine.universalSkillsDir !== engine.skillsDir) {
          const uRelDir = join(engine.universalSkillsDir, agent).replace(/\\/g, '/');
          const uIsModified = modified.some(f => f.replace(/\\/g, '/').startsWith(uRelDir));
          if (!uIsModified) {
            const { rmSync } = await import('fs');
            const uDest = join(projectRoot, engine.universalSkillsDir, agent);
            if (existsSync(uDest)) rmSync(uDest, { recursive: true, force: true });
            await writer.installSkill(agent, engine.universalSkillsDir);
          }
        }
      }
    }

    updateSpinner.text = 'Atualizando arquivos de entrada...';

    // Atualizar entry files intactos ou ausentes
    for (const engine of installedEngines) {
      const relEntry = engine.entryFile;
      const hash = manifest[relEntry];
      if (!hash) continue; // no legacy manifest entry for this file; do not touch
      const status = fileStatus(projectRoot, relEntry, hash);
      if (status === 'intact' || status === 'missing') {
        await writer.installEntryFile(engine, { force: true });
      }
    }

    updateSpinner.text = 'Atualizando estrutura canônica...';

    if (internalDir === PRODUCT.internalDir) {
      writer.ensureDirectory(join(projectRoot, internalDir, 'context'));
      writer.ensureDirectory(join(projectRoot, internalDir, 'reports'));

      for (const entry of CANONICAL_STRUCTURE_FILES) {
        const relPath = join(internalDir, entry.dest).replace(/\\/g, '/');
        const hash = manifest[relPath];
        if (!hash) continue;
        const status = fileStatus(projectRoot, relPath, hash);
        if (status === 'intact' || status === 'missing') {
          writer.installTemplateFile(entry.template, join(projectRoot, relPath), { force: true });
        }
      }
    }

    updateSpinner.text = 'Atualizando versão...';

    if (latestVersion && semver.valid(latestVersion)) {
      writeFileSync(join(projectRoot, internalDir, 'version'), latestVersion, 'utf8');
      const statePath = join(projectRoot, internalDir, 'state.json');
      const s = JSON.parse(readFileSync(statePath, 'utf8'));
      s.version = latestVersion;
      writeFileSync(statePath, JSON.stringify(s, null, 2), 'utf8');
    }

    updateSpinner.text = 'Atualizando manifest...';

    writer.saveCreatedFiles();
    const newManifest = buildManifest(projectRoot, writer.manifestPaths);
    // Mesclar com manifest existente preservando entradas intactas e modificadas.
    saveManifest(
      projectRoot,
      mergeUpdateManifest(manifest, intact, modified, newManifest)
    );

    updateSpinner.succeed(chalk.hex('#ffa203')('Atualização concluída!'));
  } catch (err) {
    updateSpinner.fail(chalk.red('Erro durante a atualização.'));
    throw err;
  }

  if (modified.length > 0) {
    console.log(chalk.yellow(`\n  ${modified.length} arquivo(s) preservado(s) por modificação manual.`));
  }
  console.log('');
}
