# Escala de confiança

Uma das partes mais importantes do agentforge é a honestidade. O sistema não finge saber o que não sabe.

Toda afirmação gerada nas especificações é marcada com um dos três níveis abaixo. Sem exceções.

---

## Os três níveis

| Marcação | Nome | Significado |
|----------|------|-------------|
| 🟢 | **CONFIRMADO** | Extraído diretamente do código, com arquivo e linha como evidência. Pode ser citado. |
| 🟡 | **INFERIDO** | Deduzido a partir de padrões, nomenclatura ou contexto. Provavelmente está certo, mas pode estar errado. |
| 🔴 | **LACUNA** | Não determinável pela análise do código. Requer validação humana. |

---

## Por que isso importa

Sem essa marcação, uma especificação gerada por IA é uma caixa preta de confiança. Você não sabe o que foi extraído do código e o que foi inventado.

Com a escala de confiança, você sabe exatamente onde confiar e onde questionar. Um agente de IA usando essa spec sabe o mesmo: "esse item é 🟢, pode usar. Esse é 🔴, precisa de uma fonte humana."

---

## Exemplos práticos

**🟢 CONFIRMADO**

> A função `calcular_desconto` aplica 15% para pedidos acima de R$ 500.
> Fonte: `src/pricing/discount.js`, linha 47.

Isso foi extraído literalmente do código. Se alguém contestar, tem onde apontar.

---

**🟡 INFERIDO**

> O sistema parece usar soft delete para registros de clientes (campo `deleted_at` presente na tabela).

O campo existe, o padrão é conhecido, mas em nenhum lugar do código está escrito explicitamente "usamos soft delete". Pode ser que o campo esteja lá por outro motivo.

---

**🔴 LACUNA**

> Não foi possível determinar o comportamento do sistema quando o pagamento falha por timeout na gateway.

O código chama a gateway, mas não há tratamento de erro para timeout. O comportamento real pode existir na camada de infraestrutura, em um banco de dados que não foi analisado, ou nunca ter sido implementado. Precisa de alguém que conhece o sistema para responder.

---

## Como as lacunas são resolvidas

O Reviewer coleta todas as lacunas 🔴 e as apresenta como perguntas para você responder. Depois que você responde, ele atualiza as specs e reclassifica: 🔴 vira 🟢 se você confirmou com evidência, ou 🟡 se você deu uma resposta mas sem certeza absoluta.

Lacunas que não puderam ser respondidas ficam em `_agentforge_sdd/gaps.md` para tratamento posterior.
