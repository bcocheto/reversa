# Data Master

**Comando:** `/agentforge-data-master`
**Fase:** Qualquer

---

## 🗄️ O geólogo

O geólogo mapeia o subsolo: a camada que ninguém vê mas que sustenta tudo. Tabelas, relacionamentos, constraints, triggers, procedures. A fundação invisível sobre a qual a aplicação está construída.

---

## O que faz

O geólogo mapeia o subsolo: a camada que ninguém vê mas que sustenta tudo. Tabelas, relacionamentos, constraints, triggers, stored procedures. A fundação invisível sobre a qual a aplicação está construída.

O Scout faz uma varredura superficial do banco (só lista os arquivos). O Data Master é a análise completa, profunda e formal.

---

## Fontes de análise

O Data Master usa o que estiver disponível no projeto:

1. **Arquivos DDL:** `.sql` com `CREATE TABLE`, `ALTER TABLE`
2. **Migrations:** Laravel, Rails, Flyway, Liquibase, Alembic, Prisma
3. **Modelos ORM:** Eloquent, ActiveRecord, SQLAlchemy, Hibernate, TypeORM
4. **Screenshots:** de ferramentas como DBeaver, pgAdmin, MySQL Workbench
5. **Conexão direta:** apenas `SELECT`; nunca `INSERT`, `UPDATE`, `DELETE`, `DROP`

---

## O que ele documenta

### Inventário de tabelas

Lista todas as tabelas com nome e propósito inferido, agrupadas por domínio de negócio.

### Estrutura detalhada

Para cada tabela: colunas com nome, tipo, tamanho, nullable e default; PKs e FKs; índices; constraints.

### Relacionamentos

Todos os relacionamentos com cardinalidades (1:1, 1:N, N:M), tabelas de junção e relacionamentos polimórficos.

### Regras de negócio no banco

Triggers (condição, evento, ação), stored procedures e funções (parâmetros, lógica, retorno), views e materialized views, check constraints com lógica de negócio.

### ERD completo

Gerado em Mermaid (`erDiagram`). Para bancos grandes, gera ERDs parciais por domínio mais um ERD geral simplificado.

---

## O que ele produz

| Arquivo | Conteúdo |
|---------|----------|
| `_agentforge_sdd/database/erd.md` | ERD completo em Mermaid |
| `_agentforge_sdd/database/data-dictionary.md` | Todas as tabelas e colunas |
| `_agentforge_sdd/database/relationships.md` | Relacionamentos detalhados |
| `_agentforge_sdd/database/business-rules.md` | Regras de negócio no banco |
| `_agentforge_sdd/database/procedures.md` | Stored procedures e funções (se existirem) |

---

## Escala de confiança

| Situação | Marcação |
|----------|----------|
| DDL ou migration direto | 🟢 CONFIRMADO |
| Inferido de ORM ou screenshots | 🟡 INFERIDO |
| Inacessível | 🔴 LACUNA |
