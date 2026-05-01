# Visor

**Comando:** `/agentforge-visor`
**Fase:** Qualquer

---

## 🖼️ O ilustrador forense

O ilustrador forense trabalha só com imagens. Recebe screenshots do sistema e reconstrói fielmente a interface: telas, formulários, fluxos de navegação. Não precisa que o sistema esteja rodando. Só das fotos.

---

## O que faz

O ilustrador forense trabalha só com imagens. Você manda screenshots e ele reconstrói fielmente o que está lá: telas, formulários, fluxos de navegação, estados de interface. Não precisa que o sistema esteja rodando. Só das fotos.

Muito útil para sistemas que rodam em ambientes difíceis de acessar: produção bloqueada, banco de dados inacessível, servidor legado que ninguém sabe configurar mais.

!!! info "Requer suporte a imagens"
    O Visor funciona apenas com modelos que aceitam imagens como entrada. Claude, GPT-4o e Gemini suportam. Verifique se sua engine suporta antes de usar.

---

## Como usar

Quando você ativa o Visor, ele pede as screenshots:

> "[Nome], para documentar a interface, envie screenshots das telas do sistema. Pode enviar uma por vez ou várias de uma vez. Priorize as telas principais e os fluxos mais importantes."

Mande as imagens e ele cuida do resto.

---

## O que ele documenta por tela

- **Inventário:** nome e propósito da tela, estado atual (carregando, vazio, preenchido, erro), contexto de uso
- **Formulários:** campos, labels, tipos, placeholders, obrigatoriedade, validações visíveis, botões de ação
- **Tabelas e listagens:** colunas, ações por linha, paginação, filtros
- **Navegação:** menus, submenus, breadcrumbs, links
- **Feedback:** mensagens de sucesso/erro/alerta, modais, confirmações, tooltips
- **Estados:** compara a mesma tela em estados diferentes quando você fornece múltiplas screenshots dela

---

## O que ele produz

| Arquivo | Conteúdo |
|---------|----------|
| `_agentforge_sdd/ui/inventory.md` | Inventário completo de telas |
| `_agentforge_sdd/ui/flow.md` | Fluxo de navegação em Mermaid |
| `_agentforge_sdd/ui/screens/[nome-da-tela].md` | Spec detalhada por tela |
