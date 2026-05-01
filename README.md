# AgentForge
<small>by bcocheto</small>

AgentForge is a CLI for creating, installing, and maintaining custom agent teams inside a project.
It is inspired by the Reversa workflow, but the goal is different: instead of turning legacy systems into specs, AgentForge creates an operational layer for agents, subagents, flows, policies, memory, and exports.

## The problem

- Isolated agents quickly become loose prompts with no shared structure.
- Real projects need clear roles, reusable flows, guardrails, and persistent memory.
- Teams need a source of truth that engines can read directly.

## The solution

AgentForge creates a canonical `.agentforge/` layer inside the repo.
That layer defines the team, the rules, the flow of work, and the engine-specific exports generated from the same source of truth.

AgentForge keeps a SHA-256 manifest so it can detect when a generated file was edited by hand and preserve those customizations during `update`, `export`, and `uninstall`.

## Install

In the root of the project:

```bash
npx agentforge install
```

Install guides you through:

1. Supported engines
2. Project name
3. How the agents should address the user
4. Project type
5. Main stack
6. The primary goal for the team
7. Initial agents
8. Initial flows
9. Git artifact strategy
10. Chat and document languages

It then creates:

- `.agentforge/state.json`
- `.agentforge/config.toml`
- `.agentforge/plan.md`
- `.agentforge/scope.md`
- `.agentforge/agents/`
- `.agentforge/subagents/`
- `.agentforge/flows/`
- `.agentforge/policies/`
- `.agentforge/memory/`
- `.agentforge/reports/`
- `.agentforge/_config/files-manifest.json`
- `AGENTS.md` for Codex when enabled or selected by default
- `CLAUDE.md` for Claude Code when enabled
- `.cursor/rules/agentforge.md` for Cursor when enabled
- `.github/copilot-instructions.md` for GitHub Copilot when enabled

AgentForge writes generated artifacts and entry files with merge-aware behavior. If an existing file was modified by the user, it is preserved unless you explicitly force an overwrite or a policy allows that change.

**Requirements:** Node.js 18+

## Activate

After installation, open the project in your engine and activate AgentForge:

```text
agentforge
```

Engines that support slash commands can use:

```text
/agentforge
```

## What gets generated

The canonical team lives under `.agentforge/`:

```text
.agentforge/
├── state.json
├── config.toml
├── plan.md
├── scope.md
├── agents/
├── subagents/
├── flows/
├── policies/
├── memory/
├── reports/
└── _config/
    └── files-manifest.json
```

Engine-specific entry files and exports are derived from that structure:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/agentforge.md`
- `.github/copilot-instructions.md`
- `.claude/agents/*.md` when Claude Code agent exports are configured
- `.github/agents/*.md` when GitHub Copilot agent exports are configured

## Concepts

### Agents

Primary roles in the project team, such as orchestrator, product owner, architect, engineer, reviewer, QA, security, and DevOps.

### Subagents

Narrow specialists used only when a flow or policy needs extra focus, such as database, API contract, or security review support.

### Flows

Operational playbooks that describe how the team works, such as feature development, bugfix, refactor, and release.

### Policies

Guardrails that define permissions, protected files, and when human approval is required.

### Memory

Persistent project knowledge, including decisions, conventions, and glossary entries.

### Exports

Derived files generated for supported engines so they can consume the same AgentForge team from their native entry points.

### Manifest

The file hash record used to detect intact, modified, missing, and newly generated files. It is what lets AgentForge preserve manual edits instead of silently overwriting them.

## Commands

```bash
npx agentforge install    # Install AgentForge and create the initial team
agentforge status         # Show the current AgentForge state
agentforge add-agent      # Create a custom project agent
agentforge add-flow       # Create a custom operational flow
agentforge add-engine     # Add support for an engine
agentforge validate       # Validate the .agentforge/ structure
agentforge export         # Generate derived files for configured engines
agentforge update         # Refresh generated files while preserving custom edits
agentforge uninstall      # Remove generated artifacts safely
```

Optional utility:

```bash
agentforge export-diagrams
```

This renders Mermaid diagrams when the diagram toolchain is available.

## Security

- AgentForge does not edit your application source code on its own.
- Generated files are written under `.agentforge/`, engine entry files, and engine exports.
- Existing files are merged or skipped based on manifest state, and modified files are preserved by default.
- `uninstall` removes only files tracked by AgentForge and asks before removing the output folder.
- `validate` writes a report at `.agentforge/reports/validation.md`.

## Example workflow

Create a team for a SaaS project:

```bash
npx agentforge install
```

Choose a SaaS/Web App project, select the initial team, and keep the default flows.

Then verify the structure:

```bash
agentforge validate
```

And export the derived files for your engine:

```bash
agentforge export
```

That gives you a project-local team definition that Codex, Claude Code, Cursor, and GitHub Copilot can read from the same canonical source of truth.

## Roadmap

- More built-in agent templates for common project types
- Richer export targets for additional engines
- Better policy composition and approval workflows
- Import and migration tools for existing `.agentforge/` teams
- Stronger interactive test coverage for install and export flows

## Contributing

Contributions are welcome. Open an issue before submitting a large change.

```bash
git clone <repository-url>
cd <repository-folder>
npm install
```

## License

MIT - see [LICENSE](LICENSE) for details.
