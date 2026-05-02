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

## Pode escrever

- `agents/*.yaml`
- `reports/agent-design.md`
- `memory/decisions.md`

## Não pode escrever

- `state.json`
- `plan.md`
- source code
- policies
- flows

## Finalizar

- `agentforge checkpoint agent-design --status done`
- `agentforge validate`

