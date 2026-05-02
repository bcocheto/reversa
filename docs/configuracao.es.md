# Configuración

AgentForge guarda su configuración y estado del análisis dentro de `.agentforge/` en la raíz del proyecto.

---

## Estructura de `.agentforge/`

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
name = "mi-proyecto"
language = "es"

[output]
folder = "_agentforge_sdd"

[engines]
active = ["claude-code"]
```

---

## `config.user.toml`

```toml
[user]
name = "Tu Nombre"
answer_mode = "chat"  # "chat" o "file"
```

!!! warning "No commitear"
    Agrega `config.user.toml` al `.gitignore`. Cada miembro del equipo puede mantener preferencias personales sin afectar al proyecto.

---

## Read-only versus escrituras seguras

**Leen los archivos originales sin modificarlos**

- `ingest`
- `adopt`
- `audit-context`

**Escriben con seguridad en `.agentforge/` o en entrypoints gestionados**

- `bootstrap`
- `refactor-context --apply`
- `suggest-skills`
- `create-skill`
- `compile`
- `export`
- `update`
- `improve --apply`
- `uninstall`

Los comandos anteriores escriben solo en la capa canónica o en los entrypoints que AgentForge gestiona explícitamente. El código de la aplicación queda fuera del alcance.

---

## `state.json`

El archivo de estado guarda la fase actual, los artefactos generados, el historial de auditorías y la información necesaria para retomar sesiones.

---

## `doc_level`

`bootstrap` y `install` ayudan a preparar el proyecto, pero el nivel de documentación sigue siendo una decisión operativa. AgentForge guarda el valor en `.agentforge/state.json` y lo respeta en ejecuciones posteriores.
