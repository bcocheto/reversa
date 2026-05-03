const EVIDENCE_LIMIT = 32;

function normalizeList(values = []) {
  return [...new Set(values.filter(Boolean).map((value) => String(value).trim()).filter(Boolean))];
}

function bullet(value) {
  return `- ${value}`;
}

function backtick(value) {
  return `\`${String(value ?? '').replace(/`/g, '\\`')}\``;
}

function formatEvidenceItem(item) {
  const path = item?.path ?? 'unknown';
  const kind = item?.kind ?? 'unknown';
  const reason = item?.reason ?? 'sem motivo';
  const snippet = String(item?.snippet ?? '').replace(/\s+/g, ' ').trim();
  return `- ${backtick(path)} [${kind}] ${reason}: ${snippet || '—'}`;
}

function formatEvidenceInventory(bundle) {
  const evidence = Array.isArray(bundle?.evidence) ? bundle.evidence.slice(0, EVIDENCE_LIMIT) : [];
  if (evidence.length === 0) return ['- nenhuma evidência registrada.'];

  const lines = evidence.map((item) => formatEvidenceItem(item));
  if ((bundle?.evidence?.length ?? 0) > EVIDENCE_LIMIT) {
    lines.push(`- ... ${bundle.evidence.length - EVIDENCE_LIMIT} evidências adicionais omitidas para manter o prompt legível.`);
  }
  return lines;
}

function formatBundleSummary(bundle) {
  const project = bundle?.project ?? {};
  const stack = bundle?.stack ?? {};

  return [
    bullet(`Project: ${project.name || 'unknown'}`),
    bullet(`Type: ${project.type || 'unknown'}`),
    bullet(`Package manager: ${project.packageManager || 'unknown'}`),
    bullet(`Framework: ${stack.framework || 'unknown'}`),
    bullet(`Package scripts: ${(bundle?.packageScripts ?? []).length === 0 ? 'none' : bundle.packageScripts.map((script) => script.name).join(', ')}`),
    bullet(`Main areas: ${(bundle?.mainAreas ?? []).length === 0 ? 'none' : bundle.mainAreas.map((area) => area.path).join(', ')}`),
    bullet(`Docs detected: ${(bundle?.docsDetected ?? []).length === 0 ? 'none' : bundle.docsDetected.map((doc) => doc.path).join(', ')}`),
    bullet(`Agentic surfaces: ${(bundle?.agenticSurfaces ?? []).length === 0 ? 'none' : bundle.agenticSurfaces.join(', ')}`),
    bullet(`Workflows: ${(bundle?.workflows ?? []).length === 0 ? 'none' : bundle.workflows.join(', ')}`),
    bullet(`Test files: ${(bundle?.testFiles ?? []).length === 0 ? 'none' : bundle.testFiles.join(', ')}`),
    bullet(`Migration/data signals: ${(bundle?.migrationDataSignals ?? []).length === 0 ? 'none' : bundle.migrationDataSignals.join(', ')}`),
    bullet(`Architecture clues: ${(bundle?.architectureClues ?? []).length === 0 ? 'none' : bundle.architectureClues.join(', ')}`),
    bullet(`Known risks: ${(bundle?.risks ?? []).length === 0 ? 'none' : bundle.risks.join(' | ')}`),
  ];
}

function renderCommonInstructions(kindLabel) {
  return [
    `Você é a IA ativa do AgentForge e deve gerar ${kindLabel}.`,
    'Julgue semanticamente o projeto, não apenas por palavras-chave ou presença superficial de arquivos.',
    'Não sugira itens genéricos, redundantes ou sem base concreta no evidence bundle.',
    'Evite duplicatas e papéis/roles redundantes que sobreponham capacidades já cobertas por outros itens.',
    'Cada item deve incluir confidence, reason, recommended_context, safety_limits e source_evidence.',
    'Cada source_evidence deve usar paths reais vindos do evidence bundle e não pode inventar arquivos.',
    'Responda somente com YAML válido, sem markdown fences, comentários soltos ou texto extra.',
    'Se não houver evidência suficiente, retorne a lista vazia do schema.',
  ];
}

function renderEvidenceSection(bundle) {
  return [
    '## Evidence bundle summary',
    '',
    ...formatBundleSummary(bundle),
    '',
    '## Evidence inventory',
    '',
    ...formatEvidenceInventory(bundle),
    '',
  ];
}

function renderPrompt({
  title,
  kindLabel,
  bundle,
  outputKey,
  schemaLines,
  extraGuidance = [],
}) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push(...renderCommonInstructions(kindLabel));
  lines.push('');
  if (extraGuidance.length > 0) {
    lines.push('## Additional guidance');
    lines.push('');
    lines.push(...extraGuidance);
    lines.push('');
  }
  lines.push(...renderEvidenceSection(bundle));
  lines.push('## Output schema');
  lines.push('');
  lines.push('Return YAML only using this exact top-level structure:');
  lines.push('');
  lines.push('```yaml');
  lines.push(outputKey + ':');
  for (const line of schemaLines) {
    lines.push(line);
  }
  lines.push('```');
  lines.push('');
  lines.push('## Output rules');
  lines.push('');
  lines.push(...[
    '- `confidence` must be one of `low`, `medium`, or `high`.',
    '- `reason` must explain the evidence-based semantic judgment.',
    '- `recommended_context` must contain repo-relative paths that the active AI should read or update.',
    '- `safety_limits` must state what the AI must not do.',
    '- `source_evidence` must copy real evidence items from the bundle with `path`, `kind`, `reason`, and `snippet`.',
    '- Do not output duplicate entries or invent a role that is already represented by another item.',
  ]);
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function agentSchemaLines() {
  return [
    '  - id: string',
    '    name: string',
    '    purpose: string',
    '    confidence: low|medium|high',
    '    reason: string',
    '    recommended_context:',
    '      - path/to/context.md',
    '    safety_limits:',
    '      - string',
    '    responsibilities:',
    '      - string',
    '    reads:',
    '      - path/to/doc.md',
    '    skills:',
    '      - skill-id',
    '    flows:',
    '      - flow-id',
    '    limits:',
    '      - string',
    '    source_evidence:',
    '      - path: path/to/file',
    '        kind: evidence-kind',
    '        reason: why this evidence matters',
    '        snippet: short excerpt copied from the bundle',
  ];
}

