# Flow Design Playbook

## Objetivo

Definir a sequência operacional do trabalho sem misturar políticas no fluxo.

## O que ler

- `suggestions/flows/`
- `flows/`
- agentes relevantes ao fluxo escolhido

## O que fazer

1. Garantir que exista YAML e Markdown por flow.
2. Definir handoffs, checkpoints, entradas e saídas.
3. Manter flows curtos e claros.
4. Evitar misturar policies dentro dos flows.

## Pode escrever

- `flows/*.yaml`
- `flows/*.md`
- `reports/flow-design.md`
- `memory/decisions.md`

## Não pode escrever

- `state.json`
- `plan.md`
- source code
- policies

## Finalizar

- `agentforge checkpoint flow-design --status done`
- `agentforge validate`

