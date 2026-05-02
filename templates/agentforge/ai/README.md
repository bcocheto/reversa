# AgentForge AI

Esta camada descreve como a IA ativa executa o AgentForge.
O CLI prepara a estrutura, o handoff e as validações. A engine configurada executa as fases inteligentes com julgamento contextual.

## Papel de cada parte

- O CLI prepara `state.json`, `plan.md`, reports, context packs e bootloaders.
- A IA ativa lê o handoff, escolhe o próximo passo e executa a fase.
- `agentforge validate` confirma se a estrutura continua consistente.

## Regras

- Nunca edite `state.json` ou `plan.md` manualmente.
- Nunca assuma que o produto é preso a uma engine específica.
- Use `agentforge handoff` para receber a orientação da próxima fase.
- Use `agentforge context-pack <phase-or-task>` quando o contexto precisar ser reduzido.
- Termine cada fase com `agentforge checkpoint <phase> --status done`.
- Finalize com `agentforge validate`.

## Fases

- `discovery`: entender o projeto e preencher o contexto canônico.
- `agent-design`: decidir a equipe AgentForge adequada ao projeto.
- `flow-design`: definir a sequência operacional e os checkpoints.
- `policies`: consolidar permissões, proteções e aprovações.
- `export`: preparar e compilar os bootloaders gerenciados.
- `review`: revisar consistência, pendências e prontidão geral.

## Playbooks

- `playbooks/discovery.md`
- `playbooks/agent-design.md`
- `playbooks/flow-design.md`
- `playbooks/policies.md`
- `playbooks/export.md`
- `playbooks/review.md`
- `playbooks/task-execution.md`

## Notas por engine

- `engines/codex.md`
- `engines/claude.md`
- `engines/gemini.md`
- `engines/cursor.md`
- `engines/copilot.md`

