"""Small helpers shared by every model."""
from datetime import datetime, timezone


def utcnow():
    return datetime.now(timezone.utc)


def iso(value):
    """A date or time as ISO 8601 text for the API; UTC times end in "Z"."""
    if value is None:
        return None
    if isinstance(value, datetime):
        if value.tzinfo is None:  # SQLite returns naive datetimes; they are stored in UTC
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat().replace("+00:00", "Z")
    return value.isoformat()
