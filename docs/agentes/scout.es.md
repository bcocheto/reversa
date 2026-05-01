# Scout

**Comando:** `/agentforge-scout`
**Fase:** 1 - Reconocimiento

---

## 🗺️ El agente inmobiliario

El agente hace el primer tour de la propiedad. No abre cajones, no lee documentos, no toca nada. Solo mapea: cuántas habitaciones, qué instalaciones existen, cuál es el estado general.

---

## Qué hace

El Scout es el primero en entrar al proyecto. Hace el tour inicial: no abre cajones, no lee todos los documentos, no toca nada. Solo mapea el territorio.

¿Cuántos módulos hay? ¿Qué lenguaje? ¿Qué framework? ¿Cuáles son las dependencias críticas? ¿Dónde está el punto de entrada de la aplicación? El Scout responde todo esto sin leer una sola línea de lógica de negocio.

---

## Qué produce

| Archivo | Contenido |
|---------|-----------|
| `_agentforge_sdd/inventory.md` | Inventario completo del proyecto |
| `_agentforge_sdd/dependencies.md` | Dependencias con versiones |
| `.agentforge/context/surface.json` | Datos estructurados para los demás agentes |

El `surface.json` es especialmente importante: agentforge lo usa para personalizar las tareas de la Fase 2 basándose en los módulos identificados.
