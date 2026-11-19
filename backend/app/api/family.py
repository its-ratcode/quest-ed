from flask_jwt_extended import current_user, jwt_required
from flask_restx import Namespace, Resource, abort
from sqlalchemy import select

from ..core.security import confirm_password, family_child_or_404, roles_required
from ..core.timezones import is_valid_timezone
from ..core.validation import Payload
from ..extensions import db
from ..models import ROLE_CHILD, ROLE_PARENT, Family, User, generate_invite_code
from ..services.erase import erase_child

ns = Namespace("family", description="Your family, and your kids' accounts")


@ns.route("")
class FamilyResource(Resource):
    @jwt_required()
    def get(self):
        """Your family and everyone in it. Parents also see emails and the invite code."""
        family = current_user.family
        if family is None:
            abort(404, "You are not part of a family yet.")
        return _family_payload(current_user)

    @roles_required(ROLE_PARENT)
    def patch(self):
        """Rename the family or change its time zone."""
        p = Payload()
        family = current_user.family
        if p.has("name"):
            name = p.string("name", max_len=80)
        if p.has("timezone"):
            timezone = p.string("timezone", max_len=64)
            if timezone and not is_valid_timezone(timezone):
                p.add_error("timezone", "Unknown time zone.")
        p.validate()
        if p.has("name"):
            family.name = name
        if p.has("timezone"):
            family.timezone = timezone
        db.session.commit()
        return _family_payload(current_user)


def _family_payload(viewer):
    family = viewer.family
    is_parent = viewer.role == ROLE_PARENT
    return {
        "family": family.to_dict(include_invite=is_parent),
        # Kids see their own points, not their brothers' and sisters'.
        "members": [member.to_dict(private=is_parent, include_balance=is_parent or member.id == viewer.id)
                    for member in family.members],
    }


@ns.route("/invite-code")
class InviteCode(Resource):
    @roles_required(ROLE_PARENT)
    def post(self):
        """Make a new invite code. The old one stops working."""
        family = current_user.family
        for _ in range(5):  # codes are random; in the rare case one is taken, try another
            code = generate_invite_code()
            if not db.session.scalar(select(Family.id).where(Family.invite_code == code)):
                family.invite_code = code
                break
        db.session.commit()
        return {"invite_code": family.invite_code}


@ns.route("/children")
class Children(Resource):
    @roles_required(ROLE_PARENT)
    def post(self):
        """Add a kid to your family. Kids sign in with a username, not an email."""
        p = Payload()
        display_name = p.string("display_name", max_len=60)
        username = p.username("username")
        password = p.password("password", min_len=6)
        avatar = p.string("avatar", required=False, max_len=16, default="🦊")
        p.validate()
        if db.session.scalar(select(User.id).where(User.username == username)):
            p.add_error("username", "This username is taken. Try another one.")
            p.validate()

        child = User(role=ROLE_CHILD, username=username, display_name=display_name, avatar=avatar,
                     family_id=current_user.family_id)
        child.set_password(password)
        db.session.add(child)
        db.session.commit()
        return {"child": child.to_dict()}, 201


@ns.route("/children/<int:child_id>")
class ChildResource(Resource):
    @roles_required(ROLE_PARENT)
    def patch(self, child_id):
        """Change a kid's name or avatar, or give them a new password."""
        child = family_child_or_404(child_id)
        p = Payload()
        if p.has("display_name"):
            display_name = p.string("display_name", max_len=60)
        if p.has("avatar"):
            avatar = p.string("avatar", max_len=16)
        password = p.password("password", min_len=6, required=False) if p.has("password") else None
        p.validate()

        if p.has("display_name"):
            child.display_name = display_name
        if p.has("avatar"):
            child.avatar = avatar
        if password:
            child.set_password(password)
        db.session.commit()
        return {"child": child.to_dict()}

    @roles_required(ROLE_PARENT)
    def delete(self, child_id):
        """Remove a kid for good, with everything about them. Needs your password,
        because it can't be undone."""
        child = family_child_or_404(child_id)
        p = Payload()
        password = p.password("password", min_len=1)
        p.validate()
        confirm_password(current_user, password)

        erase_child(child)
        db.session.commit()
        return {"message": "Removed."}
