# Motores compatibles

agentforge funciona con los principales motores de IA del mercado. El instalador detecta automáticamente cuáles están presentes en el entorno.

---

## Compatibilidad

| Motor | Archivo creado | Skills path | Cómo activar |
|-------|---------------|-------------|--------------|
| **Claude Code** ⭐ | `CLAUDE.md` | `.claude/skills/agentforge-*/` y `.agents/skills/agentforge-*/` | `/agentforge` |
| **Codex** ⭐ | `AGENTS.md` | `.agents/skills/agentforge-*/` | `agentforge` |
| **Cursor** ⭐ | `.cursorrules` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Gemini CLI** | `GEMINI.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Windsurf** | `.windsurfrules` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Antigravity** | `AGENTS.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Kiro** | `.kiro/steering/agentforge.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Opencode** | `AGENTS.md` | `.agents/skills/agentforge-*/` | `agentforge` |

---

## Claude Code

El motor más probado y con mejor soporte. Usa slash commands nativos, lo que hace la activación intuitiva.

---

## Codex y Opencode

Totalmente compatibles. Como no usan slash commands, la activación es por el nombre del agente directamente: `agentforge`, `agentforge-scout`, etc.

---

## Múltiples motores en el mismo proyecto

Puedes tener todos los motores instalados al mismo tiempo. Los agentes en `.agents/skills/` son compartidos por todos. Si trabajas en equipo y cada persona usa un motor diferente, funciona con normalidad.
