# Engines suportadas

O AgentForge funciona com as principais engines que suportam instruções em nível de projeto. O instalador detecta o que já existe e `add-engine` pode adicionar mais depois.

---

## Compatibilidade

| Engine | Arquivo de entrada | Skills path | Como ativar |
|--------|---------------------|-------------|-------------|
| Claude Code | `CLAUDE.md` | `.claude/skills/agentforge-*/` e `.agents/skills/agentforge-*/` | `/agentforge` |
| Codex | `AGENTS.md` | `.agents/skills/agentforge-*/` | `agentforge` |
| Cursor | `.cursor/rules/agentforge.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| Gemini CLI | `GEMINI.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| Windsurf | `.windsurfrules` | `.agents/skills/agentforge-*/` | `/agentforge` |
| Antigravity | `AGENTS.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| Kiro | `.kiro/steering/agentforge.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| Opencode | `AGENTS.md` | `.agents/skills/agentforge-*/` | `agentforge` |
| Cline | `.clinerules` | `.agents/skills/agentforge-*/` | `/agentforge` |
| Roo Code | `.roorules` | `.agents/skills/agentforge-*/` | `/agentforge` |
| GitHub Copilot | `.github/copilot-instructions.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| Aider | `CONVENTIONS.md` | `.agents/skills/agentforge-*/` | `agentforge` |
| Amazon Q Developer | `.amazonq/rules/agentforge.md` | `.agents/skills/agentforge-*/` | `/agentforge` |

---

## Cursor

O Cursor fica padronizado em `.cursor/rules/agentforge.md` para compile e export. O arquivo legado `.cursorrules` continua só para compatibilidade com instalações antigas.

---

## Múltiplas engines no mesmo projeto

Você pode instalar várias engines ao mesmo tempo. Os agentes em `.agents/skills/` são compartilhados por todas e os arquivos de entrada específicos de cada engine continuam separados.
