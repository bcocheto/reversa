# Architect

**Command:** `/agentforge-architect`
**Phase:** 3 - Interpretation

---

## 📐 The cartographer

The cartographer visits a territory and produces formal maps: floor plan, elevation map, structural plan. Someone who never set foot there can understand everything just by looking at the maps.

---

## What it does

The Architect visits the excavated and interpreted territory and produces formal maps. The idea is that someone who has never set foot in the project can understand the complete structure just by looking at what the Architect produced.

It works alongside the Detective in Phase 3. While the Detective extracts the *why* (business rules, decisions), the Architect synthesizes the *how* (structure, components, integrations).

---

## What it produces

### C4 diagrams

The Architect generates all three levels of the C4 model:

**Context (Level 1):** the system at the center, users around it, external systems it integrates with, and communication protocols.

**Containers (Level 2):** applications, services, databases, queues, and caches, with the technology of each and how they communicate with each other.

**Components (Level 3):** for the most relevant containers, the internal components and their responsibilities.

All diagrams are generated in Mermaid, ready to render in any Markdown.

### Full ERD

All entities with main attributes, relationships with cardinalities (1:1, 1:N, N:M), primary and foreign keys. In Mermaid (`erDiagram`).

### External integrations

REST/GraphQL APIs consumed and produced, webhooks, events, messages, protocols, and data formats.

### Technical debt

Duplicated code, inconsistent patterns, critically outdated dependencies, and absence of tests in critical modules.

### Spec Impact Matrix

A matrix showing which component impacts which. Useful for knowing the blast radius of a change before making it.

---

## Generated files

| File | Content |
|------|---------|
| `_agentforge_sdd/architecture.md` | Architectural overview |
| `_agentforge_sdd/c4-context.md` | C4 Diagram: Context |
| `_agentforge_sdd/c4-containers.md` | C4 Diagram: Containers |
| `_agentforge_sdd/c4-components.md` | C4 Diagram: Components |
| `_agentforge_sdd/erd-complete.md` | Full ERD in Mermaid |
| `_agentforge_sdd/traceability/spec-impact-matrix.md` | Impact matrix |
