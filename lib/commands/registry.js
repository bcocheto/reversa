import { PRODUCT } from '../product.js';

export const COMMAND_REGISTRY = Object.freeze([
  {
    id: 'install',
    category: 'setup',
    usage: 'install',
    description: 'Instala o AgentForge e prepara a camada agent-ready inicial.',
    aliases: [],
    safeByDefault: false,
    writes: ['.agentforge/**', 'managed engine entrypoints in project root'],
    examples: ['install'],
    status: 'stable',
    module: './install.js',
  },
  {
    id: 'bootstrap',
    category: 'setup',
    usage: 'bootstrap',
    description: 'Completa a base agent-ready do projeto atual.',
    aliases: [],
    safeByDefault: false,
    writes: ['.agentforge/**', 'managed engine entrypoints in project root'],
    examples: ['bootstrap'],
    status: 'stable',
    module: './bootstrap.js',
  },
  {
    id: 'ingest',
    category: 'adoption',
    usage: 'ingest',
    description: 'Importa snapshots de instruções agentic existentes sem alterar os originais.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/imports/**', '.agentforge/reports/ingest.md', '.agentforge/state.json'],
    examples: ['ingest'],
    status: 'stable',
    module: './ingest.js',
  },
  {
    id: 'adopt',
    category: 'adoption',
    usage: 'adopt [--apply]',
    description: 'Analisa um projeto existente e gera um plano de adoção.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/reports/adoption-plan.md', '.agentforge/state.json'],
    examples: ['adopt', 'adopt --apply'],
    status: 'stable',
    module: './adopt.js',
  },
  {
    id: 'analyze',
    category: 'inspection',
    usage: 'analyze [--write-context]',
    description: 'Analisa o projeto antes de criar ou modificar agentes, skills, flows, policies e contexto e pode escrever contexto central.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/suggestions/**', '.agentforge/reports/project-analysis.md', '.agentforge/reports/analysis-plan.md', '.agentforge/context/**', '.agentforge/README.md', '.agentforge/state.json'],
    examples: ['analyze', 'analyze --write-context'],
    status: 'stable',
    module: './analyze.js',
  },
  {
    id: 'research-patterns',
    category: 'research',
    usage: 'research-patterns [--online]',
    description: 'Sugere padrões locais a partir da stack, estrutura e contexto agentic existente.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/suggestions/patterns/**', '.agentforge/reports/pattern-research.md'],
    examples: ['research-patterns', 'research-patterns --online'],
    status: 'stable',
    module: './research-patterns.js',
  },
  {
    id: 'suggest-agents',
    category: 'agents',
    usage: 'suggest-agents',
    description: 'Sugere agentes adequados ao projeto com base na análise local e nos padrões observados.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/suggestions/agents/**', '.agentforge/reports/agent-suggestions.md', '.agentforge/state.json'],
    examples: ['suggest-agents'],
    status: 'stable',
    module: './suggest-agents.js',
  },
  {
    id: 'create-agent',
    category: 'agents',
    usage: 'create-agent <agent-id> [--force]',
    description: 'Cria um agente real a partir de uma sugestão existente em `.agentforge/suggestions/agents/`.',
    aliases: [],
    safeByDefault: false,
    writes: ['.agentforge/agents/<agent-id>.yaml|.md', '.agentforge/reports/agent-created.md', '.agentforge/state.json'],
    examples: ['create-agent automation-planner', 'create-agent automation-planner --force'],
    status: 'stable',
    module: './create-agent.js',
  },
  {
    id: 'apply-suggestions',
    category: 'meta',
    usage: 'apply-suggestions [--agents] [--skills] [--flows] [--all] [--dry-run] [--force]',
    description: 'Aplica sugestões de agentes, skills, flows e policies de forma controlada.',
    aliases: [],
    safeByDefault: false,
    writes: ['.agentforge/agents/**', '.agentforge/skills/**', '.agentforge/flows/**', '.agentforge/policies/**', '.agentforge/reports/apply-suggestions.md', '.agentforge/state.json', '.agentforge/harness/context-index.yaml'],
    examples: ['apply-suggestions', 'apply-suggestions --dry-run', 'apply-suggestions --all', 'apply-suggestions --agents --skills'],
    status: 'stable',
    module: './apply-suggestions.js',
  },
  {
    id: 'audit-context',
    category: 'inspection',
    usage: 'audit-context',
    description: 'Diagnostica a organização do contexto com heurísticas determinísticas.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/reports/context-audit.md', '.agentforge/state.json'],
    examples: ['audit-context'],
    status: 'stable',
    module: './audit-context.js',
  },
  {
    id: 'refactor-context',
    category: 'context',
    usage: 'refactor-context [--apply] [--force]',
    description: 'Separa o conteúdo importado em arquivos canônicos.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/reports/refactor-plan.md', '.agentforge/context/**'],
    examples: ['refactor-context', 'refactor-context --apply', 'refactor-context --apply --force'],
    status: 'stable',
    module: './refactor-context.js',
  },
  {
    id: 'suggest-skills',
    category: 'skills',
    usage: 'suggest-skills [--force]',
    description: 'Sugere skills de projeto a partir da estrutura e do contexto.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/skill-suggestions/**', '.agentforge/reports/skill-suggestions.md', '.agentforge/state.json'],
    examples: ['suggest-skills', 'suggest-skills --force'],
    status: 'stable',
    module: './suggest-skills.js',
  },
  {
    id: 'create-skill',
    category: 'skills',
    usage: 'create-skill <skill-id> [--force]',
    description: 'Cria uma skill real a partir de uma sugestão existente.',
    aliases: [],
    safeByDefault: false,
    writes: ['.agentforge/skills/<skill-id>/SKILL.md', '.agentforge/context/context-index.yaml', '.agentforge/state.json'],
    examples: ['create-skill run-tests', 'create-skill run-tests --force'],
    status: 'stable',
    module: './create-skill.js',
  },
  {
    id: 'add-agent',
    category: 'agents',
    usage: 'add-agent',
    description: 'Cria um agente customizado do projeto.',
    aliases: [],
    safeByDefault: false,
    writes: ['.agentforge/agents/<agent-id>.yaml', '.agentforge/state.json'],
    examples: ['add-agent'],
    status: 'stable',
    module: './add-agent.js',
  },
  {
    id: 'add-flow',
    category: 'flows',
    usage: 'add-flow',
    description: 'Cria um fluxo operacional customizado.',
    aliases: [],
    safeByDefault: false,
    writes: ['.agentforge/flows/<flow-id>.yaml', '.agentforge/state.json'],
    examples: ['add-flow'],
    status: 'stable',
    module: './add-flow.js',
  },
  {
    id: 'add-engine',
    category: 'engines',
    usage: 'add-engine',
    description: 'Adiciona suporte a uma engine.',
    aliases: [],
    safeByDefault: false,
    writes: ['project entrypoints', '.agentforge/state.json'],
    examples: ['add-engine'],
    status: 'stable',
    module: './add-engine.js',
  },
  {
    id: 'compile',
    category: 'publishing',
    usage: 'compile [--force] [--takeover-entrypoints] [--include-existing-entrypoints]',
    description: 'Atualiza os bootloaders reais do projeto e os entrypoints das engines.',
    aliases: [],
    safeByDefault: false,
    writes: ['project entrypoints', '.agentforge/reports/compile.md'],
    examples: ['compile', 'compile --takeover-entrypoints', 'compile --force'],
    status: 'stable',
    module: './compile.js',
  },
  {
    id: 'export',
    category: 'publishing',
    usage: 'export [--package]',
    description: 'Alias de compile.',
    aliases: ['compile'],
    safeByDefault: false,
    writes: ['project entrypoints', '_agentforge/** when --package is used'],
    examples: ['export', 'export --package'],
    status: 'stable',
    module: './export.js',
  },
  {
    id: 'export-package',
    category: 'publishing',
    usage: 'export-package [--force]',
    description: 'Gera o pacote isolado em _agentforge/ sem alterar os entrypoints reais.',
    aliases: [],
    safeByDefault: false,
    writes: ['_agentforge/**', '.agentforge/reports/export-package.md'],
    examples: ['export-package', 'export-package --force'],
    status: 'stable',
    module: './export-package.js',
  },
  {
    id: 'export-diagrams',
    category: 'publishing',
    usage: 'export-diagrams [--format=svg|png] [--output=<pasta>]',
    description: 'Exporta diagramas Mermaid como imagens SVG ou PNG.',
    aliases: [],
    safeByDefault: false,
    writes: ['custom output directory'],
    examples: ['export-diagrams', 'export-diagrams --format=png', 'export-diagrams --output=docs/diagrams'],
    status: 'experimental',
    module: './export-diagrams.js',
  },
  {
    id: 'status',
    category: 'inspection',
    usage: 'status [--json] [--repair]',
    description: 'Mostra o estado atual do AgentForge e a consistência com o plano.',
    aliases: [],
    safeByDefault: true,
    writes: [],
    examples: ['status', 'status --json', 'status --repair'],
    status: 'stable',
    module: './status.js',
  },
  {
    id: 'next',
    category: 'inspection',
    usage: 'next',
    description: 'Mostra a fase atual, a próxima fase e os checks pendentes calculados pelo workflow estruturado.',
    aliases: [],
    safeByDefault: true,
    writes: [],
    examples: ['next'],
    status: 'stable',
    module: './next.js',
  },
  {
    id: 'phases',
    category: 'inspection',
    usage: 'phases',
    description: 'Lista o workflow estruturado de fases do projeto.',
    aliases: [],
    safeByDefault: true,
    writes: [],
    examples: ['phases'],
    status: 'stable',
    module: './phases.js',
  },
  {
    id: 'phase-status',
    category: 'inspection',
    usage: 'phase-status',
    description: 'Mostra a tabela de status das fases e seus checks.',
    aliases: [],
    safeByDefault: true,
    writes: [],
    examples: ['phase-status'],
    status: 'stable',
    module: './phase-status.js',
  },
  {
    id: 'advance',
    category: 'inspection',
    usage: 'advance [--phase <phase-id>] [--all]',
    description: 'Avança a Phase Engine de forma transacional e valida cada transição.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/state.json', '.agentforge/plan.md', '.agentforge/workflow/history.jsonl', '.agentforge/context/**', '.agentforge/agents/**', '.agentforge/flows/**', '.agentforge/policies/**', '.agentforge/reports/**', 'project entrypoints'],
    examples: ['advance', 'advance --phase export', 'advance --all'],
    status: 'stable',
    module: './advance.js',
  },
  {
    id: 'validate',
    category: 'inspection',
    usage: 'validate',
    description: 'Valida a estrutura canônica em `.agentforge/`.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/reports/validation.md'],
    examples: ['validate'],
    status: 'stable',
    module: './validate.js',
  },
  {
    id: 'improve',
    category: 'inspection',
    usage: 'improve [--apply]',
    description: 'Analisa a estrutura e sugere melhorias.',
    aliases: [],
    safeByDefault: true,
    writes: ['.agentforge/reports/improvement-plan.md', 'readme files when --apply is used'],
    examples: ['improve', 'improve --apply'],
    status: 'stable',
    module: './improve.js',
  },
  {
    id: 'update',
    category: 'maintenance',
    usage: 'update',
    description: 'Atualiza os agentes para a última versão.',
    aliases: [],
    safeByDefault: false,
    writes: ['managed AgentForge files', 'project entrypoints'],
    examples: ['update'],
    status: 'stable',
    module: './update.js',
  },
  {
    id: 'uninstall',
    category: 'maintenance',
    usage: 'uninstall',
    description: 'Remove o AgentForge do projeto.',
    aliases: [],
    safeByDefault: false,
    writes: ['deletes managed AgentForge files', 'optionally deletes output folder'],
    examples: ['uninstall'],
    status: 'stable',
    module: './uninstall.js',
  },
  {
    id: 'commands',
    category: 'meta',
    usage: 'commands [--json] [--category <name>] [--stable] [--experimental]',
    description: 'Lista os comandos disponíveis com metadados completos.',
    aliases: [],
    safeByDefault: true,
    writes: [],
    examples: ['commands', 'commands --json', 'commands --category skills'],
    status: 'stable',
    module: './commands.js',
  },
]);

