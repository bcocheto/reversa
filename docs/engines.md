# Supported engines

AgentForge works with the main engines that support project-level instructions. The installer detects what is present, and `add-engine` can add more later.

---

## Compatibility

| Engine | Entry file | Skills path | Activate with |
|--------|------------|-------------|---------------|
| Claude Code | `CLAUDE.md` | `.claude/skills/agentforge-*/` and `.agents/skills/agentforge-*/` | `/agentforge` |
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

Cursor is standardized on `.cursor/rules/agentforge.md` for compile and export. The legacy `.cursorrules` file remains only for compatibility with existing installs.

---

## Multiple engines in the same project

You can install several engines at the same time. The agents in `.agents/skills/` are shared by all of them, and the engine-specific entry files stay separate.
