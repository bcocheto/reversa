# CLI

AgentForge tiene un CLI pequeño para gestionar la capa agent-ready del proyecto. Ejecútalo desde la raíz con `npx @bcocheto/agentforge`.

---

## Comandos

| Comando | Qué hace |
|---------|----------|
| `install` | Crea la base `.agentforge/` y los entrypoints gestionados de los motores. |
| `bootstrap` | Completa la base de un proyecto nuevo usando señales reales del repositorio. |
| `adopt` | Lee una superficie agentic existente y genera un plan de adopción. |
| `ingest` | Copia snapshots seguros de instrucciones a `.agentforge/imports/` sin tocar los originales. |
| `audit-context` | Diagnostica la organización del contexto y escribe `.agentforge/reports/context-audit.md`. |
| `refactor-context` | Crea un plan de refactor o, con `--apply`, escribe archivos canónicos en `.agentforge/`. |
| `suggest-skills` | Genera sugerencias de skills a partir de imports, contexto, package files y estructura del repositorio. |
| `create-skill <skill-id>` | Promueve una sugerencia de skill existente a una skill real. |
| `add-agent` | Añade un agente personalizado al proyecto. |
| `add-flow` | Añade un workflow personalizado. |
| `add-engine` | Añade soporte para otro motor. |
| `compile` / `export` | Genera bootloaders gestionados y archivos derivados para los motores configurados. |
| `validate` | Valida la estructura canónica `.agentforge/` y los entrypoints gestionados. |
| `update` | Actualiza los archivos generados preservando ediciones personalizadas. |
| `improve` | Revisa `.agentforge/` y sugiere mejoras más seguras y legibles para humanos. |
| `status` | Muestra el estado actual de AgentForge. |
| `uninstall` | Elimina de forma segura los archivos gestionados por AgentForge. |

---

## Comandos read-only

Estos comandos leen señales del proyecto sin modificar los archivos originales:

- `ingest`
- `adopt`
- `audit-context`

---

## `compile` versus `export`

`export` es alias de `compile`.

Cursor queda estandarizado en `.cursor/rules/agentforge.md`. El archivo legado `.cursorrules` queda solo para compatibilidad en la detección durante la instalación.
