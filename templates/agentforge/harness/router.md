# Router

Este arquivo descreve como o AgentForge decide o próximo passo.

## Objetivo

Escolher o caminho certo com base no estado do projeto, na intenção do usuário e no contexto já indexado.

## Protocol

1. Leia `.agentforge/state.json`.
2. Leia `.agentforge/harness/context-index.yaml` e `.agentforge/harness/context-map.yaml`.
3. Se o workflow ainda estiver em andamento, use `agentforge next` ou `agentforge handoff` para descobrir a próxima fase.
4. Se o workflow já estiver concluído, não reencene discovery, agent-design, flow-design, policies, export ou review.
5. Nesse caso, peça a tarefa real e resolva o task mode provável antes de editar.
6. Use `agentforge context-pack <mode> --write` para carregar o contexto certo.
7. Leia o flow, a skill e a policy relevantes antes de tocar nos arquivos reais do projeto.
8. Liste os arquivos que pretende tocar e o motivo da mudança antes de editar.
9. Aguarde confirmação explícita quando a solicitação for ambígua.
10. Nunca edite `state.json` ou `plan.md` manualmente.

## Regras de roteamento

1. Se o projeto for novo e vazio, prefira `bootstrap`.
2. Se o projeto já tiver arquivos de engine, prefira `adopt`.
3. Se houver base nova e arquivos legados relevantes, use `hybrid`.
4. Se uma política bloquear escrita, peça aprovação humana.
5. Se faltar contexto, consulte `context/project-overview.md`, `references/important-files.md` e `.agentforge/scope.md`.

## Resultado esperado

- Uma decisão clara de modo.
- O task mode mais provável quando a solicitação for uma tarefa real.
- O `context-pack` correto antes de editar.
- Os arquivos reais do projeto que precisam ser lidos.
- Se o ciclo já estiver concluído, o próximo passo é a tarefa real no projeto.

## Notas

- `.agentforge/` é a camada de roteamento e seleção de contexto, não o destino final da mudança.
- Este arquivo é para leitura humana e para orientar o comportamento do orquestrador.
- Não use web search por padrão ao ativar AgentForge.
- Só pesquise fora do repositório se o usuário pedir explicitamente ou se a tarefa exigir informação externa/atual.
- Atualize quando a forma de trabalho do projeto mudar.
