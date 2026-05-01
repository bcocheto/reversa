# Por qué existe agentforge

## El problema clásico

Imagina un sistema que entró en producción en 2015. Nadie que lo escribió sigue en la empresa. La documentación original era un archivo Word que nadie sabe dónde fue a parar. El código funciona, genera ingresos todos los días, pero hay partes que nadie se atreve a tocar porque "cambias esto, rompes aquello".

Ese sistema carga años de conocimiento acumulado: reglas de negocio implícitas, decisiones arquitectónicas tomadas a las 11pm antes de un deadline, lógica crítica enterrada en funciones con nombres como `procesar_v2_final_revisado`. El conocimiento existe. Está en el código. Pero está atrapado ahí dentro, inaccesible para cualquier agente de IA.

---

## El problema con los agentes de IA

Los agentes de IA son transformadores para crear y evolucionar software. Pero dependen de especificaciones para operar con seguridad.

Para sistemas nuevos funciona bien: escribes la spec, el agente ejecuta. ¿Pero para sistemas heredados? El agente no puede saber qué no puede romper. Si le pides "refactoriza el módulo de pagos", lo refactorizará basándose en lo que el código *parece* hacer, sin saber lo que el código *debe* hacer.

El resultado es ese momento clásico: el agente rompe una regla de negocio que nadie había documentado, y solo nos enteramos cuando el cliente llama a reclamar.

---

## La solución

agentforge es el puente entre el sistema heredado y los agentes de IA.

Analiza el código existente y extrae el conocimiento acumulado: reglas de negocio, flujos, contratos entre módulos, decisiones arquitectónicas retroactivas. Luego transforma todo en especificaciones ejecutables, trazables y listas para cualquier agente codificador.

El resultado no es documentación para que los humanos lean en una tarde tranquila. Son **contratos operacionales** que permiten a un agente evolucionar el sistema con fidelidad a lo que ya existe.

---

## Para quién es

- **Empresas con sistemas heredados** que quieren modernizar sin reescribir todo desde cero
- **Equipos que usan vibe coding** y nunca escribieron specs formales (sin juicios)
- **Desarrolladores que heredaron un proyecto** y necesitan entender qué hace antes de cambiar algo
- **Cualquier persona** con un sistema funcionando pero sin documentación que quiera usar agentes de IA para evolucionarlo con seguridad

---

## Lo que agentforge no es

agentforge no es una herramienta de análisis estático tradicional. No genera cobertura de código, no hace linting, no señala bugs. Es un framework de **extracción de conocimiento**: toma lo que está implícito en el código y lo hace explícito en especificaciones formales.

Tampoco es una solución mágica. Las partes del sistema que son genuinamente inaccesibles por análisis estático aparecerán como brechas, marcadas con 🔴, esperando validación humana. La honestidad es parte del diseño.
