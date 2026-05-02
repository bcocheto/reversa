# AgentForge

**Analiza proyectos, recomienda agentes, skills, flows y policies, y compila bootloaders limpios para herramientas de codificación con IA.**

AgentForge convierte proyectos nuevos o existentes en una capa canónica `.agentforge/` que humanos pueden leer, revisar y evolucionar con el tiempo.

---

## El problema

- `AGENTS.md` y `CLAUDE.md` crecen demasiado.
- Las reglas, el contexto, los workflows, los comandos y las policies quedan mezclados.
- Cada motor se vuelve una fuente paralela de verdad.
- A los humanos les cuesta revisar y editar contenido generado con seguridad.
- Los agents reciben demasiado contexto, o el contexto equivocado.
- Los proyectos nuevos empiezan sin una base agent-ready clara.
- Los proyectos existentes acumulan instrucciones agentic sin una estructura compartida.

---

## La solución

- `.agentforge/` es la fuente de verdad.
- `harness/context-index.yaml` controla qué se carga, cuándo y por qué.
- `analyze` escanea el proyecto y produce una visión consolidada de stack, patrones, riesgos y señales.
- `research-patterns` cruza el repositorio con un catálogo local de patrones.
- `suggest-agents`, `suggest-skills` y las sugerencias de flows/policies/contexto generadas por `analyze` convierten señales en recomendaciones.
- `apply-suggestions` promueve las recomendaciones en un paso controlado.
- `compile` regenera bootloaders gestionados para cada motor.
- `validate` e `improve` mantienen la capa legible y segura.

---

## Empieza aquí

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

## Seguridad

!!! note "Comandos read-only"
    `ingest`, `adopt`, `analyze` y `audit-context` leen las señales del proyecto sin modificar los archivos originales fuera de `.agentforge/`.

!!! note "Escrituras gestionadas"
    `compile` y `export` escriben bloques gestionados de bootloader y preservan el contenido manual fuera del bloque. `compile --takeover-entrypoints` preserva snapshots antes de reescribir entrypoints existentes. `update`, `apply-suggestions` y `uninstall` respetan el manifiesto y los archivos modificados.

!!! note "Los snapshots quedan locales"
    Los snapshots viven en `.agentforge/imports/`. Los reportes viven en `.agentforge/reports/`.

---

## Conceptos

- **Analysis**: el escaneo consolidado del proyecto que detecta stack, framework, arquitectura, riesgos y señales.
- **Pattern research**: una etapa offline basada en un catálogo local que recomienda patrones reutilizables.
- **Suggestions**: recomendaciones generadas para agentes, skills, flows, policies y context files.
- **Agents**: roles del proyecto en core, engineering, product, planning, automation, operations, data, knowledge, security, compliance, content, domain, support, integration y quality.
- **Skills**: procedimientos reutilizables promovidos desde sugerencias.
- **Flows**: workflows repetibles para feature, bugfix, review, release y refactor.
- **Policies**: archivos protegidos, límites de seguridad y reglas de aprobación.
- **Harness**: el router que carga el contexto correcto en el momento correcto.
- **Context index**: el mapa que decide qué se carga para cada modo de tarea.
- **References**: comandos, archivos importantes, docs externas y herramientas.
- **Memory**: decisiones, convenciones, glosario, lecciones y preguntas abiertas.
- **Reports**: salidas de analysis, suggestions, adopt, compile, bootstrap, improve y validation.
- **Engine entry points**: bootloaders generados para Codex, Claude Code, Cursor, Gemini y GitHub Copilot.
- **Manifest**: el registro de hash que permite a AgentForge preservar ediciones manuales.

---

## Legado

La historia original está en [Contexto histórico](por-que-reversa.md). Conservamos esa página por contexto, pero el producto actual es la capa agent-ready descrita aquí.
