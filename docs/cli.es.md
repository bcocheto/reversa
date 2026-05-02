# CLI

agentforge tiene un CLI simple para gestionar la instalación y el ciclo de vida de los agentes en tu proyecto. Todos los comandos se ejecutan con `npx agentforge` en la raíz del proyecto.

---

## Comandos disponibles

### `install`

```bash
npx agentforge install
```

Instala agentforge en el proyecto heredado actual. Detecta los motores presentes, pregunta tus preferencias y crea toda la estructura necesaria.

Úsalo una vez, en la raíz del proyecto que quieres analizar.

---

### `audit-context`

```bash
npx agentforge audit-context
```

Analiza snapshots importados y entrypoints existentes para diagnosticar la organización del contexto.
Escribe `.agentforge/reports/context-audit.md` y actualiza los metadatos de la auditoría en `.agentforge/state.json`.

Úsalo después de importar snapshots o cuando quieras una vista determinista y read-only de la calidad del contexto.

---

### `refactor-context`

```bash
npx agentforge refactor-context
```

Analiza snapshots importados y entrypoints existentes para separar el contenido en archivos canónicos `.agentforge/`.
Sin `--apply`, escribe solo `.agentforge/reports/refactor-plan.md`.
Con `--apply`, crea o actualiza archivos canónicos seguros y preserva los que fueron editados manualmente.

Úsalo después de la auditoría cuando quieras hacer la primera segmentación del contexto.

---

### `suggest-skills`

```bash
npx agentforge suggest-skills
```

Analiza imports, contexto, package files y la estructura del repositorio para sugerir skills del proyecto.
Escribe `.agentforge/reports/skill-suggestions.md` y sugerencias YAML en `.agentforge/skill-suggestions/`.

Úsalo cuando quieras una shortlist determinista de skills para crear después, no skills finales.

---

### `create-skill`

```bash
npx agentforge create-skill <skill-id>
npx agentforge create-skill <skill-id> --force
```

Crea una skill real a partir de una sugerencia existente en `.agentforge/skill-suggestions/`.
Escribe `.agentforge/skills/<skill-id>/SKILL.md`, actualiza `.agentforge/state.json` y refresca `context-index.yaml` cuando sea posible.

Úsalo después de `suggest-skills` cuando quieras promover una sugerencia a una skill reutilizable.

---

### `status`

```bash
npx agentforge status
```

Muestra el estado actual del análisis: qué fase está en curso, qué agentes ya corrieron, qué falta completar.

Útil para tener una visión rápida antes de retomar una sesión.

---

### `update`

```bash
npx agentforge update
```

Actualiza los agentes a la versión más reciente de agentforge.

El comando es inteligente: verifica el manifiesto SHA-256 de cada archivo y nunca sobreescribe archivos que hayas personalizado.

---

### `add-agent`

```bash
npx agentforge add-agent
```

Agrega un agente específico al proyecto. Útil si no instalaste todos los agentes en la instalación inicial y ahora quieres incluir, por ejemplo, el Data Master o el Design System.

---

### `add-engine`

```bash
npx agentforge add-engine
```

Agrega soporte para un motor de IA que no estaba presente cuando instalaste.

---

### `uninstall`

```bash
npx agentforge uninstall
```

Elimina agentforge del proyecto: borra los archivos creados por la instalación.

!!! info "Tus archivos quedan intactos"
    `uninstall` elimina **solo** lo que agentforge creó. Ningún archivo original del proyecto es tocado. Las especificaciones generadas en `_agentforge_sdd/` también se conservan por defecto.
