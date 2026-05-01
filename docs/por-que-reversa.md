# Why agentforge exists

## The classic problem

Imagine a system that went live in 2015. Nobody who wrote it is still at the company. The original documentation was a Word file nobody knows where it went. The code works, generates revenue every day, but there are parts nobody dares to touch because "change this, break that."

That system carries years of accumulated knowledge: implicit business rules, architectural decisions made at 11pm before a deadline, critical logic buried in functions with names like `process_v2_final_revised`. The knowledge exists. It's in the code. But it's trapped there, inaccessible to any AI agent.

---

## The problem with AI agents

AI agents are transformative for creating and evolving software. But they depend on specifications to operate safely.

For new systems it works well: you write the spec, the agent executes. But for legacy systems? The agent has no way of knowing what it can't break. If you ask it to "refactor the payments module," it will refactor based on what the code *seems* to do, without knowing what the code *should* do.

The result is that classic moment: the agent breaks a business rule that nobody had documented, and you only find out when the client calls to complain.

---

## The solution

agentforge is the bridge between the legacy system and AI agents.

It analyzes the existing code and extracts the accumulated knowledge: business rules, flows, contracts between modules, retroactive architectural decisions. Then it transforms everything into executable, traceable specifications ready for any coding agent.

The result is not documentation for humans to read on a quiet afternoon. These are **operational contracts** that allow an agent to evolve the system with fidelity to what already exists.

---

## Who it's for

- **Companies with legacy systems** that want to modernize without rewriting everything from scratch
- **Teams that use vibe coding** and never wrote formal specs (no judgment)
- **Developers who inherited a project** and need to understand what it does before changing anything
- **Anyone** with a working but undocumented system who wants to use AI agents to evolve it safely

---

## What agentforge is not

agentforge is not a traditional static analysis tool. It doesn't generate code coverage, doesn't do linting, doesn't flag bugs. It's a **knowledge extraction** framework: it takes what is implicit in the code and makes it explicit in formal specifications.

It's also not a magic solution. Parts of the system that are genuinely inaccessible through static analysis (behavior dependent on real data, rules that only exist in someone's head) will appear as gaps, marked with 🔴, waiting for human validation. Honesty is part of the design.
