# Agent Design Playbook

## Objetivo

Decidir quais agentes fazem sentido para o projeto real e quais não devem existir.

## O que ler

- `suggestions/agents/`
- contexto canônico relevante
- sinais do produto, domínio e operação

## O que fazer

1. Escolher agentes e subagentes relevantes.
2. Especializar os agentes para o projeto.
3. Incluir agentes fora de engenharia quando houver evidência.
4. Evitar agentes sem responsabilidade clara.
5. Registrar as decisões tomadas.
6. Não criar YAML de agente manualmente; use `agentforge create-agent <id>` para um agente específico ou `agentforge apply-suggestions --agents` para promover sugestões.

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
- `agentforge validate`
