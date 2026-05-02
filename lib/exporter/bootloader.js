const BLOCK_START = '<!-- agentforge:start -->';
const BLOCK_END = '<!-- agentforge:end -->';
export const ENTRYPOINT_MAX_LINES = 150;

function normalizeLines(lines = []) {
  return lines
    .map((line) => (line === null || line === undefined ? '' : String(line)))
    .filter((line) => line.trim().length > 0);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function countDocumentLines(content) {
  const text = String(content ?? '').trimEnd();
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

export function buildManagedBootloaderLines({
  activationText,
  activationHint = null,
} = {}) {
  const managedLines = [
    activationText,
    'Não use web search por padrão.',
    'Só pesquise fora do repositório se o usuário pedir explicitamente ou se a tarefa exigir informação externa ou atual.',
    'Primeiro leia `.agentforge/harness/router.md`, `.agentforge/harness/context-index.yaml`, `.agentforge/state.json` e `.agentforge/scope.md`.',
    'Use `.agentforge/plan.md` para reconciliar a fase atual com o trabalho pendente.',
    'Para comandos AgentForge, tente nesta ordem: `agentforge <command>`, `npx @bcocheto/agentforge <command>`, depois `.agentforge/references/commands.md` apenas como fallback documental.',
    'Se o comando exigir escrita, proponha um plano antes de alterar vários arquivos.',
    'Se a confirmação for vaga, como "sim" ou "continue", peça confirmação explícita do plano antes de editar amplamente.',
    'Não avance fases do AgentForge apenas porque o usuário disse "sim"; trate isso como confirmação do último plano explícito.',
    'Use `.agentforge/policies/`, `.agentforge/skills/`, `.agentforge/flows/` e `.agentforge/references/` conforme necessário.',
    'Considere `.agentforge/memory/` quando relevante.',
  ];

  if (activationHint) {
    managedLines.push(activationHint);
  }

  return managedLines;
}

function buildManagedEntrypointIntro() {
  return [
    'Este arquivo é um bootloader pequeno e humano.',
    'A fonte de verdade vive em `.agentforge/`.',
    'O conteúdo manual fora do bloco é preservado.',
  ];
}

function resolveActivationText(engine = {}) {
  const entryFile = normalizeString(engine.entryFile);
  const activationText = normalizeString(engine.activationText);

  if (activationText) return activationText;

  if (entryFile === 'CLAUDE.md') {
    return 'Quando o usuário digitar `agentforge` ou usar `/agentforge`, ative o orquestrador AgentForge.';
  }

  if (entryFile === '.github/copilot-instructions.md') {
    return 'Quando a sessão precisar de AgentForge, siga estas instruções e respeite `/agentforge` quando aplicável.';
  }

  if (entryFile === '.cursor/rules/agentforge.md') {
    return 'Quando o usuário usar `agentforge` ou `/agentforge`, siga estas regras.';
  }

  return 'Quando o usuário digitar `agentforge`, ative o orquestrador AgentForge.';
}

export function renderBootloaderBlock(lines = []) {
  const body = normalizeLines(lines);
  return [
    BLOCK_START,
    ...body,
    BLOCK_END,
  ].join('\n');
}

export function renderBootloaderDocument({
  prefaceLines = [],
  title = 'AgentForge',
  introLines = [],
  blockLines = [],
  outroLines = [],
} = {}) {
  const lines = [];
  const preface = normalizeLines(prefaceLines);
  const intro = normalizeLines(introLines);
  const outro = normalizeLines(outroLines);

  if (preface.length > 0) {
    lines.push(...preface, '');
  }

  lines.push(`# ${title}`);
  lines.push('');

  if (intro.length > 0) {
    lines.push(...intro, '');
  }

  lines.push(renderBootloaderBlock(blockLines));

  if (outro.length > 0) {
    lines.push('', ...outro);
  }

  return `${lines.join('\n')}\n`;
}

export function renderManagedEntrypoint(engine = {}, projectState = {}) {
  const entryFile = normalizeString(engine.entryFile);
  const activationText = resolveActivationText(engine, projectState);
  const activationHint = normalizeString(engine.activationHint);
  const introLines = normalizeLines(engine.introLines?.length > 0 ? engine.introLines : buildManagedEntrypointIntro());
  const frontmatterLines = normalizeLines(engine.frontmatterLines);
  const content = renderBootloaderDocument({
    prefaceLines: frontmatterLines,
    title: normalizeString(engine.title) || 'AgentForge',
    introLines,
    blockLines: buildManagedBootloaderLines({ activationText, activationHint }),
    outroLines: normalizeLines(engine.outroLines),
  });

  if (countDocumentLines(content) > ENTRYPOINT_MAX_LINES) {
    const label = entryFile ? ` (${entryFile})` : '';
    throw new Error(`Entrypoint gerenciado excede o limite de ${ENTRYPOINT_MAX_LINES} linhas${label}.`);
  }

  return content;
}

export function renderManagedBootloaderDocument(engine = {}, projectState = {}) {
  return renderManagedEntrypoint(engine, projectState);
}

export function hasBootloaderBlock(content) {
  if (typeof content !== 'string') return false;
  const start = content.indexOf(BLOCK_START);
  const end = content.indexOf(BLOCK_END);
  return start !== -1 && end !== -1 && start < end;
}

export function replaceBootloaderBlock(content, blockLines = []) {
  if (!hasBootloaderBlock(content)) return null;

  return content.replace(
    /<!-- agentforge:start -->[\s\S]*?<!-- agentforge:end -->/,
    renderBootloaderBlock(blockLines),
  );
}

export function appendBootloaderDocument(content, bootloaderDocument) {
  const existing = typeof content === 'string' ? content.trimEnd() : '';
  const addition = String(bootloaderDocument ?? '').trim();
  if (!existing) return `${addition}\n`;
  return `${existing}\n\n${addition}\n`;
}

export const AGENTFORGE_BOOTLOADER_START = BLOCK_START;
export const AGENTFORGE_BOOTLOADER_END = BLOCK_END;
