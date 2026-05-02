# AgentForge AI

Esta pasta descreve como a IA ativa deve executar o AgentForge.
O CLI prepara a estrutura, o handoff e a validação; a engine configurada executa o trabalho inteligente.

## Como usar

- Leia `README.md` antes de começar.
- Leia o playbook da fase atual em `playbooks/`.
- Leia a nota específica da sua engine em `engines/`.
- Execute a fase com julgamento contextual.
- Registre o checkpoint ao concluir.
- Valide a estrutura antes de encerrar.

## Playbooks

- `playbooks/discovery.md`
- `playbooks/agent-design.md`
- `playbooks/flow-design.md`
- `playbooks/policies.md`
- `playbooks/export.md`
- `playbooks/review.md`
- `playbooks/task-execution.md`

## Engine notes

- `engines/codex.md`
- `engines/claude.md`
- `engines/gemini.md`
- `engines/cursor.md`
- `engines/copilot.md`

## Regras

- Não edite `state.json` manualmente.
- Não edite `plan.md` manualmente.
- Não assuma uma engine única como runtime obrigatório.
- Mantenha a saída curta, rastreável e específica ao projeto.
