import { renderAiEvidenceBrief } from './evidence-bundle.js';

function bullet(value) {
  return `- ${value}`;
}

function section(title, lines = []) {
  return [title, '', ...lines, ''].join('\n');
}

function formatSuggestionCounts(analysisBundle) {
  const suggestions = analysisBundle?.suggestions ?? {};
  return [
    bullet(`Sinais de agentes: ${(suggestions.agents ?? []).length}`),
    bullet(`Capacidades detectadas: ${(suggestions.skills ?? []).length}`),
    bullet(`Fluxos candidatos detectados: ${(suggestions.flows ?? []).length}`),
    bullet(`Políticas candidatas: ${(suggestions.policies ?? []).length}`),
    bullet(`Documentos de contexto: ${(suggestions.context ?? []).length}`),
  ];
}

function formatSurfaceSummary(bundle) {
  return [
    bullet(`Project: ${bundle?.project?.name || 'unknown'}`),
    bullet(`Type: ${bundle?.project?.type || 'unknown'}`),
    bullet(`Framework: ${bundle?.stack?.framework || 'unknown'}`),
    bullet(`Evidence items: ${(bundle?.evidence ?? []).length}`),
    bullet(`Main areas: ${(bundle?.mainAreas ?? []).map((item) => item.path).join(', ') || 'none'}`),
    bullet(`Docs detected: ${(bundle?.docsDetected ?? []).map((item) => item.path).join(', ') || 'none'}`),
    bullet(`Agentic surfaces: ${(bundle?.agenticSurfaces ?? []).join(', ') || 'none'}`),
    bullet(`Workflows: ${(bundle?.workflows ?? []).join(', ') || 'none'}`),
    bullet(`Test files: ${(bundle?.testFiles ?? []).join(', ') || 'none'}`),
    bullet(`Migration/data signals: ${(bundle?.migrationDataSignals ?? []).join(', ') || 'none'}`),
    bullet(`Architecture clues: ${(bundle?.architectureClues ?? []).join(', ') || 'none'}`),
  ];
}

export function renderAgenticDossier(bundle, analysisBundle) {
  const lines = [];
  lines.push('# Agentic Dossier');
  lines.push('');
  lines.push('## Status');
  lines.push('');
  lines.push('- Evidências coletadas.');
  lines.push('- Blueprint da IA ainda necessário.');
  lines.push('- Rode/peça para a IA preencher `.agentforge/ai/outbox/agentic-blueprint.yaml`.');
  lines.push('');
  lines.push('## Evidence brief');
  lines.push('');
  lines.push(renderAiEvidenceBrief(bundle).trimEnd());
  lines.push('');
  lines.push('## Decision signals');
  lines.push('');
  lines.push(...formatSuggestionCounts(analysisBundle));
  lines.push('');
  lines.push('## Surface summary');
  lines.push('');
  lines.push(...formatSurfaceSummary(bundle));
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- These signals are inputs for the active AI, not a final recommendation.');
  lines.push('- The heuristic counts are intentionally left for the AI to resolve semantically.');
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}

export function renderAgenticBlueprintRequest(bundle, analysisBundle) {
  const lines = [];
  lines.push('# Agentic Blueprint Request');
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push('Use the collected evidence to fill `.agentforge/ai/outbox/agentic-blueprint.yaml`.');
  lines.push('The CLI has only gathered signals; it has not made the final semantic decision.');
  lines.push('Esses sinais heurísticos não são recomendação final.');
  lines.push('Do not promote agents, skills, or flows just because they were detected heuristically.');
  lines.push('Decide with evidence, not with keyword matching.');
  lines.push('');
  lines.push('## Inputs');
  lines.push('');
  lines.push(`- Evidence JSON: \`.agentforge/ai/evidence/project-evidence.json\``);
  lines.push(`- Dossier: \`.agentforge/reports/agentic-dossier.md\``);
  lines.push(`- Signal summary: agents ${(analysisBundle?.suggestions?.agents ?? []).length}, skills ${(analysisBundle?.suggestions?.skills ?? []).length}, flows ${(analysisBundle?.suggestions?.flows ?? []).length}`);
  lines.push('');
  lines.push('## Output schema');
  lines.push('');
  lines.push('Return YAML only with this top-level structure:');
  lines.push('');
  lines.push('```yaml');
  lines.push('blueprint:');
  lines.push('  project: string');
  lines.push('  decision_notes:');
  lines.push('    - string');
  lines.push('  agents:');
  lines.push('    - id: string');
  lines.push('      name: string');
  lines.push('      confidence: low|medium|high');
  lines.push('      reason: string');
  lines.push('      source_evidence:');
  lines.push('        - path: path/to/file');
  lines.push('          kind: evidence-kind');
  lines.push('          reason: why this evidence matters');
  lines.push('          snippet: short excerpt copied from the bundle');
  lines.push('  skills:');
  lines.push('    - id: string');
  lines.push('      name: string');
  lines.push('      confidence: low|medium|high');
  lines.push('      reason: string');
  lines.push('      source_evidence:');
  lines.push('        - path: path/to/file');
  lines.push('          kind: evidence-kind');
  lines.push('          reason: why this evidence matters');
  lines.push('          snippet: short excerpt copied from the bundle');
  lines.push('  flows:');
  lines.push('    - id: string');
  lines.push('      name: string');
  lines.push('      confidence: low|medium|high');
  lines.push('      reason: string');
  lines.push('      source_evidence:');
  lines.push('        - path: path/to/file');
  lines.push('          kind: evidence-kind');
  lines.push('          reason: why this evidence matters');
  lines.push('          snippet: short excerpt copied from the bundle');
  lines.push('  risks:');
  lines.push('    - string');
  lines.push('```');
  lines.push('');
  lines.push('## Rules');
  lines.push('');
  lines.push('- Keep the blueprint concise and specific.');
  lines.push('- Use real repository paths only.');
  lines.push('- If evidence is weak, leave the corresponding list empty.');
  lines.push('- Do not mirror the heuristic list without semantic review.');
  lines.push('- Make the resulting YAML suitable for `.agentforge/ai/outbox/agentic-blueprint.yaml`.');
  lines.push('');
  lines.push('## Evidence overview');
  lines.push('');
  lines.push(...formatSurfaceSummary(bundle));
  lines.push('');
  return `${lines.join('\n').trimEnd()}\n`;
}
