"""Small, explicit request validation with a message per field.

    p = Payload()
    email = p.email("email")
    password = p.password("password")
    p.validate()   # 400 with {"errors": {"email": "...", ...}} if anything was wrong
"""
import re

from flask import request
from flask_restx import abort

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
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

    def add_error(self, name, message):
        self.errors[name] = message

    def validate(self):
        if self.errors:
            abort(400, "Please check the highlighted fields.", errors=self.errors)
