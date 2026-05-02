# AgentForge

**Crea, organiza, evoluciona y compila la capa agent-ready de un proyecto.**

AgentForge le da al proyecto una fuente de verdad en `.agentforge/`, un router de contexto, skills reutilizables, flows operacionales, policies, memoria y exports para Codex, Claude Code, Cursor y GitHub Copilot.

---

## El problema

- `AGENTS.md` crece demasiado.
- `CLAUDE.md` se vuelve una fuente paralela.
- Las reglas se duplican entre motores.
- Contexto, policies, workflows y comandos quedan mezclados.
- A los humanos les cuesta editar con seguridad.
- Los agents reciben demasiado contexto, o el contexto equivocado.

---

## La solución

- `.agentforge/` es la fuente de verdad.
- `harness/` enruta el contexto.
- `context-index.yaml` define qué cargar.
- `skills/` guardan procedimientos reutilizables.
- `flows/` guardan workflows del proyecto.
- `policies/` definen límites.
- `compile` genera bootloaders gestionados para cada motor.

---

## Empieza aquí

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

## Seguridad

!!! note "Comandos read-only"
    `ingest`, `adopt` y `audit-context` leen las señales del proyecto sin modificar los archivos originales.

!!! note "Escrituras gestionadas"
    `compile` y `export` escriben bloques gestionados de bootloader y preservan el contenido manual fuera del bloque. `update` y `uninstall` respetan el manifiesto y los archivos modificados.

!!! note "Los snapshots quedan locales"
    Los snapshots viven en `.agentforge/imports/`. Los reportes viven en `.agentforge/reports/`.

---

## Conceptos

- **Harness**: el router que carga el contexto correcto en el momento correcto.
- **Context**: conocimiento canónico del proyecto en `.agentforge/context/`.
- **References**: comandos, archivos importantes, docs externas y herramientas.
- **Policies**: archivos protegidos, límites de seguridad y reglas de aprobación.
- **Flows**: workflows repetibles para feature, bugfix, refactor y review.
- **Skills**: procedimientos reutilizables promovidos desde sugerencias.
- **Agents**: los roles del proyecto que ejecutan el trabajo.
- **Memory**: decisiones, convenciones, glosario, lecciones y preguntas abiertas.
- **Reports**: salidas de audit, compile, bootstrap, improve y validation.
- **Engine exports**: entrypoints generados para Codex, Claude Code, Cursor y GitHub Copilot.

---

## Legado

La historia original está en [Contexto histórico](por-que-reversa.md). Conservamos esa página por contexto, pero el producto actual es la capa agent-ready descrita aquí.
