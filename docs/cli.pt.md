# CLI

O AgentForge tem um CLI pequeno para gerenciar a camada agent-ready do projeto. Execute a partir da raiz com `npx @bcocheto/agentforge`.

O registry de comandos é centralizado, então `agentforge commands` e a ajuda principal ficam sempre em sincronia.

---

## Comandos

| Comando | O que faz |
|---------|-----------|
| `install` | Analisa o repositório, faz poucas perguntas e prepara a camada canônica. |
| `commands` | Lista todos os comandos com categorias, uso, aliases, writes e nível de segurança. |
| `analyze` | Escaneia o projeto e produz relatórios e sugestões consolidados. |
| `research-patterns` | Compara o projeto com um catálogo local de padrões. |
| `suggest-agents` | Sugere agentes a partir da análise, padrões, docs e sinais do projeto. |
| `create-agent <agent-id>` | Promove uma sugestão de agente para um agente real. |
| `apply-suggestions` | Promove sugestões geradas para artefatos finais com confirmação. |
| `ingest` | Copia snapshots seguros de instruções para `.agentforge/imports/` sem tocar nos originais. |
| `adopt` | Lê uma superfície agentic existente e gera um plano de adoção. |
| `bootstrap` | Completa a base de um projeto novo usando sinais reais do repositório. |
| `audit-context` | Diagnostica a organização do contexto e escreve `.agentforge/reports/context-audit.md`. |
| `refactor-context` | Cria um plano de refactor ou, com `--apply`, escreve arquivos canônicos em `.agentforge/`. |
| `suggest-skills` | Gera sugestões de skills a partir de imports, contexto, package files e estrutura do repositório. |
| `create-skill <skill-id>` | Promove uma sugestão de skill existente para uma skill real. |
| `add-agent` | Adiciona um agente customizado ao projeto manualmente. |
| `add-flow` | Adiciona um workflow customizado manualmente. |
| `add-engine` | Adiciona suporte a outra engine. |
| `compile` | Atualiza os entrypoints reais do projeto nas engines configuradas. |
| `export` | Alias de `compile`. |
| `export-package` | Gera o pacote isolado em `_agentforge/` sem alterar os entrypoints reais. |
| `validate` | Valida a estrutura canônica `.agentforge/` e os entrypoints gerenciados. |
| `improve` | Revê `.agentforge/` e sugere melhorias mais seguras e legíveis para humanos. |
| `status` | Mostra o estado atual do AgentForge. |
| `update` | Atualiza os arquivos gerados preservando edições personalizadas. |
| `uninstall` | Remove com segurança os arquivos gerenciados pelo AgentForge. |
| `export-diagrams` | Exporta diagramas Mermaid quando a cadeia de ferramentas está disponível. |

---

## Comandos read-only

Esses comandos leem sinais do projeto sem modificar os arquivos originais:

- `analyze`
- `research-patterns`
- `suggest-agents`
- `ingest`
- `adopt`
- `audit-context`

---

## Registry

Use estes comandos de registry para inspecionar o catálogo completo:

```bash
npx @bcocheto/agentforge commands
npx @bcocheto/agentforge commands --json
npx @bcocheto/agentforge commands --category agents
```

`--stable` e `--experimental` podem ser combinados com `--category`.

---

## `compile` versus `export-package`

`compile` atualiza os bootloaders reais do projeto. `export-package` gera o pacote isolado em `_agentforge/`.
`export --package` é um atalho explícito para o mesmo pacote isolado.

O Cursor fica padronizado em `.cursor/rules/agentforge.md`. O arquivo legado `.cursorrules` fica apenas para compatibilidade na detecção durante a instalação.
