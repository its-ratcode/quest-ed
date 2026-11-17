"""Time zones by their IANA name, e.g. "Europe/Berlin". A family's time zone decides when its day starts."""
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def is_valid_timezone(name):
    if not isinstance(name, str) or not name or len(name) > 64:
        return False
    try:
        ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        return False
    return True
