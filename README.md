# Reversa

**Transforme sistemas legados em especificações executáveis por agentes de IA.**

O Reversa é um framework de engenharia reversa de especificações. Ele se instala dentro do seu projeto legado e coordena agentes de IA especializados para analisar o código existente e gerar especificações completas, rastreáveis e prontas para uso por qualquer agente codificador.

---

## Por que o Reversa existe

Agentes de IA são excelentes para criar software novo a partir de especificações. O problema é que a maioria dos projetos reais não tem especificações — o conhecimento está no código, nos commits, na cabeça das pessoas.

O Reversa inverte esse fluxo: parte do código existente para gerar as specs. O resultado é um conjunto de documentos que qualquer agente de IA pode usar para entender, evoluir, refatorar ou reimplementar o sistema com fidelidade.

---

## Instalação

Na raiz do projeto legado:

```bash
npx reversa install
```

O instalador vai:
1. Detectar as engines de IA presentes no ambiente (Claude Code, Codex, Cursor, etc.)
2. Perguntar quais agentes instalar — todos selecionados por padrão
3. Coletar nome do projeto, idioma e preferências
4. Copiar os agentes para `.agents/skills/` (e `.claude/skills/` para Claude Code)
5. Criar o arquivo de entrada da engine (`CLAUDE.md`, `AGENTS.md`, etc.)
6. Criar a estrutura `.reversa/` com estado, configuração e plano
7. Gerar manifesto SHA-256 para atualizações seguras

> O Reversa **nunca apaga ou modifica** arquivos existentes no seu projeto.
> Os agentes escrevem apenas em `.reversa/` e na pasta de saída (`_reversa_sdd/` por padrão).

**Requisitos:** Node.js 18+

---

> [!IMPORTANT]
> ### 🔒 Segurança e privacidade — leia antes de começar
>
> **Imutabilidade garantida do projeto legado**
> Os agentes do Reversa operam sob uma diretiva estrita e inviolável: **nenhum arquivo fora das pastas criadas pelo próprio Reversa (`.reversa/` e `_reversa_sdd/`) pode ser criado, modificado ou apagado**. Mesmo instalado na raiz do seu projeto, o Reversa não toca no seu código-fonte, configurações ou qualquer arquivo preexistente.
>
> **Sem chaves de API**
> O Reversa **não solicita, não armazena e não transmite** chaves de API de nenhum serviço de LLM. Toda a inteligência é delegada ao agente de IA já presente no seu ambiente (Claude Code, Codex, Cursor, etc.) — sem dependências externas de autenticação.

---

## Como usar

Após a instalação, abra o projeto no agente de IA e ative o Maestro:

```
/reversa
```

Em engines sem suporte a slash commands (como Codex):

```
reversa
```

O Maestro vai se apresentar, criar um plano de exploração personalizado e coordenar toda a análise. O progresso é salvo em `.reversa/state.json` a cada checkpoint — se a sessão for interrompida, basta digitar `reversa` para retomar de onde parou.

---

## Como funciona

O Reversa usa um pipeline de 5 fases orquestradas pelo **Maestro**:

```
Reconhecimento → Escavação → Interpretação → Geração  → Revisão
    Scout        Arqueólogo    Detetive       Redator    Advogado
                               Arquiteto
```

Agentes independentes (rodam em qualquer fase): **Visor**, **Data Master**, **Design System**, **Tracer**

---

## Agentes

### Obrigatórios

| Agente | Função |
|--------|--------|
| **Maestro** | Orquestrador central. Coordena todos os agentes, salva checkpoints e guia o usuário |
| **Scout** | Mapeia a superfície: estrutura de pastas, linguagens, frameworks, dependências, entry points |
| **Arqueólogo** | Análise profunda módulo a módulo: algoritmos, fluxos de controle, estruturas de dados |
| **Detetive** | Extrai conhecimento de negócio implícito: regras, ADRs retroativos, máquinas de estado, permissões |
| **Arquiteto** | Sintetiza tudo em diagramas C4, ERD completo, mapa de integrações e dívidas técnicas |
| **Redator** | Gera especificações como contratos operacionais com rastreabilidade de código |

### Opcionais (instalados por padrão)

| Agente | Função |
|--------|--------|
| **Advogado do Diabo** | Revisa as specs, encontra inconsistências e valida lacunas com o usuário |
| **Tracer** | Análise dinâmica: resolve lacunas via logs, tracing e dados reais (somente leitura) |
| **Visor** | Documenta a interface a partir de screenshots — sem precisar que o sistema esteja rodando |
| **Data Master** | Análise completa do banco: DDL, migrations, ORM, ERD, triggers, procedures |
| **Design System** | Extrai tokens de design: cores, tipografia, espaçamentos, temas e componentes |

