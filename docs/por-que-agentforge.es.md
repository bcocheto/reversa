# Por qué existe AgentForge

AgentForge existe porque los proyectos reales necesitan algo mejor que un montón de prompts sueltos y un `AGENTS.md` gigante.

El problema no es solo “código heredado”. El problema es que el contexto se vuelve un caos:

- `AGENTS.md` y `CLAUDE.md` crecen hasta que nadie quiere editarlos.
- contexto, policies, comandos y workflows se mezclan.
- cada motor se vuelve una fuente paralela de verdad.
- los humanos no distinguen qué es canónico y qué es derivado.
- los agents reciben demasiado contexto, o el contexto equivocado.
- los proyectos nuevos empiezan sin una base agent-ready clara.
- los proyectos existentes acumulan instrucciones agentic sin una estructura compartida.

AgentForge resuelve esto analizando el proyecto, recomendando qué crear y organizando el resultado como una capa agent-ready local.

## Qué entrega

- `.agentforge/` como fuente de verdad.
- `analyze` como el escaneo del proyecto.
- `research-patterns` como la etapa local de investigación de patrones.
- `suggest-agents`, `suggest-skills` y `apply-suggestions` como la canalización de promoción, con las sugerencias de flows y policies generadas por `analyze`.
- `harness/context-index.yaml` como mapa de carga.
- `skills/` como procedimientos reutilizables.
- `flows/` como workflows repetibles.
- `policies/` como límites que mantienen el trabajo seguro.
- `compile` como la etapa que exporta bootloaders limpios para Codex, Claude Code, Cursor, Gemini y GitHub Copilot.

## Para quién es

- equipos que quieren una capa agentic local, limpia y predecible
- proyectos donde varios motores necesitan compartir la misma fuente de verdad
- humanos que necesitan mantener la estructura legible con el tiempo
- agents que necesitan el contexto correcto, no todo el contexto
- proyectos que necesitan roles de planificación, automatización, operaciones, datos, conocimiento, soporte, dominio, seguridad, compliance o integración, no solo ingeniería

## Lo que no es

AgentForge no es un wrapper genérico de prompts.
No es solo una herramienta de análisis estático.
No es un dump de specs.

Es un sistema para organizar el trabajo agent-ready para que el proyecto siga siendo comprensible y seguro de evolucionar.
