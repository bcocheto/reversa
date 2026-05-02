# Instalação

## Requisitos

- **Node.js 18+** instalado na máquina

Se você ainda não tem Node.js, instale em [nodejs.org](https://nodejs.org) e volte.

---

## Um comando para criar a camada inicial

Na raiz do projeto que você quer preparar:

```bash
npx @bcocheto/agentforge install
```

O instalador cria a camada canônica `.agentforge/`, detecta as engines presentes e escreve os entrypoints gerenciados das engines escolhidas.

Ele cria:

1. a estrutura base de `.agentforge/`
2. o manifesto SHA-256 usado para updates seguros
3. os arquivos de entrada das engines selecionadas na instalação
4. o scaffolding inicial de team, flows, policies e memory

---

## Modos de instalação

- **bootstrap**: começar de um projeto novo e montar a base agent-ready inicial
- **adopt**: inspecionar um projeto existente e importar sua superfície agentic com segurança
- **hybrid**: fazer os dois, quando o projeto já tem alguma estrutura, mas ainda precisa de uma base canônica

---

## O que é criado

```text
projeto/
├── .agentforge/
├── AGENTS.md
├── CLAUDE.md
├── .cursor/rules/agentforge.md
└── .github/copilot-instructions.md
```

Dependendo das engines detectadas, o `install` também pode criar superfícies de compatibilidade como `.cursorrules`.

!!! success "Os arquivos da aplicação ficam intactos"
    O instalador cria arquivos novos e entrypoints gerenciados. Ele não reescreve o código da sua aplicação.

---

## Adicionando outra engine depois

Se depois você quiser adicionar suporte a outra engine:

```bash
npx @bcocheto/agentforge add-engine
```

O instalador detecta o que já existe e adiciona só o que falta.
