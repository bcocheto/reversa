# Developing from specs

Once agentforge has generated all specs in `_agentforge_sdd/`, you can take those files to any machine and start building the system from scratch. Here is the recommended order.

---

## Before writing a single line of code

Start by reading these three files:

| File | Why read first |
|---|---|
| `_agentforge_sdd/confidence-report.md` | Shows what is high-confidence (green) vs. gaps (red). Avoids building on wrong inferences. |
| `_agentforge_sdd/gaps.md` | Lists what agentforge could not determine. Fill these in manually before starting. |
| `_agentforge_sdd/architecture.md` + C4 diagrams | Shows the big picture: layers, modules, system boundaries. |

---

## Implementation order (bottom-up)

```
1. database/  +  erd-complete.md       (data structures, migrations)
2. domain.md  +  sdd/[core-entities]   (core business rules)
3. sdd/[services] sorted by dependency (use dependencies.md as a guide)
4. openapi/   +  API contracts         (if present)
5. ui/                                 (presentation layer last)
```

---

## Which sdd/ spec comes first

Open `_agentforge_sdd/traceability/code-spec-matrix.md`. It lists each spec and its dependencies.

Implement the specs that depend on nothing else first (leaf nodes in the dependency tree), then work up toward the specs that integrate multiple components.

---

## Keeping traceability alive during development

Use `_agentforge_sdd/traceability/code-spec-matrix.md` as a reference while developing to know which piece of implemented code corresponds to which spec. This keeps traceability accurate as the codebase grows.

---

## See also

- [Generated outputs](saidas/index.md): full list of files produced by agentforge
- [Confidence scale](escala-confianca.md): how to interpret the 🟢🟡🔴 markers in the specs
