import handoff from './handoff.js';

export default async function codexPlan(args = []) {
  console.warn('`codex-plan` is deprecated. Use `agentforge handoff`.');
  return handoff(args);
}
