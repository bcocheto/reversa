# Lifecycle

AgentForge no longer treats the project as a one-shot spec dump. It analyzes the repository, recommends structure, and manages a continuous agent-ready lifecycle.

---

## The main loops

### 1. Bootstrap a new project

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge bootstrap
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

Use this when you are starting from a new project and want the canonical layer ready from day one.

### 2. Adopt an existing project

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge adopt
npx @bcocheto/agentforge ingest
npx @bcocheto/agentforge audit-context
npx @bcocheto/agentforge refactor-context --apply
npx @bcocheto/agentforge research-patterns
npx @bcocheto/agentforge suggest-agents
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

Use this when a project already exists and you want to organize the current agentic surface safely.

### 3. Evolve the layer over time

```bash
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge research-patterns
npx @bcocheto/agentforge suggest-agents
npx @bcocheto/agentforge create-agent automation-planner
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge add-agent
npx @bcocheto/agentforge add-flow
npx @bcocheto/agentforge improve
npx @bcocheto/agentforge compile
```

Use this when the team needs to refine the layer without losing what already works.

---

## What stays stable

- `.agentforge/` remains the source of truth.
- The manifest preserves custom edits.
- Managed bootloader blocks keep manual content outside the block intact.
- Read-only commands do not modify the original project files.

---

## Historical note

The old five-phase reverse-engineering story still exists in the legacy archive, but it is no longer the main product narrative.
