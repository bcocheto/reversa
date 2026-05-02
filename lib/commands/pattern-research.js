import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { basename, dirname, extname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';
import YAML from 'yaml';

import { buildManifest, loadManifest, saveManifest } from '../installer/manifest.js';
import { Writer } from '../installer/writer.js';
import { scanProjectSignals } from './project-signals.js';

export const PATTERN_CATALOG_PATH = fileURLToPath(new URL('../../templates/agentforge/patterns/catalog.yaml', import.meta.url));
export const PATTERN_RESEARCH_REPORT_PATH = '.agentforge/reports/pattern-research.md';
export const PATTERN_SUGGESTION_DIR = '.agentforge/suggestions/patterns';

const EXTRA_CODE_DIRS = ['libs', 'modules', 'packages'];

function toPosixPath(path) {
  return String(path ?? '').split(sep).join('/');
}

function rel(projectRoot, absPath) {
  const path = toPosixPath(relative(projectRoot, absPath));
  return path || basename(absPath);
}

function listFilesRecursive(dirPath, { markdownOnly = false } = {}) {
  if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return [];

  const files = [];
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFilesRecursive(fullPath, { markdownOnly }));
      continue;
    }
    if (markdownOnly && extname(fullPath).toLowerCase() !== '.md') continue;
    files.push(fullPath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

function readText(filePath) {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJson(filePath) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function collectExtraCodeSurface(projectRoot) {
  return EXTRA_CODE_DIRS
    .filter((dir) => existsSync(join(projectRoot, dir)))
    .map((dir) => ({
      path: dir,
      fileCount: listFilesRecursive(join(projectRoot, dir)).length,
    }));
}

function collectResearchSources(projectRoot, signals, extraSurface) {
  const sources = new Map();
  const addSource = (path, content) => {
    if (!path || sources.has(path)) return;
    sources.set(path, {
      path: toPosixPath(path),
      content: String(content ?? ''),
    });
  };

  const addFileIfExists = (relPath) => {
    const absPath = join(projectRoot, relPath);
    if (!existsSync(absPath) || statSync(absPath).isDirectory()) return;
    addSource(relPath, readText(absPath));
  };

  if (signals.packageJson) {
    addSource('package.json', `${JSON.stringify(signals.packageJson, null, 2)}\n`);
  }
  if (signals.readmeExists) addSource('README.md', signals.readmeText);
  if (signals.agentsPath) addSource('AGENTS.md', signals.agentsText);
  if (signals.claudePath) addSource('CLAUDE.md', signals.claudeText);

  for (const doc of signals.docsFiles ?? []) {
    addSource(doc.path, doc.content);
  }
  for (const doc of signals.agentsFiles ?? []) {
    addSource(doc.path, doc.content);
  }
  for (const doc of signals.instructionDocs ?? []) {
    addSource(doc.path, doc.content);
  }

  for (const workflowPath of signals.workflowFiles ?? []) {
    addSource(workflowPath, readText(join(projectRoot, workflowPath)));
  }

  addFileIfExists('Dockerfile');
  addFileIfExists('docker-compose.yml');
  addFileIfExists('compose.yaml');
  addFileIfExists('pnpm-workspace.yaml');
  addFileIfExists('pyproject.toml');
  addFileIfExists('requirements.txt');

  if (signals.packageJson?.scripts && isPlainObject(signals.packageJson.scripts)) {
    addSource('package.json#scripts', `${JSON.stringify(signals.packageJson.scripts, null, 2)}\n`);
  }
  if (signals.packageJson?.bin) {
    addSource('package.json#bin', `${JSON.stringify(signals.packageJson.bin, null, 2)}\n`);
  }
  if (signals.packageJson?.workspaces) {
    addSource('package.json#workspaces', `${JSON.stringify(signals.packageJson.workspaces, null, 2)}\n`);
  }

  for (const area of signals.mainAreas ?? []) {
    addSource(area.path, area.reason ?? area.label);
  }
  for (const item of extraSurface ?? []) {
    addSource(`${item.path}/`, `files:${item.fileCount}`);
  }

  return [...sources.values()];
}

function hasKeyword(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function hasAutomationScripts(signals) {
  return (signals.projectCommands ?? []).some((entry) => /test|lint|typecheck|coverage|release|deploy|validate/i.test(entry.command))
    || (signals.testingCommands ?? []).some((entry) => /test|lint|typecheck|coverage|validate/i.test(entry.command))
    || (signals.packageScripts ?? []).some((script) => /test|lint|typecheck|coverage|release|deploy|validate/i.test(script.command));
}

function evaluateCondition(condition, signals, extraSurface, corpus) {
  switch (condition) {
    case 'node_project':
      return Boolean(signals.packageJson);
    case 'typescript_project':
      return Boolean(
        signals.dependencyNames?.some((name) => /^typescript$/i.test(name))
          || signals.tsFiles?.length > 0
          || signals.packageScripts?.some((script) => /tsc|typecheck/i.test(script.command)),
      );
    case 'nestjs_project':
      return Boolean(
        signals.dependencyNames?.some((name) => /^@nestjs\//i.test(name) || /^nestjs$/i.test(name))
          || hasKeyword(corpus, [/@nestjs\//i, /\bNestFactory\b/i, /@Module\(/i, /@Controller\(/i, /@Injectable\(/i]),
      );
    case 'nextjs_project':
      return Boolean(
        signals.dependencyNames?.some((name) => /^next$/i.test(name))
          || signals.appExists
          || hasKeyword(corpus, [/\bnext\s+(dev|build|start)\b/i, /\bnext\.config\b/i, /\blayout\.tsx\b/i, /\bpage\.tsx\b/i]),
      );
    case 'react_project':
      return Boolean(
        signals.dependencyNames?.some((name) => /^react$/i.test(name) || /^react-dom$/i.test(name))
          || hasKeyword(corpus, [/\breact-dom\b/i, /\buseState\b/i, /\buseEffect\b/i, /\.tsx\b/i]),
      );
    case 'python_project':
      return Boolean(signals.pyproject || signals.requirements);
    case 'docker_surface':
      return Boolean(
        signals.dockerfile
          || signals.composeFile
          || hasKeyword(corpus, [/\bDockerfile\b/i, /\bdocker-compose\.yml\b/i, /\bcompose\.yaml\b/i, /\bFROM\b/i]),
      );
    case 'github_actions_surface':
      return (signals.workflowFiles ?? []).length > 0;
    case 'monorepo_surface': {
      if (signals.packageJson?.workspaces) return true;
      const codeRoots = unique([
        ...(signals.srcExists ? ['src'] : []),
        ...(signals.appExists ? ['app'] : []),
        ...(signals.workerExists ? ['worker'] : []),
        ...(extraSurface ?? []).map((item) => item.path),
      ]);
      return codeRoots.length >= 2;
    }
    case 'api_surface':
      return Boolean(
        signals.projectType && /api/i.test(signals.projectType)
          || hasKeyword(corpus, [/\bapi\b/i, /\bendpoint\b/i, /\bcontroller\b/i, /\broute\b/i, /\brequest\b/i, /\bresponse\b/i, /\bREST\b/i, /\bGraphQL\b/i]),
      );
    case 'cli_surface':
      return Boolean(
        signals.packageJson?.bin
          || hasKeyword(corpus, [/\bcommander\b/i, /\byargs\b/i, /\bprocess\.argv\b/i, /\busage\b/i, /\bhelp\b/i, /\bcommands\b/i, /\bbin\b/i]),
      );
    case 'saas_signals':
      return Boolean(
        signals.projectType && /SaaS/i.test(signals.projectType)
          || hasKeyword(corpus, [/\bsaas\b/i, /\bsubscription\b/i, /\bbilling\b/i, /\btenant\b/i, /\bworkspace\b/i, /\bdashboard\b/i, /\bauth\b/i, /\bpricing\b/i]),
      );
    case 'documentation_heavy': {
      const docCount = (signals.docsFiles ?? []).length;
      const instructionCount = (signals.instructionDocs ?? []).length;
      return Boolean(
        (signals.readmeExists && docCount >= 2)
          || (signals.readmeExists && instructionCount >= 3)
          || hasKeyword(corpus, [/README\.md/i, /\bdocs\/\b/i, /\bAGENTS\.md\b/i, /\bCLAUDE\.md\b/i, /\bobjective\b/i, /\baudience\b/i, /\btesting\b/i, /\barchitecture\b/i]),
      );
    }
    case 'automation_heavy':
      return Boolean(
        (signals.workflowFiles ?? []).length > 0
          && (signals.dockerfile || signals.composeFile || hasAutomationScripts(signals) || hasKeyword(corpus, [/\brelease\b/i, /\bdeploy\b/i, /\bvalidate\b/i])),
      );
    default:
      return false;
  }
}

function extractSnippet(sourceContent, regex) {
  const lines = String(sourceContent ?? '').split(/\r?\n/);
  const safeRegex = new RegExp(regex.source, regex.flags.replace('g', ''));

  for (const line of lines) {
    if (safeRegex.test(line)) {
      return line.trim().slice(0, 180);
    }
  }

  return '';
}

function evaluateEvidence(pattern, sources) {
  const evidencePatterns = Array.isArray(pattern.evidence_patterns) ? pattern.evidence_patterns : [];
  const evidence = [];
  const seen = new Set();

  for (const evidencePattern of evidencePatterns) {
    let regex;
    try {
      regex = new RegExp(evidencePattern, 'i');
    } catch {
      continue;
    }

    for (const source of sources) {
      const searchable = `${source.path}\n${source.content}`;
      if (!regex.test(searchable)) continue;

      const snippet = extractSnippet(source.content, regex) || source.path;
      const dedupeKey = `${source.path}::${snippet}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      evidence.push({
        pattern: evidencePattern,
        path: source.path,
        snippet,
      });
      break;
    }
  }

  return evidence;
}

function confidenceFor(score) {
  if (score >= 0.75) return 'high';
  if (score >= 0.45) return 'medium';
  return 'low';
}

function summarizeEvidence(evidence = []) {
  if (evidence.length === 0) return 'No direct evidence found.';
  return evidence
    .slice(0, 3)
    .map((item) => `${item.path}: ${item.snippet || item.pattern}`)
    .join(' | ');
}

function evaluatePattern(pattern, signals, extraSurface, sources, corpus) {
  const appliesWhen = Array.isArray(pattern.applies_when) ? pattern.applies_when : [];
  const matchedConditions = appliesWhen.filter((condition) => evaluateCondition(condition, signals, extraSurface, corpus));
  const evidence = evaluateEvidence(pattern, sources);

  const appliesScore = appliesWhen.length === 0 ? 0 : matchedConditions.length / appliesWhen.length;
  const evidenceScore = Array.isArray(pattern.evidence_patterns) && pattern.evidence_patterns.length > 0
    ? Math.min(evidence.length / pattern.evidence_patterns.length, 1)
    : (evidence.length > 0 ? 1 : 0);
  const score = Number(((appliesScore * 0.45) + (evidenceScore * 0.55)).toFixed(2));
  const confidence = confidenceFor(score);
  const observed = evidence.length > 0 || matchedConditions.length > 0;
  const recommended = score >= 0.55 && evidence.length > 0;

  return {
    id: pattern.id,
    name: pattern.name,
    applies_when: appliesWhen,
    matched_conditions: matchedConditions,
    evidence_patterns: Array.isArray(pattern.evidence_patterns) ? pattern.evidence_patterns : [],
    evidence,
    evidence_summary: summarizeEvidence(evidence),
    benefits: Array.isArray(pattern.benefits) ? pattern.benefits : [],
    tradeoffs: Array.isArray(pattern.tradeoffs) ? pattern.tradeoffs : [],
    recommended_context_files: Array.isArray(pattern.recommended_context_files) ? pattern.recommended_context_files : [],
    recommended_agents: Array.isArray(pattern.recommended_agents) ? pattern.recommended_agents : [],
    recommended_skills: Array.isArray(pattern.recommended_skills) ? pattern.recommended_skills : [],
    recommended_flows: Array.isArray(pattern.recommended_flows) ? pattern.recommended_flows : [],
    score,
    confidence,
    observed,
    recommended,
    catalog: pattern,
  };
}

function inferPatternStack(signals, extraSurface, evaluatedPatterns) {
  const stack = new Set(signals.stackDetails ?? []);

  if (evaluatedPatterns.some((pattern) => pattern.id === 'nestjs' && pattern.observed)) stack.add('NestJS');
  if (evaluatedPatterns.some((pattern) => pattern.id === 'python' && pattern.observed)) stack.add('Python');
  if (evaluatedPatterns.some((pattern) => pattern.id === 'monorepo' && pattern.observed)) stack.add('Monorepo');
  if (evaluatedPatterns.some((pattern) => pattern.id === 'cli' && pattern.observed)) stack.add('CLI');
  if (evaluatedPatterns.some((pattern) => pattern.id === 'api' && pattern.observed)) stack.add('API');
  if (evaluatedPatterns.some((pattern) => pattern.id === 'saas' && pattern.observed)) stack.add('SaaS');
  if (evaluatedPatterns.some((pattern) => pattern.id === 'documentation-heavy' && pattern.observed)) stack.add('Documentation');
  if (evaluatedPatterns.some((pattern) => pattern.id === 'automation-heavy' && pattern.observed)) stack.add('Automation');
  if ((signals.workflowFiles ?? []).length > 0) stack.add('GitHub Actions');
  if (signals.dockerfile || signals.composeFile) stack.add('Docker');
  if ((extraSurface ?? []).length > 0) stack.add('Shared code roots');

  return [...stack];
}

function buildLegacyPatterns(evaluatedPatterns) {
  return evaluatedPatterns
    .filter((pattern) => pattern.observed)
    .map((pattern) => ({
      id: pattern.id,
      title: pattern.name,
      evidence: pattern.evidence_summary,
      implication: pattern.benefits[0] || 'Pattern observada localmente.',
    }));
}

function buildPatternSuggestionPayload(pattern, analysis) {
  return {
    id: pattern.id,
    kind: 'pattern',
    name: pattern.name,
    confidence: pattern.confidence,
    confidence_score: pattern.score,
    observed: pattern.observed,
    recommended: pattern.recommended,
    applies_when: pattern.applies_when,
    matched_conditions: pattern.matched_conditions,
    evidence: pattern.evidence,
    evidence_summary: pattern.evidence_summary,
    benefits: pattern.benefits,
    tradeoffs: pattern.tradeoffs,
    detected_stack: analysis.detectedStack,
    recommended_context_files: pattern.recommended_context_files,
    recommended_agents: pattern.recommended_agents,
    recommended_skills: pattern.recommended_skills,
    recommended_flows: pattern.recommended_flows,
    catalog_path: 'templates/agentforge/patterns/catalog.yaml',
  };
}

function buildPatternReport(analysis, { onlineRequested = false } = {}) {
  const lines = [];
  lines.push('# AgentForge Pattern Research');
  lines.push('');
  if (onlineRequested) {
    lines.push('> Online research is not configured yet; using local pattern catalog.');
    lines.push('');
  }

  lines.push('## Project');
  lines.push('');
  lines.push(`- Project: ${analysis.signals.projectName || basename(analysis.projectRoot)}`);
  lines.push(`- Package manager: ${analysis.signals.packageManager}`);
  lines.push(`- Project type: ${analysis.signals.projectType || 'unknown'}`);
  lines.push('');

  lines.push('## Stack detected');
  lines.push('');
  if (analysis.detectedStack.length === 0) {
    lines.push('- No stable stack signals detected.');
  } else {
    for (const item of analysis.detectedStack) {
      lines.push(`- ${item}`);
    }
  }
  lines.push('');

  lines.push('## Observed patterns');
  lines.push('');
  if (analysis.observedPatterns.length === 0) {
    lines.push('- No strong local pattern match found.');
  } else {
    for (const pattern of analysis.observedPatterns) {
      lines.push(`### ${pattern.name}`);
      lines.push('');
      lines.push(`- Id: ${pattern.id}`);
      lines.push(`- Confidence: ${pattern.confidence} (${pattern.score.toFixed(2)})`);
      if (pattern.applies_when.length > 0) {
        lines.push(`- Applies when: ${pattern.applies_when.join(', ')}`);
      }
      lines.push(`- Evidence:`);
      for (const item of pattern.evidence.length > 0 ? pattern.evidence : [{ path: 'none', snippet: 'No direct evidence found.' }]) {
        lines.push(`  - [${item.path}] ${item.snippet}`);
      }
      lines.push('');
    }
  }

  lines.push('## Recommended patterns');
  lines.push('');
  if (analysis.recommendedPatterns.length === 0) {
    lines.push('- No pattern crossed the recommendation threshold.');
  } else {
    for (const pattern of analysis.recommendedPatterns) {
      lines.push(`### ${pattern.name}`);
      lines.push('');
      lines.push(`- Id: ${pattern.id}`);
      lines.push(`- Confidence: ${pattern.confidence} (${pattern.score.toFixed(2)})`);
      lines.push(`- Evidence:`);
      for (const item of pattern.evidence.length > 0 ? pattern.evidence : [{ path: 'none', snippet: 'No direct evidence found.' }]) {
        lines.push(`  - [${item.path}] ${item.snippet}`);
      }
      if (pattern.benefits.length > 0) {
        lines.push(`- Benefits:`);
        for (const benefit of pattern.benefits) {
          lines.push(`  - ${benefit}`);
        }
      }
      if (pattern.tradeoffs.length > 0) {
        lines.push(`- Tradeoffs:`);
        for (const tradeoff of pattern.tradeoffs) {
          lines.push(`  - ${tradeoff}`);
        }
      }
      if (pattern.recommended_context_files.length > 0) {
        lines.push(`- Recommended context files: ${pattern.recommended_context_files.join(', ')}`);
      }
      if (pattern.recommended_agents.length > 0) {
        lines.push(`- Recommended agents: ${pattern.recommended_agents.join(', ')}`);
      }
      if (pattern.recommended_skills.length > 0) {
        lines.push(`- Recommended skills: ${pattern.recommended_skills.join(', ')}`);
      }
      if (pattern.recommended_flows.length > 0) {
        lines.push(`- Recommended flows: ${pattern.recommended_flows.join(', ')}`);
      }
      lines.push('');
    }
  }

  lines.push('## Summary');
  lines.push('');
  lines.push(`- Observed patterns: ${analysis.observedPatterns.length}`);
  lines.push(`- Recommended patterns: ${analysis.recommendedPatterns.length}`);
  lines.push(`- Catalog path: ${analysis.catalogPath}`);
  lines.push('');

  return `${lines.join('\n').trimEnd()}\n`;
}

function loadPatternCatalog() {
  const raw = readText(PATTERN_CATALOG_PATH);
  if (!raw.trim()) {
    return { version: 1, description: '', patterns: [] };
  }

  const parsed = YAML.parse(raw);
  if (!parsed || !Array.isArray(parsed.patterns)) {
    return { version: 1, description: '', patterns: [] };
  }

  return parsed;
}

function detectPatternAnalysis(projectRoot, { state = {}, signals = null, onlineRequested = false } = {}) {
  const projectSignals = signals ?? scanProjectSignals(projectRoot, { state });
  const extraSurface = collectExtraCodeSurface(projectRoot);
  const catalog = loadPatternCatalog();
  const sources = collectResearchSources(projectRoot, projectSignals, extraSurface);
  const corpus = normalizeText(sources.map((source) => `${source.path}\n${source.content}`).join('\n'));
  const evaluatedPatterns = (catalog.patterns ?? []).map((pattern) => evaluatePattern(pattern, projectSignals, extraSurface, sources, corpus));
  const detectedStack = inferPatternStack(projectSignals, extraSurface, evaluatedPatterns);
  const observedPatterns = evaluatedPatterns.filter((pattern) => pattern.observed);
  const recommendedPatterns = evaluatedPatterns.filter((pattern) => pattern.recommended);
  const legacyPatterns = buildLegacyPatterns(evaluatedPatterns);

  return {
    projectRoot,
    catalogPath: 'templates/agentforge/patterns/catalog.yaml',
    catalog,
    signals: projectSignals,
    extraSurface,
    sources,
    detectedStack,
    patterns: evaluatedPatterns,
    observedPatterns,
    recommendedPatterns,
    legacyPatterns,
    onlineRequested,
  };
}

export function runPatternResearch(projectRoot, options = {}) {
  return detectPatternAnalysis(projectRoot, options);
}

function writePatternSuggestions(writer, projectRoot, analysis) {
  const writtenPaths = [];

  for (const pattern of analysis.recommendedPatterns) {
    const relPath = join(PATTERN_SUGGESTION_DIR, `${pattern.id}.yaml`);
    const payload = buildPatternSuggestionPayload(pattern, analysis);
    writer.writeGeneratedFile(join(projectRoot, relPath), `${YAML.stringify(payload).trim()}\n`, { force: true });
    writtenPaths.push(relPath);
  }

  return writtenPaths;
}

export function persistPatternResearch(projectRoot, analysis) {
  const writer = new Writer(projectRoot);
  const manifest = loadManifest(projectRoot);
  const writtenPaths = [];

  const suggestionPaths = writePatternSuggestions(writer, projectRoot, analysis);
  writtenPaths.push(...suggestionPaths);

  writer.writeGeneratedFile(join(projectRoot, PATTERN_RESEARCH_REPORT_PATH), buildPatternReport(analysis, { onlineRequested: analysis.onlineRequested }), { force: true });
  writtenPaths.push(PATTERN_RESEARCH_REPORT_PATH);

  saveManifest(projectRoot, {
    ...manifest,
    ...buildManifest(projectRoot, writtenPaths),
  });

  return {
    writtenPaths,
  };
}

export function printPatternResearchSummary(analysis) {
  console.log(`  Pattern research saved to ${PATTERN_RESEARCH_REPORT_PATH}`);
  console.log(`  Pattern suggestions: ${analysis.recommendedPatterns.length}`);
  console.log(`  Stack detected: ${analysis.detectedStack.join(', ') || 'none'}`);
}
