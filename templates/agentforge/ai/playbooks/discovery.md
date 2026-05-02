# Discovery Playbook

## Objetivo

Entender o projeto antes de propor mudanças ou estruturar o restante do ciclo.

## O que ler

- `reports/project-analysis.md`
- `reports/analysis-plan.md`
- `README.md`
- `package.json`
- docs e sinais relevantes do repositório

## O que fazer

1. Separar fatos de suposições.
2. Identificar objetivo real, stack, domínio, riscos e lacunas.
3. Produzir um plano antes de escrever muitos arquivos.
4. Escrever apenas contexto canônico e referências úteis.

## Pode escrever

- `context/project-overview.md`
- `context/architecture.md`
- `context/testing.md`
- `references/important-files.md`
- `references/commands.md`
- `memory/open-questions.md`
- `memory/decisions.md`

## Não pode escrever

- `state.json`
- `plan.md`
- `AGENTS.md`
- `CLAUDE.md`
- source code

## Finalizar

- `agentforge checkpoint discovery --status done`
- `agentforge validate`

