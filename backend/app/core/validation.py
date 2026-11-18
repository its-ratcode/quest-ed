"""Small, explicit request validation with a message per field.

    p = Payload()
    email = p.email("email")
    password = p.password("password")
    p.validate()   # 400 with {"errors": {"email": "...", ...}} if anything was wrong
"""
import re
from datetime import date

from flask import request
from flask_restx import abort

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USERNAME_RE = re.compile(r"^[a-z0-9][a-z0-9_.-]{2,29}$")
_MISSING = object()


class Payload:
    def __init__(self, data=_MISSING):
        if data is _MISSING:
            data = request.get_json(silent=True)
        if data is None:
            data = {}
        if not isinstance(data, dict):
            abort(400, "Request body must be a JSON object.")
        self.data = data
        self.errors = {}

    def has(self, name):
        return name in self.data

    def _get(self, name, required):
        value = self.data.get(name, _MISSING)
        if value is None or (isinstance(value, str) and not value.strip()):
            value = _MISSING
        if value is _MISSING and required:
            self.errors[name] = "This field is required."
        return value

    def string(self, name, required=True, min_len=1, max_len=255, default=None,
               pattern=None, pattern_msg="Invalid format.", lower=False):
        """Text, trimmed. Optionally lower-cased and checked against a pattern."""
        value = self._get(name, required)
        if value is _MISSING:
            return default
        if not isinstance(value, str):
            self.errors[name] = "Must be text."
            return default
        value = value.strip()
        if lower:
            value = value.lower()
        if len(value) < min_len:
            self.errors[name] = f"Must be at least {min_len} characters."
        elif len(value) > max_len:
            self.errors[name] = f"Must be at most {max_len} characters."
        elif pattern is not None and not pattern.match(value):
            self.errors[name] = pattern_msg
        return value

    def text(self, name, max_len=1000):
        """Optional free text; missing means an empty string."""
        return self.string(name, required=False, max_len=max_len, default="") or ""

    def integer(self, name, required=True, min_value=None, max_value=None, default=None):
        """A whole number (also accepted as text, e.g. "10")."""
        value = self._get(name, required)
        if value is _MISSING:
            return default
        if isinstance(value, bool) or not isinstance(value, (int, str)):
            self.errors[name] = "Must be a whole number."
            return default
        try:
            value = int(value)
        except ValueError:
            self.errors[name] = "Must be a whole number."
            return default
        if min_value is not None and value < min_value:
            self.errors[name] = f"Must be at least {min_value}."
        elif max_value is not None and value > max_value:
            self.errors[name] = f"Must be at most {max_value}."
        return value

    def date(self, name, required=False):
        """A date as YYYY-MM-DD."""
        value = self._get(name, required)
        if value is _MISSING:
            return None
        try:
            return date.fromisoformat(value)
        except (TypeError, ValueError):
            self.errors[name] = "Use the format YYYY-MM-DD."
            return None

    def password(self, name, min_len=8, required=True):
        """A password, exactly as typed (never trimmed)."""
        value = self.data.get(name)
        if not isinstance(value, str) or value == "":
            if required:
                self.errors[name] = "This field is required."
            return None
        if len(value) < min_len:
            self.errors[name] = f"Must be at least {min_len} characters."
        elif len(value) > 128:
            self.errors[name] = "Must be at most 128 characters."
        return value

    def email(self, name, required=True):
        return self.string(name, required=required, max_len=255, lower=True,
                           pattern=EMAIL_RE, pattern_msg="Enter a valid email address.")

    def choice(self, name, choices, required=True, default=None):
        """One of a fixed list of values."""
        value = self._get(name, required)
        if value is _MISSING:
            return default
        if value not in choices:
            self.errors[name] = f"Must be one of: {', '.join(choices)}."
            return default
        return value

    def boolean(self, name, required=False, default=None):
        """true or false (as JSON, not text)."""
        value = self.data.get(name, _MISSING)
        if value is _MISSING or value is None:
            if required:
                self.errors[name] = "This field is required."
            return default
        if not isinstance(value, bool):
            self.errors[name] = "Must be true or false."
            return default
        return value

    def username(self, name, required=True):
        """A kid's sign-in name: 3-30 lowercase letters, numbers, dots, dashes or underscores."""
        return self.string(
            name, required=required, min_len=3, max_len=30, lower=True, pattern=USERNAME_RE,
            pattern_msg="Use 3-30 lowercase letters, numbers, dots, dashes or underscores.",
        )

    def add_error(self, name, message):
        self.errors[name] = message

    def validate(self):
        if self.errors:
            abort(400, "Please check the highlighted fields.", errors=self.errors)


def query_int(name, default=None, min_value=None, max_value=None):
    """A whole number from the address (?page=2), kept within the given limits."""
    raw = request.args.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        abort(400, f"Query parameter '{name}' must be a whole number.")
    if min_value is not None:
        value = max(value, min_value)
    if max_value is not None:
        value = min(value, max_value)
    return value
