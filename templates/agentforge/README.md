# AgentForge Workspace

Este diretório é a camada editável do AgentForge dentro do projeto.
Ele reúne contexto, roteamento, referências, políticas, fluxos, skills e memória em arquivos simples de revisar.

## Como usar

- Edite os arquivos quando o projeto mudar.
- Prefira manter este diretório legível e sem segredos.
- Se algo depender de um processo manual, anote aqui ou nos arquivos relacionados.

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

- Projeto: <nome do projeto>
- Modo de instalação: <bootstrap | adopt | hybrid>
- Engines ativas: <codex, claude-code, cursor, github-copilot>
- Dono do contexto: <nome de quem mantém este projeto>

## Regras de edição

- Não escreva segredos, tokens ou dados sensíveis.
- Se um arquivo for gerado e depois editado à mão, preserve a versão humana.
- Quando houver dúvida, registre a decisão em `memory/decisions.md`.
