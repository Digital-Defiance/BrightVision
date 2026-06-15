# Shipped features → tests

Map every **Done** roadmap slice to automated verification. Add a row when you ship.

| Feature (roadmap) | Mocked e2e | Scenario name | Integration / LLM |
|-------------------|------------|---------------|-------------------|
| Stream / dedupe | `stream-chat.spec.ts` | `cumulative-stream` | — |
| Proposed edits + apply | `proposed-edits-apply.spec.ts` | `proposed-edit`, `applied-edit` | `edit-block-llm` @edit |
| Proposed edits fuzzy apply | `proposed-edits-apply.spec.ts` | — | — |
| Inline display fences | `chat-parsing.spec.ts` | `display-fence` | — |
| Chat sections / timers / dismiss | `chat-ux.spec.ts` | `default` | — |
| GFM markdown (#25) | `chat-ux.spec.ts` | `markdown-answer` | — |
| Stop / queue / multiline | `chat-input.spec.ts` | — | — |
| Confirm | `confirm-flow.spec.ts` | `confirm` | — |
| `/add` Tab | `path-completion.spec.ts` | — | — |
| Attach images | `file-upload.spec.ts` | — | — |
| Settings / commit prefs | `settings-config.spec.ts` | — | — |
| Tasks / generate-spec | `tasks-workspace.spec.ts`, `tasks-generate-spec.spec.ts` | `tasks-seeded` | `test_http_generate_spec_mock.py`, `test_generate_spec_parse.py` |
| Phased spec wizard | `tasks-spec-wizard.spec.ts` (mock) | — | `test_todo_spec_phased.py`, `specWizard.test.ts` |
| Spec generate LLM | `spec-generate-all-llm.spec.ts` (default); `spec-generate-phased-llm.spec.ts` (opt-in) | hello-workspace | `test_generate_spec_llm.py` (all-layers + optional phased) |
| EARS validate (Tasks) | `tasks-ears.spec.ts` | — | `yarn verify:ears`, `test_http_ears_lint.py`, `test_ears_lint.py` |
| Project steering (Tasks) | `tasks-steering.spec.ts` | — | `test_http_steering_files.py`, `cecli/tests/spec/test_spec_steering.py` |
| Spec index & trace (Tasks) | `tasks-ears-index.spec.ts` | — | `test_ears_index.py`, `test_ears_trace.py`, `test_http_ears_index_trace.py` |
| Spec agent rail | `spec-agent.spec.ts` | — | E6 / #20 |
| Submodule verify | `release-hygiene.spec.ts` | — | `yarn verify:submodule` |
| Git tab (desktop) | `tauri-git.spec.ts` | — | — |
| Git poll | `git-polling.spec.ts` | — | — |
| Context attach | `chat-context.spec.ts` | — | `context-llm` + `context-workspace` |
| UpdateTodoList (LLM JSON) | — | — | `todo-list-llm` @todo, `test_todo_list_llm.py` |
| Proposed edit (LLM) | `proposed-edits-apply.spec.ts` | `proposed-edit` | `edit-block-llm` @edit, `test_edit_block_llm.py` |
| Session transcript (live) | `session-transcript-hydrate.spec.ts` | `session-transcript` | `transcript-llm` @transcript, `test_transcript_llm.py` |
| Superproject workspace | — | — | `test_superproject_dogfood.py`; opt-in `superproject-llm` @superproject (Vision API + README in `files`, `preproc: false`) |
| Suggested files | `suggested-files.spec.ts` | `suggested-files` | — |
| Thinking timers | `chat-ux.spec.ts` | `default` | — |
| Context chip | `session-context.spec.ts` | `default` | — |
| LLM ping | `local-llm-ping.spec.ts` | — | — |
| Empty LLM + retry | — | `empty-llm` | — |
| Resource overlay | `resource-overlay.spec.ts` | — | — |
| Model router / hopper | `model-router.spec.ts`, `model-hopper.spec.ts` | — | — |
| Agents bar | `agents-bar.spec.ts` | — | — |
| ntf alerts | `ntfy-alerts.spec.ts` | — | turn-`done` push (mock SSE) |
| About | `about-dialog.spec.ts` | — | — |
| Editor / languages | `editor-languages.spec.ts` | — | — |
| Session persistence | `session-transcript-hydrate.spec.ts` | `session-transcript` | `test_http_session_persistence.py` |
| Session lifecycle | `session-lifecycle.spec.ts` | `scan-progress` | — |
| Agent todo bridge | — | — | `integration/agent-todo-sync` |
| Roadmap agent hints | — | — | `test_roadmap_hints.py` (unit + session `user_message`) |
| Cecli glued tool JSON | — | — | `test_cecli_tool_json.py`, cecli `test_tool_arguments.py` |
| Char-split UpdateTodoList recovery | `agent-todo-char-split.spec.ts` (`agent-todo-char-split` scenario) | — | `integration/import-agent-plan`, `integration/agent-todo-sync` (title), `test_http_agent_todo_import.py`, `test_agent_todos.py` |
| Navigation | `navigation.spec.ts` | — | — |
| Roadmap gaps UI | `roadmap-gaps.spec.ts` | — | — |

**Run all scenario outputs:** `yarn test:e2e --grep "Scenario:"`

**Full mocked suite:** `yarn test:e2e`
