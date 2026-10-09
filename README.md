# rag-stack

A Claude skill that defines a standard, gated, eval-driven workflow for building
RAG systems with LangChain.js, LangGraph.js and Langfuse on Supabase pgvector.

- `SKILL.md` — the skill entry point (phases, gates, hard rules)
- `references/` — detailed guides per phase and per tool
- `templates/` — `RAG_STATUS.md` status file and a retrieval eval runner

To install, add this folder as a skill in Claude (it must contain `SKILL.md` at its root).
