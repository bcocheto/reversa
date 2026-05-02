# AgentForge

**Analyze projects, recommend agents, skills, flows and policies, and compile clean bootloaders for AI coding tools.**

AgentForge turns new or existing projects into a canonical `.agentforge/` layer that humans can read, review, and evolve over time.

---

## The problem

- `AGENTS.md` and `CLAUDE.md` grow too large.
- Rules, context, workflows, commands, and policies get mixed.
- Each engine becomes a parallel source of truth.
- Humans struggle to review and edit generated content safely.
- Agents receive too much or the wrong context.
- New projects start without a clear agent-ready base.
- Existing projects accumulate agentic instructions without a shared structure.

---

## The solution

- `.agentforge/` is the source of truth.
- `harness/context-index.yaml` controls what loads, when, and why.
- `analyze` scans the project and produces a consolidated view of stack, patterns, risks, and signals.
- `research-patterns` matches the repo against a local pattern catalog.
- `suggest-agents`, `suggest-skills`, and the flow/policy/context suggestions from `analyze` turn signals into recommendations.
- `apply-suggestions` promotes recommendations in a controlled pass.
- `compile` regenerates managed bootloaders for each engine.
- `validate` and `improve` keep the layer readable and safe.

---

## Start here

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

---

## Security

!!! note "Read-only commands"
    `ingest`, `adopt`, `analyze`, and `audit-context` read project signals without modifying the original files outside `.agentforge/`.

!!! note "Managed writes"
    `compile` and `export` write managed bootloader blocks and preserve manual content outside the block. `compile --takeover-entrypoints` snapshots existing entrypoints before rewriting them. `update`, `apply-suggestions`, and `uninstall` respect the manifest and modified files.

!!! note "Snapshots stay local"
    Snapshots are stored under `.agentforge/imports/`. Reports are written under `.agentforge/reports/`.

---

## Concepts

- **Analysis**: the consolidated project scan that detects stack, framework, architecture, risks, and signals.
- **Pattern research**: an offline catalog-based pass that recommends reusable patterns.
- **Suggestions**: the generated recommendations for agents, skills, flows, policies, and context files.
- **Agents**: project roles across core, engineering, product, planning, automation, operations, data, knowledge, security, compliance, content, domain, support, integration, and quality.
- **Skills**: reusable procedures promoted from suggestions.
- **Flows**: repeatable workflows for feature, bugfix, review, release, and refactor work.
- **Policies**: protected files, safety limits, and approval rules.
- **Harness**: the router that loads the right context at the right time.
- **Context index**: the mapping that decides what loads for each task mode.
- **References**: commands, important files, external docs, and tools.
- **Memory**: decisions, conventions, glossary, lessons, and open questions.
- **Reports**: analysis, suggestions, adoption, compile, bootstrap, improvement, and validation outputs.
- **Engine entry points**: generated bootloaders for Codex, Claude Code, Cursor, Gemini, and GitHub Copilot.
- **Manifest**: the file hash record that lets AgentForge preserve manual edits.

---

## Legacy

The historical origin story lives in [Historical context](por-que-reversa.md). It is kept for context, but the current product is the agent-ready layer described on this page.
