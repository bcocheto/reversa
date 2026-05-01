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
