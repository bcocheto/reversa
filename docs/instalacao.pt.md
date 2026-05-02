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

O instalador agora começa com análise, faz poucas perguntas de onboarding, mostra um resumo do que detectou e só então aplica a estrutura recomendada se você aprovar.

Ele pergunta:

- projeto novo ou projeto existente
- engines suportadas
- nome do projeto
- nome do usuário
- estratégia git
- idioma do chat
- idioma dos documentos

Ele infere:

- stack
- framework
- arquitetura provável
- agentes
- flows
- skills
- padrões recomendados
- entrypoints a regenerar

Ele então escreve ou atualiza:

1. a estrutura base de `.agentforge/`
2. o manifesto SHA-256 usado para updates seguros
3. os entrypoints e bootloaders gerenciados das engines escolhidas
4. os relatórios de análise, padrões, sugestões e validação

---

## Modos de instalação

- **bootstrap**: começar de um projeto novo e montar a base agent-ready inicial
- **adopt**: inspecionar um projeto existente e reorganizar sua superfície agentic com segurança
- **hybrid**: mantido para normalização de estado legado; não aparece na UI do instalador

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
    O instalador cria arquivos novos e entrypoints gerenciados. Ele não reescreve o código da sua aplicação. Entry points existentes são preservados como snapshots antes do takeover.

---

## Próximo passo sugerido

Depois do install, use:

```bash
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

---

## Adicionando outra engine depois

Se depois você quiser adicionar suporte a outra engine:

```bash
npx @bcocheto/agentforge add-engine
```

O instalador detecta o que já existe e adiciona só o que falta.
