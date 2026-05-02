# Por qué existe AgentForge

AgentForge existe porque los proyectos reales necesitan algo mejor que un montón de prompts sueltos y un `AGENTS.md` gigante.

El problema no es solo “código heredado”. El problema es que el contexto se vuelve un caos:

- `AGENTS.md` crece hasta que nadie quiere editarlo.
- `CLAUDE.md` empieza a duplicar las mismas reglas.
- contexto, policies, comandos y workflows se mezclan.
- los humanos no distinguen qué es canónico y qué es derivado.
- los agents reciben demasiado contexto, o el contexto equivocado.

AgentForge resuelve esto organizando el proyecto como una capa agent-ready.

## Qué entrega

- `.agentforge/` como fuente de verdad.
- `harness/` como router de contexto.
- `context-index.yaml` como mapa de carga.
- `skills/` como procedimientos reutilizables.
- `flows/` como workflows repetibles.
- `policies/` como límites que mantienen el trabajo seguro.
- `compile` como la etapa que exporta entrypoints para Codex, Claude Code, Cursor y GitHub Copilot.

## Para quién es

- equipos que quieren una capa agentic local, limpia y predecible
- proyectos donde varios motores necesitan compartir la misma fuente de verdad
- humanos que necesitan mantener la estructura legible con el tiempo
- agents que necesitan el contexto correcto, no todo el contexto

## Lo que no es

AgentForge no es un wrapper genérico de prompts.
No es una herramienta de análisis estático.
No es un dump de specs.

Es un sistema para organizar el trabajo agent-ready para que el proyecto siga siendo comprensible y seguro de evolucionar.