function skillSchemaLines() {
  return [
    '  - id: string',
    '    name: string',
    '    description: string',
    '    confidence: low|medium|high',
    '    reason: string',
    '    triggers:',
    '      - string',
    '    recommended_context:',
    '      - path/to/context.md',
    '    recommended_steps:',
    '      - string',
    '    safety_limits:',
    '      - string',
    '    source_evidence:',
    '      - path: path/to/file',
    '        kind: evidence-kind',
    '        reason: why this evidence matters',
    '        snippet: short excerpt copied from the bundle',
  ];
}

function flowSchemaLines() {
  return [
    '  - id: string',
    '    name: string',
    '    purpose: string',
    '    confidence: low|medium|high',
    '    reason: string',
    '    stages:',
    '      - string',
    '    recommended_context:',
    '      - path/to/context.md',
    '    safety_limits:',
    '      - string',
    '    source_evidence:',
    '      - path: path/to/file',
    '        kind: evidence-kind',
    '        reason: why this evidence matters',
    '        snippet: short excerpt copied from the bundle',
  ];
}

function policySchemaLines() {
  return [
    '  - id: string',
    '    name: string',
    '    scope: string',
    '    rule: string',
    '    confidence: low|medium|high',
    '    reason: string',
    '    recommended_context:',
    '      - path/to/context.md',
    '    safety_limits:',
    '      - string',
    '    source_evidence:',
    '      - path: path/to/file',
    '        kind: evidence-kind',
    '        reason: why this evidence matters',
    '        snippet: short excerpt copied from the bundle',
  ];
}

function contextSchemaLines() {
  return [
    '  - path: path/to/context.md',
    '    title: string',
    '    purpose: string',
    '    confidence: low|medium|high',
    '    reason: string',
    '    sections:',
    '      - heading: string',
    '        bullets:',
    '          - string',
    '    recommended_context:',
    '      - path/to/context.md',
    '    safety_limits:',
    '      - string',
    '    source_evidence:',
    '      - path: path/to/file',
    '        kind: evidence-kind',
    '        reason: why this evidence matters',
    '        snippet: short excerpt copied from the bundle',
  ];
}

export function renderAgentSuggestionRequest(bundle) {
  return renderPrompt({
    title: 'Agent Suggestion Request',
    kindLabel: 'agent suggestions',
    bundle,
    outputKey: 'agents',
    schemaLines: agentSchemaLines(),
    extraGuidance: [
      'Sugira apenas agentes com responsabilidade semântica clara, evitando funções duplicadas como "general assistant" ou "reviewer" genérico sem prova no bundle.',
      'Cada agente deve ter um papel distinto, com fronteiras explícitas de leitura, escrita e risco.',
    ],
  });
}

export function renderSkillSuggestionRequest(bundle) {
  return renderPrompt({
    title: 'Skill Suggestion Request',
    kindLabel: 'skill suggestions',
    bundle,
    outputKey: 'skills',
    schemaLines: skillSchemaLines(),
    extraGuidance: [
      'Sugira apenas skills com uso recorrente e evidência direta em comandos, docs, flows, testes ou sinais de domínio.',
      'Evite skills que repitam a mesma intenção de outra skill já sugerida; prefira granularidade útil e separação por objetivo real.',
    ],
  });
}

export function renderFlowSuggestionRequest(bundle) {
  return renderPrompt({
    title: 'Flow Suggestion Request',
    kindLabel: 'flow suggestions',
    bundle,
    outputKey: 'flows',
    schemaLines: flowSchemaLines(),
    extraGuidance: [
      'Sugira flows quando o repositório mostrar um processo recorrente, com etapas e checkpoints claros.',
      'Evite inventar pipelines abstratos sem evidência em scripts, docs, policy files ou históricos de workflow.',
    ],
  });
}

export function renderPolicySuggestionRequest(bundle) {
  return renderPrompt({
    title: 'Policy Suggestion Request',
    kindLabel: 'policy suggestions',
    bundle,
    outputKey: 'policies',
    schemaLines: policySchemaLines(),
    extraGuidance: [
      'Sugira políticas apenas quando houver um risco, restrição ou comportamento de governança claramente observável no bundle.',
      'A política deve ser específica, acionável e alinhada ao que o projeto já faz ou precisa proteger.',
    ],
  });
}

export function renderContextSynthesisRequest(bundle) {
  return renderPrompt({
    title: 'Context Synthesis Request',
    kindLabel: 'context synthesis items',
    bundle,
    outputKey: 'context_documents',
    schemaLines: contextSchemaLines(),
    extraGuidance: [
      'Synthesize or update context documents that would help the active AI understand the repository faster.',
      'Prefer documents that consolidate architecture, conventions, testing, workflows, or domain knowledge already implied by the bundle.',
      'Do not duplicate existing context documents without a clear reason to replace or split them.',
    ],
  });
}

export default {
  renderAgentSuggestionRequest,
  renderSkillSuggestionRequest,
  renderFlowSuggestionRequest,
  renderPolicySuggestionRequest,
  renderContextSynthesisRequest,
};
