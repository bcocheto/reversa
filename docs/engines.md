# Supported engines

agentforge works with the leading AI engines on the market. The installer automatically detects which ones are present in the environment, but you can add more at any time with `npx agentforge add-engine`.

---

## Compatibility

| Engine | File created | Skills path | How to activate |
|--------|-------------|-------------|-----------------|
| **Claude Code** ⭐ | `CLAUDE.md` | `.claude/skills/agentforge-*/` and `.agents/skills/agentforge-*/` | `/agentforge` |
| **Codex** ⭐ | `AGENTS.md` | `.agents/skills/agentforge-*/` | `agentforge` |
| **Cursor** ⭐ | `.cursorrules` and `.cursor/rules/agentforge.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Gemini CLI** | `GEMINI.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Windsurf** | `.windsurfrules` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Antigravity** | `AGENTS.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Kiro** | `.kiro/steering/agentforge.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Opencode** | `AGENTS.md` | `.agents/skills/agentforge-*/` | `agentforge` |

---

## Claude Code

The most tested engine with the best support. Uses native slash commands, making activation intuitive. agentforge creates files in both `.claude/skills/` and `.agents/skills/` (for compatibility with other engines that may be added later).

---

## Codex

Fully compatible. Since Codex doesn't use slash commands, activation is by the agent name directly: `agentforge`, `agentforge-scout`, etc. The `AGENTS.md` file at the project root serves as the entry point.

---

## Cursor

Compatible via `.cursorrules` and `.cursor/rules/agentforge.md`. Cursor reads the rules from these files and the agents are available as skills.

---

## Gemini CLI and Windsurf

Full support. Agents live in `.agents/skills/` and are accessed via each engine's native mechanisms.

---

## Antigravity

Google's agentic development platform, released in November 2025. Reads `AGENTS.md` natively (same file as Codex). If Codex is already installed in the project, the existing `AGENTS.md` is reused without duplication. CLI command: `agy`.

---

## Kiro

Amazon's agentic IDE. Uses steering documents in `.kiro/steering/` to instruct the agent: the installer creates `.kiro/steering/agentforge.md`. Agents live in `.agents/skills/` and are activated via `/agentforge`.

---

## Opencode

Open source coding agent for the terminal (SST). Reads `AGENTS.md` natively, same convention as Codex. CLI command: `opencode`. Like Codex, activation is by agent name: `agentforge`.

---

## Multiple engines in the same project

You can have all engines installed at the same time. Agents in `.agents/skills/` are shared by all of them. The installer creates the specific entry files for each engine without conflict.

If you work in a team where each person uses a different engine, this works normally: everyone uses their engine's entry file, but all agents are in the same place.
