# Escala de confianza

Una de las partes más importantes de agentforge es la honestidad. El sistema no finge saber lo que no sabe.

Cada afirmación generada en las especificaciones se marca con uno de los tres niveles. Sin excepciones.

---

## Los tres niveles

| Marca | Nombre | Significado |
|-------|--------|-------------|
| 🟢 | **CONFIRMADO** | Extraído directamente del código, con archivo y línea como evidencia. Se puede citar. |
| 🟡 | **INFERIDO** | Deducido de patrones, nomenclatura o contexto. Probablemente correcto, pero podría estar equivocado. |
| 🔴 | **BRECHA** | No determinable por el análisis del código. Requiere validación humana. |

---

## Por qué importa

Sin esta marcación, una especificación generada por IA es una caja negra de confianza. No sabes qué fue extraído del código y qué fue inventado.

Con la escala de confianza, sabes exactamente dónde confiar y dónde cuestionar.

---

## Ejemplos prácticos

**🟢 CONFIRMADO**

> La función `calcular_descuento` aplica 15% para pedidos superiores a $500.
> Fuente: `src/pricing/discount.js`, línea 47.

**🟡 INFERIDO**

> El sistema parece usar soft delete para registros de clientes (campo `deleted_at` presente en la tabla).

**🔴 BRECHA**

> No fue posible determinar el comportamiento del sistema cuando el pago falla por timeout en la gateway.

---

## Cómo se resuelven las brechas

El Reviewer recopila todas las brechas 🔴 y las presenta como preguntas para que respondas. Después de responder, actualiza las specs: 🔴 se convierte en 🟢 si confirmaste con evidencia, o 🟡 si diste una respuesta pero sin certeza absoluta.
