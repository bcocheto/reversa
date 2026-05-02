# AgentForge
<small>by bcocheto</small>

AgentForge creates, organizes, evolves, and compiles the agent-ready layer of a project.
It is not just a generator of agents. It gives a project a canonical `.agentforge/` source of truth, a context router, reusable skills, operational flows, policies, memory, and engine exports.

## The problem

- `AGENTS.md` grows too large and starts mixing unrelated concerns.
- `CLAUDE.md` becomes a parallel source of truth instead of a thin entrypoint.
- Rules get duplicated across engines and drift apart over time.
- Context, policies, workflows, and commands end up mixed in the same place.
- Humans struggle to edit safely when generated and manual content are tangled.
- Agents receive too much context, or the wrong context, at the wrong time.

## The solution

- `.agentforge/` is the source of truth for the project agent layer.
- `harness/` routes context and keeps the load order explicit.
- `context-index.yaml` maps what should load, when, and why.
- `skills/` hold reusable procedures.
- `flows/` hold project workflows.
- `policies/` define boundaries and approvals.
- `compile` turns the canonical layer into the real engine entrypoints in the project root.
- `export-package` generates an isolated `_agentforge/` package when you explicitly want a portable bundle.

AgentForge keeps a SHA-256 manifest so it can detect when a generated file was edited by hand and preserve those customizations during `update`, `compile`, and `uninstall`.

## Install

In the root of the project:

```bash
npx @bcocheto/agentforge install
```

Install guides you through:

- Setup mode: bootstrap, adopt, or hybrid
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

- `.agentforge/README.md`
- `.agentforge/harness/`
- `.agentforge/context/`
- `.agentforge/references/`
- `.agentforge/skills/`
- `.agentforge/memory/`
- `.agentforge/reports/`
- `.agentforge/state.json`
- `.agentforge/config.toml`
- `.agentforge/plan.md`
- `.agentforge/scope.md`
- `.agentforge/agents/`
- `.agentforge/subagents/`
- `.agentforge/flows/`
- `.agentforge/policies/`
- `.agentforge/_config/files-manifest.json`
- `AGENTS.md` for Codex when enabled or selected by default
- `CLAUDE.md` for Claude Code when enabled
- `.cursorrules` and `.cursor/rules/agentforge.md` for Cursor when enabled
- `.github/copilot-instructions.md` for GitHub Copilot when enabled

After install, `agentforge bootstrap` can complete the human-readable project context,
flow docs, and initial skill guidance for the current repo using real repository signals
such as `package.json`, `README.md`, `docs/`, `src/`, tests, and workflow files.

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

The legacy `reversa` alias is kept for compatibility with existing installs.

## Modes

AgentForge supports three installation modes:

- `bootstrap`: start from a new project and build the initial agent-ready base
- `adopt`: inspect an existing project and import its agentic surface safely
- `hybrid`: do both, when a project has some structure already but still needs a canonical base

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

Engine-specific entry files and bootloaders are derived from that structure:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursorrules`
- `.cursor/rules/agentforge.md`
- `.github/copilot-instructions.md`
- `.claude/agents/*.md` when Claude Code agent exports are configured
- `.github/agents/*.md` when GitHub Copilot agent exports are configured

`compile` updates the real engine entrypoints in the repository root. `export-package` writes the isolated `_agentforge/` bundle without replacing those entrypoints. `export --package` is an explicit shortcut for that same package export.

## Flows

### New project

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge bootstrap
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

### Existing project

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge adopt
npx @bcocheto/agentforge audit-context
npx @bcocheto/agentforge refactor-context --apply
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

### Continuous work

```bash
npx @bcocheto/agentforge add-agent
npx @bcocheto/agentforge add-flow
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge improve
```

## Security

- `ingest`, `adopt`, and `audit-context` read project signals without modifying the original files.
- Snapshots are stored under `.agentforge/imports/`.
- `compile` and `export` write managed bootloader blocks and preserve manual content outside those blocks.
- The manifest preserves customizations and lets `update` and `uninstall` respect modified files.
- `validate` and the report commands write only under `.agentforge/`.

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
npx @bcocheto/agentforge install    # Install AgentForge and create the initial team
agentforge bootstrap      # Complete or refresh the project base
agentforge adopt          # Read existing agentic structure and generate an adoption plan
agentforge improve        # Review the .agentforge/ structure and suggest upgrades
agentforge refactor-context  # Split imported context into canonical .agentforge/ files
agentforge suggest-skills  # Suggest project skills from repo signals
agentforge audit-context  # Diagnose how context is organized
agentforge create-skill <skill-id>  # Create a real skill from an existing suggestion
agentforge status         # Show the current AgentForge state
agentforge add-agent      # Create a custom project agent
agentforge add-flow       # Create a custom operational flow
agentforge add-engine     # Add support for an engine
agentforge validate       # Validate the .agentforge/ structure
agentforge ingest         # Import agentic instruction snapshots into .agentforge/
agentforge compile        # Update the real engine entrypoints in the project root
agentforge export         # Alias of compile
agentforge export-package # Generate the isolated _agentforge/ package
agentforge export --package  # Same as export-package
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
- Generated files are written under `.agentforge/`, engine entry files, and engine bootloaders.
- Existing files are merged or skipped based on manifest state, and modified files are preserved by default.
- `uninstall` removes only files tracked by AgentForge and asks before removing the output folder.
- `validate` writes a report at `.agentforge/reports/validation.md`.

## Example workflow

Create a team for a SaaS project:

```bash
npx @bcocheto/agentforge install
```

Choose a SaaS/Web App project, select the initial team, and keep the default flows.

Then verify the structure:

```bash
agentforge validate
```

And compile the bootloaders and derived files for your engine:

```bash
agentforge compile
```

If you want AgentForge to suggest structural improvements without changing human-owned
content, run:

```bash
agentforge improve
```

`agentforge improve` generates an improvement plan with a simple score and the safest
recommended changes first.

Use `agentforge improve --apply` only for safe structural additions like missing README
files, placeholder documentation, and other small generated scaffolds.

That gives you a project-local team definition that Codex, Claude Code, Cursor, and GitHub Copilot can read from the same canonical source of truth.

## Roadmap

- More built-in agent templates for common project types
- Richer compile targets for additional engines
- Better policy composition and approval workflows
- Import and migration tools for existing `.agentforge/` teams
- Stronger interactive test coverage for install and compile flows

## Contributing

Contributions are welcome. Open an issue before submitting a large change.

```bash
git clone <repository-url>
cd <repository-folder>
npm install
```

## License

MIT - see [LICENSE](LICENSE) for details.
