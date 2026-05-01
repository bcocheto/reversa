# Router

Este arquivo descreve como o AgentForge decide o próximo passo.

## Objetivo

Escolher o caminho certo entre bootstrap, adopt e hybrid com base no estado do projeto e na intenção do usuário.

## Regras de roteamento

1. Se o projeto for novo e vazio, prefira `bootstrap`.
2. Se o projeto já tiver arquivos de engine, prefira `adopt`.
3. Se houver base nova e arquivos legados relevantes, use `hybrid`.
4. Se uma política bloquear escrita, peça aprovação humana.
5. Se faltar contexto, consulte `context/project-overview.md` e `references/important-files.md`.

## Resultado esperado

- Uma decisão clara de modo.
- O próximo fluxo recomendado.
- Os arquivos que precisam ser lidos antes de agir.

## Notas

- Este arquivo é para leitura humana e para orientar o comportamento do orquestrador.
- Atualize quando a forma de trabalho do projeto mudar.
