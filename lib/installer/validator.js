import { existsSync, readFileSync } from 'fs';
import { getStatePath, resolveInternalDir, normalizeAgentIds } from '../product.js';

export function checkExistingInstallation(projectRoot) {
  const internalDir = resolveInternalDir(projectRoot);
  const statePath = getStatePath(projectRoot);

  if (!existsSync(statePath)) {
    return { installed: false };
  }

  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    return {
      installed: true,
      version: state.version ?? '?',
      state: {
        ...state,
        agents: normalizeAgentIds(state.agents ?? []),
      },
      internalDir,
      statePath,
    };
  } catch {
    return { installed: false };
  }
}

export function checkFileConflict(filePath) {
  return existsSync(filePath);
}
