import { existsSync } from 'fs';
import { join } from 'path';

export const PRODUCT = Object.freeze({
  id: 'agentforge',
  name: 'AgentForge',
  command: 'agentforge',
  activationCommand: 'agentforge',
  slashCommand: '/agentforge',
  internalDir: '.agentforge',
  outputDir: '_agentforge',
  skillsPrefix: 'agentforge',
  packageName: 'agentforge',
});

export const SETUP_MODES = Object.freeze(['bootstrap', 'adopt', 'hybrid']);

export function normalizeSetupMode(value) {
  return SETUP_MODES.includes(value) ? value : 'bootstrap';
}

export const LEGACY_PRODUCT = Object.freeze({
  id: 'reversa',
  name: 'Reversa',
  command: 'reversa',
  activationCommand: 'reversa',
  slashCommand: '/reversa',
  internalDir: '.reversa',
  outputDir: '_reversa_sdd',
  skillsPrefix: 'reversa',
  packageName: 'reversa',
});

const INTERNAL_DIRS = [PRODUCT.internalDir, LEGACY_PRODUCT.internalDir];
const OUTPUT_DIRS = [PRODUCT.outputDir, LEGACY_PRODUCT.outputDir];
export const AGENT_SKILL_IDS = Object.freeze([
  PRODUCT.skillsPrefix,
  `${PRODUCT.skillsPrefix}-scope-scout`,
  `${PRODUCT.skillsPrefix}-agent-architect`,
  `${PRODUCT.skillsPrefix}-flow-designer`,
  `${PRODUCT.skillsPrefix}-policy-guard`,
  `${PRODUCT.skillsPrefix}-exporter`,
  `${PRODUCT.skillsPrefix}-reviewer`,
]);

/**
 * Keeps legacy Reversa installations readable while the product migrates.
 * TODO: remove the legacy fallback once all projects have been upgraded.
 */
export function resolveInternalDir(projectRoot) {
  for (const internalDir of INTERNAL_DIRS) {
    if (existsSync(join(projectRoot, internalDir, 'state.json'))) return internalDir;
  }

  for (const internalDir of INTERNAL_DIRS) {
    if (existsSync(join(projectRoot, internalDir))) return internalDir;
  }

  return PRODUCT.internalDir;
}

export function resolveOutputDir(projectRoot, preferredOutputDir) {
  if (preferredOutputDir) return preferredOutputDir;

  for (const outputDir of OUTPUT_DIRS) {
    if (existsSync(join(projectRoot, outputDir))) return outputDir;
  }

  return PRODUCT.outputDir;
}

export function getStatePath(projectRoot) {
  return join(projectRoot, resolveInternalDir(projectRoot), 'state.json');
}

export function getConfigDir(projectRoot) {
  return join(projectRoot, resolveInternalDir(projectRoot), '_config');
}

export function getManifestPath(projectRoot) {
  return join(getConfigDir(projectRoot), 'files-manifest.json');
}

export function resolveAgentSourceId(agentId) {
  return agentId;
}

export function normalizeAgentId(agentId) {
  return agentId;
}

export function normalizeAgentIds(agentIds = []) {
  return [...agentIds];
}
