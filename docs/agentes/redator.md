# Writer

**Command:** `/agentforge-writer`
**Phase:** 4 - Generation

---

## 📝 The notary

The notary transforms what was discovered into formal, precise, traceable contracts. Each clause has a declared confidence level. The document is a contract: an AI agent can reimplement the system from it.

---

## What it does

The Writer transforms what was discovered in the previous three phases into formal contracts: precise, traceable, and detailed enough for an AI agent, without access to the original code, to reimplement the functionality faithfully.

Specs are not documentation for humans to read on a quiet afternoon. They are operational contracts.

---

## The workflow

The Writer never generates everything at once. Large projects have many components, and generating everything in one response burns excessive context and prevents incremental review. The flow is:

### 1. Build and present the plan

Before generating any file, the Writer reads all artifacts from previous phases and builds a complete list of what it will generate:

```
📋 Generation plan: 12 items

SDD:
  [ ] 1. sdd/auth.md
  [ ] 2. sdd/orders.md
  [ ] 3. sdd/payments.md

OpenAPI:
  [ ] 4. openapi/api-v1.yaml

User Stories:
  [ ] 5. user-stories/checkout.md

Traceability:
  [ ] 6. traceability/code-spec-matrix.md

Type CONTINUE to start.
```

You approve (or adjust) the plan before any generation begins.

### 2. Generate one item at a time

For each item: generates the file, saves it, reports what was completed and what comes next, and **stops**. You confirm "CONTINUE" before the next one. This allows you to review each spec before moving on.

### 3. Code/Spec Matrix last

The last item is always the traceability matrix: which code file corresponds to which spec, with the coverage level of each.

---

## SDD spec format

Each spec follows a fixed template with required sections:

- **Overview** of the component
- **Responsibilities** with MoSCoW classification (Must / Should / Could / Won't)
- **Flows** and documented business rules
- **Non-functional requirements** (inferred from code, not invented)
- **Acceptance criteria** in `Given / When / Then` format, with happy path and failure scenarios

Every statement is marked with 🟢, 🟡, or 🔴. No exceptions.

---

## Generated files

| File | Content |
|------|---------|
| `_agentforge_sdd/sdd/[component].md` | Spec per component |
| `_agentforge_sdd/openapi/[api].yaml` | API spec (if applicable) |
| `_agentforge_sdd/user-stories/[flow].md` | User stories (if applicable) |
| `_agentforge_sdd/traceability/code-spec-matrix.md` | Code-to-spec matrix |
