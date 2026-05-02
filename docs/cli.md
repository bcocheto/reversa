# CLI

AgentForge has a small CLI for managing the project agent layer. Run it from the project root with `npx @bcocheto/agentforge`.

The command registry is centralized, so `agentforge commands` and the main help output stay in sync.

---

## Commands

| Command | What it does |
|---------|--------------|
| `install` | Analyzes the repository, asks a short onboarding set, and prepares the canonical layer. |
| `commands` | Lists all commands with categories, usage, aliases, write impact, and safety level. |
| `analyze` | Scans the project and produces consolidated reports and suggestions. |
| `research-patterns` | Matches the project against a local pattern catalog. |
| `suggest-agents` | Suggests agents from analysis, patterns, docs, and project signals. |
| `create-agent <agent-id>` | Promotes an existing agent suggestion into a real agent. |
| `apply-suggestions` | Promotes generated suggestions into final artifacts with confirmation. |
| `ingest` | Copies safe instruction snapshots into `.agentforge/imports/` without touching originals. |
| `adopt` | Reads an existing agentic surface and produces an adoption plan. |
| `bootstrap` | Completes the base for a new project using real repository signals. |
| `audit-context` | Diagnoses context organization and writes `.agentforge/reports/context-audit.md`. |
| `refactor-context` | Creates a refactor plan or, with `--apply`, writes canonical `.agentforge/` files. |
| `suggest-skills` | Generates skill suggestions from imports, context, package files, and repository structure. |
| `create-skill <skill-id>` | Promotes an existing skill suggestion into a real skill. |
| `add-agent` | Adds a custom project agent manually. |
| `add-flow` | Adds a custom workflow manually. |
| `add-engine` | Adds support for another engine. |
| `compile` | Updates the real engine entrypoints in the project root. |
| `export` | Alias of `compile`. |
| `export-package` | Generates the isolated `_agentforge/` package without changing the real entrypoints. |
| `validate` | Validates the canonical `.agentforge/` structure and managed entrypoints. |
| `improve` | Reviews `.agentforge/` and suggests safer, more human-friendly improvements. |
| `status` | Shows the current AgentForge state. |
| `update` | Refreshes generated files while preserving custom edits. |
| `uninstall` | Removes AgentForge-managed files safely. |
| `export-diagrams` | Exports Mermaid diagrams when the diagram toolchain is available. |

---

## Read-only commands

These commands read project signals without modifying the original source files:

- `analyze`
- `research-patterns`
- `suggest-agents`
- `ingest`
- `adopt`
- `audit-context`

---

## Registry

Use these registry commands to inspect the full command catalog:

```bash
npx @bcocheto/agentforge commands
npx @bcocheto/agentforge commands --json
npx @bcocheto/agentforge commands --category agents
```

`--stable` and `--experimental` can be combined with `--category` to narrow the output.

---

## `compile` versus `export-package`

`compile` updates the real bootloaders in the repository root. `export-package` generates the isolated `_agentforge/` package.
`export --package` is an explicit shortcut for the same package export.

Cursor is standardized on `.cursor/rules/agentforge.md`. The legacy `.cursorrules` file remains only for compatibility during install-time detection.
