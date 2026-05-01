# Scout

**Command:** `/agentforge-scout`
**Phase:** 1 - Reconnaissance

---

## 🗺️ The real estate agent

The agent does the first tour of the property. Doesn't open drawers, doesn't read documents, doesn't touch anything. Just maps: how many rooms, which neighborhood, what facilities exist, what's the general condition.

---

## What it does

The Scout is the first to enter the project. It does the initial tour: doesn't open drawers, doesn't read all the documents, doesn't touch anything. Just maps the territory.

How many modules are there? What language? What framework? What are the critical dependencies? Where is the application entry point? Scout answers all of this without reading a single line of business logic.

---

## What it analyzes

- **Folder structure:** complete project tree (excluding `node_modules`, `.git`, `dist`, `build`, and similar)
- **Technologies and frameworks:** languages identified by file extension, frameworks and libraries via config files (`package.json`, `requirements.txt`, `go.mod`, etc.)
- **Entry points:** `main`, `index`, `app`, `server`, `bootstrap`; config files; CI/CD; Docker
- **Database schema (surface):** only lists DDL files, migrations, and ORM models. Data Master does the detailed analysis.
- **Test coverage:** identified test frameworks and coverage estimate by file count

---

## What it produces

| File | Content |
|------|---------|
| `_agentforge_sdd/inventory.md` | Complete project inventory |
| `_agentforge_sdd/dependencies.md` | Dependencies with versions |
| `.agentforge/context/surface.json` | Structured data for the other agents |

The `surface.json` is especially important: agentforge uses it to customize Phase 2 tasks based on identified modules.

---

## When to use manually

You'll rarely need to call Scout directly. The orchestrator does this automatically in Phase 1. But if you want to refresh the project inventory after a major refactoring:

```
/agentforge-scout
```
