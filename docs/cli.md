# CLI

agentforge has a simple CLI to manage the installation and lifecycle of agents in your project. All commands run with `npx agentforge` in the project root.

---

## Available commands

### `install`

```bash
npx agentforge install
```

Installs agentforge in the current legacy project. Detects present engines, asks for your preferences, and creates the entire required structure.

Use once, in the root of the project you want to analyze.

---

### `ingest`

```bash
npx agentforge ingest
```

Imports safe, explicit agentic instruction files already present in the project into `.agentforge/imports/snapshots/` without touching the originals.

Use this before auditing or refactoring an existing project surface.

---

### `audit-context`

```bash
npx agentforge audit-context
```

Analyzes imported snapshots and existing entrypoints to diagnose context organization.
It writes `.agentforge/reports/context-audit.md` and updates the audit metadata in `.agentforge/state.json`.

Use this after ingesting or when you want a deterministic, read-only overview of context quality.

---

### `refactor-context`

```bash
npx agentforge refactor-context
```

Analyzes imported snapshots and existing entrypoints to split content into canonical `.agentforge/` files.
Without `--apply`, it writes only `.agentforge/reports/refactor-plan.md`.
With `--apply`, it creates or updates safe canonical files and preserves manually modified ones.

Use this after auditing context when you want the first segmentation pass.

---

### `suggest-skills`

```bash
npx agentforge suggest-skills
```

Analyzes imports, context, package files, and repository structure to suggest project skills.
It writes `.agentforge/reports/skill-suggestions.md` and YAML suggestions under `.agentforge/skill-suggestions/`.

Use this when you want a deterministic shortlist of skills to create later, not final skill files.

---

### `create-skill`

```bash
npx agentforge create-skill <skill-id>
npx agentforge create-skill <skill-id> --force
```

Creates a real skill from an existing suggestion in `.agentforge/skill-suggestions/`.
It writes `.agentforge/skills/<skill-id>/SKILL.md`, updates `.agentforge/state.json`, and refreshes `context-index.yaml` when possible.

Use this after `suggest-skills` when you are ready to promote a suggestion into a reusable skill.

---

### `status`

```bash
npx agentforge status
```

Shows the current analysis state: which phase is in progress, which agents have already run, what's left to complete.

Useful for a quick overview before resuming a session.

---

### `update`

```bash
npx agentforge update
```

Updates agents to the latest version of agentforge.

The command is smart: it checks the SHA-256 manifest of each file and never overwrites files you've customized. If you made adjustments to any agent, they stay intact.

---

### `add-agent`

```bash
npx agentforge add-agent
```

Adds a specific agent to the project. Useful if you didn't install all agents during the initial installation and now want to include, for example, Data Master or Design System.

---

### `add-engine`

```bash
npx agentforge add-engine
```

Adds support for an AI engine that wasn't present when you installed. For example: you installed only for Claude Code and now want to add Codex.

---

### `uninstall`

```bash
npx agentforge uninstall
```

Removes agentforge from the project: deletes the files created by the installation (`.agentforge/`, `.agents/skills/agentforge-*/`, engine entry files).

!!! info "Your files stay intact"
    `uninstall` removes **only** what agentforge created. No original project file is touched. Specifications generated in `_agentforge_sdd/` are also preserved by default.
