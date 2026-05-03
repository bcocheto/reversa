import { ENGINES } from '../installer/detector.js';

const ENGINE_IDS = new Set(ENGINES.map((engine) => engine.id));
const KEBAB_CASE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value.filter((item) => item !== null && item !== undefined);
  return [];
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function toPosixPath(value) {
  return String(value ?? '').trim().replace(/\\/g, '/');
}

function isSafeRelativePath(value) {
  const path = toPosixPath(value);
  if (!path || path.startsWith('/') || /^[a-zA-Z]:\//.test(path)) return false;
  if (path.includes('..')) return false;
  if (path.split('/').some((segment) => segment === '.' || segment === '..' || segment === '')) return false;
  return true;
}

function isKebabCase(value) {
  return KEBAB_CASE_PATTERN.test(normalizeString(value));
}

function normalizeEvidenceItem(item) {
  if (!isPlainObject(item)) return null;
  const path = toPosixPath(item.path ?? item.file);
  const kind = normalizeString(item.kind);
  const reason = normalizeString(item.reason);
  const snippet = normalizeString(item.snippet);

  return {
    path,
    kind,
    reason,
    snippet,
    ...(Number.isInteger(item.line) ? { line: item.line } : {}),
  };
}

function normalizeEvidenceList(value) {
  return normalizeArray(value).map(normalizeEvidenceItem).filter(Boolean);
}

function normalizeSectionList(value) {
  return normalizeArray(value).map((section) => {
    if (typeof section === 'string') {
      return { heading: section.trim(), bullets: [] };
    }
    if (!isPlainObject(section)) return null;
    return {
      heading: normalizeString(section.heading),
      bullets: normalizeArray(section.bullets).map((bullet) => normalizeString(bullet)).filter(Boolean),
    };
  }).filter(Boolean);
}

function normalizeBlueprintRoot(doc) {
  if (!isPlainObject(doc)) return {};
  if (isPlainObject(doc.blueprint)) return doc.blueprint;
  return doc;
}

function normalizeProject(project) {
  if (!isPlainObject(project)) return {
    name: '',
    type: '',
    objective: '',
    source_evidence: [],
  };
  return {
    name: normalizeString(project.name),
    type: normalizeString(project.type),
    objective: normalizeString(project.objective),
    package_manager: normalizeString(project.package_manager),
    source_evidence: normalizeEvidenceList(project.source_evidence),
  };
}

function normalizeAgent(agent) {
  if (!isPlainObject(agent)) return null;
  return {
    id: normalizeString(agent.id),
    name: normalizeString(agent.name),
    purpose: normalizeString(agent.purpose),
    responsibilities: normalizeArray(agent.responsibilities).map((entry) => normalizeString(entry)).filter(Boolean),
    triggers: normalizeArray(agent.triggers).map((entry) => normalizeString(entry)).filter(Boolean),
    skills: normalizeArray(agent.skills).map((entry) => normalizeString(entry)).filter(Boolean),
    context: normalizeArray(agent.context).map((entry) => toPosixPath(entry)).filter(Boolean),
    safety_limits: normalizeArray(agent.safety_limits).map((entry) => normalizeString(entry)).filter(Boolean),
    source_evidence: normalizeEvidenceList(agent.source_evidence),
  };
}

function normalizeSkill(skill) {
  if (!isPlainObject(skill)) return null;
  return {
    id: normalizeString(skill.id),
    name: normalizeString(skill.name),
    description: normalizeString(skill.description),
    owner_agents: normalizeArray(skill.owner_agents).map((entry) => normalizeString(entry)).filter(Boolean),
    steps: normalizeArray(skill.steps).map((entry) => normalizeString(entry)).filter(Boolean),
    source_evidence: normalizeEvidenceList(skill.source_evidence),
  };
}

function normalizeContextDocument(doc) {
  if (!isPlainObject(doc)) return null;
  return {
    path: toPosixPath(doc.path),
    title: normalizeString(doc.title),
    purpose: normalizeString(doc.purpose),
    owner_agent: normalizeString(doc.owner_agent),
    sections: normalizeSectionList(doc.sections),
    source_evidence: normalizeEvidenceList(doc.source_evidence),
  };
}

function normalizeFlow(flow) {
  if (!isPlainObject(flow)) return null;
  return {
    id: normalizeString(flow.id),
    name: normalizeString(flow.name),
    purpose: normalizeString(flow.purpose),
    owner_agents: normalizeArray(flow.owner_agents).map((entry) => normalizeString(entry)).filter(Boolean),
    steps: normalizeArray(flow.steps).map((entry) => normalizeString(entry)).filter(Boolean),
    source_evidence: normalizeEvidenceList(flow.source_evidence),
  };
}

function normalizePolicy(policy) {
  if (!isPlainObject(policy)) return null;
  return {
    id: normalizeString(policy.id),
    name: normalizeString(policy.name),
    scope: normalizeString(policy.scope),
    rule: normalizeString(policy.rule),
    owner_agents: normalizeArray(policy.owner_agents).map((entry) => normalizeString(entry)).filter(Boolean),
    source_evidence: normalizeEvidenceList(policy.source_evidence),
  };
}

function normalizeRouting(routing) {
  if (!isPlainObject(routing)) return {
    default_agent: '',
    rules: [],
    source_evidence: [],
  };
  return {
    default_agent: normalizeString(routing.default_agent),
    rules: normalizeArray(routing.rules).map((rule) => {
      if (!isPlainObject(rule)) return null;
      return {
        trigger: normalizeString(rule.trigger),
        agent: normalizeString(rule.agent),
        reason: normalizeString(rule.reason),
        source_evidence: normalizeEvidenceList(rule.source_evidence),
      };
    }).filter(Boolean),
    source_evidence: normalizeEvidenceList(routing.source_evidence),
  };
}

function normalizeEntrypoint(entrypoint) {
  if (!isPlainObject(entrypoint)) return null;
  return {
    path: toPosixPath(entrypoint.path),
    engine: normalizeString(entrypoint.engine),
    purpose: normalizeString(entrypoint.purpose),
    owner_agent: normalizeString(entrypoint.owner_agent),
    source_evidence: normalizeEvidenceList(entrypoint.source_evidence),
  };
}

function normalizeExport(exportItem) {
  if (!isPlainObject(exportItem)) return null;
  return {
    path: toPosixPath(exportItem.path),
    source: toPosixPath(exportItem.source),
    engine: normalizeString(exportItem.engine),
    owner_agent: normalizeString(exportItem.owner_agent),
    source_evidence: normalizeEvidenceList(exportItem.source_evidence),
  };
}

function normalizeMigrationPlan(plan) {
  if (!isPlainObject(plan)) return {
    mode: '',
    steps: [],
    source_evidence: [],
  };
  return {
    mode: normalizeString(plan.mode),
    steps: normalizeArray(plan.steps).map((step) => {
      if (typeof step === 'string') {
        return { title: normalizeString(step), details: '', source_evidence: [] };
      }
      if (!isPlainObject(step)) return null;
      return {
        title: normalizeString(step.title),
        details: normalizeString(step.details),
        source_evidence: normalizeEvidenceList(step.source_evidence),
      };
    }).filter(Boolean),
    source_evidence: normalizeEvidenceList(plan.source_evidence),
  };
}

export function normalizeAgenticBlueprint(doc) {
  const blueprint = normalizeBlueprintRoot(doc);
  return {
    blueprint: {
      project: normalizeProject(blueprint.project),
      agents: normalizeArray(blueprint.agents).map(normalizeAgent).filter(Boolean),
      skills: normalizeArray(blueprint.skills).map(normalizeSkill).filter(Boolean),
      context_documents: normalizeArray(blueprint.context_documents).map(normalizeContextDocument).filter(Boolean),
      flows: normalizeArray(blueprint.flows).map(normalizeFlow).filter(Boolean),
      policies: normalizeArray(blueprint.policies).map(normalizePolicy).filter(Boolean),
      routing: normalizeRouting(blueprint.routing),
      entrypoints: normalizeArray(blueprint.entrypoints).map(normalizeEntrypoint).filter(Boolean),
      exports: normalizeArray(blueprint.exports).map(normalizeExport).filter(Boolean),
      migration_plan: normalizeMigrationPlan(blueprint.migration_plan),
    },
  };
}

function collectEvidencePaths(evidenceBundle) {
  const paths = new Set();
  for (const item of normalizeArray(evidenceBundle?.evidence)) {
    if (isPlainObject(item) && typeof item.path === 'string' && item.path.trim()) {
      paths.add(toPosixPath(item.path));
    }
  }
  return paths;
}

function addError(errors, path, message) {
  errors.push({ path, message });
}

function validateEvidenceList(errors, path, items, evidencePaths) {
  if (!Array.isArray(items) || items.length === 0) {
    addError(errors, path, 'source_evidence é obrigatório e deve conter pelo menos um item.');
    return false;
  }

  let ok = true;
  items.forEach((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isPlainObject(item)) {
      addError(errors, itemPath, 'source_evidence deve conter objetos.');
      ok = false;
      return;
    }
    if (!isSafeRelativePath(item.path)) {
      addError(errors, itemPath, 'source_evidence.path deve ser um caminho relativo seguro.');
      ok = false;
    } else if (!evidencePaths.has(item.path)) {
      addError(errors, itemPath, `source_evidence.path "${item.path}" não existe no evidence bundle.`);
      ok = false;
    }
    if (!normalizeString(item.kind)) {
      addError(errors, itemPath, 'source_evidence.kind é obrigatório.');
      ok = false;
    }
    if (!normalizeString(item.reason)) {
      addError(errors, itemPath, 'source_evidence.reason é obrigatório.');
      ok = false;
    }
    if (!normalizeString(item.snippet)) {
      addError(errors, itemPath, 'source_evidence.snippet é obrigatório.');
      ok = false;
    }
  });

  return ok;
}

