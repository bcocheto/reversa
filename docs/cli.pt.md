# CLI

O agentforge tem um CLI simples para gerenciar a instalação e o ciclo de vida dos agentes no seu projeto. Todos os comandos rodam com `npx agentforge` na raiz do projeto.

---

## Comandos disponíveis

### `install`

```bash
npx agentforge install
```

Instala o agentforge no projeto legado atual. Detecta as engines presentes, pergunta suas preferências e cria toda a estrutura necessária.

Use uma vez, na raiz do projeto que você quer analisar.

---

### `ingest`

```bash
npx agentforge ingest
```

Importa arquivos de instrução agentic seguros e explícitos que já existem no projeto para `.agentforge/imports/snapshots/`, sem tocar nos originais.

Use isso antes de auditar ou refatorar uma superfície existente.

---

### `audit-context`

```bash
npx agentforge audit-context
```

Analisa snapshots importados e entrypoints existentes para diagnosticar a organização do contexto.
Ele escreve `.agentforge/reports/context-audit.md` e atualiza os metadados da auditoria em `.agentforge/state.json`.

Use depois de importar os snapshots ou quando quiser uma visão determinística e read-only da qualidade do contexto.

---

### `refactor-context`

```bash
npx agentforge refactor-context
```

Analisa snapshots importados e entrypoints existentes para separar o conteúdo em arquivos canônicos `.agentforge/`.
Sem `--apply`, escreve apenas `.agentforge/reports/refactor-plan.md`.
Com `--apply`, cria ou atualiza arquivos canônicos seguros e preserva os que foram editados manualmente.

Use depois da auditoria quando quiser fazer a primeira segmentação do contexto.

---

### `suggest-skills`

```bash
npx agentforge suggest-skills
```

Analisa imports, contexto, package files e a estrutura do repositório para sugerir skills do projeto.
Escreve `.agentforge/reports/skill-suggestions.md` e sugestões YAML em `.agentforge/skill-suggestions/`.

Use quando quiser uma shortlist determinística de skills para criar depois, não skills finais.

---

### `status`

```bash
npx agentforge status
```

Mostra o estado atual da análise: qual fase está em andamento, quais agentes já rodaram, o que falta completar.

Útil para ter uma visão geral rápida antes de retomar uma sessão.

---

### `update`

```bash
npx agentforge update
```

Atualiza os agentes para a versão mais recente do agentforge.

O comando é inteligente: ele verifica o manifesto SHA-256 de cada arquivo e nunca sobrescreve arquivos que você personalizou. Se você fez ajustes em algum agente, eles ficam intactos.

---

### `add-agent`

```bash
npx agentforge add-agent
```

Adiciona um agente específico ao projeto. Útil se você não instalou todos os agentes na instalação inicial e agora quer incluir, por exemplo, o Data Master ou o Design System.

---

### `add-engine`

```bash
npx agentforge add-engine
```

Adiciona suporte a uma engine de IA que não estava presente quando você instalou. Por exemplo: instalou só para Claude Code e agora quer adicionar Codex também.

---

### `uninstall`

```bash
npx agentforge uninstall
```

Remove o agentforge do projeto: apaga os arquivos criados pela instalação (`.agentforge/`, `.agents/skills/agentforge-*/`, os arquivos de entrada das engines).

!!! info "Seus arquivos continuam intactos"
    O `uninstall` remove **apenas** o que o agentforge criou. Nenhum arquivo original do projeto é tocado. As especificações geradas em `_agentforge_sdd/` também são preservadas por padrão.
