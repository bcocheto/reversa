# Como usar

## Ativar o AgentForge

Depois de instalar, abra o projeto na sua engine e ative o orquestrador:

=== "Claude Code / Cursor / Gemini CLI"

    ```
    /agentforge
    ```

=== "Codex e engines sem slash commands"

    ```
    agentforge
    ```

O orquestrador verifica `.agentforge/state.json`, retoma a sessão existente se houver uma, ou inicia o próximo passo seguro para o projeto.

---

## Fluxos comuns

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
npx @bcocheto/agentforge research-patterns
npx @bcocheto/agentforge suggest-agents
npx @bcocheto/agentforge create-agent automation-planner
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge improve
npx @bcocheto/agentforge compile
```

---

## Read-only versus comandos que escrevem

**Leem os arquivos originais sem modificá-los**

- `analyze`
- `research-patterns`
- `suggest-agents`
- `ingest`
- `adopt`
- `audit-context`

Esses comandos leem sinais do projeto e escrevem só em `.agentforge/`.

**Escrevem de forma segura em `.agentforge/` ou em entrypoints gerenciados**

- `bootstrap`
- `refactor-context --apply`
- `apply-suggestions`
- `suggest-skills`
- `create-skill`
- `create-agent`
- `compile`
- `export`
- `update`
- `improve --apply`
- `uninstall`

Esses comandos escrevem apenas na camada canônica ou nos entrypoints gerenciados pelo AgentForge.

---

## Registry e descoberta

Use o registry quando quiser a lista canônica:

```bash
npx @bcocheto/agentforge commands
npx @bcocheto/agentforge commands --json
npx @bcocheto/agentforge commands --category agents
```

---

## Ativar um agente específico manualmente

Se quiser rodar um agente avulso, sem passar pelo orquestrador:

```
/agentforge-scout
/agentforge-detective
/agentforge-data-master
```

Útil quando já há uma sessão em andamento e você precisa só de um papel específico.
