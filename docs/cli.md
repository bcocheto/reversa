# CLI

AgentForge has a small CLI for managing the project agent layer. Run it from the project root with `npx @bcocheto/agentforge`.

---

## Commands

| Command | What it does |
|---------|--------------|
| `install` | Creates the `.agentforge/` base and managed engine entrypoints. |
| `bootstrap` | Completes the base for a new project using real repository signals. |
| `adopt` | Reads an existing agentic surface and produces an adoption plan. |
| `ingest` | Copies safe instruction snapshots into `.agentforge/imports/` without touching originals. |
| `audit-context` | Diagnoses context organization and writes `.agentforge/reports/context-audit.md`. |
| `refactor-context` | Creates a refactor plan or, with `--apply`, writes canonical `.agentforge/` files. |
| `suggest-skills` | Generates skill suggestions from imports, context, package files, and repository structure. |
| `create-skill <skill-id>` | Promotes an existing skill suggestion into a real skill. |
| `add-agent` | Adds a custom project agent. |
| `add-flow` | Adds a custom workflow. |
| `add-engine` | Adds support for another engine. |
| `compile` | Updates the real engine entrypoints in the project root. |
| `export` | Alias of `compile`. |
| `export-package` | Generates the isolated `_agentforge/` package without changing the real entrypoints. |
| `validate` | Validates the canonical `.agentforge/` structure and managed entrypoints. |
| `update` | Refreshes generated files while preserving custom edits. |
| `improve` | Reviews `.agentforge/` and suggests safer, more human-friendly improvements. |
| `status` | Shows the current AgentForge state. |
| `uninstall` | Removes AgentForge-managed files safely. |

---

## Read-only commands

These commands read project signals without modifying the original source files:

- `ingest`
- `adopt`
- `audit-context`

---

## `compile` versus `export-package`

`compile` updates the real bootloaders in the repository root. `export-package` generates the isolated `_agentforge/` package.
`export --package` is an explicit shortcut for the same package export.

Cursor is standardized on `.cursor/rules/agentforge.md`. The legacy `.cursorrules` file remains only for compatibility during install-time detection.
