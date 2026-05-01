# Cómo usar

## Activar agentforge

Después de instalar, abre el proyecto en tu agente de IA y activa agentforge:

=== "Claude Code / Cursor / Gemini CLI"

    ```
    /agentforge
    ```

=== "Codex y motores sin slash commands"

    ```
    agentforge
    ```

Eso es todo. agentforge toma el control y coordina todo el análisis desde ahí.

---

## Qué ocurre al activarlo

agentforge verifica si hay un análisis en curso:

**Primera vez:** crea un plan de exploración personalizado para tu proyecto, lo presenta para aprobación y comienza el análisis en la fase 1.

**Sesión retomada:** lee el checkpoint guardado en `.agentforge/state.json` y continúa exactamente donde se quedó. No importa si cerraste el editor, reiniciaste la máquina o lo dejaste dormido tres días.

---

## Flujo típico de un análisis completo

```
Escribes /agentforge
        ↓
agentforge crea el plan de exploración
        ↓
Revisas y apruebas el plan
        ↓
Scout mapea la superficie del proyecto
        ↓
agentforge presenta el resumen del Scout y eliges el nivel de documentación
        ↓
Archaeologist analiza módulo por módulo
        ↓
Detective y Architect interpretan lo encontrado
        ↓
Writer genera las especificaciones (una a la vez, con tu aprobación)
        ↓
Reviewer revisa todo y plantea preguntas de validación
        ↓
Especificaciones listas en _agentforge_sdd/
```

El proceso es incremental y conversacional. No necesitas estar presente todo el tiempo: agentforge te avisa cuando te necesita.

---

## ¿Cuánto tiempo lleva?

Depende del tamaño del proyecto, pero una regla general:

| Tamaño del proyecto | Estimado |
|---------------------|----------|
| Pequeño (< 10 módulos) | 2 a 4 sesiones |
| Mediano (10 a 30 módulos) | 5 a 10 sesiones |
| Grande (30+ módulos) | 10+ sesiones |

El Archaeologist analiza un módulo por sesión a propósito, para conservar contexto. Para proyectos grandes retomarás varias veces, pero cada retomada es automática y sin pérdida de progreso.

---

## Consejo: desbordamiento de contexto

Si la sesión se alarga y el contexto empieza a agotarse, agentforge guarda el checkpoint automáticamente y avisa:

> "Voy a pausar aquí. Todo está guardado. Escribe `/agentforge` en una nueva sesión para continuar."

Sin drama. Sin pérdida. Solo continúa después.

---

## Nivel de documentación

Después de que el Scout termina, agentforge presenta un resumen de lo que encontró (cantidad de módulos, integraciones, presencia de base de datos) y pregunta qué volumen de documentación quieres para el proyecto:

| Nivel | Cuándo usar | Qué genera |
|-------|-------------|------------|
| **Esencial** | Proyectos simples, scripts, prototipos | Artefactos principales: análisis de código, dominio, arquitectura, specs SDD |
| **Completo** | Proyectos medianos, equipos pequeños (por defecto) | Todo lo esencial + diagramas C4, ERD, ADRs, OpenAPI, user stories y matrices de trazabilidad |
| **Detallado** | Sistemas enterprise, múltiples equipos | Todo lo completo + flowcharts por función, ADRs expandidos, diagrama de deployment y revisión cruzada obligatoria |

La elección se guarda en `.agentforge/state.json` y todos los agentes siguientes la respetan automáticamente. Si necesitas ajustarla después de iniciado el análisis, edita el campo `doc_level` en ese archivo.

---

## Activar un agente específico manualmente

Si quieres ejecutar un agente suelto, sin pasar por el orquestador:

```
/agentforge-scout
/agentforge-detective
/agentforge-data-master
```

Útil cuando ya tienes un análisis en curso y quieres ejecutar un agente específico por alguna razón puntual.
