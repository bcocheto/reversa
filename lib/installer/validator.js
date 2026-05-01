import { existsSync, readFileSync } from 'fs';
import { getStatePath, resolveInternalDir, normalizeSetupMode } from '../product.js';

export function checkExistingInstallation(projectRoot) {
  const internalDir = resolveInternalDir(projectRoot);
  const statePath = getStatePath(projectRoot);

  if (!existsSync(statePath)) {
    return { installed: false };
  }

  try {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const internalAgents = state.internal_agents ?? state.agents ?? [];
    const {
      agents: _legacyAgents,
      answer_mode: _legacyAnswerMode,
      doc_level: _legacyDocLevel,
      ...rest
    } = state;
    return {
      installed: true,
      version: state.version ?? '?',
      state: {
        ...rest,
        setup_mode: normalizeSetupMode(state.setup_mode),
        internal_agents: internalAgents,
        generated_agents: state.generated_agents ?? [],
        generated_subagents: state.generated_subagents ?? [],
        flows: state.flows ?? [],
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
