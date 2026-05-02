# AgentForge Workspace

Este diretório é a camada editável do AgentForge dentro do projeto.
Ele reúne contexto, roteamento, referências, políticas, fluxos, skills e memória em arquivos simples de revisar.

## Como usar

- Edite os arquivos quando o projeto mudar.
- Prefira manter este diretório legível e sem segredos.
- Se algo depender de um processo manual, anote aqui ou nos arquivos relacionados.
- Use `agentforge next` para determinar a fase atual e a próxima fase real.
- Use `agentforge advance` para avançar a Phase Engine.
- Nunca edite `state.json` ou `plan.md` manualmente.

## Estrutura principal

- `harness/`: regras de leitura, roteamento e carga.
- `context/`: contexto do projeto, arquitetura e padrões.
- `references/`: atalhos para comandos, arquivos importantes e docs externas.
- `policies/`: regras de proteção e aprovações humanas.
- `flows/`: fluxos operacionais em formato legível.
- `skills/`: skills reutilizáveis com frontmatter.
- `memory/`: decisões e aprendizados persistentes.
- `reports/`: relatórios gerados e notas de auditoria.

## Estado atual

- Projeto: A preencher
- Modo de instalação: A preencher
- Engines ativas: A preencher
- Dono do contexto: A preencher
- Use `agentforge next` para determinar a próxima fase.

## A preencher

- Nome real do projeto.
- Modo de instalação efetivamente usado.
- Engines habilitadas de fato.
- Pessoa responsável pelo contexto.

## Regras de edição

- Não escreva segredos, tokens ou dados sensíveis.
- Se um arquivo for gerado e depois editado à mão, preserve a versão humana.
- Quando houver dúvida, registre a decisão em `memory/decisions.md`.
