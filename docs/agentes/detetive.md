# Detective

**Command:** `/agentforge-detective`
**Phase:** 3 - Interpretation

---

## 🔍 Sherlock Holmes

Sherlock Holmes arrives after the archaeologist. Looks at the cataloged artifacts and asks: *"But why is this here? Who put it here? What does this reveal about who lived here?"* Doesn't excavate. Interprets.

---

## What it does

The Detective arrives after the Archaeologist. Looks at everything that was cataloged and asks: *"But why is this here? Who put this here? What does this reveal about who built this system?"*

It doesn't dig more code. It interprets what was excavated. It's the specialist in extracting tacit knowledge that was never documented: business rules living in conditionals, architectural decisions that only exist in git history, constraints that appear in validations with no comment at all.

---

## What it analyzes

### Git archaeology

The Detective reads the commit history like a project diary:

- Messages that reveal business or technical decisions
- Fix/hotfix commits: indicate behaviors that "should have worked but didn't"
- Large refactors: indicate requirement changes that nobody documented
- Reverts with apparent reason
- All of this becomes source material for retroactive ADRs

### Implicit business rules

- Complex conditionals with domain logic
- Validations and constraints in models
- Constants and enums with business names (those that reveal a lot about how the domain thinks)
- Old comments: they are evidence of past intentions
- TODOs and FIXMEs: unimplemented intentions that may reveal forgotten requirements

### State machines

For each entity with a status/state field, the Detective maps:

- All possible values
- Allowed transitions and their triggers
- State diagram in Mermaid

### Permissions and roles

- User roles in the system
- Permissions per role
- Access restrictions to features and data
- All in permission matrix format

---

## What it produces

| File | Content |
|------|---------|
| `_agentforge_sdd/domain.md` | Glossary and domain rules |
| `_agentforge_sdd/state-machines.md` | State machines in Mermaid |
| `_agentforge_sdd/permissions.md` | Permission matrix |
| `_agentforge_sdd/adrs/[number]-[title].md` | One ADR per identified decision |

---

## A note on confidence

The Detective is rigorous with the [confidence scale](../escala-confianca.md). Most of what it extracts is 🟡 INFERRED, and it knows this. The art is inferring well and marking honestly where there's uncertainty.

Business rules inferred from code are hypotheses until validated by someone who truly knows the business.