function validateKebabId(errors, path, value, label) {
  if (!normalizeString(value)) {
    addError(errors, path, `${label} é obrigatório.`);
    return false;
  }
  if (!isKebabCase(value)) {
    addError(errors, path, `${label} deve estar em kebab-case.`);
    return false;
  }
  return true;
}

function validateReferences(errors, path, refs, knownIds, label) {
  if (!Array.isArray(refs) || refs.length === 0) {
    addError(errors, path, `${label} precisa referenciar pelo menos um item.`);
    return false;
  }
  let ok = true;
  for (const ref of refs) {
    if (!knownIds.has(ref)) {
      addError(errors, path, `${label} referencia id inexistente: ${ref}.`);
      ok = false;
    }
  }
  return ok;
}

function validateAgenticSectionIds(errors, path, items, label) {
  const ids = new Set();
  let ok = true;
  for (const item of items) {
    const id = item.id;
    if (!validateKebabId(errors, `${path}.id`, id, `${label}.id`)) {
      ok = false;
      continue;
    }
    if (ids.has(id)) {
      addError(errors, path, `${label} com id duplicado: ${id}.`);
      ok = false;
      continue;
    }
    ids.add(id);
  }
  return { ok, ids };
}

function validateSafePaths(errors, path, items, label) {
  let ok = true;
  for (const item of items) {
    const target = normalizeString(item.path);
    if (!isSafeRelativePath(target)) {
      addError(errors, path, `${label}.path deve ser um caminho relativo seguro: ${target || 'vazio'}.`);
      ok = false;
    }
  }
  return ok;
}

