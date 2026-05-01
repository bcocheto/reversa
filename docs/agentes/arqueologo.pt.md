# Archaeologist

**Comando:** `/agentforge-archaeologist`
**Fase:** 2 - Escavação

---

## ⛏️ O escavador

O arqueólogo escava o terreno com paciência, camada por camada. Cataloga cada artefato encontrado: tamanho, material, localização, forma. Ele não interpreta a civilização, só descreve com precisão o que está lá.

---

## O que faz

O Archaeologist escava o código com paciência, camada por camada. Cataloga cada artefato encontrado: tamanho, forma, localização, estrutura. Ele não interpreta a civilização, não tira conclusões sobre o negócio. Só descreve com precisão o que está lá.

É um trabalho meticuloso e repetitivo, e isso é exatamente o que o torna valioso. O Detective e o Architect vão precisar do que ele catalogou para fazer o trabalho interpretativo.

---

## O que ele analisa por módulo

- **Fluxo de controle:** funções e métodos principais, condicionais complexas, loops com lógica de negócio, tratamento de erros e exceções
- **Algoritmos e lógica:** algoritmos não-triviais, transformações de dados, cálculos e fórmulas, lógica de validação
- **Estruturas de dados:** modelos, entidades, DTOs, interfaces; dicionário de dados com campos, tipos, obrigatoriedade e valores padrão
- **Metadados e configurações:** constantes e enums com nomes de domínio, feature flags, parâmetros configuráveis por ambiente

---

## Um módulo por sessão

O Archaeologist analisa um módulo por vez, de propósito. Para projetos com muitos módulos, isso significa várias sessões. Mas é a abordagem certa:

- Preserva qualidade: análise profunda de um módulo é melhor que análise rasa de vinte
- Conserva contexto: não esgota a janela de contexto do agente
- Permite revisão incremental: você pode revisar o resultado de cada módulo antes de continuar

---

## O que ele produz

| Arquivo | Conteúdo |
|---------|----------|
| `_agentforge_sdd/code-analysis.md` | Análise técnica consolidada |
| `_agentforge_sdd/data-dictionary.md` | Dicionário completo de dados |
| `_agentforge_sdd/flowcharts/[modulo].md` | Fluxograma em Mermaid por módulo |
| `.agentforge/context/modules.json` | Dados estruturados por módulo para os próximos agentes |

---

## Escala de confiança

O Archaeologist usa a [escala de confiança](../escala-confianca.md) em tudo que produz:

- 🟢 para o que ele leu diretamente no código
- 🟡 para o que ele inferiu de padrões
- 🔴 para o que estava ilegível, obfuscado ou dependente de dados externos
