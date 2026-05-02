# Por que o AgentForge existe

O AgentForge existe porque projetos reais precisam de algo melhor do que um monte de prompts soltos e um `AGENTS.md` gigante.

O problema não é só “código legado”. O problema é que o contexto vira um caos:

- `AGENTS.md` cresce até ninguém mais querer editar.
- `CLAUDE.md` começa a duplicar as mesmas regras.
- contexto, policies, comandos e workflows ficam misturados.
- humanos não conseguem distinguir o que é canônico e o que é derivado.
- agents recebem contexto demais, ou o contexto errado.

O AgentForge resolve isso organizando o projeto como uma camada agent-ready.

## O que ele entrega

- `.agentforge/` como fonte da verdade.
- `harness/` como roteador de contexto.
- `context-index.yaml` como mapa de carregamento.
- `skills/` como procedimentos reutilizáveis.
- `flows/` como workflows repetíveis.
- `policies/` como limites que mantêm o trabalho seguro.
- `compile` como a etapa que exporta entrypoints para Codex, Claude Code, Cursor e GitHub Copilot.

## Para quem é

- times que querem uma camada agentic local, limpa e previsível
- projetos onde várias engines precisam compartilhar a mesma fonte de verdade
- humanos que precisam manter a estrutura legível ao longo do tempo
- agents que precisam do contexto certo, não de todo o contexto

## O que ele não é

O AgentForge não é um wrapper genérico de prompts.
Não é uma ferramenta de análise estática.
Não é um dump de specs.

É um sistema para organizar o trabalho agent-ready para que o projeto continue compreensível e seguro de evoluir.
