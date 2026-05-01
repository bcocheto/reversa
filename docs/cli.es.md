# CLI

Reversa tiene un CLI simple para gestionar la instalación y el ciclo de vida de los agentes en tu proyecto. Todos los comandos se ejecutan con `npx agentforge` en la raíz del proyecto.

---

## Comandos disponibles

### `install`

```bash
npx agentforge install
```

Instala Reversa en el proyecto heredado actual. Detecta los motores presentes, pregunta tus preferencias y crea toda la estructura necesaria.

Úsalo una vez, en la raíz del proyecto que quieres analizar.

---

### `status`

```bash
npx agentforge status
```

Muestra el estado actual del análisis: qué fase está en curso, qué agentes ya corrieron, qué falta completar.

Útil para tener una visión rápida antes de retomar una sesión.

---

### `update`

```bash
npx agentforge update
```

Actualiza los agentes a la versión más reciente de Reversa.

El comando es inteligente: verifica el manifiesto SHA-256 de cada archivo y nunca sobreescribe archivos que hayas personalizado.

---

### `add-agent`

```bash
npx agentforge add-agent
```

Agrega un agente específico al proyecto. Útil si no instalaste todos los agentes en la instalación inicial y ahora quieres incluir, por ejemplo, el Data Master o el Design System.

---

### `add-engine`

```bash
npx agentforge add-engine
```

Agrega soporte para un motor de IA que no estaba presente cuando instalaste.

---

### `uninstall`

```bash
npx agentforge uninstall
```

Elimina Reversa del proyecto: borra los archivos creados por la instalación.

!!! info "Tus archivos quedan intactos"
    `uninstall` elimina **solo** lo que Reversa creó. Ningún archivo original del proyecto es tocado. Las especificaciones generadas en `_reversa_sdd/` también se conservan por defecto.
