# Ciclo de vida

AgentForge ya no trata el proyecto como un dump único de specs. Gestiona un ciclo de vida agent-ready continuo.

---

## Los ciclos principales

### 1. Montar un proyecto nuevo

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge bootstrap
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

Úsalo cuando empiezas desde un proyecto nuevo y quieres la capa canónica lista desde el primer día.

### 2. Adoptar un proyecto existente

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge adopt
npx @bcocheto/agentforge ingest
npx @bcocheto/agentforge audit-context
npx @bcocheto/agentforge refactor-context --apply
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

Úsalo cuando el proyecto ya existe y quieres organizar la superficie agentic actual con seguridad.

### 3. Evolucionar la capa con el tiempo

```bash
npx @bcocheto/agentforge add-agent
npx @bcocheto/agentforge add-flow
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge improve
```

Úsalo cuando el equipo necesita refinar la capa sin perder lo que ya funciona.

---

## Lo que permanece estable

- `.agentforge/` sigue siendo la fuente de verdad.
- El manifiesto preserva ediciones personalizadas.
- Los bloques gestionados de bootloader mantienen intacto el contenido manual fuera del bloque.
- Los comandos read-only no modifican los archivos originales del proyecto.

---

## Nota histórica

La vieja historia de 5 fases de reverse-engineering sigue existiendo en el archivo legado, pero ya no es la narrativa principal del producto.
