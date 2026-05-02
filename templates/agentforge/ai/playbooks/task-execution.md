# Task Execution Playbook

## Objetivo

Executar uma tarefa específica com contexto mínimo e saída auditável.

## Passos

1. Ler `ai/README.md`.
2. Ler o playbook da fase.
3. Ler a nota da engine.
4. Ler apenas os arquivos de contexto necessários.
5. Executar com julgamento contextual.
6. Registrar o checkpoint.
7. Validar o resultado.

## Regras

- Não escreva contexto inteligente fora do escopo pedido.
- Não altere `state.json` ou `plan.md` manualmente.
- Não trate a engine como identidade fixa do produto.
