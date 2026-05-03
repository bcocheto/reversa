import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { buildManifest, fileStatus, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { PRODUCT } from '../product.js';
import { COMMAND_REGISTRY } from './registry.js';
import { summarizeStatePlan } from './project-plan.js';

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readPlanContent(projectRoot) {
  return readText(join(projectRoot, PRODUCT.internalDir, 'plan.md'));
}

function safeString(value, fallback = 'A confirmar') {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : fallback;
}

function formatBulletList(values = [], emptyLabel = 'Nenhum sinal detectado.') {
  const items = values.filter(Boolean);
  if (items.length === 0) return [`- ${emptyLabel}`];
  return items.map((value) => `- ${value}`);
}

function formatNamedBulletList(items = [], emptyLabel = 'Nenhum sinal detectado.') {
  const filtered = items.filter(Boolean);
  if (filtered.length === 0) return [`- ${emptyLabel}`];
  return filtered.map((item) => `- ${item}`);
}

function formatTable(rows, header) {
  if (rows.length === 0) return [];
  return [
    `| ${header.join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

function listDetectedSources(bundle) {
  const analysis = bundle?.analysis ?? {};
  const signals = analysis?.signals ?? {};
  const patternResearch = bundle?.patternResearch ?? {};
  const suggestions = bundle?.suggestions ?? {};
  const sources = [
    signals.readmeExists ? 'README.md' : '',
    signals.packageJson ? 'package.json' : '',
    (signals.docsFiles ?? []).length > 0 ? 'docs/' : '',
    (signals.instructionDocs ?? []).length > 0 ? 'AGENTS.md / CLAUDE.md snapshots' : '',
    (signals.agentsFiles ?? []).length > 0 ? '.agents/' : '',
    (analysis?.extraCodeSurface ?? []).length > 0 ? analysis.extraCodeSurface.map((item) => item.path).join(', ') : '',
    (patternResearch?.recommendedPatterns ?? []).length > 0 ? 'pattern research' : '',
    (suggestions?.agents ?? []).length > 0 ? 'suggested agents' : '',
    (suggestions?.flows ?? []).length > 0 ? 'suggested flows' : '',
    (suggestions?.skills ?? []).length > 0 ? 'suggested skills' : '',
  ];

  return unique(sources);
}

function describeScript(name) {
  const normalized = normalizeText(name);
  if (normalized === 'test' || normalized.startsWith('test:')) return 'Validação e regressão.';
  if (normalized === 'lint' || normalized.startsWith('lint:')) return 'Verificação de estilo e consistência.';
  if (normalized === 'typecheck' || normalized.startsWith('typecheck:') || normalized === 'tsc') return 'Validação estática de tipos.';
  if (normalized === 'build' || normalized.startsWith('build:')) return 'Construção de artefatos para entrega.';
  if (normalized === 'dev' || normalized.startsWith('dev:')) return 'Execução local em modo de desenvolvimento.';
  if (normalized === 'start' || normalized.startsWith('start:')) return 'Inicialização do serviço ou aplicação.';
  if (normalized === 'preview' || normalized.startsWith('preview:')) return 'Pré-visualização do build.';
  if (normalized === 'release' || normalized.startsWith('release:')) return 'Fluxo de release e publicação.';
  if (normalized === 'check' || normalized.startsWith('check:')) return 'Validações agregadas.';
  return 'Script do projeto detectado no package.json.';
}

function buildAgentForgeCommandsSection() {
  const rows = COMMAND_REGISTRY.map((entry) => [
    `\`${entry.id}\``,
    `\`${entry.usage}\``,
    entry.status,
    entry.description,
  ]);

  return [
    '## AgentForge commands',
    '',
    'Gerado a partir de `COMMAND_REGISTRY`.',
    '',
    ...formatTable(rows, ['Command', 'Usage', 'Status', 'Description']),
    '',
  ].join('\n');
}

