import { renderAiEvidenceBrief } from './evidence-bundle.js';
import { renderAgenticBlueprintRequest as renderAgenticBlueprintRequestPrompt } from './request-renderer.js';

function bullet(value) {
  return `- ${value}`;
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
  return renderAgenticBlueprintRequestPrompt(bundle, analysisBundle);
}
