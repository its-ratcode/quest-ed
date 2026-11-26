from flask import jsonify, request
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

from ..core import limits
from ..core.security import confirm_password, roles_required
from ..core.timezones import is_valid_timezone
from ..core.validation import Payload
from ..extensions import db
from ..models import ROLE_ADMIN, ROLE_CHILD, ROLE_PARENT, Family, TokenBlocklist, User, utcnow
from ..services import audit
from ..services.badges import add_starter_badges
from ..services.categories import add_starter_categories
from ..services.site import feature_enabled, needs_setup

ns = Namespace("auth", description="Sign-up, sign-in and sessions")

# Checked when an account doesn't exist, so a wrong email takes as long as a wrong
# password and nobody can tell from the timing which emails have accounts.
_DUMMY_HASH = generate_password_hash("not-a-real-password")


# In a session where a parent opened one of their kids' accounts: which parent it was.
ACTING_CLAIM = "acting_parent_id"


def _session_response(user, status=200, claims=None):
    """The user's details, with fresh session cookies attached."""
    response = jsonify(user=user.to_dict(private=True))
    response.status_code = status
    set_access_cookies(response, create_access_token(identity=user, additional_claims=claims))
    set_refresh_cookies(response, create_refresh_token(identity=user, additional_claims=claims))
    return response


def _acting_claims():
    """Keeps an "opened by a parent" session that way when its cookie is renewed."""
    parent_id = get_jwt().get(ACTING_CLAIM)
    return {ACTING_CLAIM: parent_id} if parent_id else None


def _acting_parent():
    """The parent who opened this kid's account, if that's what this session is."""
    parent_id = get_jwt().get(ACTING_CLAIM)
    return db.session.get(User, parent_id) if parent_id else None


def _end_this_session():
    """The cookies are about to be replaced; the old session token stops working too."""
    jti = get_jwt().get("jti")
    if jti:
        db.session.add(TokenBlocklist(jti=jti))


@ns.route("/setup")
class Setup(Resource):
    def post(self):
        """On a brand-new site only: create the administrator and sign in. Once there is one,
        this always answers 409, so it can never make a second."""
        if not needs_setup():
            abort(409, "This site is already set up. Please sign in.", error="already_set_up")
        p = Payload()
        display_name = p.string("display_name", max_len=60)
        email = p.email("email")
        password = p.password("password", min_len=12)
        p.validate()
        if db.session.scalar(select(User.id).where(User.email == email)):
            p.add_error("email", "An account with this email already exists.")
            p.validate()

        admin = User(role=ROLE_ADMIN, email=email, display_name=display_name, avatar="🛡️", last_login_at=utcnow())
        admin.set_password(password)
        db.session.add(admin)
        db.session.flush()
        if db.session.scalar(select(func.count(User.id)).where(User.role == ROLE_ADMIN)) > 1:
            db.session.rollback()  # two people went through setup at the same moment; the first one wins
            abort(409, "This site is already set up. Please sign in.", error="already_set_up")
        audit.record("site.setup", actor=admin, target_type="user", target_id=admin.id)
        db.session.commit()
        return _session_response(admin, status=201)


@ns.route("/register")
class Register(Resource):
    def post(self):
        """Create a parent account and sign in: with a new family, or joining one with its invite code.
        403 while the administrator has new sign-ups switched off."""
        if not feature_enabled("registration"):
            abort(403, "New sign-ups are closed right now.", error="registration_closed")
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
        if not invite_code:
            db.session.flush()  # gives the new family its id
            add_starter_categories(family.id)  # a starting point; parents can change all of them
            add_starter_badges(family.id)
        db.session.flush()  # gives the new parent an id for the log
        audit.record("account.registered", actor=user, target_type="user", target_id=user.id,
                     joined_with_code=bool(invite_code))
        db.session.commit()
        return _session_response(user, status=201)


@ns.route("/login")
class Login(Resource):
    def post(self):
        """Sign in with an email (parents, admins) or a username (kids). After too many wrong
        passwords (per account, or from one address) it says to wait a while: 429."""
        p = Payload()
        identifier = p.string("identifier", max_len=255, lower=True)
        password = p.password("password", min_len=1)
        p.validate()
        address = request.remote_addr or "unknown"
        limits.check("login_ip", address)
        limits.check("login", identifier)

        user = db.session.scalar(
            select(User).where(or_(func.lower(User.email) == identifier, User.username == identifier))
        )
        if user is None:
            check_password_hash(_DUMMY_HASH, password)
        if user is None or not user.check_password(password):
            limits.failed("login", identifier)
            limits.failed("login_ip", address)
            abort(401, "Incorrect email/username or password.", error="invalid_credentials")
        limits.succeeded("login", identifier)
        if not user.is_active:
            abort(403, "This account has been switched off. Ask whoever manages it.", error="account_inactive")

        user.last_login_at = utcnow()
        audit.record("auth.login", actor=user, target_type="user", target_id=user.id)
        db.session.commit()
        return _session_response(user)


@ns.route("/refresh")
class Refresh(Resource):
    @jwt_required(refresh=True)
    def post(self):
        """A new short-lived session cookie, from the long-lived refresh cookie."""
        response = jsonify(user=current_user.to_dict(private=True))
        set_access_cookies(response, create_access_token(identity=current_user, additional_claims=_acting_claims()))
        return response


@ns.route("/view-as/<int:child_id>")
class ViewAsChild(Resource):
    @roles_required(ROLE_PARENT)
    def post(self, child_id):
        """Open one of your kids' accounts in this browser, without their password: to see what they
        see, or to tick something off for them. Switching back asks for your password, so a kid left
        at the keyboard can't get into the parent account."""
        child = db.session.get(User, child_id)
        if (child is None or child.role != ROLE_CHILD or child.family_id != current_user.family_id
                or not child.is_active):
            abort(404, "Child not found.")
        audit.record("auth.view_as_child", actor=current_user, target_type="user", target_id=child.id,
                     family_id=child.family_id)
        _end_this_session()
        db.session.commit()
        return _session_response(child, claims={ACTING_CLAIM: current_user.id})


@ns.route("/switch-back")
class SwitchBack(Resource):
    @jwt_required()
    def post(self):
        """From a kid's account back to the parent who opened it. Needs that parent's password
        (wrong guesses are limited, like every password check)."""
        parent = _acting_parent()
        if parent is None:
            abort(409, "This isn't an account a parent opened.", error="not_acting")
        p = Payload()
        password = p.password("password", min_len=1)
        p.validate()
        if parent.role != ROLE_PARENT or not parent.is_active or parent.family_id != current_user.family_id:
            abort(403, "That parent account can't be used here any more. Please sign in again.")
        confirm_password(parent, password)
        audit.record("auth.switch_back", actor=parent, target_type="user", target_id=current_user.id,
                     family_id=parent.family_id)
        _end_this_session()
        db.session.commit()
        return _session_response(parent)


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
    parent = _acting_parent()
    return {
        "user": user.to_dict(private=True),
        "family": family.to_dict(include_invite=user.role == ROLE_PARENT) if family else None,
        # Set while a parent is using this kid's account (the web app shows a banner to switch back).
        "acting_parent": ({"id": parent.id, "display_name": parent.display_name, "avatar": parent.avatar}
                          if parent is not None else None),
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