export function validateAgenticBlueprint(doc, evidenceBundle) {
  const normalized = normalizeAgenticBlueprint(doc);
  const blueprint = normalized.blueprint;
  const evidencePaths = collectEvidencePaths(evidenceBundle);
  const errors = [];

  if (!isPlainObject(doc)) {
    addError(errors, 'blueprint', 'Blueprint deve ser um objeto.');
    return { valid: false, errors, normalized };
  }

  if (Object.keys(blueprint).length === 0) {
    addError(errors, 'blueprint', 'Blueprint não pode ser vazio.');
  }

  if (!normalizeString(blueprint.project.name)) {
    addError(errors, 'project.name', 'project.name é obrigatório.');
  }
  if (!normalizeString(blueprint.project.type)) {
    addError(errors, 'project.type', 'project.type é obrigatório.');
  }
  if (!normalizeString(blueprint.project.objective)) {
    addError(errors, 'project.objective', 'project.objective é obrigatório.');
  }
  validateEvidenceList(errors, 'project.source_evidence', blueprint.project.source_evidence, evidencePaths);

  validateAgenticSectionIds(errors, 'agents', blueprint.agents, 'agent');
  validateAgenticSectionIds(errors, 'skills', blueprint.skills, 'skill');
  for (const agent of blueprint.agents) {
    const basePath = `agents[${agent.id || '?'}]`;
    if (!normalizeString(agent.name)) addError(errors, `${basePath}.name`, 'agent.name é obrigatório.');
    if (!normalizeString(agent.purpose)) addError(errors, `${basePath}.purpose`, 'agent.purpose é obrigatório.');
    if (!Array.isArray(agent.responsibilities) || agent.responsibilities.length === 0) addError(errors, `${basePath}.responsibilities`, 'agent.responsibilities é obrigatório.');
    if (!Array.isArray(agent.triggers) || agent.triggers.length === 0) addError(errors, `${basePath}.triggers`, 'agent.triggers é obrigatório.');
    if (!Array.isArray(agent.skills) || agent.skills.length === 0) addError(errors, `${basePath}.skills`, 'agent.skills é obrigatório.');
    if (!Array.isArray(agent.context) || agent.context.length === 0) addError(errors, `${basePath}.context`, 'agent.context é obrigatório.');
    if (!Array.isArray(agent.safety_limits) || agent.safety_limits.length === 0) addError(errors, `${basePath}.safety_limits`, 'agent.safety_limits é obrigatório.');
    validateEvidenceList(errors, `${basePath}.source_evidence`, agent.source_evidence, evidencePaths);
  }

  for (const skill of blueprint.skills) {
    const basePath = `skills[${skill.id || '?'}]`;
    if (!normalizeString(skill.name)) addError(errors, `${basePath}.name`, 'skill.name é obrigatório.');
    if (!normalizeString(skill.description)) addError(errors, `${basePath}.description`, 'skill.description é obrigatório.');
    if (!Array.isArray(skill.owner_agents) || skill.owner_agents.length === 0) addError(errors, `${basePath}.owner_agents`, 'skill.owner_agents é obrigatório.');
    if (!Array.isArray(skill.steps) || skill.steps.length === 0) addError(errors, `${basePath}.steps`, 'skill.steps é obrigatório.');
    validateEvidenceList(errors, `${basePath}.source_evidence`, skill.source_evidence, evidencePaths);
  }

  for (const docItem of blueprint.context_documents) {
    const basePath = `context_documents[${docItem.path || '?'}]`;
    if (!isSafeRelativePath(docItem.path)) addError(errors, `${basePath}.path`, 'context_documents.path deve ser seguro e relativo.');
    if (!normalizeString(docItem.title)) addError(errors, `${basePath}.title`, 'context_documents.title é obrigatório.');
    if (!normalizeString(docItem.purpose)) addError(errors, `${basePath}.purpose`, 'context_documents.purpose é obrigatório.');
    if (!normalizeString(docItem.owner_agent)) addError(errors, `${basePath}.owner_agent`, 'context_documents.owner_agent é obrigatório.');
    if (!Array.isArray(docItem.sections) || docItem.sections.length === 0) addError(errors, `${basePath}.sections`, 'context_documents.sections é obrigatório.');
    validateEvidenceList(errors, `${basePath}.source_evidence`, docItem.source_evidence, evidencePaths);
  }

  for (const flow of blueprint.flows) {
    const basePath = `flows[${flow.id || '?'}]`;
    if (!validateKebabId(errors, `${basePath}.id`, flow.id, 'flow.id')) continue;
    if (!normalizeString(flow.name)) addError(errors, `${basePath}.name`, 'flow.name é obrigatório.');
    if (!normalizeString(flow.purpose)) addError(errors, `${basePath}.purpose`, 'flow.purpose é obrigatório.');
    if (!Array.isArray(flow.owner_agents) || flow.owner_agents.length === 0) addError(errors, `${basePath}.owner_agents`, 'flow.owner_agents é obrigatório.');
    if (!Array.isArray(flow.steps) || flow.steps.length === 0) addError(errors, `${basePath}.steps`, 'flow.steps é obrigatório.');
    validateEvidenceList(errors, `${basePath}.source_evidence`, flow.source_evidence, evidencePaths);
  }

  for (const policy of blueprint.policies) {
    const basePath = `policies[${policy.id || '?'}]`;
    if (!validateKebabId(errors, `${basePath}.id`, policy.id, 'policy.id')) continue;
    if (!normalizeString(policy.name)) addError(errors, `${basePath}.name`, 'policy.name é obrigatório.');
    if (!normalizeString(policy.scope)) addError(errors, `${basePath}.scope`, 'policy.scope é obrigatório.');
    if (!normalizeString(policy.rule)) addError(errors, `${basePath}.rule`, 'policy.rule é obrigatório.');
    if (!Array.isArray(policy.owner_agents) || policy.owner_agents.length === 0) addError(errors, `${basePath}.owner_agents`, 'policy.owner_agents é obrigatório.');
    validateEvidenceList(errors, `${basePath}.source_evidence`, policy.source_evidence, evidencePaths);
  }

  const agentIds = new Set(blueprint.agents.map((agent) => agent.id));
  const skillIds = new Set(blueprint.skills.map((skill) => skill.id));

  for (const agent of blueprint.agents) {
    validateReferences(errors, `agents[${agent.id}].skills`, agent.skills, skillIds, 'agent.skills');
    validateSafePaths(errors, `agents[${agent.id}].context`, agent.context.map((path) => ({ path })), 'agent.context');
  }

  for (const skill of blueprint.skills) {
    validateReferences(errors, `skills[${skill.id}].owner_agents`, skill.owner_agents, agentIds, 'skill.owner_agents');
  }

  for (const docItem of blueprint.context_documents) {
    validateReferences(errors, `context_documents[${docItem.path}].owner_agent`, [docItem.owner_agent], agentIds, 'context_documents.owner_agent');
    validateSafePaths(errors, `context_documents[${docItem.path}].path`, [{ path: docItem.path }], 'context_documents.path');
  }

  for (const flow of blueprint.flows) {
    validateReferences(errors, `flows[${flow.id}].owner_agents`, flow.owner_agents, agentIds, 'flow.owner_agents');
  }

  for (const policy of blueprint.policies) {
    validateReferences(errors, `policies[${policy.id}].owner_agents`, policy.owner_agents, agentIds, 'policy.owner_agents');
  }

  if (!normalizeString(blueprint.routing.default_agent)) {
    addError(errors, 'routing.default_agent', 'routing.default_agent é obrigatório.');
  } else if (!agentIds.has(blueprint.routing.default_agent)) {
    addError(errors, 'routing.default_agent', `routing.default_agent referencia agente inexistente: ${blueprint.routing.default_agent}.`);
  }
  validateEvidenceList(errors, 'routing.source_evidence', blueprint.routing.source_evidence, evidencePaths);
  for (const rule of blueprint.routing.rules) {
    const basePath = `routing.rules[${rule.trigger || '?'}]`;
    if (!normalizeString(rule.trigger)) addError(errors, `${basePath}.trigger`, 'routing rule trigger é obrigatório.');
    if (!normalizeString(rule.agent)) addError(errors, `${basePath}.agent`, 'routing rule agent é obrigatório.');
    else if (!agentIds.has(rule.agent)) addError(errors, `${basePath}.agent`, `routing rule agent referencia agente inexistente: ${rule.agent}.`);
    if (!normalizeString(rule.reason)) addError(errors, `${basePath}.reason`, 'routing rule reason é obrigatório.');
    validateEvidenceList(errors, `${basePath}.source_evidence`, rule.source_evidence, evidencePaths);
  }

  const entrypointSeen = new Set();
  for (const entrypoint of blueprint.entrypoints) {
    const basePath = `entrypoints[${entrypoint.path || '?'}]`;
    if (!isSafeRelativePath(entrypoint.path)) addError(errors, `${basePath}.path`, 'entrypoints.path deve ser um caminho relativo seguro.');
    if (entrypointSeen.has(entrypoint.path)) addError(errors, `${basePath}.path`, `entrypoints.path duplicado: ${entrypoint.path}.`);
    entrypointSeen.add(entrypoint.path);
    if (!ENGINE_IDS.has(entrypoint.engine)) addError(errors, `${basePath}.engine`, `entrypoints.engine inválido: ${entrypoint.engine || 'vazio'}.`);
    if (!normalizeString(entrypoint.purpose)) addError(errors, `${basePath}.purpose`, 'entrypoints.purpose é obrigatório.');
    if (!normalizeString(entrypoint.owner_agent)) addError(errors, `${basePath}.owner_agent`, 'entrypoints.owner_agent é obrigatório.');
    else if (!agentIds.has(entrypoint.owner_agent)) addError(errors, `${basePath}.owner_agent`, `entrypoints.owner_agent referencia agente inexistente: ${entrypoint.owner_agent}.`);
    validateEvidenceList(errors, `${basePath}.source_evidence`, entrypoint.source_evidence, evidencePaths);
  }

  const exportPaths = new Set();
  for (const exportItem of blueprint.exports) {
    const basePath = `exports[${exportItem.path || '?'}]`;
    if (!isSafeRelativePath(exportItem.path)) addError(errors, `${basePath}.path`, 'exports.path deve ser um caminho relativo seguro.');
    if (exportPaths.has(exportItem.path)) addError(errors, `${basePath}.path`, `exports.path duplicado: ${exportItem.path}.`);
    exportPaths.add(exportItem.path);
    if (!isSafeRelativePath(exportItem.source)) addError(errors, `${basePath}.source`, 'exports.source deve ser um caminho relativo seguro.');
    if (!ENGINE_IDS.has(exportItem.engine)) addError(errors, `${basePath}.engine`, `exports.engine inválido: ${exportItem.engine || 'vazio'}.`);
    if (!normalizeString(exportItem.owner_agent)) addError(errors, `${basePath}.owner_agent`, 'exports.owner_agent é obrigatório.');
    else if (!agentIds.has(exportItem.owner_agent)) addError(errors, `${basePath}.owner_agent`, `exports.owner_agent referencia agente inexistente: ${exportItem.owner_agent}.`);
    validateEvidenceList(errors, `${basePath}.source_evidence`, exportItem.source_evidence, evidencePaths);
  }

  if (!normalizeString(blueprint.migration_plan.mode)) {
    addError(errors, 'migration_plan.mode', 'migration_plan.mode é obrigatório.');
  }
  if (!Array.isArray(blueprint.migration_plan.steps) || blueprint.migration_plan.steps.length === 0) {
    addError(errors, 'migration_plan.steps', 'migration_plan.steps é obrigatório.');
  } else {
    blueprint.migration_plan.steps.forEach((step, index) => {
      const basePath = `migration_plan.steps[${index}]`;
      if (!normalizeString(step.title)) addError(errors, `${basePath}.title`, 'migration_plan step title é obrigatório.');
      if (!normalizeString(step.details)) addError(errors, `${basePath}.details`, 'migration_plan step details é obrigatório.');
      validateEvidenceList(errors, `${basePath}.source_evidence`, step.source_evidence, evidencePaths);
    });
  }
  validateEvidenceList(errors, 'migration_plan.source_evidence', blueprint.migration_plan.source_evidence, evidencePaths);

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    normalized,
  };
}

