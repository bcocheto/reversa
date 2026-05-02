# Lifecycle

AgentForge no longer treats the project as a one-shot spec dump. It manages a continuous agent-ready lifecycle.

---

## The main loops

### 1. Bootstrap a new project

```bash
npx agentforge install
npx agentforge bootstrap
npx agentforge compile
npx agentforge validate
```

Use this when you are starting from a new project and want the canonical layer ready from day one.

### 2. Adopt an existing project

```bash
npx agentforge install
npx agentforge adopt
npx agentforge ingest
npx agentforge audit-context
npx agentforge refactor-context --apply
npx agentforge suggest-skills
npx agentforge compile
npx agentforge validate
```

Use this when a project already exists and you want to organize the current agentic surface safely.

### 3. Evolve the layer over time

```bash
npx agentforge add-agent
npx agentforge add-flow
npx agentforge suggest-skills
npx agentforge create-skill run-tests
npx agentforge improve
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
