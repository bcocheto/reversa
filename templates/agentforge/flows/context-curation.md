# Context Curation

Use este fluxo quando o usuário pedir organização, segregação, revisão ou localização granular de contexto.

## Objetivo

Manter o contexto durável do projeto navegável, pequeno, confiável e rastreável por arquivo e linha.

## Executor principal

`context-curator`

## Entradas

- `.agentforge/harness/context-index.yaml`
- `.agentforge/harness/context-map.yaml`
- `.agentforge/reports/refactor-plan.md`
- `.agentforge/reports/context-curation-input.md`
- `.agentforge/context/`
- `.agentforge/references/`
- `.agentforge/policies/`
- `.agentforge/flows/`
- `.agentforge/memory/`

## Saídas

- `.agentforge/harness/context-map.yaml`
- `.agentforge/reports/context-curation.md`
- `.agentforge/reports/context-map.md`
- arquivos reorganizados em `context/`, `references/` e `memory/`

## Regras

- Não editar `state.json` manualmente.
- Não editar `plan.md` manualmente.
- Não mover contexto humano sem justificar.
- Não promover baixa confiança como fato.
- Não colocar termos genéricos de stack no glossário de domínio.
