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
npx @bcocheto/agentforge bootstrap
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

### Proyecto existente

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge adopt
npx @bcocheto/agentforge audit-context
npx @bcocheto/agentforge refactor-context --apply
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

### Trabajo continuo

```bash
npx @bcocheto/agentforge add-agent
npx @bcocheto/agentforge add-flow
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge improve
```

---

## Read-only versus comandos que escriben

**Leen los archivos originales sin modificarlos**

- `ingest`
- `adopt`
- `audit-context`

Estos comandos leen señales del proyecto y escriben solo en `.agentforge/`.

**Escriben de forma segura en `.agentforge/` o en entrypoints gestionados**

- `bootstrap`
- `refactor-context --apply`
- `suggest-skills`
- `create-skill`
- `compile`
- `export`
- `update`
- `improve --apply`
- `uninstall`

Estos comandos escriben solo en la capa canónica o en los entrypoints gestionados por AgentForge.

---

## Activar un agente específico manualmente

Si quieres ejecutar un agente directamente, sin pasar por el orquestador:

```
/agentforge-scout
/agentforge-detective
/agentforge-data-master
```

Útil cuando ya hay una sesión en curso y necesitas solo un rol.
