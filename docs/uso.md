# How to use

## Activate AgentForge

After install, open the project in your engine and activate the orchestrator:

=== "Claude Code / Cursor / Gemini CLI"

    ```
    /agentforge
    ```

=== "Codex and engines without slash commands"

    ```
    agentforge
    ```

The orchestrator checks `.agentforge/state.json`, resumes an existing session if one exists, or starts the next safe step for the project.

---

## Common flows

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
npx @bcocheto/agentforge research-patterns
npx @bcocheto/agentforge suggest-agents
npx @bcocheto/agentforge create-agent automation-planner
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge improve
npx @bcocheto/agentforge compile
```

---

## Read-only versus write commands

**Read-only against original project files**

- `analyze`
- `research-patterns`
- `suggest-agents`
- `ingest`
- `adopt`
- `audit-context`

These commands read project signals and write only under `.agentforge/`.

**Safe writes under `.agentforge/` or managed entrypoints**

- `bootstrap`
- `refactor-context --apply`
- `apply-suggestions`
- `suggest-skills`
- `create-skill`
- `create-agent`
- `compile`
- `export`
- `update`
- `improve --apply`
- `uninstall`

These commands write only to the canonical layer or to engine entrypoints managed by AgentForge.

---

## Registry and command discovery

Use the registry when you want the canonical list:

```bash
npx @bcocheto/agentforge commands
npx @bcocheto/agentforge commands --json
npx @bcocheto/agentforge commands --category agents
```

---

## Activating a specific agent manually

If you want to run an agent directly, without going through the orchestrator:

```
/agentforge-scout
/agentforge-detective
/agentforge-data-master
```

Useful when a session is already in progress and you need just one role.