export const COMMAND_STATUS_VALUES = Object.freeze(['stable', 'experimental', 'planned']);

export const COMMAND_CATEGORIES = Object.freeze([
  'setup',
  'adoption',
  'inspection',
  'research',
  'context',
  'skills',
  'agents',
  'flows',
  'engines',
  'publishing',
  'maintenance',
  'meta',
]);

const COMMAND_INDEX = new Map();
for (const entry of COMMAND_REGISTRY) {
  COMMAND_INDEX.set(entry.id, entry);
  for (const alias of entry.aliases ?? []) {
    if (!COMMAND_INDEX.has(alias)) {
      COMMAND_INDEX.set(alias, entry);
    }
  }
}

function matchesStatus(entry, { stable = false, experimental = false } = {}) {
  if (!stable && !experimental) return true;
  const allowed = new Set();
  if (stable) allowed.add('stable');
  if (experimental) allowed.add('experimental');
  return allowed.has(entry.status);
}

export function getCommandEntry(commandId) {
  if (typeof commandId !== 'string') return null;
  return COMMAND_INDEX.get(commandId) ?? null;
}

export function listCommands({ category = null, stable = false, experimental = false } = {}) {
  const normalizedCategory = typeof category === 'string' && category.trim()
    ? category.trim().toLowerCase()
    : null;

  return COMMAND_REGISTRY.filter((entry) => {
    if (normalizedCategory && entry.category.toLowerCase() !== normalizedCategory) return false;
    return matchesStatus(entry, { stable, experimental });
  });
}

