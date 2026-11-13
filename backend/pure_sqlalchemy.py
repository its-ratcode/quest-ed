"""Load SQLAlchemy's pure-Python modules instead of its compiled (.pyd) ones.

Some Windows machines use Application Control, which blocks SQLAlchemy's compiled
speed-up files ("DLL load failed ... blocked this file"). SQLAlchemy ships a
plain-Python copy of each one right next to it and officially supports running
without the compiled versions, just a little slower.

Python normally prefers the compiled file when both exist. This finder makes it
pick the .py file for those modules only. Nothing in site-packages or in Windows
is changed. Import this module before SQLAlchemy is imported.
Set QUESTED_USE_COMPILED_SQLALCHEMY=1 to turn it off.
"""
import importlib.util
import os
import sys


class _PreferPurePython:
    def find_spec(self, fullname, path=None, target=None):
        if not (fullname.startswith("sqlalchemy.") and fullname.endswith("_cy")):
            return None
        filename = fullname.rsplit(".", 1)[1] + ".py"
        for entry in path or ():
            candidate = os.path.join(entry, filename)
            if os.path.isfile(candidate):
                return importlib.util.spec_from_file_location(fullname, candidate)
        return None


if os.environ.get("QUESTED_USE_COMPILED_SQLALCHEMY") != "1" and not any(
        isinstance(f, _PreferPurePython) for f in sys.meta_path):
    sys.meta_path.insert(0, _PreferPurePython())
