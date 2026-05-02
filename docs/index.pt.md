# AgentForge

**Analise projetos, recomende agentes, skills, flows e policies, e compile bootloaders limpos para ferramentas de codificação com IA.**

O AgentForge transforma projetos novos ou existentes em uma camada canônica `.agentforge/` que humanos conseguem ler, revisar e evoluir ao longo do tempo.

---

## O problema

- `AGENTS.md` e `CLAUDE.md` crescem demais.
- Regras, contexto, workflows, comandos e policies ficam misturados.
- Cada engine vira uma fonte paralela de verdade.
- Humanos têm dificuldade de revisar e editar conteúdo gerado com segurança.
- Agents recebem contexto demais, ou o contexto errado.
- Projetos novos começam sem uma base agent-ready clara.
- Projetos existentes acumulam instruções agentic sem uma estrutura compartilhada.

---

## A solução

- `.agentforge/` é a fonte da verdade.
- `harness/context-index.yaml` controla o que carrega, quando e por quê.
- `analyze` varre o projeto e produz uma visão consolidada de stack, padrões, riscos e sinais.
- `research-patterns` cruza o repositório com um catálogo local de padrões.
- `suggest-agents`, `suggest-skills` e as sugestões de flows/policies/contexto geradas por `analyze` transformam sinais em recomendações.
- `apply-suggestions` promove as recomendações em um passo controlado.
- `compile` regenera bootloaders gerenciados para cada engine.
- `validate` e `improve` mantêm a camada legível e segura.

---

## Comece aqui

### Projeto novo

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

### Projeto existente

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge adopt --apply
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

### Trabalho contínuo

```bash
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge suggest-agents
npx @bcocheto/agentforge create-agent automation-planner
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge improve
npx @bcocheto/agentforge compile
```

---

## Segurança

!!! note "Comandos read-only"
    `ingest`, `adopt`, `analyze` e `audit-context` leem os sinais do projeto sem modificar os arquivos originais fora de `.agentforge/`.

!!! note "Escritas gerenciadas"
    `compile` e `export` escrevem blocos gerenciados de bootloader e preservam o conteúdo manual fora do bloco. `compile --takeover-entrypoints` preserva snapshots antes de reescrever entrypoints existentes. `update`, `apply-suggestions` e `uninstall` respeitam o manifesto e os arquivos modificados.

!!! note "Snapshots ficam locais"
    Os snapshots ficam em `.agentforge/imports/`. Os relatórios ficam em `.agentforge/reports/`.

---

## Conceitos

- **Analysis**: a varredura consolidada do projeto que detecta stack, framework, arquitetura, riscos e sinais.
- **Pattern research**: uma etapa offline baseada em catálogo local que recomenda padrões reutilizáveis.
- **Suggestions**: recomendações geradas para agentes, skills, flows, policies e context files.
- **Agents**: papéis do projeto em core, engineering, product, planning, automation, operations, data, knowledge, security, compliance, content, domain, support, integration e quality.
- **Skills**: procedimentos reutilizáveis promovidos a partir de sugestões.
- **Flows**: workflows repetíveis para feature, bugfix, review, release e refactor.
- **Policies**: arquivos protegidos, limites de segurança e regras de aprovação.
- **Harness**: o roteador que carrega o contexto certo na hora certa.
- **Context index**: o mapeamento que decide o que carrega para cada modo de tarefa.
- **References**: comandos, arquivos importantes, docs externas e ferramentas.
- **Memory**: decisões, convenções, glossário, lições e perguntas em aberto.
- **Reports**: saídas de analysis, suggestions, adopt, compile, bootstrap, improve e validation.
- **Engine entry points**: bootloaders gerados para Codex, Claude Code, Cursor, Gemini e GitHub Copilot.
- **Manifest**: o registro de hash que permite ao AgentForge preservar edições manuais.

---

## Legado

A origem histórica está em [Contexto histórico](por-que-reversa.md). Mantemos essa página para contexto, mas o produto atual é a camada agent-ready descrita aqui.
