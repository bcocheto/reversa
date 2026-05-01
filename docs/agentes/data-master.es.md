# Data Master

**Comando:** `/agentforge-data-master`
**Fase:** Cualquiera

---

## 🗄️ El geólogo

El geólogo mapea el subsuelo: la capa que nadie ve pero que lo sostiene todo. Tablas, relaciones, constraints, triggers, procedures. Los cimientos invisibles sobre los que se construye la aplicación.

---

## Qué hace

El geólogo mapea el subsuelo: la capa que nadie ve pero que lo sostiene todo. Tablas, relaciones, constraints, triggers, stored procedures. La fundación invisible sobre la que está construida la aplicación.

El Scout hace un escaneo superficial de la base de datos (solo lista los archivos). El Data Master es el análisis completo, profundo y formal.

---

## Fuentes de análisis

1. Archivos DDL (`.sql` con `CREATE TABLE`, `ALTER TABLE`)
2. Migrations (Laravel, Rails, Flyway, Liquibase, Alembic, Prisma)
3. Modelos ORM (Eloquent, ActiveRecord, SQLAlchemy, Hibernate, TypeORM)
4. Screenshots de herramientas como DBeaver, pgAdmin, MySQL Workbench
5. Conexión directa: solo lectura; nunca `INSERT`, `UPDATE`, `DELETE`, `DROP`

---

## Qué produce

| Archivo | Contenido |
|---------|-----------|
| `_agentforge_sdd/database/erd.md` | ERD completo en Mermaid |
| `_agentforge_sdd/database/data-dictionary.md` | Todas las tablas y columnas |
| `_agentforge_sdd/database/relationships.md` | Relaciones detalladas |
| `_agentforge_sdd/database/business-rules.md` | Reglas de negocio en la base de datos |
| `_agentforge_sdd/database/procedures.md` | Stored procedures y funciones (si los hay) |
