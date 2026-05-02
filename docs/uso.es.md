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
npx agentforge install
npx agentforge bootstrap
npx agentforge compile
npx agentforge validate
```

### Proyecto existente

```bash
npx agentforge install
npx agentforge adopt
npx agentforge audit-context
npx agentforge refactor-context --apply
npx agentforge suggest-skills
npx agentforge compile
npx agentforge validate
```

### Trabajo continuo

```bash
npx agentforge add-agent
npx agentforge add-flow
npx agentforge suggest-skills
npx agentforge create-skill run-tests
npx agentforge improve
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
