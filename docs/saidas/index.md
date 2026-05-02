# Generated outputs

AgentForge writes its canonical outputs under `.agentforge/` and, when configured, to a project-specific output folder for spec artifacts.

---

## Canonical outputs

```text
.agentforge/
├── context/
├── references/
├── policies/
├── flows/
├── skills/
├── memory/
├── reports/
├── imports/
└── _config/
```

These folders hold the project memory, audits, reports, canonical docs, and skill suggestions.

---

## Engine exports

`compile` and `export` generate managed bootloaders for:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/agentforge.md`
- `.github/copilot-instructions.md`

Legacy compatibility surfaces like `.cursorrules` can still exist when installed, but the modern compile target for Cursor is `.cursor/rules/agentforge.md`.

---

## What is safe to commit

- `.agentforge/` canonical docs and reports
- managed engine entrypoints
- generated skills and flows
- manifests and state files

If you do not want spec artifacts in git, keep the configured output folder ignored. The canonical layer itself is the source of truth.
