# Confidence scale

One of the most important parts of agentforge is honesty. The system doesn't pretend to know what it doesn't know.

Every statement generated in the specifications is marked with one of the three levels below. No exceptions.

---

## The three levels

| Mark | Name | Meaning |
|------|------|---------|
| 🟢 | **CONFIRMED** | Extracted directly from code, with file and line as evidence. Can be cited. |
| 🟡 | **INFERRED** | Deduced from patterns, naming, or context. Probably right, but might be wrong. |
| 🔴 | **GAP** | Not determinable from code analysis. Requires human validation. |

---

## Why this matters

Without this marking, an AI-generated specification is a black box of trust. You don't know what was extracted from the code and what was made up.

With the confidence scale, you know exactly where to trust and where to question. An AI agent using this spec knows the same: "this item is 🟢, safe to use. This one is 🔴, needs a human source."

---

## Practical examples

**🟢 CONFIRMED**

> The `calculate_discount` function applies 15% for orders above $500.
> Source: `src/pricing/discount.js`, line 47.

This was extracted literally from the code. If someone disputes it, there's somewhere to point.

---

**🟡 INFERRED**

> The system appears to use soft delete for customer records (field `deleted_at` present in the table).

The field exists, the pattern is well-known, but nowhere in the code is it explicitly written "we use soft delete." The field might be there for another reason.

---

**🔴 GAP**

> Could not determine the system's behavior when payment fails due to gateway timeout.

The code calls the gateway, but there's no timeout error handling. The actual behavior may exist at the infrastructure layer, in a database that wasn't analyzed, or may never have been implemented. Someone who knows the system needs to answer this.

---

## How gaps are resolved

The Reviewer collects all 🔴 gaps and presents them as questions for you to answer. After you answer, it updates the specs and reclassifies: 🔴 becomes 🟢 if you confirmed with evidence, or 🟡 if you gave an answer but without absolute certainty.

Gaps that couldn't be answered remain in `_agentforge_sdd/gaps.md` for later handling.
