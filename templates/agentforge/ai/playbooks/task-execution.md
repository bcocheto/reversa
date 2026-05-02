# Task Execution Playbook

## Objetivo

Executar uma tarefa específica com contexto mínimo, rastreabilidade e saída auditável.

## O que ler

- `ai/README.md`
- o playbook da fase
- a nota da engine
- apenas os arquivos estritamente necessários

## Passos

1. Confirmar a fase e o objetivo real.
2. Ler contexto suficiente, mas não excessivo.
3. Executar com julgamento contextual.
4. Registrar o checkpoint.
5. Validar o resultado.

## Regras

- Não escreva contexto inteligente fora do escopo pedido.
- Não altere `state.json` ou `plan.md` manualmente.
- Não trate a engine como identidade fixa do produto.

## Finalizar

- `agentforge checkpoint <phase> --status done`
- `agentforge validate`

