# Export Playbook

## Objetivo

Preparar e compilar os bootloaders sem transformar os entrypoints em dumps de contexto.

## O que ler

- `state.json`
- `plan.md`
- `harness/router.md`
- `harness/context-index.yaml`
- entrypoints existentes

## O que fazer

1. Rodar `agentforge compile --takeover-entrypoints --include-existing-entrypoints`.
2. Verificar `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Cursor e Copilot.
3. Garantir que os bootloaders continuem curtos.
4. Confirmar que os entrypoints não viraram dumps.
5. Não editar entrypoints manualmente; a alteração canônica acontece via `agentforge compile --takeover-entrypoints --include-existing-entrypoints`.

## Pode executar

- `agentforge compile --takeover-entrypoints --include-existing-entrypoints`
- `agentforge validate`

## Não pode escrever manualmente

- entrypoints fora do fluxo de `compile`
- `state.json`
- `plan.md`
- source code

## Finalizar

- `agentforge checkpoint export --status done`
- `agentforge validate`
