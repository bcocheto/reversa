# Visor

**Command:** `/agentforge-visor`
**Phase:** Any

---

## 🖼️ The forensic illustrator

The forensic illustrator works only with images. Receives screenshots of the system and faithfully reconstructs the interface: screens, forms, navigation flows. Doesn't need the system to be running. Just the photos.

---

## What it does

The forensic illustrator works only with images. You send screenshots and it faithfully reconstructs what's there: screens, forms, navigation flows, interface states. The system doesn't need to be running. Just the photos.

Very useful for systems running in hard-to-access environments: locked production, inaccessible database, legacy server nobody knows how to configure anymore.

!!! info "Requires image support"
    Visor only works with models that accept images as input. Claude, GPT-4o, and Gemini support this. Check if your engine supports it before using.

---

## How to use

When you activate Visor, it asks for screenshots:

> "[Name], to document the interface, send screenshots of the system screens. You can send one at a time or several at once. Prioritize the main screens and most important flows."

Send the images and it handles the rest.

---

## What it documents per screen

- **Inventory:** screen name and purpose, current state (loading, empty, filled, error), usage context
- **Forms:** fields, labels, types, placeholders, required/optional, visible validations, action buttons
- **Tables and listings:** columns, row actions, pagination, filters
- **Navigation:** menus, submenus, breadcrumbs, links
- **Feedback:** success/error/alert messages, modals, confirmations, tooltips
- **States:** compares the same screen in different states when you provide multiple screenshots of it

---

## What it produces

| File | Content |
|------|---------|
| `_agentforge_sdd/ui/inventory.md` | Complete screen inventory |
| `_agentforge_sdd/ui/flow.md` | Navigation flow in Mermaid |
| `_agentforge_sdd/ui/screens/[screen-name].md` | Detailed spec per screen |
