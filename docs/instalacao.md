# Installation

## Requirements

- **Node.js 18+** installed on your machine

If you don't have Node.js yet, install it at [nodejs.org](https://nodejs.org) and come back.

---

## One command to bootstrap the layer

In the root of the project you want to prepare:

```bash
npx agentforge install
```

The installer creates the canonical `.agentforge/` layer, detects the engines already present, and writes the managed entrypoints for the engines you enabled.

It creates:

1. the base `.agentforge/` structure
2. the SHA-256 manifest used for safe updates
3. the engine entry files for the engines selected during install
4. the initial team, flows, policies, and memory scaffolding

---

## Installation modes

- **bootstrap**: start from a new project and build the initial agent-ready base
- **adopt**: inspect an existing project and import its agentic surface safely
- **hybrid**: do both, when the project already has some structure but still needs a canonical base

---

## What gets created

```text
project/
├── .agentforge/
├── AGENTS.md
├── CLAUDE.md
├── .cursor/rules/agentforge.md
└── .github/copilot-instructions.md
```

Depending on the detected engines, `install` may also create compatibility surfaces like `.cursorrules`.

!!! success "Original app files stay intact"
    The installer creates new files and managed entrypoints. It does not rewrite your application source code.

---

## Adding another engine later

If you want to add support for another engine later:

```bash
npx agentforge add-engine
```

The installer detects what already exists and adds only what is missing.
