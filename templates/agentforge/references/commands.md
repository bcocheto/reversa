# Commands

Este arquivo é gerado a partir de `COMMAND_REGISTRY`.
Não mantenha uma lista manual divergente.

## Exemplos

- `npx @bcocheto/agentforge commands`
- `npx @bcocheto/agentforge validate`
- `npx @bcocheto/agentforge compile`
- `npx @bcocheto/agentforge analyze`

## Registry atual

| Command | Category | Usage | Status | Description |
| --- | --- | --- | --- | --- |
| `install` | setup | `install` | stable | Instala o AgentForge e prepara a camada agent-ready inicial. |
| `bootstrap` | setup | `bootstrap` | stable | Completa a base agent-ready do projeto atual. |
| `ingest` | adoption | `ingest` | stable | Importa snapshots de instruções agentic existentes sem alterar os originais. |
| `adopt` | adoption | `adopt [--apply]` | stable | Analisa um projeto existente e gera um plano de adoção. |
| `analyze` | inspection | `analyze` | stable | Analisa o projeto antes de criar ou modificar agentes, skills, flows, policies e contexto. |
| `research-patterns` | research | `research-patterns [--online]` | stable | Sugere padrões locais a partir da stack, estrutura e contexto agentic existente. |
| `suggest-agents` | agents | `suggest-agents` | stable | Sugere agentes adequados ao projeto com base na análise local e nos padrões observados. |
| `create-agent` | agents | `create-agent <agent-id> [--force]` | stable | Cria um agente real a partir de uma sugestão existente em `.agentforge/suggestions/agents/`. |
| `apply-suggestions` | meta | `apply-suggestions [--agents] [--skills] [--flows] [--all] [--dry-run] [--force]` | stable | Aplica sugestões de agentes, skills, flows e policies de forma controlada. |
| `audit-context` | inspection | `audit-context` | stable | Diagnostica a organização do contexto com heurísticas determinísticas. |
| `refactor-context` | context | `refactor-context [--apply] [--force]` | stable | Separa o conteúdo importado em arquivos canônicos. |
| `suggest-skills` | skills | `suggest-skills [--force]` | stable | Sugere skills de projeto a partir da estrutura e do contexto. |
| `create-skill` | skills | `create-skill <skill-id> [--force]` | stable | Cria uma skill real a partir de uma sugestão existente. |
| `add-agent` | agents | `add-agent` | stable | Cria um agente customizado do projeto. |
| `add-flow` | flows | `add-flow` | stable | Cria um fluxo operacional customizado. |
| `add-engine` | engines | `add-engine` | stable | Adiciona suporte a uma engine. |
| `compile` | publishing | `compile [--force] [--takeover-entrypoints]` | stable | Atualiza os bootloaders reais do projeto e os entrypoints das engines. |
| `export` | publishing | `export [--package]` | stable | Alias de compile. |
| `export-package` | publishing | `export-package [--force]` | stable | Gera o pacote isolado em _agentforge/ sem alterar os entrypoints reais. |
| `export-diagrams` | publishing | `export-diagrams [--format=svg|png] [--output=<pasta>]` | experimental | Exporta diagramas Mermaid como imagens SVG ou PNG. |
| `status` | inspection | `status [--json] [--repair]` | stable | Mostra o estado atual do AgentForge e a consistência com o plano. |
| `next` | inspection | `next` | stable | Mostra a próxima fase recomendada a partir de state.json e plan.md. |
| `validate` | inspection | `validate` | stable | Valida a estrutura canônica em `.agentforge/`. |
| `improve` | inspection | `improve [--apply]` | stable | Analisa a estrutura e sugere melhorias. |
| `update` | maintenance | `update` | stable | Atualiza os agentes para a última versão. |
| `uninstall` | maintenance | `uninstall` | stable | Remove o AgentForge do projeto. |
| `commands` | meta | `commands [--json] [--category <name>] [--stable] [--experimental]` | stable | Lista os comandos disponíveis com metadados completos. |

## Nota

- `commands` lista o registry em tempo de execução.
- Se o binário local não existir, use `npx @bcocheto/agentforge <command>` como fallback.
