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

## Read-only versus comandos que escrevem

**Leem os arquivos originais sem modificá-los**

- `ingest`
- `adopt`
- `audit-context`

Esses comandos leem sinais do projeto e escrevem só em `.agentforge/`.

**Escrevem de forma segura em `.agentforge/` ou em entrypoints gerenciados**

- `bootstrap`
- `refactor-context --apply`
- `suggest-skills`
- `create-skill`
- `compile`
- `export`
- `update`
- `improve --apply`
- `uninstall`

Esses comandos escrevem apenas na camada canônica ou nos entrypoints gerenciados pelo AgentForge.

---

## Ativar um agente específico manualmente

Se quiser rodar um agente avulso, sem passar pelo orquestrador:

```
/agentforge-scout
/agentforge-detective
/agentforge-data-master
```

Útil quando já há uma sessão em andamento e você precisa só de um papel específico.
