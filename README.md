# AgentForge
<small>by bcocheto</small>

AgentForge is AI-engine driven. The CLI prepares the harness and handoff, while your configured AI engine executes the intelligent workflow.
It works for new projects and existing projects, and it keeps evolving the same canonical layer over time.

## The problem

- `AGENTS.md` and `CLAUDE.md` grow too large and start mixing unrelated concerns.
- Rules, context, workflows, commands, and policies end up tangled together.
- Each engine drifts toward a parallel source of truth instead of a thin bootloader.
- Humans struggle to review and edit safely when generated and manual content are mixed.
- Agents receive too much context, or the wrong context, at the wrong time.
- New projects start without a clear agent-ready base.
- Existing projects accumulate agentic instructions without a shared structure.

## The solution

- `.agentforge/` is the canonical source of truth for the project agent layer.
- `.agentforge/ai/` stores engine-agnostic playbooks plus engine-specific notes.
- `harness/context-index.yaml` manages what context loads, when, and why.
- `analyze` scans the project and builds a consolidated view of stack, architecture, patterns, risks, and signals.
- `research-patterns` evaluates a local pattern catalog against the detected project evidence.
- `suggest-agents`, `suggest-skills`, and the flow/policy/context suggestions from `analyze` turn signals into recommendations.
- `apply-suggestions` promotes recommendations in a controlled way.
- `compile` regenerates clean engine bootloaders from the canonical layer.
- `handoff` prepares the next intelligent phase for the active AI engine.
- `validate` and `improve` keep the layer readable, safe, and consistent.
- `export-package` generates an isolated `_agentforge/` bundle when you explicitly want a portable copy.

AgentForge keeps a SHA-256 manifest so it can detect when a generated file was edited by hand and preserve those customizations during `update`, `compile`, `apply-suggestions`, and `uninstall`.

## Install

In the root of the project:

```bash
npx @bcocheto/agentforge install
```

The installer asks for:

- new project or existing project
- engines
- project name
- user name
- git strategy
- chat language
- document language

AgentForge infers the rest from the repository:

- stack
- framework
- probable architecture
- agents
- flows
- skills
- patterns
- entrypoints to regenerate

The install flow shows a summary before it writes anything. If you approve it, AgentForge creates or refreshes the `.agentforge/` layer, prepares `.agentforge/ai/`, takes over existing entrypoints as managed bootloaders, and validates the result. If you do not approve it, it still produces reports and suggestions only under `.agentforge/`.

**Requirements:** Node.js 18+

## Activate

After installation, open the project in your configured AI engine and activate AgentForge:

```text
agentforge
```

Engines that support slash commands can use:

```text
/agentforge
```

Use the handoff command to prepare the next intelligent phase for a specific engine:

```bash
npx @bcocheto/agentforge handoff --engine codex
npx @bcocheto/agentforge handoff --engine claude
npx @bcocheto/agentforge handoff --engine gemini
```

The legacy `reversa` alias is kept for compatibility with existing installs, but the product narrative is now centered on analysis, suggestions, promotion, handoff, and compilation.

## Modes

AgentForge supports two user-facing installation modes:

- `bootstrap`: start from a new project and build the initial agent-ready base
- `adopt`: inspect an existing project and reorganize its agentic surface safely

`hybrid` remains supported internally for legacy state normalization, but it is no longer shown in the installer UI.

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
- `GEMINI.md`
- `.cursorrules`
- `.cursor/rules/agentforge.md`
- `.github/copilot-instructions.md`
- `.claude/agents/*.md` when Claude Code agent exports are configured
- `.github/agents/*.md` when GitHub Copilot agent exports are configured
- `.agentforge/ai/README.md`
- `.agentforge/ai/playbooks/*.md`
- `.agentforge/ai/engines/*.md`

`compile` updates the real engine entrypoints in the repository root. `compile --takeover-entrypoints` snapshots existing entrypoints first and then rewrites them as managed bootloaders. `export-package` writes the isolated `_agentforge/` bundle without replacing those entrypoints. `export --package` is an explicit shortcut for that same package export.

## Analysis

`analyze` scans the project before you create or modify agents, skills, flows, policies, or context. It detects the stack, package manager, framework, architecture, risks, automation signals, product signals, integration and data signals, and whether the project already has agentic surfaces.

It writes:

- `.agentforge/reports/project-analysis.md`
- `.agentforge/reports/analysis-plan.md`
- `.agentforge/suggestions/agents/*.yaml`
- `.agentforge/suggestions/skills/*.yaml`
- `.agentforge/suggestions/flows/*.yaml`
- `.agentforge/suggestions/policies/*.yaml`
- `.agentforge/suggestions/context/*.yaml`

## Pattern Research

`research-patterns` is offline by default. It uses a local pattern catalog to match the repository against known patterns such as Node.js, TypeScript, NestJS, Next.js, React, Python, Docker, GitHub Actions, monorepo, API, CLI, SaaS, documentation-heavy, and automation-heavy projects.

It writes:

- `.agentforge/reports/pattern-research.md`
- `.agentforge/suggestions/patterns/*.yaml`

## Suggestions

Suggestions are the bridge between analysis and final artifacts.

