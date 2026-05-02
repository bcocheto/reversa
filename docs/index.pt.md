# AgentForge

**Crie, organize, evolua e compile a camada agent-ready de um projeto.**

O AgentForge dá ao projeto uma fonte da verdade em `.agentforge/`, um roteador de contexto, skills reutilizáveis, flows operacionais, policies, memória e exports para Codex, Claude Code, Cursor e GitHub Copilot.

---

## O problema

- `AGENTS.md` cresce demais.
- `CLAUDE.md` vira uma fonte paralela.
- Regras são duplicadas entre engines.
- Contexto, policies, workflows e comandos ficam misturados.
- Humanos têm dificuldade para editar com segurança.
- Agents recebem contexto demais, ou o contexto errado.

---

## A solução

- `.agentforge/` é a fonte da verdade.
- `harness/` roteia o contexto.
- `context-index.yaml` define o que carregar.
- `skills/` guardam procedimentos reutilizáveis.
- `flows/` guardam workflows do projeto.
- `policies/` definem limites.
- `compile` gera bootloaders gerenciados para cada engine.

---

## Comece aqui

### Projeto novo

```bash
npx agentforge install
npx agentforge bootstrap
npx agentforge compile
npx agentforge validate
```

### Projeto existente

```bash
npx agentforge install
npx agentforge adopt
npx agentforge audit-context
npx agentforge refactor-context --apply
npx agentforge suggest-skills
npx agentforge compile
npx agentforge validate
```

### Trabalho contínuo

```bash
npx agentforge add-agent
npx agentforge add-flow
npx agentforge suggest-skills
npx agentforge create-skill run-tests
npx agentforge improve
```

---

## Segurança

!!! note "Comandos read-only"
    `ingest`, `adopt` e `audit-context` leem os sinais do projeto sem modificar os arquivos originais.

!!! note "Escritas gerenciadas"
    `compile` e `export` escrevem blocos gerenciados de bootloader e preservam o conteúdo manual fora do bloco. `update` e `uninstall` respeitam o manifesto e os arquivos modificados.

!!! note "Snapshots ficam locais"
    Os snapshots ficam em `.agentforge/imports/`. Os relatórios ficam em `.agentforge/reports/`.

---

## Conceitos

- **Harness**: o roteador que carrega o contexto certo na hora certa.
- **Context**: conhecimento canônico do projeto em `.agentforge/context/`.
- **References**: comandos, arquivos importantes, docs externas e ferramentas.
- **Policies**: arquivos protegidos, limites de segurança e regras de aprovação.
- **Flows**: workflows repetíveis para feature, bugfix, refactor e review.
- **Skills**: procedimentos reutilizáveis promovidos a partir de sugestões.
- **Agents**: os papéis do projeto que executam o trabalho.
- **Memory**: decisões, convenções, glossário, lições e perguntas em aberto.
- **Reports**: saídas de audit, compile, bootstrap, improve e validation.
- **Engine exports**: entrypoints gerados para Codex, Claude Code, Cursor e GitHub Copilot.

---

## Legado

A origem histórica está em [Contexto histórico](por-que-reversa.md). Mantemos essa página para contexto, mas o produto atual é a camada agent-ready descrita aqui.
