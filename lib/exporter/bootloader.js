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
      ? 'O workflow AgentForge já está concluído; trate a próxima solicitação como tarefa real do projeto, não como nova rodada de adoção.'
      : 'A IA ativa deve decidir o próximo passo com julgamento contextual antes de editar arquivos reais.',
    'A pasta `.agentforge/` não é a tarefa; ela é o harness para decidir como trabalhar no projeto.',
    'Leia `.agentforge/harness/router.md`, `.agentforge/harness/context-index.yaml` e `.agentforge/harness/context-map.yaml`.',
    'Selecione o task mode mais provável para a solicitação do usuário.',
    'Gere ou leia `agentforge context-pack <mode> --write` e use o pacote para orientar a ação.',
    'Aplique o flow, skill e policy relevantes ao contexto detectado.',
    'Só então leia e edite os arquivos reais do projeto conforme o objetivo do usuário.',
    'Não assuma Codex como o único runtime; use a IA ativa configurada no ambiente.',
    'Se a tarefa for de contexto, documentação, refatoração de instruções, glossário, localização ou segregação de conhecimento, acione o agente `context-curator`.',
    'Use `agentforge handoff` para obter o plano da próxima fase quando o workflow ainda estiver em andamento.',
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