export function groupCommands(commands) {
  const buckets = new Map();
  for (const entry of commands) {
    const items = buckets.get(entry.category) ?? [];
    items.push(entry);
    buckets.set(entry.category, items);
  }
  return [...buckets.entries()].map(([category, items]) => ({
    category,
    commands: items,
  }));
}

function formatList(values = [], fallback = '—') {
  return values.length > 0 ? values.join(', ') : fallback;
}

function formatUsage(binaryName, usage) {
  return `npx ${binaryName} ${usage}`.replace(/\s+/g, ' ').trim();
}

function formatWrites(values = []) {
  return formatList(values, 'read-only');
}

function renderCompactCommandLine(entry) {
  return `  ${entry.id.padEnd(18)} ${entry.description}`;
}

function renderDetailedCommand(binaryName, entry) {
  const lines = [];
  lines.push(`  ${entry.id}`);
  lines.push(`    Categoria: ${entry.category}`);
  lines.push(`    Uso: ${formatUsage(binaryName, entry.usage)}`);
  lines.push(`    Descrição: ${entry.description}`);
  lines.push(`    Aliases: ${formatList(entry.aliases)}`);
  lines.push(`    Escreve: ${formatWrites(entry.writes)}`);
  lines.push(`    Seguro por padrão: ${entry.safeByDefault ? 'sim' : 'não'}`);
  lines.push(`    Status: ${entry.status}`);
  if (entry.examples?.length > 0) {
    lines.push(`    Exemplos:`);
    for (const example of entry.examples) {
      lines.push(`      - ${formatUsage(binaryName, example)}`);
    }
  }
  return lines.join('\n');
}

