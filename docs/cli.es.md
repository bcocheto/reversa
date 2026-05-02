# CLI

AgentForge tiene un CLI pequeño para gestionar la capa agent-ready del proyecto. Ejecútalo desde la raíz con `npx @bcocheto/agentforge`.

El registry de comandos está centralizado, así que `agentforge commands` y la ayuda principal siempre quedan sincronizados.

---

## Comandos

| Comando | Qué hace |
|---------|----------|
| `install` | Analiza el repositorio, hace pocas preguntas y prepara la capa canónica. |
| `commands` | Lista todos los comandos con categorías, uso, aliases, writes y nivel de seguridad. |
| `analyze` | Escanea el proyecto y produce reportes y sugerencias consolidados. |
| `research-patterns` | Compara el proyecto con un catálogo local de patrones. |
| `suggest-agents` | Sugiere agentes a partir de la análisis, patrones, docs y señales del proyecto. |
| `create-agent <agent-id>` | Promueve una sugerencia de agente a un agente real. |
| `apply-suggestions` | Promueve sugerencias generadas a artefactos finales con confirmación. |
| `ingest` | Copia snapshots seguros de instrucciones a `.agentforge/imports/` sin tocar los originales. |
| `adopt` | Lee una superficie agentic existente y genera un plan de adopción. |
| `bootstrap` | Completa la base de un proyecto nuevo usando señales reales del repositorio. |
| `audit-context` | Diagnostica la organización del contexto y escribe `.agentforge/reports/context-audit.md`. |
| `refactor-context` | Crea un plan de refactor o, con `--apply`, escribe archivos canónicos en `.agentforge/`. |
| `suggest-skills` | Genera sugerencias de skills a partir de imports, contexto, package files y estructura del repositorio. |
| `create-skill <skill-id>` | Promueve una sugerencia de skill existente a una skill real. |
| `add-agent` | Añade un agente personalizado al proyecto manualmente. |
| `add-flow` | Añade un workflow personalizado manualmente. |
| `add-engine` | Añade soporte para otro motor. |
| `compile` | Actualiza los entrypoints reales del proyecto en los motores configurados. |
| `export` | Alias de `compile`. |
| `export-package` | Genera el paquete aislado `_agentforge/` sin cambiar los entrypoints reales. |
| `validate` | Valida la estructura canónica `.agentforge/` y los entrypoints gestionados. |
| `improve` | Revisa `.agentforge/` y sugiere mejoras más seguras y legibles para humanos. |
| `status` | Muestra el estado actual de AgentForge. |
| `update` | Actualiza los archivos generados preservando ediciones personalizadas. |
| `uninstall` | Elimina de forma segura los archivos gestionados por AgentForge. |
| `export-diagrams` | Exporta diagramas Mermaid cuando la cadena de herramientas está disponible. |

---

## Comandos read-only

Estos comandos leen señales del proyecto sin modificar los archivos originales:

- `analyze`
- `research-patterns`
- `suggest-agents`
- `ingest`
- `adopt`
- `audit-context`

---

## Registry

Usa estos comandos de registry para inspeccionar el catálogo completo:

```bash
npx @bcocheto/agentforge commands
npx @bcocheto/agentforge commands --json
npx @bcocheto/agentforge commands --category agents
```

`--stable` y `--experimental` se pueden combinar con `--category`.

---

## `compile` versus `export`

`export` es alias de `compile`.

Cursor queda estandarizado en `.cursor/rules/agentforge.md`. El archivo legado `.cursorrules` queda solo para compatibilidad en la detección durante la instalación.
