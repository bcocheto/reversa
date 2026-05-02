# Motores compatibles

AgentForge funciona con los principales motores que admiten instrucciones a nivel de proyecto. El instalador detecta lo que ya existe y `add-engine` puede añadir más después.

---

## Compatibilidad

| Motor | Archivo de entrada | Skills path | Cómo activar |
|-------|---------------------|-------------|-------------|
| Claude Code | `CLAUDE.md` | `.claude/skills/agentforge-*/` y `.agents/skills/agentforge-*/` | `/agentforge` |
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

Cursor queda estandarizado en `.cursor/rules/agentforge.md` para compile y export. El archivo legado `.cursorrules` sigue solo para compatibilidad con instalaciones antiguas.

---

## Múltiples motores en el mismo proyecto

Puedes instalar varios motores al mismo tiempo. Los agentes en `.agents/skills/` se comparten entre todos y los archivos de entrada específicos de cada motor siguen separados.
