"""The action log. Call `record(...)` before the commit of the change it describes, so the
entry is saved together with the change (or not at all, if the change fails)."""
import json

from ..extensions import db
from ..models import AuditLog


def record(action, actor=None, target_type=None, target_id=None, family_id=None, **details):
    """Log `action` (e.g. "task.approved"), done by `actor` (a User, or None). The family defaults
    to the actor's. Keep `details` to numbers and ids: no names, notes or other personal text."""
    db.session.add(AuditLog(
        action=action,
        actor_id=getattr(actor, "id", None),
        target_type=target_type,
        target_id=target_id,
        family_id=family_id if family_id is not None else getattr(actor, "family_id", None),
        details=json.dumps(details, default=str, sort_keys=True),
    ))
