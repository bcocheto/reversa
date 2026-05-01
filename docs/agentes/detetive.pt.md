# Detective

**Comando:** `/agentforge-detective`
**Fase:** 3 - Interpretação

---

## 🔍 Sherlock Holmes

Sherlock Holmes chega depois do arqueólogo. Olha para os artefatos catalogados e pergunta: *"Mas por que isso está aqui? Quem colocou? O que isso revela sobre quem viveu aqui?"* Ele não escava. Ele interpreta.

---

## O que faz

O Detective chega depois do Archaeologist. Olha para tudo que foi catalogado e pergunta: *"Mas por que isso está aqui? Quem colocou isso? O que isso revela sobre quem construiu esse sistema?"*

Ele não escava mais código. Ele interpreta o que foi escavado. É o especialista em extrair o conhecimento tácito que nunca foi documentado: as regras de negócio que vivem em condicionais, as decisões arquiteturais que só existem no histórico git, as restrições que aparecem em validações sem comentário nenhum.

---

## O que ele analisa

### Arqueologia git

O Detective lê o histórico de commits como um diário do projeto:

- Mensagens que revelam decisões de negócio ou técnicas
- Commits de fix/hotfix: indicam comportamentos que "deveriam funcionar assim mas não funcionavam"
- Grandes refatorações: indicam mudanças de requisitos que ninguém documentou
- Reverts com motivo aparente
- Tudo isso vira fonte para ADRs retroativos

### Regras de negócio implícitas

- Condicionais complexas com lógica de domínio
- Validações e restrições nos modelos
- Constantes e enums com nomes de negócio (aqueles que revelam muito sobre como o domínio pensa)
- Comentários antigos: são evidências de intenções passadas
- TODOs e FIXMEs: intenções não implementadas que podem revelar requisitos esquecidos

### Máquinas de estado

Para cada entidade com campo de status/estado, o Detetive mapeia:

- Todos os valores possíveis
- Transições permitidas e seus gatilhos
- Diagrama de estados em Mermaid

### Permissões e papéis

- Papéis de usuário no sistema
- Permissões por papel
- Restrições de acesso a funcionalidades e dados
- Tudo em formato de matriz de permissões

---

## O que ele produz

| Arquivo | Conteúdo |
|---------|----------|
| `_agentforge_sdd/domain.md` | Glossário e regras de domínio |
| `_agentforge_sdd/state-machines.md` | Máquinas de estado em Mermaid |
| `_agentforge_sdd/permissions.md` | Matriz de permissões |
| `_agentforge_sdd/adrs/[numero]-[titulo].md` | Um ADR por decisão identificada |

---

## Uma nota sobre confiança

O Detective é rigoroso com a [escala de confiança](../escala-confianca.md). A maior parte do que ele extrai é 🟡 INFERIDO, e ele sabe disso. A arte é inferir bem e marcar honestamente onde há incerteza.

Regras de negócio inferidas do código são hipóteses até serem validadas por alguém que conhece o negócio de verdade.
