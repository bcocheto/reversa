# Data Master

**Command:** `/agentforge-data-master`
**Phase:** Any

---

## 🗄️ The geologist

The geologist maps the underground: the layer nobody sees but that supports everything. Tables, relationships, constraints, triggers, stored procedures. The invisible foundation on which the application is built.

---

## What it does

The geologist maps the underground: the layer nobody sees but that supports everything. Tables, relationships, constraints, triggers, stored procedures. The invisible foundation on which the application is built.

Scout does a surface-level scan of the database (just lists the files). Data Master is the complete, deep, formal analysis.

---

## Analysis sources

Data Master uses whatever is available in the project:

1. **DDL files:** `.sql` with `CREATE TABLE`, `ALTER TABLE`
2. **Migrations:** Laravel, Rails, Flyway, Liquibase, Alembic, Prisma
3. **ORM models:** Eloquent, ActiveRecord, SQLAlchemy, Hibernate, TypeORM
4. **Screenshots:** from tools like DBeaver, pgAdmin, MySQL Workbench
5. **Direct connection:** read-only only; never `INSERT`, `UPDATE`, `DELETE`, `DROP`

---

## What it documents

### Table inventory

Lists all tables with name and inferred purpose, grouped by business domain.

### Detailed structure

For each table: columns with name, type, size, nullable, and default; PKs and FKs; indexes; constraints.

### Relationships

All relationships with cardinalities (1:1, 1:N, N:M), junction tables, and polymorphic relationships.

### Business rules in the database

Triggers (condition, event, action), stored procedures and functions (parameters, logic, return), views and materialized views, check constraints with business logic.

### Full ERD

Generated in Mermaid (`erDiagram`). For large databases, generates partial ERDs per domain plus a simplified general ERD.

---

## What it produces

| File | Content |
|------|---------|
| `_agentforge_sdd/database/erd.md` | Full ERD in Mermaid |
| `_agentforge_sdd/database/data-dictionary.md` | All tables and columns |
| `_agentforge_sdd/database/relationships.md` | Detailed relationships |
| `_agentforge_sdd/database/business-rules.md` | Business rules in the database |
| `_agentforge_sdd/database/procedures.md` | Stored procedures and functions (if any) |

---

## Confidence scale

| Situation | Mark |
|-----------|------|
| Direct DDL or migration | 🟢 CONFIRMED |
| Inferred from ORM or screenshots | 🟡 INFERRED |
| Inaccessible | 🔴 GAP |
