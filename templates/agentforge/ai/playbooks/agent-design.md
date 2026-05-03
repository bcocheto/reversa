# Agent Design Playbook

## Objetivo

Decidir quais agentes fazem sentido para o projeto real e quais não devem existir.

## O que ler

- `suggestions/agents/`
- contexto canônico relevante
- sinais do produto, domínio e operação

## O que fazer

1. Listar as sugestões disponíveis em `suggestions/agents/`.
2. Comparar as sugestões com os arquivos existentes em `agents/`.
3. Para cada agente justificável ausente, executar `agentforge create-agent <id> --force`.
4. Se `create-agent` falhar, parar imediatamente e relatar o erro.
5. Se não houver sugestão válida, registrar no relatório que nada foi promovido.
6. Especializar os agentes para o projeto sem criar YAML manualmente.
7. Incluir agentes fora de engenharia quando houver evidência.
8. Evitar agentes sem responsabilidade clara.
9. Registrar as decisões tomadas.
10. não crie agentes manualmente; use `agentforge create-agent <id>` ou `agentforge apply-suggestions --agents`.

## Pode escrever

- `reports/agent-design.md`
- `memory/decisions.md`

## Pode escrever por comando

- `agents/*.yaml` via `agentforge create-agent <id>` ou `agentforge apply-suggestions --agents`
- `suggestions/agents/*.yaml` via `agentforge suggest-agents --heuristic` ou `agentforge import-ai-suggestions`

## Não pode escrever

- `state.json`
- `plan.md`
- `_config/**`
- source code
- policies
- flows

## Finalizar

- `agentforge checkpoint agent-design --status done`
- `agentforge create-agent <id> --force`
- `agentforge apply-suggestions --agents`
- `agentforge validate`