export function renderMainHelp(binaryName = PRODUCT.command, version = '') {
  const lines = [
    '',
    `  ${PRODUCT.name}`,
    '  Create, organize, evolve, and compile the agent-ready layer of your project.',
    '',
    `  AgentForge v${version}`.trimEnd(),
    '',
    `  Uso: npx ${binaryName} <comando>`,
    '',
    '  Comandos:',
  ];

  for (const entry of COMMAND_REGISTRY) {
    lines.push(renderCompactCommandLine(entry));
  }

  lines.push('');
  lines.push(`  Use "npx ${binaryName} commands" para ver metadados completos e filtros.`);
  lines.push('');
  lines.push('  Documentação: https://github.com/bcocheto/agentforge');
  lines.push('');
  return lines.join('\n');
}

export function renderCommandsListing(binaryName, commands, { detailed = true } = {}) {
  const grouped = groupCommands(commands);
  const lines = [
    '',
    `  ${PRODUCT.name}: Commands`,
    `  Uso: npx ${binaryName} commands [--json] [--category <name>] [--stable] [--experimental]`,
    '',
  ];

  if (grouped.length === 0) {
    lines.push('  Nenhum comando encontrado com os filtros informados.');
    lines.push('');
    return lines.join('\n');
  }

  for (const group of grouped) {
    lines.push(`  ${group.category}`);
    for (const entry of group.commands) {
      lines.push(detailed ? renderDetailedCommand(binaryName, entry) : renderCompactCommandLine(entry));
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function buildCommandsJsonPayload(commands, filters = {}) {
  return {
    filters,
    commands: commands.map((entry) => ({
      id: entry.id,
      category: entry.category,
      usage: entry.usage,
      description: entry.description,
      aliases: [...(entry.aliases ?? [])],
      safeByDefault: entry.safeByDefault,
      writes: [...(entry.writes ?? [])],
      examples: [...(entry.examples ?? [])],
      status: entry.status,
    })),
  };
}

export function renderCommandsReferenceDocument({
  binaryName = PRODUCT.command,
} = {}) {
  const lines = [
    '# Commands',
    '',
    'Este arquivo é gerado a partir de `COMMAND_REGISTRY`.',
    'Não mantenha uma lista manual divergente.',
    '',
    '## Exemplos',
    '',
    `- \`npx @bcocheto/${binaryName} commands\``,
    `- \`npx @bcocheto/${binaryName} validate\``,
    `- \`npx @bcocheto/${binaryName} compile\``,
    `- \`npx @bcocheto/${binaryName} analyze\``,
    '',
    '## Registry atual',
    '',
    '| Command | Category | Usage | Status | Description |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const entry of COMMAND_REGISTRY) {
    lines.push(
      `| \`${entry.id}\` | ${entry.category} | \`${entry.usage}\` | ${entry.status} | ${entry.description} |`,
    );
  }

  lines.push('');
  lines.push('## Nota');
  lines.push('');
  lines.push('- `commands` lista o registry em tempo de execução.');
  lines.push('- Se o binário local não existir, use `npx @bcocheto/agentforge <command>` como fallback.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}
