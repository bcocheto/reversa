# Configuration

AgentForge stores its configuration and analysis state inside `.agentforge/` at the project root.

---

## `.agentforge/` structure

```text
.agentforge/
├── state.json
├── config.toml
├── config.user.toml
├── plan.md
├── imports/
├── context/
├── references/
├── policies/
├── flows/
├── skills/
├── memory/
├── reports/
└── _config/
    ├── manifest.yaml
    └── files-manifest.json
```

---

## `config.toml`

```toml
[project]
name = "my-project"
language = "en"

[output]
folder = "_agentforge_sdd"

[engines]
active = ["claude-code"]
```

---

## `config.user.toml`

```toml
[user]
name = "Your Name"
answer_mode = "chat"  # "chat" or "file"
```

!!! warning "Don't commit"
    Add `config.user.toml` to `.gitignore`. Each teammate can keep personal preferences without affecting the project.

---

## Read-only versus safe writes

**Read original project files without modifying them**

- `ingest`
- `adopt`
- `audit-context`

**Write safely to `.agentforge/` or managed entrypoints**

- `bootstrap`
- `refactor-context --apply`
- `suggest-skills`
- `create-skill`
- `compile`
- `export`
- `update`
- `improve --apply`
- `uninstall`

The commands above write only to the canonical layer or to the entrypoints AgentForge explicitly manages. Application source files stay out of scope.

---

## `state.json`

The state file keeps the current phase, generated artifacts, audit history, and the information needed to resume sessions.

---

## `doc_level`

`bootstrap` and `install` help prepare the project, but the documentation level remains an operational choice. AgentForge stores the value in `.agentforge/state.json` and respects it in later runs.
