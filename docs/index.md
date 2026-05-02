# AgentForge

**Create, organize, evolve, and compile the agent-ready layer of a project.**

AgentForge gives a project a canonical `.agentforge/` source of truth, a context router, reusable skills, operational flows, policies, memory, and exports for Codex, Claude Code, Cursor, and GitHub Copilot.

---

## The problem

- `AGENTS.md` grows too large.
- `CLAUDE.md` becomes a parallel source of truth.
- Rules are duplicated across engines.
- Context, policies, workflows, and commands get mixed.
- Humans struggle to edit safely.
- Agents receive too much or the wrong context.

---

## The solution

- `.agentforge/` is the source of truth.
- `harness/` routes context.
- `context-index.yaml` controls what loads.
- `skills/` hold reusable procedures.
- `flows/` hold project workflows.
- `policies/` define boundaries.
- `compile` generates managed bootloaders for each engine.

---

## Start here

### New project

```bash
npx agentforge install
npx agentforge bootstrap
npx agentforge compile
npx agentforge validate
```

### Existing project

```bash
npx agentforge install
npx agentforge adopt
npx agentforge audit-context
npx agentforge refactor-context --apply
npx agentforge suggest-skills
npx agentforge compile
npx agentforge validate
```

### Continuous work

```bash
npx agentforge add-agent
npx agentforge add-flow
npx agentforge suggest-skills
npx agentforge create-skill run-tests
npx agentforge improve
```

---

## Security

!!! note "Read-only commands"
    `ingest`, `adopt`, and `audit-context` read project signals without modifying the original files.

!!! note "Managed writes"
    `compile` and `export` write managed bootloader blocks and preserve manual content outside the block. `update` and `uninstall` respect the manifest and modified files.

!!! note "Snapshots stay local"
    Snapshots are stored under `.agentforge/imports/`. Reports are written under `.agentforge/reports/`.

---

## Concepts

- **Harness**: the router that loads the right context at the right time.
- **Context**: canonical project knowledge in `.agentforge/context/`.
- **References**: commands, important files, external docs, and tools.
- **Policies**: protected files, safety limits, and approval rules.
- **Flows**: repeatable workflows for feature, bugfix, refactor, and review work.
- **Skills**: reusable procedures promoted from suggestions.
- **Agents**: the project roles that run the work.
- **Memory**: decisions, conventions, glossary, lessons, and open questions.
- **Reports**: audit, compile, bootstrap, improvement, and validation outputs.
- **Engine exports**: generated entrypoints for Codex, Claude Code, Cursor, and GitHub Copilot.

---

## Legacy

The historical origin story lives in [Historical context](por-que-reversa.md). It is kept for context, but the current product is the agent-ready layer described on this page.
