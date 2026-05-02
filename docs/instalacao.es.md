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

El instalador ahora empieza con análisis, hace pocas preguntas de onboarding, muestra un resumen de lo detectado y solo entonces aplica la estructura recomendada si la apruebas.

Pregunta:

- proyecto nuevo o proyecto existente
- motores soportados
- nombre del proyecto
- nombre del usuario
- estrategia git
- idioma del chat
- idioma de los documentos

Infiere:

- stack
- framework
- arquitectura probable
- agentes
- flows
- skills
- patrones recomendados
- entrypoints a regenerar

Luego escribe o refresca:

1. la estructura base de `.agentforge/`
2. el manifiesto SHA-256 usado para updates seguros
3. los entrypoints y bootloaders gestionados de los motores seleccionados
4. los reportes de análisis, patrones, sugerencias y validación

---

## Modos de instalación

- **bootstrap**: empezar desde un proyecto nuevo y montar la base agent-ready inicial
- **adopt**: inspeccionar un proyecto existente y reorganizar su superficie agentic con seguridad
- **hybrid**: se mantiene para normalización de estado legado; no aparece en la UI del instalador

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
    El instalador crea archivos nuevos y entrypoints gestionados. No reescribe el código de tu aplicación. Los entrypoints existentes se preservan como snapshots antes del takeover.

---

## Siguiente paso sugerido

Después de `install`, usa:

```bash
npx @bcocheto/agentforge analyze
npx @bcocheto/agentforge apply-suggestions
npx @bcocheto/agentforge compile
npx @bcocheto/agentforge validate
```

---

## Agregar otro motor después

Si luego quieres añadir soporte para otro motor:

```bash
npx @bcocheto/agentforge add-engine
```

El instalador detecta lo que ya existe y agrega solo lo que falta.
