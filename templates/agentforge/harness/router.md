# Router

Este arquivo descreve como o AgentForge decide o próximo passo.

## Objetivo

Escolher o caminho certo entre bootstrap, adopt e hybrid com base no estado do projeto e na intenção do usuário.

## Activation protocol

1. Detecte o estado atual em `.agentforge/state.json`.
2. Detecte a próxima fase com `agentforge next` se o comando existir.
3. Se `agentforge next` não estiver disponível, compare `.agentforge/state.json` com `.agentforge/plan.md`.
4. Antes de editar arquivos, liste:
   - a fase atual;
   - os arquivos que pretende tocar;
   - o motivo da mudança.
5. Aguarde confirmação explícita antes de editar.
6. Se a confirmação for vaga, responda com um plano curto em vez de escrever imediatamente.

## Regras de roteamento

1. Se o projeto for novo e vazio, prefira `bootstrap`.
2. Se o projeto já tiver arquivos de engine, prefira `adopt`.
3. Se houver base nova e arquivos legados relevantes, use `hybrid`.
4. Se uma política bloquear escrita, peça aprovação humana.
5. Se faltar contexto, consulte `context/project-overview.md`, `references/important-files.md` e `.agentforge/scope.md`.

## Resultado esperado

- Uma decisão clara de modo.
- O próximo fluxo recomendado.
- Os arquivos que precisam ser lidos antes de agir.

## Notas

- Este arquivo é para leitura humana e para orientar o comportamento do orquestrador.
- Não use web search por padrão ao ativar AgentForge.
- Só pesquise fora do repositório se o usuário pedir explicitamente ou se a tarefa exigir informação externa/atual.
- Atualize quando a forma de trabalho do projeto mudar.