export function renderAgenticBlueprintSchema() {
  const lines = [];
  lines.push('# Agentic Blueprint Schema');
  lines.push('');
  lines.push('Return YAML only with this top-level structure:');
  lines.push('');
  lines.push('```yaml');
  lines.push('blueprint:');
  lines.push('  project:');
  lines.push('    name: string');
  lines.push('    type: string');
  lines.push('    objective: string');
  lines.push('    package_manager: string');
  lines.push('    source_evidence:');
  lines.push('      - path: path/to/evidence');
  lines.push('        kind: evidence-kind');
  lines.push('        reason: string');
  lines.push('        snippet: string');
  lines.push('  agents:');
  lines.push('    - id: kebab-case');
  lines.push('      name: string');
  lines.push('      purpose: string');
  lines.push('      responsibilities: [string]');
  lines.push('      triggers: [string]');
  lines.push('      skills: [skill-id]');
  lines.push('      context: [relative/path.md]');
  lines.push('      safety_limits: [string]');
  lines.push('      source_evidence: [...]');
  lines.push('  skills:');
  lines.push('    - id: kebab-case');
  lines.push('      name: string');
  lines.push('      description: string');
  lines.push('      owner_agents: [agent-id]');
  lines.push('      steps: [string]');
  lines.push('      source_evidence: [...]');
  lines.push('  context_documents:');
  lines.push('    - path: relative/path.md');
  lines.push('      title: string');
  lines.push('      purpose: string');
  lines.push('      owner_agent: agent-id');
  lines.push('      sections:');
  lines.push('        - heading: string');
  lines.push('          bullets: [string]');
  lines.push('      source_evidence: [...]');
  lines.push('  flows:');
  lines.push('    - id: kebab-case');
  lines.push('      name: string');
  lines.push('      purpose: string');
  lines.push('      owner_agents: [agent-id]');
  lines.push('      steps: [string]');
  lines.push('      source_evidence: [...]');
  lines.push('  policies:');
  lines.push('    - id: kebab-case');
  lines.push('      name: string');
  lines.push('      scope: string');
  lines.push('      rule: string');
  lines.push('      owner_agents: [agent-id]');
  lines.push('      source_evidence: [...]');
  lines.push('  routing:');
  lines.push('    default_agent: agent-id');
  lines.push('    rules:');
  lines.push('      - trigger: string');
  lines.push('        agent: agent-id');
  lines.push('        reason: string');
  lines.push('        source_evidence: [...]');
  lines.push('    source_evidence: [...]');
  lines.push('  entrypoints:');
  lines.push('    - path: relative/path');
  lines.push('      engine: codex|claude-code|cursor|gemini-cli|windsurf|antigravity|kiro|opencode|cline|roo-code|github-copilot|aider|amazon-q');
  lines.push('      purpose: string');
  lines.push('      owner_agent: agent-id');
  lines.push('      source_evidence: [...]');
  lines.push('  exports:');
  lines.push('    - path: relative/path');
  lines.push('      source: relative/path');
  lines.push('      engine: valid-engine-id');
  lines.push('      owner_agent: agent-id');
  lines.push('      source_evidence: [...]');
  lines.push('  migration_plan:');
  lines.push('    mode: string');
  lines.push('    steps:');
  lines.push('      - title: string');
  lines.push('        details: string');
  lines.push('        source_evidence: [...]');
  lines.push('    source_evidence: [...]');
  lines.push('```');
  lines.push('');
  lines.push('Validation rules:');
  lines.push('');
  lines.push('- ids must be kebab-case.');
  lines.push('- paths must be safe relative paths.');
  lines.push('- source_evidence must reference paths present in the evidence bundle.');
  lines.push('- agents must reference existing skills.');
  lines.push('- skills must reference existing agents.');
  lines.push('- entrypoints and exports must use a valid engine id.');
  lines.push('- every item must carry source_evidence.');
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}
