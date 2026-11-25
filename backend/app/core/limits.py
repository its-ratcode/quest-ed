"""Limits on password guessing.

Wrong passwords are counted per account (and, for signing in, per address). After too many
within the time window, further tries get a 429 until the oldest one is old enough to drop
out. A right password clears the account's count.

Kept in memory: simple, no extra service, and enough for one server process (the usual
self-hosted setup). Restarting the server forgets the counts. With several server processes,
put a shared store (e.g. Redis) behind these functions.
"""
import threading
import time
from collections import defaultdict, deque

from flask import current_app
from flask_restx import abort

WINDOW_SECONDS = 15 * 60
LIMITS = {
    "login": 5,      # wrong passwords for one email or username
    "login_ip": 30,  # wrong passwords from one address, across accounts
    "password": 5,   # a parent's password before removing a kid (or the family)
}

_failures = defaultdict(deque)  # "kind:key" -> times of recent wrong tries
_lock = threading.Lock()


def reset():
    """Forget every count (tests start each one fresh)."""
    with _lock:
        _failures.clear()


def _enabled():
    return current_app.config.get("RATE_LIMIT_ENABLED", True)


def _recent(key, now):
    tries = _failures[key]
    while tries and now - tries[0] > WINDOW_SECONDS:
        tries.popleft()
    return tries


def check(kind, key):
    """Stop with a 429 if this account (or address) has used up its tries."""
    if not _enabled():
        return
    now = time.monotonic()
    with _lock:
        tries = _recent(f"{kind}:{key}", now)
        if len(tries) >= LIMITS[kind]:
            minutes = max(1, round((WINDOW_SECONDS - (now - tries[0])) / 60))
            abort(429, f"Too many wrong tries. Please wait about {minutes} minute{'s' if minutes != 1 else ''} "
                       "and try again.", error="too_many_attempts")


def failed(kind, key):
    """Count a wrong password."""
    if _enabled():
        with _lock:
            _failures[f"{kind}:{key}"].append(time.monotonic())


def succeeded(kind, key):
    """A right password: start counting from zero again."""
    with _lock:
        _failures.pop(f"{kind}:{key}", None)
