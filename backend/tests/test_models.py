import pytest
from sqlalchemy.exc import IntegrityError

from app.models import ROLE_CHILD, ROLE_PARENT, Family, User, generate_invite_code


def make_family(session, name="The Testers"):
    family = Family(name=name)
    session.add(family)
    session.flush()
    return family


def make_user(session, family, role=ROLE_PARENT, **fields):
    user = User(role=role, display_name=fields.pop("display_name", "Pat"), family=family, **fields)
    user.set_password("a-good-password")
    session.add(user)
    session.flush()
    return user


def test_a_family_gets_an_invite_code_and_utc_by_default(session):
    family = make_family(session)
    assert len(family.invite_code) == 8
    assert family.timezone == "UTC"
    assert "invite_code" not in family.to_dict()
    assert family.to_dict(include_invite=True)["invite_code"] == family.invite_code


def test_invite_codes_avoid_look_alike_characters():
    codes = "".join(generate_invite_code() for _ in range(200))
    assert not set(codes) & set("0O1I")


def test_parents_and_kids_belong_to_a_family(session):
    family = make_family(session)
    parent = make_user(session, family, email="pat@example.test")
    kid = make_user(session, family, role=ROLE_CHILD, username="mia", display_name="Mia")
    assert [m.display_name for m in family.members] == ["Pat", "Mia"]
    assert kid.family is family and parent.avatar == "🙂" and kid.is_active


def test_passwords_are_hashed_and_checked(session):
    user = make_user(session, make_family(session), email="pat@example.test")
    assert user.password_hash != "a-good-password"
    assert user.check_password("a-good-password")
    assert not user.check_password("wrong")


def test_email_is_only_shared_with_its_owner(session):
    user = make_user(session, make_family(session), email="pat@example.test")
    assert "email" not in user.to_dict()
    assert user.to_dict(private=True)["email"] == "pat@example.test"
    assert user.to_dict()["created_at"].endswith("Z")


def test_emails_and_usernames_are_unique(session):
    family = make_family(session)
    make_user(session, family, email="pat@example.test")
    with pytest.raises(IntegrityError):
        make_user(session, family, email="pat@example.test")
    session.rollback()

    family = make_family(session)
    make_user(session, family, role=ROLE_CHILD, username="mia")
    with pytest.raises(IntegrityError):
        make_user(session, family, role=ROLE_CHILD, username="mia")


def test_a_user_cannot_point_at_a_missing_family(session):
    user = User(role=ROLE_PARENT, display_name="Ghost", family_id=999)
    user.set_password("a-good-password")
    session.add(user)
    with pytest.raises(IntegrityError):
        session.flush()
