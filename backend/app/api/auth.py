from flask import jsonify
from flask_jwt_extended import (
    create_access_token,
    create_refresh_token,
    current_user,
    get_jwt,
    jwt_required,
    set_access_cookies,
    set_refresh_cookies,
    unset_jwt_cookies,
    verify_jwt_in_request,
)
from flask_jwt_extended.exceptions import JWTExtendedException
from flask_restx import Namespace, Resource, abort
from jwt.exceptions import PyJWTError
from sqlalchemy import func, or_, select
from werkzeug.security import check_password_hash, generate_password_hash

from ..core.security import roles_required
from ..core.timezones import is_valid_timezone
from ..core.validation import Payload
from ..extensions import db
from ..models import ROLE_ADMIN, ROLE_PARENT, Family, TokenBlocklist, User, utcnow

ns = Namespace("auth", description="Sign-up, sign-in and sessions")

# Checked when an account doesn't exist, so a wrong email takes as long as a wrong
# password and nobody can tell from the timing which emails have accounts.
_DUMMY_HASH = generate_password_hash("not-a-real-password")


def _session_response(user, status=200):
    """The user's details, with fresh session cookies attached."""
    response = jsonify(user=user.to_dict(private=True))
    response.status_code = status
    set_access_cookies(response, create_access_token(identity=user))
    set_refresh_cookies(response, create_refresh_token(identity=user))
    return response


@ns.route("/register")
class Register(Resource):
    def post(self):
        """Create a parent account and sign in: with a new family, or joining one with its invite code."""
        p = Payload()
        display_name = p.string("display_name", max_len=60)
        email = p.email("email")
        password = p.password("password", min_len=8)
        invite_code = p.string("invite_code", required=False, max_len=16)
        family_name = p.string("family_name", required=not invite_code, max_len=80)
        p.validate()
        if db.session.scalar(select(User.id).where(User.email == email)):
            p.add_error("email", "An account with this email already exists.")

        family = None
        if invite_code:
            family = db.session.scalar(select(Family).where(Family.invite_code == invite_code.upper()))
            if family is None:
                p.add_error("invite_code", "This invite code is not valid.")
        p.validate()

        if family is None:
            # Sent by the browser on its own; an unknown value falls back to UTC rather than
            # blocking sign-up over a field the parent never saw.
            tz = p.data.get("timezone")
            family = Family(name=family_name, timezone=tz if is_valid_timezone(tz) else "UTC")

        # The role is always set here; a role sent by the browser is ignored.
        user = User(role=ROLE_PARENT, email=email, display_name=display_name, family=family,
                    last_login_at=utcnow())
        user.set_password(password)
        db.session.add_all([family, user])
        db.session.commit()
        return _session_response(user, status=201)


@ns.route("/login")
class Login(Resource):
    def post(self):
        """Sign in with an email (parents, admins) or a username (kids)."""
        p = Payload()
        identifier = p.string("identifier", max_len=255, lower=True)
        password = p.password("password", min_len=1)
        p.validate()

        user = db.session.scalar(
            select(User).where(or_(func.lower(User.email) == identifier, User.username == identifier))
        )
        if user is None:
            check_password_hash(_DUMMY_HASH, password)
        if user is None or not user.check_password(password):
            abort(401, "Incorrect email/username or password.", error="invalid_credentials")
        if not user.is_active:
            abort(403, "This account has been switched off. Ask whoever manages it.", error="account_inactive")

        user.last_login_at = utcnow()
        db.session.commit()
        return _session_response(user)


@ns.route("/refresh")
class Refresh(Resource):
    @jwt_required(refresh=True)
    def post(self):
        """A new short-lived session cookie, from the long-lived refresh cookie."""
        response = jsonify(user=current_user.to_dict(private=True))
        set_access_cookies(response, create_access_token(identity=current_user))
        return response


@ns.route("/logout")
class Logout(Resource):
    def post(self):
        """End the session. The cookies are always cleared, even if the session had already expired."""
        try:
            verify_jwt_in_request(optional=True, refresh=True)
            jti = get_jwt().get("jti")
            if jti:
                db.session.add(TokenBlocklist(jti=jti))
                db.session.commit()
        except (JWTExtendedException, PyJWTError):
            db.session.rollback()
        response = jsonify(message="Signed out.")
        unset_jwt_cookies(response)
        return response


def _me_payload(user):
    family = user.family
    return {
        "user": user.to_dict(private=True),
        "family": family.to_dict(include_invite=user.role == ROLE_PARENT) if family else None,
    }


@ns.route("/me")
class Me(Resource):
    @jwt_required()
    def get(self):
        """The signed-in user and their family."""
        return _me_payload(current_user)

    @jwt_required()
    def patch(self):
        """Change your own display name or avatar (any emoji, or a short text)."""
        p = Payload()
        if p.has("display_name"):
            display_name = p.string("display_name", max_len=60)
        if p.has("avatar"):
            avatar = p.string("avatar", max_len=16)
        p.validate()
        if p.has("display_name"):
            current_user.display_name = display_name
        if p.has("avatar"):
            current_user.avatar = avatar
        db.session.commit()
        return _me_payload(current_user)


@ns.route("/change-password")
class ChangePassword(Resource):
    @roles_required(ROLE_PARENT, ROLE_ADMIN)
    def post(self):
        """Change your password. Kids' passwords are set by a parent instead."""
        p = Payload()
        current = p.password("current_password", min_len=1)
        new = p.password("new_password", min_len=8)
        p.validate()
        if not current_user.check_password(current):
            p.add_error("current_password", "Your current password is incorrect.")
            p.validate()
        current_user.set_password(new)
        db.session.commit()
        return {"message": "Password updated."}
