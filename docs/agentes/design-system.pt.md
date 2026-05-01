# Design System

**Comando:** `/agentforge-design-system`
**Fase:** Qualquer

---

## 🎨 O estilista

O estilista cataloga o guarda-roupa: paleta de cores, tipografia, espaçamentos, tokens de design. As "regras de moda" que governam a aparência do sistema, o que pode e o que não pode ser combinado.

---

## O que faz

O estilista cataloga o guarda-roupa do sistema: paleta de cores, tipografia, espaçamentos, tokens de design. As "regras de moda" que governam a aparência do projeto, o que pode e o que não pode ser combinado.

Útil quando você precisa reescrever a interface ou criar novos componentes mantendo consistência visual com o que já existe.

---

## Fontes de análise

O Design System usa o que estiver disponível:

1. **CSS/SCSS/LESS:** variáveis CSS (`--color-primary`) e variáveis Sass (`$color-primary`)
2. **Tailwind CSS:** `tailwind.config.js` com tema customizado
3. **Bibliotecas de UI:** MUI (`createTheme`), Chakra UI (`extendTheme`), Mantine, Ant Design
4. **styled-components / Emotion:** objetos de tema via `ThemeProvider`
5. **Arquivos de tokens:** Style Dictionary, `tokens.json`, `design-tokens.yaml`
6. **Storybook:** se existir, analisa stories para variantes de componentes
7. **Screenshots:** como complemento visual para confirmar tokens

---

## O que ele documenta

### Paleta de cores

Cores primárias, secundárias e de destaque; cores neutras; cores de feedback (sucesso, erro, alerta, informação); variações (50 a 900 ou light/main/dark) com valores em hex/rgb/hsl.

### Tipografia

Famílias de fontes com fallbacks, escala de tamanhos, pesos disponíveis, line-height e letter-spacing padrão, hierarquia (h1 a h6, body, caption, label, code).

### Espaçamento e layout

Escala de espaçamento base, grid (colunas, gutter, largura máxima), breakpoints (sm, md, lg, xl, 2xl em px).

### Outros tokens

Border-radius, sombras e elevações, z-index, transições e easing functions, opacidades semânticas.

### Componentes

Se houver biblioteca de componentes própria: lista de componentes, variantes e props principais.

---

## O que ele produz

| Arquivo | Conteúdo |
|---------|----------|
| `_agentforge_sdd/design-system/color-palette.md` | Paleta completa com valores |
| `_agentforge_sdd/design-system/typography.md` | Sistema tipográfico |
| `_agentforge_sdd/design-system/spacing.md` | Espaçamento, grid e breakpoints |
| `_agentforge_sdd/design-system/tokens.md` | Todos os tokens em tabela |
| `_agentforge_sdd/design-system/design-system.md` | Documento consolidado |
