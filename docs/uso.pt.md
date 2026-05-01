# Como usar

## Ativar o agentforge

Após instalar, abra o projeto no seu agente de IA e ative o agentforge:

=== "Claude Code / Cursor / Gemini CLI"

    ```
    /agentforge
    ```

=== "Codex e engines sem slash commands"

    ```
    agentforge
    ```

É só isso. O agentforge assume o controle e coordena toda a análise a partir daí.

---

## O que acontece quando você ativa

O agentforge verifica se existe uma análise em andamento:

**Primeira vez:** ele cria um plano de exploração personalizado para o seu projeto, apresenta ao usuário para aprovação e começa a análise pela fase 1.

**Sessão retomada:** ele lê o checkpoint salvo em `.agentforge/state.json` e continua exatamente de onde parou. Não importa se você fechou o editor, reiniciou a máquina ou deixou dormindo por três dias.

---

## Fluxo típico de uma análise completa

```
Você digita /agentforge
        ↓
agentforge cria o plano de exploração
        ↓
Você revisa e aprova o plano
        ↓
Scout mapeia a superfície do projeto
        ↓
agentforge apresenta o resumo do Scout e você escolhe o nível de documentação
        ↓
Archaeologist analisa módulo por módulo
        ↓
Detective e Architect interpretam o que foi encontrado
        ↓
Writer gera as especificações (uma por vez, com sua aprovação)
        ↓
Reviewer revisa tudo e levanta perguntas para validação
        ↓
Especificações prontas em _agentforge_sdd/
```

O processo é incremental e conversacional. Você não precisa estar presente o tempo todo: o agentforge avisa quando precisa de você.

---

## Quanto tempo leva?

Depende do tamanho do projeto, mas uma regra geral:

| Tamanho do projeto | Estimativa |
|--------------------|------------|
| Pequeno (< 10 módulos) | 2 a 4 sessões |
| Médio (10 a 30 módulos) | 5 a 10 sessões |
| Grande (30+ módulos) | 10+ sessões |

O Archaeologist analisa um módulo por sessão para economizar contexto. Para projetos grandes, você vai retomar várias vezes, mas cada retomada é automática e sem perda de progresso.

---

## Dica: estouro de contexto

Se a sessão ficar muito longa e o contexto começar a acabar, o agentforge salva o checkpoint automaticamente e avisa:

> "Vou pausar aqui. Tudo está salvo. Digite `/agentforge` em uma nova sessão para continuar."

Sem drama. Sem perda. É só continuar depois.

---

## Nível de documentação

Depois que o Scout termina, o agentforge apresenta um resumo do que encontrou (quantos módulos, integrações, se há banco de dados) e pergunta qual volume de documentação você quer para o projeto:

| Nível | Quando usar | O que gera |
|-------|-------------|------------|
| **Essencial** | Projetos simples, scripts, protótipos | Artefatos principais: análise de código, domínio, arquitetura, specs SDD |
| **Completo** | Projetos médios, equipes pequenas (padrão) | Tudo do essencial + diagramas C4, ERD, ADRs, OpenAPI, user stories e matrizes de rastreabilidade |
| **Detalhado** | Sistemas enterprise, múltiplas equipes | Tudo do completo + flowcharts por função, ADRs expandidos, diagrama de deployment e revisão cruzada obrigatória |

A escolha fica salva em `.agentforge/state.json` e todos os agentes seguintes a respeitam automaticamente. Se precisar ajustar depois de iniciada a análise, basta editar o campo `doc_level` no arquivo.

---

## Ativar um agente específico manualmente

Se quiser rodar um agente avulso, sem passar pelo orquestrador:

```
/agentforge-scout
/agentforge-detective
/agentforge-data-master
```

Útil quando você já tem uma análise em andamento e quer executar um agente específico por algum motivo pontual.
