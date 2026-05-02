# Instalación

## Requisitos

- **Node.js 18+** instalado en tu máquina

Si todavía no tienes Node.js, instálalo en [nodejs.org](https://nodejs.org) y vuelve.

---

## Un comando para crear la capa inicial

En la raíz del proyecto que quieres preparar:

```bash
npx @bcocheto/agentforge install
```

El instalador crea la capa canónica `.agentforge/`, detecta los motores presentes y escribe los entrypoints gestionados de los motores que elegiste.

Crea:

1. la estructura base de `.agentforge/`
2. el manifiesto SHA-256 usado para updates seguros
3. los archivos de entrada de los motores seleccionados en la instalación
4. el scaffolding inicial de team, flows, policies y memory

---

## Modos de instalación

- **bootstrap**: empezar desde un proyecto nuevo y montar la base agent-ready inicial
- **adopt**: inspeccionar un proyecto existente e importar su superficie agentic con seguridad
- **hybrid**: hacer ambas cosas, cuando el proyecto ya tiene algo de estructura pero todavía necesita una base canónica

---

## Qué se crea

```text
proyecto/
├── .agentforge/
├── AGENTS.md
├── CLAUDE.md
├── .cursor/rules/agentforge.md
└── .github/copilot-instructions.md
```

Dependiendo de los motores detectados, `install` también puede crear superficies de compatibilidad como `.cursorrules`.

!!! success "Los archivos de tu aplicación quedan intactos"
    El instalador crea archivos nuevos y entrypoints gestionados. No reescribe el código de tu aplicación.

---

## Agregar otro motor después

Si luego quieres añadir soporte para otro motor:

```bash
npx @bcocheto/agentforge add-engine
```

El instalador detecta lo que ya existe y agrega solo lo que falta.
