# Por que o AgentForge existe

O AgentForge existe porque projetos reais precisam de algo melhor do que um monte de prompts soltos e um `AGENTS.md` gigante.

O problema não é só “código legado”. O problema é que o contexto vira um caos:

- `AGENTS.md` e `CLAUDE.md` crescem até ninguém mais querer editar.
- contexto, policies, comandos e workflows ficam misturados.
- cada engine vira uma fonte paralela de verdade.
- humanos não conseguem distinguir o que é canônico e o que é derivado.
- agents recebem contexto demais, ou o contexto errado.
- projetos novos começam sem uma base agent-ready clara.
- projetos existentes acumulam instruções agentic sem uma estrutura compartilhada.

O AgentForge resolve isso analisando o projeto, recomendando o que criar e organizando o resultado como uma camada agent-ready local.

## O que ele entrega

- `.agentforge/` como fonte da verdade.
- `analyze` como a varredura do projeto.
- `research-patterns` como a etapa local de pesquisa de padrões.
- `suggest-agents`, `suggest-skills` e `apply-suggestions` como a esteira de promoção, com sugestões de flows e policies geradas por `analyze`.
- `harness/context-index.yaml` como mapa de carregamento.
- `skills/` como procedimentos reutilizáveis.
- `flows/` como workflows repetíveis.
- `policies/` como limites que mantêm o trabalho seguro.
- `compile` como a etapa que exporta bootloaders limpos para Codex, Claude Code, Cursor, Gemini e GitHub Copilot.

## Para quem é

- times que querem uma camada agentic local, limpa e previsível
- projetos onde várias engines precisam compartilhar a mesma fonte de verdade
- humanos que precisam manter a estrutura legível ao longo do tempo
- agents que precisam do contexto certo, não de todo o contexto
- projetos que precisam de papéis de planejamento, automação, operações, dados, conhecimento, suporte, domínio, segurança, compliance ou integração, e não só engenharia

## O que ele não é

O AgentForge não é um wrapper genérico de prompts.
Não é apenas uma ferramenta de análise estática.
Não é um dump de specs.

É um sistema para organizar o trabalho agent-ready para que o projeto continue compreensível e seguro de evoluir.
