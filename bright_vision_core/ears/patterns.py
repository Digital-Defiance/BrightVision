"""Re-export from cecli.spec (BrightVision compatibility shim)."""
import importlib

_mod = importlib.import_module("cecli.spec.ears.patterns")
globals().update({k: getattr(_mod, k) for k in dir(_mod) if not (k.startswith("__") and k.endswith("__"))})
