# Generated outputs

Everything agentforge produces goes to the `_agentforge_sdd/` folder (or whatever name you configure in `config.toml`). The legacy project is never touched.

The set of artifacts generated depends on the **documentation level** chosen at the start of the analysis:

| Legend | Level |
|--------|-------|
| *(all)* | Generated at all 3 levels |
| *(complete+)* | Only at `complete` and `detailed` levels |
| *(detailed)* | Only at `detailed` level |

---

## Full structure

```
_agentforge_sdd/
├── inventory.md              # Project inventory — all levels
├── dependencies.md           # Dependencies with versions — all levels
├── code-analysis.md          # Technical analysis per module — all levels
├── data-dictionary.md        # Complete data dictionary — complete+
├── domain.md                 # Glossary and business rules — all levels
├── state-machines.md         # State machines in Mermaid — complete+
├── permissions.md            # Permission matrix — complete+
├── architecture.md           # General architectural overview — all levels
├── c4-context.md             # C4 Diagram: Context — all levels
├── c4-containers.md          # C4 Diagram: Containers — complete+
├── c4-components.md          # C4 Diagram: Components — complete+
├── erd-complete.md           # Full ERD in Mermaid — complete+
├── deployment.md             # Infrastructure diagram — detailed only
├── confidence-report.md      # Confidence report 🟢🟡🔴 — all levels
├── gaps.md                   # Unresolved gaps — complete+
├── questions.md              # Human validation questions — all levels
├── sdd/                      # Specs per component — all levels
│   └── [component].md
│
├── openapi/                  # API specs — complete+
│   └── [api].yaml
│
├── user-stories/             # User stories — complete+
│   └── [flow].md
│
├── adrs/                     # Retroactive architectural decisions — complete+
│   └── [number]-[title].md
│
├── flowcharts/               # Mermaid flowcharts — complete+
│   └── [module].md
│
├── ui/                       # Interface specs (Visor)
│   ├── inventory.md
│   ├── flow.md
│   └── screens/
│       └── [screen].md
│
├── database/                 # Database specs (Data Master)
│   ├── erd.md
│   ├── data-dictionary.md
│   ├── relationships.md
│   ├── business-rules.md
│   └── procedures.md
│
├── design-system/            # Design tokens (Design System)
│   ├── color-palette.md
│   ├── typography.md
│   ├── spacing.md
│   ├── tokens.md
│   └── design-system.md
│
└── traceability/
    ├── spec-impact-matrix.md # Which spec impacts which — complete+
    └── code-spec-matrix.md   # Code file to corresponding spec — complete+
```

---

## Traceability

Two files connect everything:

**`traceability/code-spec-matrix.md`:** maps each code file to its corresponding spec, with coverage level. You know what's covered and what isn't.

**`traceability/spec-impact-matrix.md`:** maps which component impacts which. Before changing something, you know the blast radius of the change.

---

## What not to commit

Suggested `.gitignore` to avoid versioning agentforge outputs alongside code (unless you want to):

```gitignore
# agentforge outputs (optional: remove if you want to version the specs)
_agentforge_sdd/

# Personal agentforge configuration (never commit)
.agentforge/config.user.toml
```

---

## Next step

Specs in hand? See [Developing from specs](../desenvolvendo-com-specs.md) for the recommended order to build the system.
