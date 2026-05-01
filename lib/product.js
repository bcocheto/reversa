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
const AGENT_SKILL_ALIASES = Object.freeze([
  [PRODUCT.skillsPrefix, LEGACY_PRODUCT.skillsPrefix],
  [`${PRODUCT.skillsPrefix}-scout`, 'reversa-scout'],
  [`${PRODUCT.skillsPrefix}-archaeologist`, 'reversa-archaeologist'],
  [`${PRODUCT.skillsPrefix}-detective`, 'reversa-detective'],
  [`${PRODUCT.skillsPrefix}-architect`, 'reversa-architect'],
  [`${PRODUCT.skillsPrefix}-writer`, 'reversa-writer'],
  [`${PRODUCT.skillsPrefix}-reviewer`, 'reversa-reviewer'],
  [`${PRODUCT.skillsPrefix}-visor`, 'reversa-visor'],
  [`${PRODUCT.skillsPrefix}-data-master`, 'reversa-data-master'],
  [`${PRODUCT.skillsPrefix}-design-system`, 'reversa-design-system'],
  [`${PRODUCT.skillsPrefix}-agents-help`, 'reversa-agents-help'],
  [`${PRODUCT.skillsPrefix}-reconstructor`, 'reversa-reconstructor'],
]);
const LEGACY_AGENT_SKILL_ALIASES = Object.freeze(
  Object.fromEntries(AGENT_SKILL_ALIASES.map(([current, legacy]) => [legacy, current]))
);

export const AGENT_SKILL_IDS = Object.freeze(AGENT_SKILL_ALIASES.map(([current]) => current));

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
  return AGENT_SKILL_ALIASES.find(([current]) => current === agentId)?.[1] ?? agentId;
}

export function normalizeAgentId(agentId) {
  return LEGACY_AGENT_SKILL_ALIASES[agentId] ?? agentId;
}

export function normalizeAgentIds(agentIds = []) {
  return agentIds.map(normalizeAgentId);
}
