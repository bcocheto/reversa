# CLI

O AgentForge tem um CLI pequeno para gerenciar a camada agent-ready do projeto. Execute a partir da raiz com `npx @bcocheto/agentforge`.

---

## Comandos

| Comando | O que faz |
|---------|-----------|
| `install` | Cria a base `.agentforge/` e os entrypoints gerenciados das engines. |
| `bootstrap` | Completa a base de um projeto novo usando sinais reais do repositório. |
| `adopt` | Lê uma superfície agentic existente e gera um plano de adoção. |
| `ingest` | Copia snapshots seguros de instruções para `.agentforge/imports/` sem tocar nos originais. |
| `audit-context` | Diagnostica a organização do contexto e escreve `.agentforge/reports/context-audit.md`. |
| `refactor-context` | Cria um plano de refactor ou, com `--apply`, escreve arquivos canônicos em `.agentforge/`. |
| `suggest-skills` | Gera sugestões de skills a partir de imports, contexto, package files e estrutura do repositório. |
| `create-skill <skill-id>` | Promove uma sugestão de skill existente para uma skill real. |
| `add-agent` | Adiciona um agente customizado ao projeto. |
| `add-flow` | Adiciona um workflow customizado. |
| `add-engine` | Adiciona suporte a outra engine. |
| `compile` / `export` | Gera bootloaders gerenciados e arquivos derivados para as engines configuradas. |
| `validate` | Valida a estrutura canônica `.agentforge/` e os entrypoints gerenciados. |
| `update` | Atualiza os arquivos gerados preservando edições personalizadas. |
| `improve` | Revê `.agentforge/` e sugere melhorias mais seguras e legíveis para humanos. |
| `status` | Mostra o estado atual do AgentForge. |
| `uninstall` | Remove com segurança os arquivos gerenciados pelo AgentForge. |

---

## Comandos read-only

Esses comandos leem sinais do projeto sem modificar os arquivos originais:

- `ingest`
- `adopt`
- `audit-context`

---

## `compile` versus `export`

`export` é alias de `compile`.

O Cursor fica padronizado em `.cursor/rules/agentforge.md`. O arquivo legado `.cursorrules` fica apenas para compatibilidade na detecção durante a instalação.
