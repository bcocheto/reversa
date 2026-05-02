# Policies Playbook

## Objetivo

Consolidar permissões, arquivos protegidos e aprovações humanas.

## O que ler

- `policies/`
- `permissions.yaml`
- `protected-files.yaml`
- `human-approval.yaml`
- `safety.md`

## O que fazer

1. Separar YAML estruturado de Markdown humano.
2. Proteger secrets, env, migrations, workflows, `state.json` e `plan.md`.
3. Não bloquear trabalho normal sem motivo.
4. Registrar as exceções justificadas.

## Pode escrever

- `policies/*.yaml`
- `policies/*.md`
- `reports/policies.md`
- `memory/decisions.md`

## Não pode escrever

- `state.json`
- `plan.md`
- source code
- agents
- flows

## Finalizar

- `agentforge checkpoint policies --status done`
- `agentforge validate`

