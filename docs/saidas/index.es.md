# Salidas generadas

AgentForge escribe sus salidas canónicas en `.agentforge/` y, cuando está configurado, en una carpeta de salida específica del proyecto para artefactos de spec.

---

## Salidas canónicas

```text
.agentforge/
├── context/
├── references/
├── policies/
├── flows/
├── skills/
├── memory/
├── reports/
├── imports/
└── _config/
```

Estas carpetas guardan la memoria del proyecto, audits, reports, docs canónicos y sugerencias de skills.

---

## Exports de motor

`compile` y `export` generan bootloaders gestionados para:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/agentforge.md`
- `.github/copilot-instructions.md`

Las superficies de compatibilidad heredada como `.cursorrules` todavía pueden existir cuando se instalan, pero el target moderno de Cursor es `.cursor/rules/agentforge.md`.

---

## Qué es seguro commitear

- docs y reports canónicos en `.agentforge/`
- entrypoints gestionados por los motores
- skills y flows generados
- manifiestos y archivos de estado

Si no quieres los artefactos de spec en git, mantén ignorada la carpeta de salida configurada. La capa canónica sigue siendo la fuente de verdad.
