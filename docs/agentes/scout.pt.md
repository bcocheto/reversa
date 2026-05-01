# Scout

**Comando:** `/agentforge-scout`
**Fase:** 1 - Reconhecimento

---

## 🗺️ O corretor de imóveis

O corretor faz o primeiro tour no imóvel. Não abre gavetas, não lê documentos, não mexe em nada. Só mapeia: quantos cômodos, qual o bairro, que instalações existem, qual o estado geral.

---

## O que faz

O Scout é o primeiro a entrar no projeto. Ele faz o tour inicial: não abre gavetas, não lê todos os documentos, não mexe em nada. Só mapeia o território.

Quantos módulos existem? Qual linguagem? Qual framework? Quais as dependências críticas? Onde é o ponto de entrada da aplicação? O Scout responde tudo isso sem precisar ler uma linha de lógica de negócio.

---

## O que ele analisa

- **Estrutura de pastas:** árvore completa do projeto (excluindo `node_modules`, `.git`, `dist`, `build` e similares)
- **Tecnologias e frameworks:** linguagens identificadas por extensão de arquivo, frameworks e bibliotecas via arquivos de configuração (`package.json`, `requirements.txt`, `go.mod`, etc.)
- **Pontos de entrada:** `main`, `index`, `app`, `server`, `bootstrap`; arquivos de configuração; CI/CD; Docker
- **Schema de banco (superficial):** apenas lista arquivos DDL, migrations e ORM. O Data Master faz a análise detalhada.
- **Cobertura de testes:** frameworks de teste identificados e estimativa de cobertura por contagem de arquivos

---

## O que ele produz

| Arquivo | Conteúdo |
|---------|----------|
| `_agentforge_sdd/inventory.md` | Inventário completo do projeto |
| `_agentforge_sdd/dependencies.md` | Dependências com versões |
| `.agentforge/context/surface.json` | Dados estruturados para os demais agentes |

O `surface.json` é especialmente importante: o agentforge o usa para personalizar as tarefas da Fase 2 com base nos módulos identificados.

---

## Quando usar manualmente

Você raramente vai precisar chamar o Scout diretamente. O orquestrador faz isso automaticamente na Fase 1. Mas se você quiser atualizar o inventário do projeto depois de uma refatoração grande, pode chamar diretamente:

```
/agentforge-scout
```
