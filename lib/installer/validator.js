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
    const internalAgents = normalizeAgentIds(state.internal_agents ?? state.agents ?? []);
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