- `suggest-agents` recommends team roles beyond engineering, including planning, automation, operations, data, knowledge, domain, security, compliance, support, integration, and quality.
- `suggest-skills` recommends reusable skills from the project surface.
- Flow and policy suggestions come from `analyze` and are promoted with `apply-suggestions`.

### Agents

Agents are project roles, not just software developers. Common categories include:

- `core`
- `engineering`
- `product`
- `planning`
- `automation`
- `operations`
- `data`
- `knowledge`
- `security`
- `compliance`
- `content`
- `domain`
- `support`
- `integration`
- `quality`

Examples:

- `automation-planner`
- `workflow-automation-designer`
- `operations-coordinator`
- `release-coordinator`
- `data-analyst`
- `documentation-curator`
- `knowledge-manager`
- `domain-specialist`
- `support-ops`
- `integration-specialist`
- `security-reviewer`
- `compliance-reviewer`

### Skills

Skills are reusable procedures, such as running tests, reviewing changes, diagnosing CI, updating docs, or handling migrations.

### Flows

Flows are repeatable playbooks such as feature development, bugfix, review, release, and refactor.

### Policies

Policies define safe-by-default behavior, protected files, and human approval gates.

## Flows

### New project

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

### Existing project

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge adopt --apply
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

### Continuous work

```bash
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge suggest-agents
npx @bcocheto/agentforge create-agent automation-planner
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge improve
npx @bcocheto/agentforge compile
```

## Security

- `ingest`, `adopt`, `analyze`, and `audit-context` read project signals without modifying the original files outside `.agentforge/`.
- `ingest` and `adopt` preserve snapshots before takeover.
- `compile` and `export` write managed bootloader blocks and preserve manual content outside those blocks.
- `compile --takeover-entrypoints` snapshots existing entrypoints before rewriting them as bootloaders.
- `.agentforge/` is the source of truth for generated agent-ready content.
- The manifest detects customizations and lets `update`, `apply-suggestions`, `compile`, and `uninstall` respect modified files.
- `apply-suggestions` is controlled and only promotes explicit suggestions.
- `validate` and the report commands write only under `.agentforge/`.

## Concepts

### Analysis

The project scan that consolidates stack, framework, architecture, commands, risks, and signals before suggestions are generated.

### Pattern Research

An offline, deterministic pass over a local catalog that recommends patterns, context files, agents, skills, and flows.

### Suggestions

Generated recommendations that can be reviewed, promoted, or ignored without touching application source code.

### Agents

Project roles, including core, engineering, product, planning, automation, operations, data, knowledge, security, compliance, content, domain, support, integration, and quality roles.

### Skills

Reusable procedures promoted from suggestions into `.agentforge/skills/`.

### Flows

Repeatable playbooks for feature work, bugfixes, review, release, and refactor paths.

### Policies

Guardrails that define permissions, protected files, and when human approval is required.

### Harness

The routing layer that decides what context loads, in what order, and for which task mode.

### Context Index

The file that maps context files to task modes and determines which files are relevant for a session.

### References

The index of commands, important files, external docs, and tools that make the layer easier to navigate.

### Memory

Persistent project knowledge, including decisions, conventions, glossary entries, and lessons learned.

### Reports

Human-readable outputs that explain analysis, suggestions, adoption, compilation, validation, and improvement decisions.

### Engine Entry Points

The thin bootloaders written to `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/agentforge.md`, and `.github/copilot-instructions.md`.

### Manifest

The file hash record used to detect intact, modified, missing, and newly generated files. It lets AgentForge preserve manual edits instead of silently overwriting them.

## Commands

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge commands
npx @bcocheto/agentforge commands --json
npx @bcocheto/agentforge commands --category agents
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge research-patterns
npx @bcocheto/agentforge suggest-agents
npx @bcocheto/agentforge create-agent automation-planner
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge ingest
npx @bcocheto/agentforge adopt
npx @bcocheto/agentforge bootstrap
npx @bcocheto/agentforge audit-context
npx @bcocheto/agentforge refactor-context
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge add-agent
npx @bcocheto/agentforge add-flow
npx @bcocheto/agentforge add-engine
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge export
npx @bcocheto/agentforge export-package
npx @bcocheto/agentforge validate
npx @bcocheto/agentforge improve
npx @bcocheto/agentforge status
npx @bcocheto/agentforge update
npx @bcocheto/agentforge uninstall
npx @bcocheto/agentforge export-diagrams
```

## Security

- AgentForge does not edit your application source code on its own.
- Generated files are written under `.agentforge/`, engine entry files, and engine bootloaders.
- Existing files are merged or skipped based on manifest state, and modified files are preserved by default.
- `uninstall` removes only files tracked by AgentForge and asks before removing the output folder.
- `validate` writes a report at `.agentforge/reports/validation.md`.

## Example workflow

Create a team for a new project:

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

AgentForge analyzes the project, suggests the initial team and supporting structure, and then compiles the bootloaders for your engines.

For an existing project:

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge adopt --apply
npx @bcocheto/agentforge validate
```

Then evolve continuously:

```bash
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge suggest-agents
npx @bcocheto/agentforge create-agent automation-planner
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge improve
npx @bcocheto/agentforge compile
```

`agentforge improve` still generates a reviewable improvement plan for the canonical layer, while `analyze`, `research-patterns`, `suggest-agents`, and `suggest-skills` focus on understanding and expanding the project agent surface.

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
