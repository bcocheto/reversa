# Installation

## Requirements

- **Node.js 18+** installed on your machine

If you don't have Node.js yet, install it at [nodejs.org](https://nodejs.org) and come back.

---

## One command to bootstrap the layer

In the root of the project you want to prepare:

```bash
npx @bcocheto/agentforge install
```

The installer now starts with analysis, then asks a small set of onboarding questions, shows a summary of what it detected, and only then applies the recommended structure if you approve it.

It asks for:

- new project or existing project
- supported engines
- project name
- user name
- git strategy
- chat language
- document language

It infers:

- stack
- framework
- probable architecture
- agents
- flows
- skills
- recommended patterns
- entrypoints to regenerate

It then writes or refreshes:

1. the base `.agentforge/` structure
2. the SHA-256 manifest used for safe updates
3. the engine entry files and managed bootloaders for the selected engines
4. the initial analysis, pattern, suggestion, and validation reports

---

## Installation modes

- **bootstrap**: start from a new project and build the initial agent-ready base
- **adopt**: inspect an existing project and reorganize its agentic surface safely
- **hybrid**: kept for legacy state normalization; it is not shown in the installer UI

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
    The installer creates new files and managed entrypoints. It does not rewrite your application source code. Existing entrypoints are preserved as snapshots before takeover.

---

## Suggested follow-up

After install, use:

```bash
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

---

## Adding another engine later

If you want to add support for another engine later:

```bash
npx @bcocheto/agentforge add-engine
```

The installer detects what already exists and adds only what is missing.
