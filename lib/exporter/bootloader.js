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

function normalizePhaseList(values = []) {
  return Array.isArray(values)
    ? values.filter((entry) => typeof entry === 'string' && entry.trim())
    : [];
}

export function countDocumentLines(content) {
  const text = String(content ?? '').trimEnd();
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

export function buildManagedBootloaderLines({
  activationText,
  activationHint = null,
  projectState = null,
} = {}) {
  const workflow = projectState?.workflow ?? {};
  const completed = normalizePhaseList(workflow.completed_phases);
  const pending = normalizePhaseList(workflow.pending_phases);
  const workflowComplete = pending.length === 0 && completed.includes('review') && completed.includes('export');

  const managedLines = [
      activationText,
    workflowComplete
      ? 'O workflow AgentForge está preparado; trate a próxima solicitação como uma tarefa real do projeto.'
      : 'A IA ativa deve conduzir discovery, agent-design, flow-design, policies, export e review com julgamento contextual.',
    'Não assuma Codex como o único runtime; use a IA ativa configurada no ambiente.',
    'Leia `.agentforge/harness/router.md` e `.agentforge/harness/context-index.yaml`.',
    'Leia `.agentforge/harness/context-map.yaml` para localizar itens por arquivo e linha.',
    'Leia `.agentforge/ai/README.md` se esse arquivo existir.',
    'Use `agentforge handoff` para obter o plano da próxima fase.',
    'Para tarefas de contexto, documentação, refatoração de instruções, glossário, segregação de conhecimento ou localização de informação, acione o agente `context-curator`.',
    'Quando o trabalho for organizar, visualizar, mapear, localizar ou segregar contexto, use o task mode `context-curation` e o agente `context-curator`.',
    'Use `agentforge context-pack <phase-or-task>` quando esse comando estiver disponível.',
    'Execute a fase com leitura contextual, síntese e adaptação ao projeto.',
    'Ao concluir, rode `agentforge checkpoint <phase> --status done` e depois `agentforge validate`.',
    'Nunca edite `state.json` ou `plan.md` manualmente.',
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
    blockLines: buildManagedBootloaderLines({ activationText, activationHint, projectState }),
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
