# Configuração

O AgentForge guarda sua configuração e estado da análise dentro de `.agentforge/` na raiz do projeto.

---

## Estrutura de `.agentforge/`

```text
.agentforge/
├── state.json
├── config.toml
├── config.user.toml
├── plan.md
├── imports/
├── context/
├── references/
├── policies/
├── flows/
├── skills/
├── memory/
├── reports/
└── _config/
    ├── manifest.yaml
    └── files-manifest.json
```

---

## `config.toml`

```toml
[project]
name = "meu-projeto"
language = "pt-br"

[output]
folder = "_agentforge_sdd"

[engines]
active = ["claude-code"]
```

---

## `config.user.toml`

```toml
[user]
name = "Seu Nome"
answer_mode = "chat"  # "chat" ou "file"
```

!!! warning "Não commitar"
    Adicione `config.user.toml` ao `.gitignore`. Cada pessoa do time pode manter preferências pessoais sem afetar o projeto.

---

## Read-only versus escritas seguras

**Leem os arquivos originais sem modificá-los**

- `ingest`
- `adopt`
- `audit-context`

**Escrevem com segurança em `.agentforge/` ou em entrypoints gerenciados**

- `bootstrap`
- `refactor-context --apply`
- `suggest-skills`
- `create-skill`
- `compile`
- `export`
- `update`
- `improve --apply`
- `uninstall`

Os comandos acima escrevem apenas na camada canônica ou nos entrypoints que o AgentForge gerencia explicitamente. O código da aplicação fica fora do escopo.

---

## `state.json`

O arquivo de estado guarda a fase atual, os artefatos gerados, o histórico de auditorias e as informações necessárias para retomar sessões.

---

## `doc_level`

`bootstrap` e `install` ajudam a preparar o projeto, mas o nível de documentação continua sendo uma escolha operacional. O AgentForge guarda o valor em `.agentforge/state.json` e respeita isso em execuções posteriores.
