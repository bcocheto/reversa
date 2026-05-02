# Ciclo de vida

O AgentForge não trata mais o projeto como um dump único de specs. Ele gerencia um ciclo de vida agent-ready contínuo.

---

## Os principais ciclos

### 1. Montar um projeto novo

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge bootstrap
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

Use isso quando você está começando de um projeto novo e quer a camada canônica pronta desde o primeiro dia.

### 2. Adotar um projeto existente

```bash
npx @bcocheto/agentforge install
npx @bcocheto/agentforge adopt
npx @bcocheto/agentforge ingest
npx @bcocheto/agentforge audit-context
npx @bcocheto/agentforge refactor-context --apply
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

Use isso quando o projeto já existe e você quer organizar a superfície agentic atual com segurança.

### 3. Evoluir a camada ao longo do tempo

```bash
npx @bcocheto/agentforge add-agent
npx @bcocheto/agentforge add-flow
npx @bcocheto/agentforge suggest-skills
npx @bcocheto/agentforge create-skill run-tests
npx @bcocheto/agentforge improve
```

Use isso quando o time precisa refinar a camada sem perder o que já funciona.

---

## O que permanece estável

- `.agentforge/` continua sendo a fonte da verdade.
- O manifesto preserva edições personalizadas.
- Blocos gerenciados de bootloader mantêm o conteúdo manual fora do bloco intacto.
- Comandos read-only não modificam os arquivos originais do projeto.

---

## Nota histórica

A velha história de 5 fases de reverse-engineering ainda existe no arquivo legado, mas não é mais a narrativa principal do produto.
