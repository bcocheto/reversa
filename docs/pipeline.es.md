# Ciclo de vida

AgentForge ya no trata el proyecto como un dump único de specs. Gestiona un ciclo de vida agent-ready continuo.

---

## Los ciclos principales

### 1. Montar un proyecto nuevo

```bash
npx agentforge install
npx agentforge bootstrap
npx agentforge compile
npx agentforge validate
```

Úsalo cuando empiezas desde un proyecto nuevo y quieres la capa canónica lista desde el primer día.

### 2. Adoptar un proyecto existente

```bash
npx agentforge install
npx agentforge adopt
npx agentforge ingest
npx agentforge audit-context
npx agentforge refactor-context --apply
npx agentforge suggest-skills
npx agentforge compile
npx agentforge validate
```

Úsalo cuando el proyecto ya existe y quieres organizar la superficie agentic actual con seguridad.

### 3. Evolucionar la capa con el tiempo

```bash
npx agentforge add-agent
npx agentforge add-flow
npx agentforge suggest-skills
npx agentforge create-skill run-tests
npx agentforge improve
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
