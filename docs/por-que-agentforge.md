# Why AgentForge exists

AgentForge exists because real projects need more than loose prompts and a giant `AGENTS.md`.

The problem is not only “legacy code”. The problem is that context becomes unmanageable:

- `AGENTS.md` grows until no one wants to edit it.
- `CLAUDE.md` starts to duplicate the same rules.
- context, policies, commands, and workflows get mixed together.
- humans cannot tell what is canonical and what is derived.
- agents get too much context, or the wrong context.

AgentForge solves that by organizing the project as an agent-ready layer.

## What it gives you

- `.agentforge/` as the source of truth.
- `harness/` as the context router.
- `context-index.yaml` as the loading map.
- `skills/` as reusable procedures.
- `flows/` as repeatable workflows.
- `policies/` as the boundaries that keep work safe.
- `compile` as the export step that produces entrypoints for Codex, Claude Code, Cursor, and GitHub Copilot.

## Who it is for

- teams that want a clean, project-local agent layer
- projects where multiple engines need to share the same source of truth
- humans who need the structure to stay readable over time
- agents that need the right context, not all the context

## What it is not

AgentForge is not a generic prompt wrapper.
It is not a static analysis tool.
It is not a spec dump.

It is a system for organizing agent-ready work so the project stays understandable and safe to evolve.
