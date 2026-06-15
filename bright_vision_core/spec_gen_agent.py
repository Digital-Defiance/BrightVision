"""Re-export cecli spec gen agent; model routing lives on Session."""
import importlib

_mod = importlib.import_module("cecli.spec.gen_agent")
globals().update({k: getattr(_mod, k) for k in dir(_mod) if not (k.startswith("__") and k.endswith("__"))})


def apply_spec_gen_model_route(session, routing_text: str) -> None:
    session.apply_spec_gen_route(routing_text)
