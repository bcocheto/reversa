# Review Playbook

## Objetivo

Revisar consistência geral, pendências e prontidão do AgentForge para tarefas reais.

## O que ler

- `state.json`
- `plan.md`
- `harness/context-index.yaml`
- `agents/`
- `flows/`
- `policies/`
- `reports/`

## O que fazer

1. Comparar state, plan e artefatos gerados.
2. Verificar consistência entre contexto, agentes, flows e policies.
3. Confirmar que a estrutura está pronta para uso pela IA ativa.
4. Listar pendências reais, não hipotéticas.

## Pode escrever

- `reports/review.md`
- `memory/decisions.md`
- `memory/open-questions.md`

## Não pode escrever

- `state.json`
- `plan.md`
- source code

## Finalizar

- `agentforge checkpoint review --status done`
- `agentforge validate`

