"""
Behavioral prompt eval against real Ollama — opt-in with E2E_LLM=1.

Runs a concrete, well-scoped edit task through the full Vision HTTP -> cecli /agent stack
and scores the turn with ``bright_vision_core.agent_eval``. This is the objective half of
"did the new prompt help": it asserts the agent followed the editing contract
(ReadRange before EditText, no edit/readrange errors, no error event) on a task small
enough that a 3b local model can complete it.

The score + metrics are printed so a human can eyeball the subjective side, and so two
prompt versions can be compared by diffing the logged metrics across runs.

Run::

    E2E_LLM=1 .venv/bin/python -m pytest tests/core/test_agent_prompt_eval.py -q -s
"""

from __future__ import annotations

import asyncio
import os
import subprocess
import sys
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient

    from bright_vision_core.http_api import app, _sessions
    from bright_vision_core.http_auth import configure_auth, reset_auth_for_tests
except ImportError:
    TestClient = None
    app = None
    configure_auth = None
    reset_auth_for_tests = None

from bright_vision_core.agent_eval import score_turn, summarize_metrics
from bright_vision_core.agent_judge import (
    judge_transcript,
    summarize_verdict,
    transcript_from_events,
)
from llm_client import stream_session_message
from llm_ollama import ensure_ollama_for_llm_e2e, ollama_reachable, resolve_vision_model

REPO_ROOT = Path(__file__).resolve().parents[2]
EVAL_WORKSPACE = REPO_ROOT / "e2e" / "fixtures" / "prompt-eval-workspace"

# A concrete, single-file edit. Phrased so the model must read then edit one file.
EDIT_TASK = (
    "/agent In greeter.py, change the greet() function so it returns "
    "'Hello, ' followed by the name argument and an exclamation mark "
    "(for example greet('Sam') returns 'Hello, Sam!'). Edit only greeter.py."
)

GREETER_BEFORE = '''\
def greet(name):
    return "hi"
'''


def _ensure_eval_workspace() -> str:
    EVAL_WORKSPACE.mkdir(parents=True, exist_ok=True)
    (EVAL_WORKSPACE / "greeter.py").write_text(GREETER_BEFORE, encoding="utf8")
    readme = EVAL_WORKSPACE / "README.md"
    if not readme.exists():
        readme.write_text("# Prompt eval workspace\n", encoding="utf8")
    if not (EVAL_WORKSPACE / ".git").exists():
        subprocess.run(["git", "init", "-b", "main"], cwd=EVAL_WORKSPACE, check=True, capture_output=True)
    # Commit current state so each run starts from a clean, known tree.
    subprocess.run(["git", "add", "-A"], cwd=EVAL_WORKSPACE, check=True, capture_output=True)
    subprocess.run(
        ["git", "-c", "user.email=eval@test", "-c", "user.name=eval", "commit",
         "-m", "eval reset", "--allow-empty"],
        cwd=EVAL_WORKSPACE, check=True, capture_output=True,
    )
    return str(EVAL_WORKSPACE)


@unittest.skipIf(TestClient is None, "fastapi not installed")
@unittest.skipIf(os.environ.get("E2E_LLM") != "1", "set E2E_LLM=1 to run real LLM tests")
@unittest.skipIf(not ollama_reachable(), "Local LLM not reachable")
class TestAgentPromptEval(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        ensure_ollama_for_llm_e2e()

    def setUp(self):
        _sessions.clear()
        reset_auth_for_tests()
        configure_auth("127.0.0.1")

    def tearDown(self):
        reset_auth_for_tests()

    def test_scoped_edit_follows_contract(self):
        model = resolve_vision_model()
        root = _ensure_eval_workspace()
        client = TestClient(app)
        res = client.post("/sessions", json={"workspace": root, "model": model})
        if res.status_code == 400:
            self.skipTest(f"Could not create session: {res.text}")
        self.assertEqual(res.status_code, 200, res.text)
        session_id = res.json()["session_id"]

        events = stream_session_message(client, session_id, EDIT_TASK)
        metrics = score_turn(events)
        print("\n" + summarize_metrics(model, metrics), file=sys.stderr, flush=True)

        # Objective behavioral assertions. These are the contract the new prompt bakes in.
        self.assertFalse(metrics.had_error_event, "turn emitted an error event")
        self.assertTrue(metrics.wrote_files, "agent never edited a file for an edit task")
        self.assertEqual(
            metrics.edit_failure_count, 0,
            f"edit failures this turn ({metrics.edit_failure_count}); "
            "contract requires ReadRange before EditText",
        )
        self.assertTrue(
            metrics.readrange_before_first_edit,
            "first successful edit was not preceded by a ReadRange (contract violation)",
        )
        # The actual code change landed.
        final = (EVAL_WORKSPACE / "greeter.py").read_text(encoding="utf8")
        self.assertIn("Hello, ", final, f"greet() not updated: {final!r}")

        # Subjective rubric (LLM-as-judge). Opt-in via BV_PROMPT_JUDGE=1 so the default
        # eval run does not require a second model. Reports scores but does not fail the
        # test on judge unavailability — it is a signal, not a gate.
        if os.environ.get("BV_PROMPT_JUDGE") == "1":
            from cecli import models

            judge_name = os.environ.get("BV_PROMPT_JUDGE_MODEL") or model
            judge_model = models.Model(judge_name)
            transcript = transcript_from_events(events)
            verdict = asyncio.run(judge_transcript(judge_model, EDIT_TASK, transcript))
            print(summarize_verdict(judge_name, verdict), file=sys.stderr, flush=True)
            if verdict.notes:
                print(f"  judge notes: {verdict.notes}", file=sys.stderr, flush=True)
            # Only assert when the judge actually produced scores (don't fail on a flaky
            # or unreachable judge model).
            if verdict.ok:
                self.assertGreaterEqual(
                    verdict.overall, 2.5,
                    f"judge rated the turn poorly overall: {verdict.scores}",
                )


if __name__ == "__main__":
    unittest.main()
