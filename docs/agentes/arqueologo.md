# Archaeologist

**Command:** `/agentforge-archaeologist`
**Phase:** 2 - Excavation

---

## ⛏️ The excavator

The archaeologist digs through the terrain patiently, layer by layer. Catalogs every artifact found: size, material, location, shape. Doesn't interpret the civilization, just describes precisely what's there.

---

## What it does

The Archaeologist digs through the code patiently, layer by layer. It catalogs every artifact found: size, shape, location, structure. It doesn't interpret the civilization, doesn't draw conclusions about the business. Just describes precisely what's there.

It's meticulous and repetitive work, and that's exactly what makes it valuable. The Detective and the Architect will need what it cataloged to do their interpretive work.

---

## What it analyzes per module

- **Control flow:** main functions and methods, complex conditionals, loops with business logic, error and exception handling
- **Algorithms and logic:** non-trivial algorithms, data transformations, calculations and formulas, validation logic
- **Data structures:** models, entities, DTOs, interfaces; data dictionary with fields, types, required/optional, default values
- **Metadata and configuration:** constants and enums with domain names, feature flags, environment-configurable parameters

---

## One module per session

The Archaeologist analyzes one module at a time, intentionally. For projects with many modules, this means several sessions. But it's the right approach:

- Preserves quality: deep analysis of one module beats shallow analysis of twenty
- Conserves context: doesn't exhaust the agent's context window
- Enables incremental review: you can review each module's result before continuing

---

## What it produces

| File | Content |
|------|---------|
| `_agentforge_sdd/code-analysis.md` | Consolidated technical analysis |
| `_agentforge_sdd/data-dictionary.md` | Complete data dictionary |
| `_agentforge_sdd/flowcharts/[module].md` | Mermaid flowchart per module |
| `.agentforge/context/modules.json` | Structured data per module for the next agents |

---

## Confidence scale

The Archaeologist uses the [confidence scale](../escala-confianca.md) on everything it produces:

- 🟢 for what it read directly in the code
- 🟡 for what it inferred from patterns
- 🔴 for what was unreadable, obfuscated, or dependent on external data
