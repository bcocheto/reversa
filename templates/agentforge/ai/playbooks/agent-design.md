# Agent Design Playbook

## Objetivo

Decidir e materializar a equipe agentic a partir de blueprint validado.

## O que ler

- `.agentforge/ai/outbox/agentic-blueprint.yaml`
- contexto canônico relevante
- sinais do produto, domínio e operação

## O que fazer

1. Se não houver blueprint validado, parar e pedir `.agentforge/ai/outbox/agentic-blueprint.yaml`.
2. Validar o blueprint antes de qualquer materialização.
3. Nunca crie ou edite agentes manualmente.
4. Agentes finais vêm de blueprint validado, de `agentforge create-agent <id>` ou de `agentforge apply-suggestions --blueprint .agentforge/ai/outbox/agentic-blueprint.yaml`.
5. Não compare sugestões heurísticas para decidir criação de agente.
6. Especializar os agentes para o projeto sem criar YAML manualmente.
7. Incluir agentes fora de engenharia quando houver evidência.
8. Evitar agentes sem responsabilidade clara.
9. Registrar as decisões tomadas.

## Pode escrever

- `reports/agent-design.md`
- `memory/decisions.md`

## Pode escrever por comando

- `agents/*.yaml` via `agentforge create-agent <id>` ou `agentforge apply-suggestions --blueprint .agentforge/ai/outbox/agentic-blueprint.yaml`

## Não pode escrever

- `state.json`
- `plan.md`
- `_config/**`
- source code
- policies
- flows

## Finalizar

- `agentforge checkpoint agent-design --status done`
- `agentforge create-agent <id>`
- `agentforge apply-suggestions --blueprint .agentforge/ai/outbox/agentic-blueprint.yaml`
- `agentforge validate`
