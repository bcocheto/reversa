# Cómo usar

## Activar AgentForge

Después de instalar, abre el proyecto en tu motor y activa el orquestador:

=== "Claude Code / Cursor / Gemini CLI"

    ```
    /agentforge
    ```

=== "Codex y motores sin slash commands"

    ```
    agentforge
    ```

El orquestador verifica `.agentforge/state.json`, reanuda la sesión existente si hay una, o inicia el siguiente paso seguro para el proyecto.

---

## Flujos comunes

### Proyecto nuevo

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

### Proyecto existente

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge adopt --apply
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

### Trabajo continuo

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

## Read-only versus comandos que escriben

**Leen los archivos originales sin modificarlos**

- `analyze`
- `research-patterns`
- `suggest-agents`
- `ingest`
- `adopt`
- `audit-context`

Estos comandos leen señales del proyecto y escriben solo en `.agentforge/`.

**Escriben de forma segura en `.agentforge/` o en entrypoints gestionados**

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

Estos comandos escriben solo en la capa canónica o en los entrypoints gestionados por AgentForge.

---

## Registry y descubrimiento

Usa el registry cuando quieras la lista canónica:

```bash
npx @bcocheto/agentforge commands
npx @bcocheto/agentforge commands --json
npx @bcocheto/agentforge commands --category agents
```

---

## Activar un agente específico manualmente

Si quieres ejecutar un agente directamente, sin pasar por el orquestador:

```
/agentforge-scout
/agentforge-detective
/agentforge-data-master
```

Útil cuando ya hay una sesión en curso y necesitas solo un rol.