---

## O que é gerado

```
_reversa_sdd/
├── inventory.md              # Inventário do projeto
├── dependencies.md           # Dependências com versões
├── code-analysis.md          # Análise técnica por módulo
├── data-dictionary.md        # Dicionário de dados
├── domain.md                 # Glossário e regras de negócio
├── state-machines.md         # Máquinas de estado em Mermaid
├── permissions.md            # Matriz de permissões
├── architecture.md           # Visão arquitetural
├── c4-context.md             # Diagrama C4 — Contexto
├── c4-containers.md          # Diagrama C4 — Containers
├── c4-components.md          # Diagrama C4 — Componentes
├── erd-complete.md           # ERD completo em Mermaid
├── confidence-report.md      # Relatório de confiança 🟢🟡🔴
├── gaps.md                   # Lacunas identificadas
├── questions.md              # Perguntas para validação humana
├── dynamic.md                # Descobertas da análise dinâmica (Tracer)
├── sdd/                      # Specs por componente
│   └── [componente].md
├── openapi/                  # Specs de API (se aplicável)
├── user-stories/             # User stories (se aplicável)
├── adrs/                     # Decisões arquiteturais retroativas
├── flowcharts/               # Fluxogramas em Mermaid
├── sequences/                # Diagramas de sequência
├── ui/                       # Specs de interface (Visor)
├── database/                 # Specs de banco de dados (Data Master)
├── design-system/            # Tokens de design (Design System)
└── traceability/
    ├── spec-impact-matrix.md # Qual spec impacta qual
    └── code-spec-matrix.md   # Arquivo de código → spec correspondente
```

### Escala de confiança

Toda afirmação nas specs é marcada com:

| Marcação | Significado |
|----------|-------------|
| 🟢 CONFIRMADO | Extraído diretamente do código — pode ser citado com arquivo e linha |
| 🟡 INFERIDO | Deduzido de padrões — pode estar errado |
| 🔴 LACUNA | Não determinável pelo código — requer validação humana |

---

## Engines suportadas

| Engine | Arquivo criado | Skills path | Ativação |
|--------|---------------|-------------|---------|
| Claude Code ⭐ | `CLAUDE.md` | `.claude/skills/reversa-*/` e `.agents/skills/reversa-*/` | `/reversa` |
| Codex ⭐ | `AGENTS.md` | `.agents/skills/reversa-*/` | `reversa` |
| Cursor ⭐ | `.cursorrules` | `.agents/skills/reversa-*/` | `/reversa` |
| Gemini CLI | `GEMINI.md` | `.agents/skills/reversa-*/` | `/reversa` |
| Windsurf | `.windsurfrules` | `.agents/skills/reversa-*/` | `/reversa` |

---

## Comandos CLI

```bash
npx reversa install      # Instala o Reversa no projeto
npx reversa status       # Mostra o estado atual da análise
npx reversa update       # Atualiza os agentes para a versão mais recente
npx reversa add-agent    # Adiciona um agente ao projeto
npx reversa add-engine   # Adiciona suporte a uma nova engine
npx reversa uninstall    # Remove o Reversa do projeto
```

O comando `update` detecta arquivos modificados por você via SHA-256 e nunca sobrescreve customizações.
O comando `uninstall` remove apenas os arquivos criados pelo Reversa — nada do projeto legado é tocado.

---

## Estrutura interna

```
.reversa/
├── state.json          # Estado da análise entre sessões
├── config.toml         # Configuração do projeto
├── config.user.toml    # Preferências pessoais (não commitar)
├── plan.md             # Plano de exploração (editável pelo usuário)
├── version             # Versão instalada
├── context/
│   ├── surface.json    # Gerado pelo Scout
│   └── modules.json    # Gerado pelo Arqueólogo
└── _config/
    ├── manifest.yaml       # Metadados da instalação
    └── files-manifest.json # Hashes SHA-256 para update seguro

.agents/skills/         # Skills universais (todos os agentes compatíveis)
.claude/skills/         # Mirror para Claude Code
```

---

## Contribuindo

Contribuições são bem-vindas. Abra uma issue para discutir antes de enviar um PR.

```bash
git clone https://github.com/sandeco/reversa.git
cd reversa
npm install
```

---

## Licença

MIT — veja [LICENSE](LICENSE) para detalhes.
