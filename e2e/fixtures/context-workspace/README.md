# E2E context workspace

Small **git** fixture for opt-in LLM e2e (`context-llm.spec.ts`, `tests/core/test_context_llm.py`).

- `src/e2e_widget.ts` exports `E2E_CONTEXT_MAGIC` — tests `/add` + model read-back.
- Do **not** point daily dogfood here; use `hello-workspace` for smoke-only LLM tests.
