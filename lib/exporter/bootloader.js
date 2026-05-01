const BLOCK_START = '<!-- agentforge:start -->';
const BLOCK_END = '<!-- agentforge:end -->';

function normalizeLines(lines = []) {
  return lines
    .map((line) => (line === null || line === undefined ? '' : String(line)))
    .filter((line) => line.trim().length > 0);
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
