# Desarrollando desde los specs

Una vez que agentforge ha generado todos los specs en `_agentforge_sdd/`, puedes copiar esos archivos a cualquier máquina y comenzar a construir el sistema desde cero. Aquí está el orden recomendado.

---

## Antes de escribir una sola línea de código

Comienza leyendo estos tres archivos:

| Archivo | Por qué leer primero |
|---|---|
| `_agentforge_sdd/confidence-report.md` | Muestra qué tiene alta confianza (verde) vs. brechas (rojo). Evita implementar algo basado en inferencias incorrectas. |
| `_agentforge_sdd/gaps.md` | Lista lo que agentforge no pudo determinar. Completa manualmente antes de comenzar. |
| `_agentforge_sdd/architecture.md` + diagramas C4 | Muestra el panorama general: capas, módulos, límites del sistema. |

---

## Orden de implementación (bottom-up)

```
1. database/  +  erd-complete.md             (estructuras de datos, migraciones)
2. domain.md  +  sdd/[entidades-core]        (reglas de negocio centrales)
3. sdd/[servicios] ordenados por dependencia (usa dependencies.md como guía)
4. openapi/   +  contratos de API            (si existen)
5. ui/                                       (capa de presentación al final)
```

---

## Qué sdd/ va primero

Abre `_agentforge_sdd/traceability/code-spec-matrix.md`. Listá cada spec y sus dependencias.

Implementa primero los specs que no dependen de ningún otro (hojas del árbol de dependencias), y sube hacia los specs que integran múltiples componentes.

---

## Mantener la trazabilidad durante el desarrollo

Usa `_agentforge_sdd/traceability/code-spec-matrix.md` como referencia durante el desarrollo para saber qué fragmento de código implementado corresponde a qué spec. Esto mantiene la trazabilidad precisa a medida que el código crece.

---

## Ver también

- [Salidas generadas](saidas/index.md): lista completa de archivos producidos por agentforge
- [Escala de confianza](escala-confianca.md): cómo interpretar los marcadores 🟢🟡🔴 en los specs
