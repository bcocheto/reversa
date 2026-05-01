# Reviewer

**Comando:** `/agentforge-reviewer`
**Fase:** 5 - Revisión

---

## ⚖️ El revisor de specs

El Reviewer toma los contratos del Writer e intenta hacerles agujeros: *"Esto es una contradicción. Este punto no tiene prueba. Esta regla desaparece si el usuario hace X."* No para destruir, sino para garantizar que lo que quede sea sólido.

---

## Qué hace

El Reviewer toma los contratos generados por el Writer e intenta hacerles agujeros. No para destruir, sino para garantizar que lo que quede sea sólido.

Busca: contradicciones internas dentro de una misma spec, conflictos entre specs diferentes, afirmaciones marcadas como 🟢 que son en realidad inferencias, comportamientos obvios no especificados.

---

## Bonus: revisión cruzada vía Codex

Si el plugin de Codex está activo en la sesión, el Reviewer ofrece solicitar una revisión independiente antes de hacer la suya propia. La ventaja es obtener una segunda opinión de una LLM diferente a la que generó las specs.

---

## Qué produce

| Archivo | Contenido |
|---------|-----------|
| `_agentforge_sdd/questions.md` | Preguntas para validación humana |
| `_agentforge_sdd/confidence-report.md` | Conteo de 🟢/🟡/🔴 por spec y porcentaje general |
| `_agentforge_sdd/gaps.md` | Brechas que quedaron sin respuesta |
| `_agentforge_sdd/cross-review-result.md` | Hallazgos de Codex (si se solicitó revisión cruzada) |
