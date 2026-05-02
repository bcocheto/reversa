# Saídas geradas

O AgentForge escreve suas saídas canônicas em `.agentforge/` e, quando configurado, em uma pasta de saída específica do projeto para artefatos de spec.

---

## Saídas canônicas

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

Essas pastas guardam memória do projeto, audits, reports, docs canônicos e sugestões de skills.

---

## Exports de engine

`compile` e `export` geram bootloaders gerenciados para:

- `AGENTS.md`
- `CLAUDE.md`
- `.cursor/rules/agentforge.md`
- `.github/copilot-instructions.md`

Superfícies de compatibilidade legada como `.cursorrules` ainda podem existir quando instaladas, mas o target moderno do Cursor é `.cursor/rules/agentforge.md`.

---

## O que é seguro commitar

- docs e reports canônicos em `.agentforge/`
- entrypoints gerenciados pelas engines
- skills e flows gerados
- manifests e arquivos de estado

Se você não quiser os artefatos de spec no git, mantenha a pasta de saída configurada ignorada. A camada canônica continua sendo a fonte da verdade.
