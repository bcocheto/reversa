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

## Read-only versus write commands

**Read-only against original project files**

- `ingest`
- `adopt`
- `audit-context`

These commands read project signals and write only under `.agentforge/`.

**Safe writes under `.agentforge/` or managed entrypoints**

- `bootstrap`
- `refactor-context --apply`
- `suggest-skills`
- `create-skill`
- `compile`
- `export`
- `update`
- `improve --apply`
- `uninstall`

These commands write only to the canonical layer or to engine entrypoints managed by AgentForge.

---

## Activating a specific agent manually

If you want to run an agent directly, without going through the orchestrator:

```
/agentforge-scout
/agentforge-detective
/agentforge-data-master
```

Useful when a session is already in progress and you need just one role.
