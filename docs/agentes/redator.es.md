# Writer

**Comando:** `/agentforge-writer`
**Fase:** 4 - Generación

---

## 📝 El notario

El notario transforma lo descubierto en contratos formales, precisos y trazables. Cada cláusula tiene nivel de certeza declarado. El documento vale como contrato: un agente de IA puede reimplementar el sistema a partir de él.

---

## Qué hace

El Writer transforma lo descubierto en las tres fases anteriores en contratos formales: precisos, trazables y lo suficientemente detallados para que un agente de IA, sin acceso al código original, pueda reimplementar la funcionalidad fielmente.

Las specs no son documentación para que los humanos lean en una tarde tranquila. Son contratos operacionales.

---

## El flujo de trabajo

El Writer nunca genera todo de una vez. Monta un plan, lo presenta para tu aprobación, y luego genera un archivo a la vez esperando tu confirmación antes de continuar. Esto permite revisión incremental.

---

## Formato de las specs SDD

Cada spec sigue una plantilla fija con secciones obligatorias, incluyendo criterios de aceptación en formato `Dado / Cuando / Entonces`. Cada afirmación se marca con 🟢, 🟡 o 🔴. Sin excepciones.

---

## Archivos generados

| Archivo | Contenido |
|---------|-----------|
| `_agentforge_sdd/sdd/[componente].md` | Spec por componente |
| `_agentforge_sdd/openapi/[api].yaml` | Spec de API (si aplica) |
| `_agentforge_sdd/user-stories/[flujo].md` | User stories (si aplica) |
| `_agentforge_sdd/traceability/code-spec-matrix.md` | Matriz código-spec |
