# Engines suportadas

O agentforge funciona com as principais engines de IA do mercado. O instalador detecta automaticamente quais estão presentes no ambiente, mas você pode adicionar mais a qualquer momento com `npx agentforge add-engine`.

---

## Compatibilidade

| Engine | Arquivo criado | Skills path | Como ativar |
|--------|---------------|-------------|-------------|
| **Claude Code** ⭐ | `CLAUDE.md` | `.claude/skills/agentforge-*/` e `.agents/skills/agentforge-*/` | `/agentforge` |
| **Codex** ⭐ | `AGENTS.md` | `.agents/skills/agentforge-*/` | `agentforge` |
| **Cursor** ⭐ | `.cursorrules` e `.cursor/rules/agentforge.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Gemini CLI** | `GEMINI.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Windsurf** | `.windsurfrules` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Antigravity** | `AGENTS.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Kiro** | `.kiro/steering/agentforge.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Opencode** | `AGENTS.md` | `.agents/skills/agentforge-*/` | `agentforge` |
| **Cline** | `.clinerules` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Roo Code** | `.roorules` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **GitHub Copilot** | `.github/copilot-instructions.md` | `.agents/skills/agentforge-*/` | `/agentforge` |
| **Aider** | `CONVENTIONS.md` | `.agents/skills/agentforge-*/` | `agentforge` |
| **Amazon Q Developer** | `.amazonq/rules/agentforge.md` | `.agents/skills/agentforge-*/` | `/agentforge` |

---

## Claude Code

A engine mais testada e com melhor suporte. Usa slash commands nativos, o que torna a ativação intuitiva. O agentforge cria os arquivos em `.claude/skills/` e em `.agents/skills/` (para compatibilidade com outras engines que possam ser adicionadas depois).

---

## Codex

Totalmente compatível. Como o Codex não usa slash commands, a ativação é pelo nome do agente diretamente: `agentforge`, `agentforge-scout`, etc. O arquivo `AGENTS.md` na raiz do projeto serve como ponto de entrada.

---

## Cursor

Compatível via `.cursorrules` e `.cursor/rules/agentforge.md`. O Cursor lê as regras desses arquivos e os agentes ficam disponíveis como skills.

---

## Gemini CLI e Windsurf

Suporte completo. Os agentes ficam em `.agents/skills/` e são acessados via os mecanismos nativos de cada engine.

---

## Antigravity

Plataforma de desenvolvimento agêntico do Google, lançada em novembro de 2025. Lê `AGENTS.md` nativamente (mesmo arquivo do Codex). Se Codex já estiver instalado no projeto, o `AGENTS.md` existente é reaproveitado sem duplicação. Comando CLI: `agy`.

---

## Kiro

IDE agêntico da Amazon. Usa steering documents em `.kiro/steering/` para instruir o agente: o instalador cria `.kiro/steering/agentforge.md`. Os agentes ficam em `.agents/skills/` e são ativados via `/agentforge`.

---

## Opencode

Agente de codificação open source para terminal (SST). Lê `AGENTS.md` nativamente, mesma convenção do Codex. Comando CLI: `opencode`. Como Codex, a ativação é pelo nome do agente: `agentforge`.

---

## Cline e Roo Code

Extensions de VS Code com suporte a regras personalizadas via `.clinerules` e `.roorules` respectivamente. O padrão é idêntico ao Cursor e Windsurf: arquivo de regras na raiz do projeto que instrui o agente ao ativar `/agentforge`.

---

## GitHub Copilot

Usa `.github/copilot-instructions.md` como arquivo de instruções customizadas, lido automaticamente pelo Copilot em toda sessão. O instalador cria o arquivo dentro de `.github/` (que pode já existir no projeto).

---

## Aider

Agente de codificação para terminal. O entry file `CONVENTIONS.md` na raiz é passado via `--read CONVENTIONS.md` ou configurado em `.aider.conf.yml`. Como Codex e Opencode, a ativação é pelo nome: `agentforge`.

---

## Amazon Q Developer

CLI de IA da AWS. Usa regras em `.amazonq/rules/` para instruir o agente por projeto. O instalador cria `.amazonq/rules/agentforge.md` sem interferir em outras regras que você já tenha nessa pasta.

---

## Múltiplas engines no mesmo projeto

Você pode ter todas as engines instaladas ao mesmo tempo. Os agentes em `.agents/skills/` são compartilhados por todas. O instalador cria os arquivos de entrada específicos de cada engine sem conflito entre eles.

Se você trabalha em equipe e cada pessoa usa uma engine diferente, isso funciona normalmente: cada um usa o arquivo de entrada da sua engine, mas todos os agentes estão no mesmo lugar.