function buildProjectCommandsSection(signals) {
  const packageScripts = signals?.packageScripts ?? [];
  const rows = packageScripts.map((script) => [
    `\`${script.name}\``,
    `\`${script.command}\``,
    describeScript(script.name),
  ]);

  const lines = ['## Project commands', ''];
  if (rows.length === 0) {
    lines.push('- Nenhum script package.json detectado.');
    lines.push('- `npx @bcocheto/agentforge <command>` permanece como fallback quando o binário local não estiver disponível.');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(...formatTable(rows, ['Script', 'Command', 'Purpose']));
  lines.push('');
  lines.push('Fallback:')
  lines.push('');
  lines.push('- `npx @bcocheto/agentforge <command>`');
  lines.push('');
  return lines.join('\n');
}

export function buildCommandsReferenceDocument(signals = {}) {
  return [
    '# Commands',
    '',
    'Este arquivo é gerado a partir de `COMMAND_REGISTRY` e dos scripts do projeto.',
    'Não mantenha uma lista manual divergente.',
    '',
    '## Exemplos',
    '',
    '- `npx @bcocheto/agentforge commands`',
    '- `npx @bcocheto/agentforge validate`',
    '- `npx @bcocheto/agentforge compile`',
    '- `npx @bcocheto/agentforge analyze`',
    '',
    buildAgentForgeCommandsSection().trimEnd(),
    buildProjectCommandsSection(signals).trimEnd(),
    '## Nota',
    '',
    '- `commands` lista o registry em tempo de execução.',
    '- Se o binário local não existir, use `npx @bcocheto/agentforge <command>` como fallback.',
    '',
  ].join('\n');
}

function buildExternalDocsSection(analysis, planSummary) {
  const signals = analysis?.signals ?? {};
  const docs = [];

  if (signals.readmeExists) {
    docs.push({ label: 'README.md', path: '[README.md](README.md)', note: 'Visão geral principal do projeto.' });
  }

  for (const doc of signals.docsFiles ?? []) {
    docs.push({
      label: doc.path,
      path: `[${doc.path}](${doc.path})`,
      note: 'Documentação local do projeto.',
    });
  }

  for (const doc of signals.instructionDocs ?? []) {
    if (doc.path === 'AGENTS.md' || doc.path === 'CLAUDE.md') {
      docs.push({
        label: doc.path,
        path: `[${doc.path}](${doc.path})`,
        note: 'Snapshot de instruções agentic locais.',
      });
    }
  }

  if (signals.agentsFiles?.length > 0) {
    docs.push({
      label: '.agents/',
      path: '[.agents/](.agents/)',
      note: 'Conteúdo legado importado ou referência de contexto agentic.',
    });
  }

  docs.push({
    label: '.agentforge/reports/project-analysis.md',
    path: '[.agentforge/reports/project-analysis.md](.agentforge/reports/project-analysis.md)',
    note: 'Resumo consolidado da análise local.',
  });
  docs.push({
    label: '.agentforge/reports/analysis-plan.md',
    path: '[.agentforge/reports/analysis-plan.md](.agentforge/reports/analysis-plan.md)',
    note: 'Plano sugerido a partir da análise.',
  });
  docs.push({
    label: '.agentforge/harness/router.md',
    path: '[.agentforge/harness/router.md](.agentforge/harness/router.md)',
    note: 'Regras de roteamento e ativação do AgentForge.',
  });
  docs.push({
    label: '.agentforge/harness/context-index.yaml',
    path: '[.agentforge/harness/context-index.yaml](.agentforge/harness/context-index.yaml)',
    note: 'Índice canônico de contexto e modos de tarefa.',
  });

  const rows = docs.map((doc) => [`\`${doc.label}\``, doc.path, doc.note]);
  const lines = ['## External docs', '', ...formatTable(rows, ['Local doc', 'Link', 'Why keep it']), ''];

  if (planSummary?.warnings?.length > 0) {
    lines.push('## A confirmar');
    lines.push('');
    for (const warning of planSummary.warnings.slice(0, 5)) {
      lines.push(`- ${warning}`);
    }
    lines.push('');
  } else {
    lines.push('## A confirmar');
    lines.push('');
    lines.push('- Adicionar outros documentos locais relevantes quando aparecerem no repositório.');
    lines.push('');
  }

  return lines.join('\n');
}

function buildProjectOverviewDocument(bundle, state, planSummary) {
  const analysis = bundle?.analysis ?? {};
  const signals = analysis?.signals ?? {};
  const projectName = safeString(signals.projectName || state?.project || state?.project_name, 'Projeto não detectado');
  const projectType = safeString(signals.projectType || state?.project_type);
  const objective = safeString(signals.objectiveText || state?.objective);
  const audience = safeString(signals.audienceText);
  const stack = analysis?.detectedStack?.length > 0
    ? analysis.detectedStack.join(', ')
    : safeString(analysis?.framework && analysis.framework !== 'Unknown' ? analysis.framework : '');
  const mainAreas = analysis?.mainAreas ?? [];
  const patterns = bundle?.patternResearch?.recommendedPatterns ?? [];
  const suggestedAgents = bundle?.suggestions?.agents ?? [];
  const suggestedFlows = bundle?.suggestions?.flows ?? [];
  const suggestedSkills = bundle?.suggestions?.skills ?? [];

  const lines = [
    '# Project Overview',
    '',
    '## Nome',
    '',
    projectName,
    '',
    '## Objetivo',
    '',
    objective,
    '',
    '## Tipo de projeto',
    '',
    projectType,
    '',
    '## Stack detectada',
    '',
    stack,
    '',
    '## Público e usuários',
    '',
    audience,
    '',
    '## Áreas principais',
    '',
    ...formatNamedBulletList(mainAreas.map((area) => `${area.label} (${area.path}) — ${area.reason}`), 'Nenhuma área principal detectada.'),
    '',
    '## Estado atual',
    '',
    `- Análise local: concluída com ${patterns.length} padrão(ões) de pesquisa e ${analysis?.risks?.length ?? 0} risco(s) detectado(s).`,
    `- Sugestões geradas: ${suggestedAgents.length} agentes, ${suggestedFlows.length} flows, ${suggestedSkills.length} skills.`,
    `- Sinais usados: ${listDetectedSources(bundle).join(', ') || 'Nenhum sinal forte detectado.'}`,
    '- Use `agentforge next` para determinar a próxima fase.',
    '',
    '## A confirmar',
    '',
  ];

  const missing = [];
  if (!signals.projectName && !state?.project && !state?.project_name) missing.push('Nome do projeto a partir do README, package.json ou estado inicial.');
  if (!signals.objectiveText && !state?.objective) missing.push('Objetivo consolidado do projeto.');
  if (!signals.audienceText) missing.push('Público principal ou usuários.');
  if (analysis?.mainAreas?.length === 0) missing.push('Áreas principais do repositório.');
  if (!analysis?.framework) missing.push('Framework ou runtime principal.');
  if ((bundle?.patternResearch?.recommendedPatterns ?? []).length === 0) missing.push('Padrões locais relevantes.');

  if (missing.length === 0) {
    lines.push('- Nenhuma lacuna crítica detectada com os sinais atuais.');
  } else {
    for (const item of missing) {
      lines.push(`- ${item}`);
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function buildArchitectureDocument(analysis, planSummary) {
  const signals = analysis?.signals ?? {};
  const mainAreas = analysis?.mainAreas ?? [];
  const layers = signals.architectureLayers ?? [];
  const extraSurface = analysis?.extraCodeSurface ?? [];
  const patterns = analysis?.localPatterns ?? [];
  const integration = analysis?.integrationSignals ?? [];
  const dataSignals = analysis?.dataSignals ?? [];
  const securitySignals = analysis?.securitySignals ?? [];

  const flowSteps = [
    '1. Entrypoints e harness leem `state.json`, `plan.md`, `scope.md` e o índice de contexto antes de editar.',
    '2. A camada principal executa nas superfícies detectadas em `app/`, `src/`, `worker/` e módulos adicionais.',
    '3. Dados, migrações, workflows e contêineres sustentam a integração e a entrega.',
    '4. Testes, lint, typecheck e validate fecham o ciclo antes de promoção ou publicação.',
  ];

  const lines = [
    '# Architecture',
    '',
    '## Arquitetura provável',
    '',
    safeString(analysis?.architecture, 'Arquitetura ainda pouco explícita nos sinais locais.'),
    '',
    '## Superfícies principais',
    '',
    ...formatNamedBulletList(mainAreas.map((area) => `${area.label} — ${area.path} — ${area.reason}`), 'Nenhuma superfície principal detectada.'),
    '',
    '## Camadas detectadas',
    '',
    ...formatNamedBulletList(layers.map((layer) => layer), 'Nenhuma camada explícita detectada.'),
    '',
    '## Superfícies extras',
    '',
    ...formatNamedBulletList(extraSurface.map((item) => `${item.path} (${item.fileCount} arquivo(s))`), 'Nenhuma superfície extra detectada.'),
    '',
    '## Fluxo operacional de alto nível',
    '',
    ...flowSteps,
    '',
    '## Decisões arquiteturais inferidas',
    '',
    ...formatNamedBulletList([
      patterns.some((pattern) => pattern.id === 'command-driven-automation')
        ? 'O projeto depende de comandos reproduzíveis e o contexto deve documentar scripts e entrypoints.'
        : '',
      patterns.some((pattern) => pattern.id === 'docs-as-product-surface')
        ? 'Documentação é uma superfície de produto e precisa ficar alinhada com o código.'
        : '',
      patterns.some((pattern) => pattern.id === 'automation-and-ops')
        ? 'Automação, entrega e operação fazem parte do desenho arquitetural.'
        : '',
      patterns.some((pattern) => pattern.id === 'data-aware-surface')
        ? 'Há uma camada de dados que pede atenção a migrações, rollback e contrato de persistência.'
        : '',
      patterns.some((pattern) => pattern.id === 'agentic-instructions')
        ? 'Há instruções agentic legadas ou locais que precisam ser mantidas em sincronia com o contexto canônico.'
        : '',
      patterns.some((pattern) => pattern.id === 'multi-root-code-surface')
        ? 'O projeto tem superfícies de código múltiplas e precisa de fronteiras explícitas entre roots compartilhados.'
        : '',
    ], 'Nenhuma decisão inferida com confiança suficiente.'),
    '',
    '## Sinais de suporte',
    '',
    `- Integração: ${integration.length > 0 ? integration.join(', ') : 'nenhuma detectada'}.`,
    `- Dados: ${dataSignals.length > 0 ? dataSignals.join(', ') : 'nenhum sinal explícito'}.`,
    `- Segurança: ${securitySignals.length > 0 ? securitySignals.join(', ') : 'nenhum sinal explícito'}.`,
    '- Use `agentforge next` para determinar a próxima fase.',
    '',
    '## A confirmar',
    '',
  ];

  const missing = [];
  if (layers.length === 0) missing.push('Camadas arquiteturais explícitas.');
  if (mainAreas.length === 0) missing.push('Superfícies principais do repositório.');
  if (extraSurface.length === 0) missing.push('Roots de código extras como `libs/` ou `modules/`, se existirem.');
  if (patterns.length === 0) missing.push('Padrões locais de arquitetura e operação.');
  if (integration.length === 0) missing.push('Superfícies de integração e entrega.');
  if (dataSignals.length === 0) missing.push('Sinais claros de camada de dados.');

  if (missing.length === 0) {
    lines.push('- Nenhuma lacuna crítica detectada com os sinais locais.');
  } else {
    for (const item of missing) {
      lines.push(`- ${item}`);
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function buildTestingDocument(analysis) {
  const signals = analysis?.signals ?? {};
  const packageScripts = signals.packageScripts ?? [];
  const testingCommands = signals.testingCommands ?? [];
  const testFiles = signals.testFiles ?? [];
  const packageRows = packageScripts
    .filter((script) => /(^|:)(test|tests|lint|typecheck|coverage|build)(:|$)/i.test(script.name))
    .map((script) => [`\`${script.name}\``, `\`${script.command}\``, script.source, describeScript(script.name)]);
  const agentForgeRows = [
    ['`agentforge validate`', '`agentforge validate`', 'AgentForge CLI', 'Valida a estrutura canônica após mudanças em `.agentforge/`.'],
    ['`agentforge analyze --write-context`', '`agentforge analyze --write-context`', 'AgentForge CLI', 'Escreve contexto central a partir dos sinais detectados.'],
  ];

  const lines = [
    '# Testing',
    '',
    '## Estratégia',
    '',
    '- Teste o menor escopo útil primeiro e amplie apenas quando necessário.',
    '- Use diretórios temporários quando o comando escrever artefatos no disco.',
    '- Antes de finalizar mudanças agentic, valide a estrutura canônica do projeto.',
    '',
    '## Comandos detectados',
    '',
    ...formatTable(packageRows, ['Script', 'Command', 'Source', 'Why run it']),
    ...(packageRows.length === 0 ? ['- Nenhum script de teste detectado no package.json.'] : []),
    '',
    '## Comandos AgentForge úteis',
    '',
    ...formatTable(agentForgeRows, ['Command', 'Invocation', 'Source', 'Why run it']),
    '',
    '## Arquivos/pastas de teste detectados',
    '',
    ...formatNamedBulletList(testFiles.map((file) => `\`${file}\``), 'Nenhum arquivo ou pasta de teste detectado.'),
    '',
    '## Quando rodar cada comando',
    '',
    ...formatBulletList([
      packageScripts.some((script) => /(^|:)test(:|$)/i.test(script.name))
        ? `Rode \`${packageScripts.find((script) => /(^|:)test(:|$)/i.test(script.name))?.command}\` antes de concluir mudanças funcionais.`
        : '',
      packageScripts.some((script) => /lint/i.test(script.name))
        ? `Rode \`${packageScripts.find((script) => /lint/i.test(script.name))?.command}\` quando a mudança tocar estilo, docs ou convenções.`
        : '',
      packageScripts.some((script) => /typecheck/i.test(script.name))
        ? `Rode \`${packageScripts.find((script) => /typecheck/i.test(script.name))?.command}\` quando o código tocar TypeScript ou fronteiras tipadas.`
        : '',
      packageScripts.some((script) => /build/i.test(script.name))
        ? `Rode \`${packageScripts.find((script) => /build/i.test(script.name))?.command}\` antes de release, publish ou mudança de integração.`
        : '',
      testingCommands.length > 0
        ? `Os comandos encontrados em README/docs incluem ${testingCommands.map((entry) => `\`${entry.command}\``).join(', ')}.`
        : '',
    ], 'Nenhum comando de validação adicional detectado.'),
    '',
    '## A confirmar',
    '',
  ];

  const missing = [];
  if (packageRows.length === 0) missing.push('Comandos de teste/lint/typecheck/build detectados no package.json.');
  if (testFiles.length === 0) missing.push('Arquivos e pastas de teste reais.');
  if (testingCommands.length === 0) missing.push('Comandos de validação documentados no README/docs.');

  if (missing.length === 0) {
    lines.push('- Nenhuma lacuna crítica detectada com os sinais locais.');
  } else {
    for (const item of missing) {
      lines.push(`- ${item}`);
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function buildDeploymentDocument(analysis) {
  const signals = analysis?.signals ?? {};
  const packageScripts = signals.packageScripts ?? [];
  const dockerfile = signals.dockerfile ? 'Dockerfile' : '';
  const composeFile = signals.composeFile ? signals.composeFile : '';
  const workflowFiles = signals.workflowFiles ?? [];
  const buildScript = packageScripts.find((script) => /(^|:)build(:|$)/i.test(script.name));
  const startScript = packageScripts.find((script) => /(^|:)(start|dev|preview)(:|$)/i.test(script.name));
  const rollbackInference = workflowFiles.length > 0 || dockerfile || composeFile
    ? 'Inferência: o rollback provável passa por voltar ao commit/tag/imagem anterior e repetir validate/test antes de promover novamente.'
    : 'A estratégia de rollback real ainda não ficou explícita nos sinais locais.';

  const lines = [
    '# Deployment',
    '',
    '## Artefatos detectados',
    '',
    ...formatNamedBulletList([
      dockerfile ? `Dockerfile (${dockerfile})` : '',
      composeFile ? `Compose (${composeFile})` : '',
      ...(workflowFiles.length > 0 ? workflowFiles.map((file) => `Workflow (${file})`) : []),
    ], 'Nenhum artefato de deployment detectado.'),
    '',
    '## Scripts de build e start',
    '',
    ...formatNamedBulletList([
      buildScript ? `${buildScript.name}: \`${buildScript.command}\`` : '',
      startScript ? `${startScript.name}: \`${startScript.command}\`` : '',
    ], 'Nenhum script de build/start detectado.'),
    '',
    '## Ambientes conhecidos',
    '',
    ...formatNamedBulletList([
      'Local',
      ...(workflowFiles.length > 0 ? ['CI'] : []),
      ...(dockerfile || composeFile ? ['Container'] : []),
    ], 'Ambientes ainda não descritos.'),
    '',
    '## Rollback',
    '',
    rollbackInference,
    '',
    '## A confirmar',
    '',
  ];

  const missing = [];
  if (!dockerfile && !composeFile && workflowFiles.length === 0) missing.push('Artefatos de deployment como Dockerfile, compose e workflows.');
  if (!buildScript && !startScript) missing.push('Scripts de build/start no package.json.');
  if (rollbackInference.startsWith('A estratégia')) missing.push('Estratégia de rollback real do projeto.');

  if (missing.length === 0) {
    lines.push('- Nenhuma lacuna crítica detectada com os sinais locais.');
  } else {
    for (const item of missing) {
      lines.push(`- ${item}`);
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function buildGlossaryDocument(analysis) {
  const signals = analysis?.signals ?? {};
  const terms = [];
  const push = (term, meaning) => {
    if (!term || !meaning) return;
    if (terms.some((entry) => entry.term === term)) return;
    terms.push({ term, meaning });
  };

  push('AgentForge', 'Camada que organiza contexto, instruções e comandos do projeto.');
  push('Harness', 'Camada de roteamento e carga que decide o que ler primeiro.');
  push('State', 'Estado persistido em `.agentforge/state.json`.');
  push('Plan', 'Plano de fases e tarefas em `.agentforge/plan.md`.');
  push('Context', 'Arquivos canônicos que resumem o projeto e suas regras.');
  push('Flow', 'Sequência operacional com etapas e checkpoints.');
  push('Policy', 'Regra de proteção, aprovação ou segurança.');
  push('README', 'Visão geral e ponto de entrada humano.');
  push('Scope', 'Limites explícitos do trabalho atual.');
  push('Next phase', 'Indica a fase seguinte calculada pelo Phase Engine.');

  for (const item of analysis?.mainAreas ?? []) {
    push(item.label, item.reason || `Área principal detectada em ${item.path}.`);
  }

  for (const stackItem of analysis?.detectedStack ?? []) {
    const label = stackItem.replace(/^code:/, '');
    if (!label) continue;
    push(label, `Stack ou superfície detectada nos sinais locais.`);
  }

  for (const pattern of analysis?.localPatterns ?? []) {
    push(pattern.title, pattern.implication);
  }

  for (const heading of signals.readmeSections?.map((section) => section.title).filter(Boolean) ?? []) {
    push(heading, 'Seção recorrente extraída do README.');
  }

  const rows = terms.map((term) => [`\`${term.term}\``, term.meaning]);

  const lines = [
    '# Glossary',
    '',
    '## Termos',
    '',
    ...formatTable(rows, ['Term', 'Meaning']),
    '',
    '## A confirmar',
    '',
  ];

  if (terms.length === 0) {
    lines.push('- Nenhum termo confiável detectado além da base AgentForge.');
  } else {
    lines.push('- Atualize os termos quando o README, docs ou instruções passarem a usar vocabulário novo.');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function buildReadmeDocument(bundle, state, planSummary) {
  const analysis = bundle?.analysis ?? {};
  const signals = analysis?.signals ?? {};
  const engines = Array.isArray(state?.engines) ? state.engines : [];
  const owner = safeString(state?.user_name, 'A confirmar');
  const setupMode = safeString(state?.setup_mode, 'a confirmar');
  const projectName = safeString(signals.projectName || state?.project || state?.project_name, 'Projeto não detectado');
  const projectType = safeString(signals.projectType || state?.project_type);
  const sources = listDetectedSources(bundle);

  const lines = [
    '# AgentForge Workspace',
    '',
    'Este diretório concentra o contexto canônico do AgentForge dentro do projeto.',
    'Ele reúne leitura, roteamento, referências, políticas, fluxos, skills e memória em arquivos simples de revisar.',
    '',
    '## Projeto',
    '',
    `- Projeto: ${projectName}`,
    `- Tipo: ${projectType}`,
    `- Objetivo: ${safeString(signals.objectiveText || state?.objective)}`,
    `- Stack: ${analysis?.detectedStack?.length > 0 ? analysis.detectedStack.join(', ') : safeString(analysis?.framework && analysis.framework !== 'Unknown' ? analysis.framework : '')}`,
    `- Públicos/usuários: ${safeString(signals.audienceText)}`,
    '',
    '## Instalação',
    '',
    `- Modo de instalação: ${setupMode}`,
    `- Engines ativas: ${engines.length > 0 ? engines.join(', ') : 'A confirmar'}`,
    `- Dono do contexto: ${owner}`,
    '',
    '## Como navegar',
    '',
    '1. Leia `harness/router.md` para entender ativação e roteamento.',
    '2. Leia `harness/context-index.yaml` para ver o que o agente carrega primeiro.',
    '3. Confira `state.json` e `plan.md` para entender fase, pendências e consistência.',
    '4. Use `scope.md` para limitar o trabalho atual quando existir.',
    '',
    '## Comandos importantes',
    '',
    '- `agentforge commands`',
    '- `agentforge status`',
    '- `agentforge next`',
    '- `agentforge validate`',
    '- `agentforge analyze --write-context`',
    '- `npx @bcocheto/agentforge <command>`',
    '',
    '## Estado atual',
    '',
    `- Sinais usados: ${sources.join(', ') || 'Nenhum sinal forte detectado.'}`,
    `- Consistência state/plan: ${planSummary.errors.length > 0 || planSummary.warnings.length > 0 ? 'há pontos a revisar' : 'ok'}`,
    '- Use `agentforge next` para determinar a próxima fase.',
    '',
    '## A confirmar',
    '',
  ];

  const missing = [];
  if (!signals.projectName && !state?.project && !state?.project_name) missing.push('Nome real do projeto.');
  if (!signals.objectiveText && !state?.objective) missing.push('Objetivo consolidado.');
  if (!signals.audienceText) missing.push('Público principal ou usuários.');
  if (engines.length === 0) missing.push('Engines ativas.');
  if (!state?.workflow?.current_phase && !state?.phase) missing.push('Fase atual a partir do state/workflow.');

  if (missing.length === 0) {
    lines.push('- Nenhuma lacuna crítica detectada com os sinais locais.');
  } else {
    for (const item of missing) {
      lines.push(`- ${item}`);
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

function shouldWriteSynthesizedFile(projectRoot, manifest, relPath, { force = false } = {}) {
  const absPath = join(projectRoot, relPath);
  if (!existsSync(absPath)) return 'create';
  if (force) return 'write';

  const hash = manifest[relPath];
  if (hash) {
    return fileStatus(projectRoot, relPath, hash) === 'intact' ? 'write' : 'skip';
  }

  const content = readText(absPath).trim();
  if (!content) return 'write';
  if (/(\bA preencher\b|<[^>]+>|\bTBD\b|\bNão detectado\b)/i.test(content)) return 'write';
  return 'skip';
}

export function buildCoreContextDocuments(projectRoot, state, analysisBundle) {
  const analysis = analysisBundle?.analysis ?? {};
  const planSummary = summarizeStatePlan({
    state: state ?? {},
    planContent: readPlanContent(projectRoot),
  });

  return {
    'context/project-overview.md': buildProjectOverviewDocument(analysisBundle, state, planSummary),
    'context/architecture.md': buildArchitectureDocument(analysis, planSummary),
    'context/testing.md': buildTestingDocument(analysis),
    'context/deployment.md': buildDeploymentDocument(analysis),
    'context/glossary.md': buildGlossaryDocument(analysis),
    'references/commands.md': buildCommandsReferenceDocument(analysis?.signals ?? {}),
    'references/external-docs.md': buildExternalDocsSection(analysis, planSummary),
    'README.md': buildReadmeDocument(analysisBundle, state, planSummary),
  };
}

export function applyCoreContextSynthesis(projectRoot, state, analysisBundle, { force = false } = {}) {
  const documents = buildCoreContextDocuments(projectRoot, state, analysisBundle);
  const writer = new Writer(projectRoot);
  const manifest = loadManifest(projectRoot);
  const writtenPaths = [];
  const skippedPaths = [];

  for (const [relPath, content] of Object.entries(documents)) {
    const internalRelPath = join(PRODUCT.internalDir, relPath).replace(/\\/g, '/');
    const decision = shouldWriteSynthesizedFile(projectRoot, manifest, internalRelPath, { force });
    if (decision === 'skip') {
      skippedPaths.push(internalRelPath);
      continue;
    }
    writer.writeGeneratedFile(join(projectRoot, internalRelPath), content, { force: true });
    writtenPaths.push(internalRelPath);
  }

  const nextState = {
    ...(state ?? {}),
    last_context_synthesis_at: new Date().toISOString(),
    synthesized_context_files: writtenPaths,
  };

  writer.writeGeneratedFile(
    join(projectRoot, PRODUCT.internalDir, 'state.json'),
    `${JSON.stringify(nextState, null, 2)}\n`,
    { force: true },
  );
  writtenPaths.push(join(PRODUCT.internalDir, 'state.json').replace(/\\/g, '/'));
  writer.saveCreatedFiles();

  saveManifest(projectRoot, {
    ...loadManifest(projectRoot),
    ...buildManifest(projectRoot, writtenPaths),
  });

  return {
    state: nextState,
    writtenPaths,
    skippedPaths,
    documents,
  };
}
