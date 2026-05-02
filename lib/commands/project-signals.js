import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, join, relative, sep, extname } from 'path';

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
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
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

function extractHeadingSections(content) {
  const lines = String(content ?? '').split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      if (current) sections.push(current);
      current = {
        title: heading[2].trim(),
        body: [],
      };
      continue;
    }
    if (!current) continue;
    current.body.push(line);
  }

  if (current) sections.push(current);
  return sections.map((section) => ({
    title: section.title,
    text: section.body.join('\n').trim(),
  }));
}

function firstUsefulParagraph(content) {
  const blocks = String(content ?? '')
    .split(/\n\s*\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  for (const block of blocks) {
    const normalized = block.replace(/^#{1,6}\s+/gm, '').trim();
    if (!normalized) continue;
    if (/^[-*+]\s+/m.test(normalized)) continue;
    return normalized;
  }

  return '';
}

function extractSectionByHeadings(content, headings) {
  const sections = extractHeadingSections(content);
  for (const section of sections) {
    const normalizedTitle = normalizeText(section.title);
    if (headings.some((needle) => normalizedTitle.includes(needle))) {
      const paragraph = firstUsefulParagraph(section.text);
      if (paragraph) return paragraph;
    }
  }
  return '';
}

function collectTargets(projectRoot, relDir, { markdownOnly = true } = {}) {
  const abs = join(projectRoot, relDir);
  if (!existsSync(abs)) return [];
  return listFilesRecursive(abs, { markdownOnly }).map((filePath) => ({
    path: rel(projectRoot, filePath),
    content: readText(filePath),
  }));
}

function collectCommandCandidates(text) {
  const commands = [];
  const source = String(text ?? '');

  for (const match of source.matchAll(/`([^`]+)`/g)) {
    const value = match[1].trim();
    if (/^(agentforge|npm|pnpm|yarn|npx|bun|pytest|uv|docker|podman|node|python)\b/i.test(value)) {
      commands.push(value);
    }
  }

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (!/^[-*+]\s+/.test(trimmed)) continue;
    const value = trimmed.replace(/^[-*+]\s+/, '').trim();
    if (/^(agentforge|npm|pnpm|yarn|npx|bun|pytest|uv|docker|podman|node|python)\b/i.test(value)) {
      commands.push(value.replace(/[.;,]+$/, ''));
    }
  }

  return unique(commands);
}

function inferProjectName(projectRoot, packageJson, readmeTitle, state = {}) {
  const stateName = typeof state.project === 'string' ? state.project.trim() : '';
  if (stateName) return stateName;
  const packageName = typeof packageJson?.name === 'string' ? packageJson.name.trim() : '';
  if (packageName) return packageName;
  if (readmeTitle) return readmeTitle;
  return basename(projectRoot);
}

function inferProjectType(signals) {
  const stateProjectType = String(signals.stateProjectType ?? '').trim();
  if (stateProjectType) return stateProjectType;
  if (signals.packageJson && (signals.appExists || signals.srcExists || signals.workflowFiles.length > 0 || signals.workerExists)) {
    return 'SaaS/Web App';
  }
  if (signals.pyproject || signals.requirements) {
    return 'Data/AI';
  }
  if (signals.composerJson) {
    return 'API';
  }
  if (signals.readmeTitle) {
    return 'Outro';
  }
  return 'SaaS/Web App';
}

function inferObjective(signals) {
  const sources = [
    signals.readmeObjective,
    signals.agentsObjective,
    signals.claudeObjective,
    signals.docsObjective,
    signals.stateObjective,
  ].map((value) => String(value ?? '').trim()).filter(Boolean);

  for (const candidate of sources) {
    if (candidate.length >= 12) return candidate;
  }

  const goalLabels = {
    'develop-features': 'Desenvolver e evoluir funcionalidades do projeto',
    'fix-bugs': 'Corrigir bugs e estabilizar o comportamento',
    'review-prs': 'Revisar mudanças com segurança',
    refactor: 'Refatorar a base sem alterar o comportamento esperado',
    document: 'Documentar o projeto e seus fluxos',
    other: 'A preencher',
  };
  if (signals.stateObjective && goalLabels[signals.stateObjective]) {
    return goalLabels[signals.stateObjective];
  }

  return '';
}

function inferAudience(signals) {
  const candidates = [
    signals.readmeAudience,
    signals.agentsAudience,
    signals.docsAudience,
  ].map((value) => String(value ?? '').trim()).filter(Boolean);

  return candidates[0] ?? '';
}

function inferStackDetails(signals) {
  const labels = [];
  const deps = new Set((signals.dependencyNames ?? []).map((value) => String(value).toLowerCase()));
  const pkg = signals.packageJson ?? {};
  const hasTs = Boolean(signals.typecheckScript || deps.has('typescript') || (signals.tsFiles ?? []).length > 0);
  const hasNext = deps.has('next') || signals.appExists;
  const hasReact = deps.has('react') || deps.has('react-dom') || hasNext;
  const hasPrisma = deps.has('prisma') || signals.prismaExists || (signals.migrationFiles ?? []).length > 0;
  const hasTailwind = deps.has('tailwindcss');
  const hasAuth = deps.has('auth.js') || deps.has('next-auth') || deps.has('@auth/core') || deps.has('@auth/nextjs');
  const hasPostgres = deps.has('pg') || deps.has('postgres') || deps.has('postgresql') || /postgres/i.test(JSON.stringify(pkg));

  if (signals.packageJson) labels.push('Node.js');
  if (hasTs) labels.push('TypeScript');
  if (hasNext) labels.push('Next.js');
  if (hasReact) labels.push('React');
  if (hasPrisma) labels.push('Prisma');
  if (hasPostgres) labels.push('PostgreSQL');
  if (hasTailwind) labels.push('Tailwind CSS');
  if (hasAuth) labels.push('Auth.js');
  if (signals.dockerfile || signals.composeFile) labels.push('Docker');
  if (signals.workflowFiles.length > 0) labels.push('GitHub Actions');
  if (signals.workerExists) labels.push('Worker');
  if (signals.docsExists) labels.push('Documentation');

  return unique(labels);
}

function inferMainAreas(signals) {
  const areas = [];
  const add = (label, path, reason) => areas.push({ label, path, reason });
  if (signals.appExists) add('App', 'app/', 'Interface principal da aplicação.');
  if (signals.srcExists) add('Source', 'src/', 'Código principal do projeto.');
  if (signals.workerExists) add('Worker', 'worker/', 'Processamento assíncrono ou rotinas de fundo.');
  if (signals.docsExists) add('Docs', 'docs/', 'Documentação do projeto.');
  if (signals.testsExists) add('Tests', 'tests/', 'Suíte de validação e regressão.');
  if (signals.migrationsExists) add('Migrations', 'migrations/', 'Migrações e evolução do banco.');
  if (signals.workflowFiles.length > 0) add('GitHub Actions', '.github/workflows/', 'Automação de CI/CD.');
  if (signals.dockerfile || signals.composeFile) add('Docker', signals.composeFile || 'Dockerfile', 'Ambiente de execução e orquestração.');
  if (signals.agentsFiles.length > 0) add('Legacy agent docs', '.agents/', 'Fontes agentic legadas importadas.');
  return areas;
}

function inferArchitectureLayers(signals) {
  const layers = [];
  if (signals.appExists || signals.srcExists || signals.readmeHasCommands) layers.push('Interface');
  if (signals.workerExists || signals.testsExists || signals.workflowFiles.length > 0) layers.push('Aplicação');
  if ((signals.domainDocs ?? []).length > 0 || (signals.agentsFiles ?? []).length > 0) layers.push('Domínio');
  if (signals.prismaExists || signals.migrationsExists || signals.dockerfile || signals.composeFile || signals.workflowFiles.length > 0) layers.push('Infraestrutura');
  return unique(layers);
}

function inferArchitectureClues(signals) {
  const clues = [];
  const sources = [
    ...(signals.instructionDocs ?? []),
    ...(signals.domainDocs ?? []),
    ...(signals.architectureDocs ?? []),
  ];

  for (const source of sources) {
    const lines = String(source.content ?? '').split(/\r?\n/);
    for (const line of lines) {
      if (!/\b(architecture|arch|layer|flow|component|boundary|domain|worker|service|migrations|workflow|docker|api|db|database|test|testing)\b/i.test(line)) {
        continue;
      }
      const snippet = line.trim().replace(/^[-*+]\s+/, '');
      if (!snippet) continue;
      clues.push(`${source.path}: ${snippet}`);
      if (clues.length >= 8) return clues;
    }
  }

  return unique(clues);
}

function inferTestingCommands(signals) {
  const entries = [];
  const add = (command, source) => {
    if (!command) return;
    if (!entries.some((item) => item.command === command)) {
      entries.push({ command, source });
    }
  };

  for (const script of signals.packageScripts) {
    if (/(^|:)(test|tests|test:e2e|test:unit|test:integration|coverage|lint|typecheck)(:|$)/i.test(script.name)) {
      add(script.command, script.source);
    }
  }

  for (const command of signals.docCommands) {
    if (/^(agentforge|npm|pnpm|yarn|npx|bun|pytest|uv|docker|podman|node|python)\b/i.test(command.command)) {
      if (/test|lint|typecheck|coverage|validate/i.test(command.command)) {
        add(command.command, command.source);
      }
    }
  }

  return entries;
}

function inferProjectCommands(signals) {
  const entries = [];
  const add = (command, source) => {
    if (!command) return;
    if (!entries.some((item) => item.command === command)) {
      entries.push({ command, source });
    }
  };

  for (const script of signals.packageScripts) {
    add(script.command, script.source);
  }

  for (const command of signals.docCommands) {
    add(command.command, command.source);
  }

  const agentforgeCommands = [
    'agentforge install',
    'agentforge bootstrap',
    'agentforge analyze',
    'agentforge research-patterns',
    'agentforge suggest-agents',
    'agentforge create-agent',
    'agentforge adopt',
    'agentforge audit-context',
    'agentforge refactor-context',
    'agentforge suggest-skills',
    'agentforge validate',
    'agentforge compile',
    'agentforge export',
    'agentforge commands',
  ];
  for (const command of agentforgeCommands) {
    add(command, 'AgentForge CLI');
  }

  return entries;
}

export class ProjectSignalScanner {
  constructor(projectRoot, { state = {} } = {}) {
    this.projectRoot = projectRoot;
    this.state = state;
  }

  scan() {
    const packageJsonPath = join(this.projectRoot, 'package.json');
    const packageJson = existsSync(packageJsonPath) ? readJson(packageJsonPath) : null;
    const scripts = packageJson?.scripts && typeof packageJson.scripts === 'object' && !Array.isArray(packageJson.scripts)
      ? packageJson.scripts
      : {};
    const dependencyNames = unique([
      ...Object.keys(packageJson?.dependencies && typeof packageJson.dependencies === 'object' && !Array.isArray(packageJson.dependencies) ? packageJson.dependencies : {}),
      ...Object.keys(packageJson?.devDependencies && typeof packageJson.devDependencies === 'object' && !Array.isArray(packageJson.devDependencies) ? packageJson.devDependencies : {}),
    ]);

    const readmePath = join(this.projectRoot, 'README.md');
    const agentsPath = join(this.projectRoot, 'AGENTS.md');
    const claudePath = join(this.projectRoot, 'CLAUDE.md');
    const pyprojectPath = join(this.projectRoot, 'pyproject.toml');
    const requirementsPath = join(this.projectRoot, 'requirements.txt');
    const composerJsonPath = join(this.projectRoot, 'composer.json');
    const docsDir = join(this.projectRoot, 'docs');
    const agentsDir = join(this.projectRoot, '.agents');
    const srcDir = join(this.projectRoot, 'src');
    const appDir = join(this.projectRoot, 'app');
    const workerDir = join(this.projectRoot, 'worker');
    const migrationsDir = join(this.projectRoot, 'migrations');
    const testsDir = join(this.projectRoot, 'tests');
    const testDir = join(this.projectRoot, 'test');
    const specsDir = join(this.projectRoot, 'specs');
    const workflowsDir = join(this.projectRoot, '.github', 'workflows');
    const prismaDir = join(this.projectRoot, 'prisma');

    const readmeText = existsSync(readmePath) ? readText(readmePath) : '';
    const agentsText = existsSync(agentsPath) ? readText(agentsPath) : '';
    const claudeText = existsSync(claudePath) ? readText(claudePath) : '';

    const instructionDocs = [
      { path: 'AGENTS.md', content: agentsText },
      { path: 'CLAUDE.md', content: claudeText },
      ...collectTargets(this.projectRoot, '.agents'),
      ...collectTargets(this.projectRoot, 'docs'),
    ].filter((entry) => String(entry.content ?? '').trim().length > 0);
    const domainDocs = instructionDocs.filter((doc) => /\b(domain|glossary|business|rules?|terms?|vocabulary|objective|purpose)\b/i.test(`${doc.path}\n${doc.content}`));
    const architectureDocs = instructionDocs.filter((doc) => /\b(architecture|arch|layer|layers|flow|component|components|boundary|system)\b/i.test(`${doc.path}\n${doc.content}`));

    const docsFiles = collectTargets(this.projectRoot, 'docs');
    const agentsFiles = collectTargets(this.projectRoot, '.agents');
    const workflowFiles = listFilesRecursive(workflowsDir, { markdownOnly: false }).map((filePath) => rel(this.projectRoot, filePath));
    const migrationFiles = listFilesRecursive(migrationsDir, { markdownOnly: false }).map((filePath) => rel(this.projectRoot, filePath));
    const testFiles = [
      ...listFilesRecursive(testsDir, { markdownOnly: false }),
      ...listFilesRecursive(testDir, { markdownOnly: false }),
      ...listFilesRecursive(specsDir, { markdownOnly: false }),
    ]
      .map((filePath) => rel(this.projectRoot, filePath))
      .filter((filePath, index, array) => array.indexOf(filePath) === index);
    const tsFiles = [
      ...listFilesRecursive(srcDir, { markdownOnly: false }),
      ...listFilesRecursive(appDir, { markdownOnly: false }),
      ...listFilesRecursive(workerDir, { markdownOnly: false }),
    ].filter((filePath) => ['.ts', '.tsx', '.js', '.jsx'].includes(extname(filePath).toLowerCase())).map((filePath) => rel(this.projectRoot, filePath));

    const readmeSections = extractHeadingSections(readmeText);
    const readmeTitle = readmeSections.find((section) => section.title)?.title || '';
    const readmeObjective = extractSectionByHeadings(readmeText, ['objetivo', 'objective', 'problem', 'problema', 'purpose', 'why', 'what this project solves']);
    const readmeAudience = extractSectionByHeadings(readmeText, ['público', 'audience', 'users', 'usuarios', 'who']);
    const docsObjective = instructionDocs.map((doc) => extractSectionByHeadings(doc.content, ['objetivo', 'objective', 'problem', 'problema', 'purpose'])).find(Boolean) || '';
    const agentsObjective = extractSectionByHeadings(agentsText, ['objetivo', 'objective', 'problem', 'problema', 'purpose']) || '';
    const claudeObjective = extractSectionByHeadings(claudeText, ['objetivo', 'objective', 'problem', 'problema', 'purpose']) || '';
    const docsAudience = instructionDocs.map((doc) => extractSectionByHeadings(doc.content, ['público', 'audience', 'users', 'usuarios', 'who'])).find(Boolean) || '';

    const packageScripts = Object.entries(scripts)
      .filter(([, value]) => typeof value === 'string')
      .map(([name, command]) => ({
        name,
        command,
        source: 'package.json',
      }));
    const docCommands = unique([
      ...collectCommandCandidates(readmeText).map((command) => ({ command, source: 'README.md' })),
      ...collectCommandCandidates(agentsText).map((command) => ({ command, source: 'AGENTS.md' })),
      ...collectCommandCandidates(claudeText).map((command) => ({ command, source: 'CLAUDE.md' })),
      ...instructionDocs.flatMap((doc) => collectCommandCandidates(doc.content).map((command) => ({ command, source: doc.path }))),
    ].map((entry) => `${entry.command}::${entry.source}`)).map((item) => {
      const [command, source] = item.split('::');
      return { command, source };
    });

    const srcExists = existsSync(srcDir);
    const appExists = existsSync(appDir);
    const workerExists = existsSync(workerDir);
    const docsExists = existsSync(docsDir);
    const migrationsExists = existsSync(migrationsDir);
    const testsExists = existsSync(testsDir) || existsSync(testDir) || existsSync(specsDir) || testFiles.length > 0;

    const signals = {
      projectRoot: this.projectRoot,
      state: this.state,
      packageJson,
      scripts,
      dependencyNames,
      packageManager: packageJson?.packageManager?.toLowerCase().startsWith('pnpm')
        ? 'pnpm'
        : packageJson?.packageManager?.toLowerCase().startsWith('yarn')
          ? 'yarn'
          : packageJson?.packageManager?.toLowerCase().startsWith('npm')
            ? 'npm'
            : existsSync(join(this.projectRoot, 'pnpm-lock.yaml'))
              ? 'pnpm'
              : existsSync(join(this.projectRoot, 'yarn.lock'))
                ? 'yarn'
                : existsSync(join(this.projectRoot, 'package-lock.json'))
                  ? 'npm'
                  : 'npm',
      readmeExists: existsSync(readmePath),
      readmePath,
      readmeText,
      readmeTitle,
      readmeObjective,
      readmeAudience,
      readmeHasCommands: /`[^`]+`/.test(readmeText),
      agentsPath,
      agentsText,
      agentsObjective,
      agentsAudience: extractSectionByHeadings(agentsText, ['público', 'audience', 'users', 'usuarios', 'who']),
      claudePath,
      claudeText,
      claudeObjective,
      domainDocs: domainDocs.length > 0 ? domainDocs : instructionDocs,
      architectureDocs: architectureDocs.length > 0 ? architectureDocs : instructionDocs,
      stateProjectType: typeof this.state.project_type === 'string'
        ? this.state.project_type.trim()
        : typeof this.state.projectType === 'string'
          ? this.state.projectType.trim()
          : '',
      stateObjective: typeof this.state.objective === 'string'
        ? this.state.objective.trim()
        : '',
      docsExists,
      docsDir,
      docsObjective,
      docsAudience,
      docsFiles,
      agentsFiles,
      instructionDocs,
      workflowFiles,
      migrationFiles,
      testFiles,
      tsFiles,
      srcExists,
      appExists,
      workerExists,
      migrationsExists,
      testsExists,
      prismaExists: existsSync(prismaDir),
      dockerfile: existsSync(join(this.projectRoot, 'Dockerfile')),
      composeFile: existsSync(join(this.projectRoot, 'docker-compose.yml'))
        ? 'docker-compose.yml'
        : existsSync(join(this.projectRoot, 'compose.yaml'))
          ? 'compose.yaml'
          : '',
      packageLock: existsSync(join(this.projectRoot, 'package-lock.json')),
      pnpmLock: existsSync(join(this.projectRoot, 'pnpm-lock.yaml')),
      yarnLock: existsSync(join(this.projectRoot, 'yarn.lock')),
      pyproject: existsSync(pyprojectPath),
      requirements: existsSync(requirementsPath),
      composerJson: existsSync(composerJsonPath),
      packageScripts,
      docCommands,
      projectCommands: inferProjectCommands({
        packageScripts,
        docCommands,
      }),
      testingCommands: inferTestingCommands({
        packageScripts,
        docCommands,
      }),
      stackDetails: inferStackDetails({
      packageJson,
      dependencyNames,
      tsFiles,
      typecheckScript: typeof scripts.typecheck === 'string' || Object.values(scripts).some((value) => typeof value === 'string' && /\btsc\b/i.test(value)),
        srcExists,
        appExists,
        workerExists,
        testsExists,
        workflowFiles,
        dockerfile: existsSync(join(this.projectRoot, 'Dockerfile')),
        composeFile: existsSync(join(this.projectRoot, 'docker-compose.yml')) ? 'docker-compose.yml' : (existsSync(join(this.projectRoot, 'compose.yaml')) ? 'compose.yaml' : ''),
        prismaExists: existsSync(prismaDir),
        migrationFiles,
        docsExists,
      }),
      mainAreas: inferMainAreas({
        appExists,
        srcExists,
        workerExists,
        docsExists,
        testsExists,
        migrationsExists,
        workflowFiles,
        dockerfile: existsSync(join(this.projectRoot, 'Dockerfile')),
        composeFile: existsSync(join(this.projectRoot, 'docker-compose.yml')) ? 'docker-compose.yml' : (existsSync(join(this.projectRoot, 'compose.yaml')) ? 'compose.yaml' : ''),
        agentsFiles,
      }),
      mainDirectories: unique([
        srcExists ? 'src/' : '',
        appExists ? 'app/' : '',
        workerExists ? 'worker/' : '',
        docsExists ? 'docs/' : '',
        migrationsExists ? 'migrations/' : '',
        testsExists ? 'tests/' : '',
        workflowFiles.length > 0 ? '.github/workflows/' : '',
        agentsFiles.length > 0 ? '.agents/' : '',
      ]),
    };

    signals.projectName = inferProjectName(this.projectRoot, packageJson, readmeTitle, this.state);
    signals.projectType = inferProjectType(signals);
    signals.objectiveText = inferObjective(signals);
    signals.audienceText = inferAudience(signals);
    signals.architectureLayers = inferArchitectureLayers(signals);
    signals.architectureClues = inferArchitectureClues(signals);
    signals.testingFiles = testFiles;
    signals.commandEntries = signals.projectCommands;

    return signals;
  }
}

export function scanProjectSignals(projectRoot, options = {}) {
  return new ProjectSignalScanner(projectRoot, options).scan();
}
