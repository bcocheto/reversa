# Design System

**Command:** `/agentforge-design-system`
**Phase:** Any

---

## 🎨 The stylist

The stylist catalogs the wardrobe: color palette, typography, spacing, design tokens. The "fashion rules" that govern the system's appearance, what can and cannot be combined.

---

## What it does

The stylist catalogs the system's wardrobe: color palette, typography, spacing, design tokens. The "fashion rules" that govern the project's appearance, what can and can't be combined.

Useful when you need to rewrite the interface or create new components while maintaining visual consistency with what already exists.

---

## Analysis sources

Design System uses whatever is available:

1. **CSS/SCSS/LESS:** CSS variables (`--color-primary`) and Sass variables (`$color-primary`)
2. **Tailwind CSS:** `tailwind.config.js` with custom theme
3. **UI libraries:** MUI (`createTheme`), Chakra UI (`extendTheme`), Mantine, Ant Design
4. **styled-components / Emotion:** theme objects via `ThemeProvider`
5. **Token files:** Style Dictionary, `tokens.json`, `design-tokens.yaml`
6. **Storybook:** if it exists, analyzes stories for component variants
7. **Screenshots:** as visual complement to confirm tokens

---

## What it documents

### Color palette

Primary, secondary, and accent colors; neutral colors; feedback colors (success, error, warning, info); variations (50 to 900 or light/main/dark) with values in hex/rgb/hsl.

### Typography

Font families with fallbacks, size scale, available weights, default line-height and letter-spacing, hierarchy (h1 to h6, body, caption, label, code).

### Spacing and layout

Base spacing scale, grid (columns, gutter, max-width), breakpoints (sm, md, lg, xl, 2xl in px).

### Other tokens

Border-radius, shadows and elevations, z-index scale, transitions and easing functions, semantic opacities.

### Components

If there's a custom component library: list of components, variants, and main props.

---

## What it produces

| File | Content |
|------|---------|
| `_agentforge_sdd/design-system/color-palette.md` | Complete palette with values |
| `_agentforge_sdd/design-system/typography.md` | Typography system |
| `_agentforge_sdd/design-system/spacing.md` | Spacing, grid, and breakpoints |
| `_agentforge_sdd/design-system/tokens.md` | All tokens in a table |
| `_agentforge_sdd/design-system/design-system.md` | Consolidated document |
