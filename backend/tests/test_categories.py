"""Task categories belong to each family: parents add, rename, restyle, hide, reorder and remove them."""
from app.extensions import db
from app.models import Category

PASSWORD = "parent-pass-123"


def parent(api, email="pat@example.test", family_name="The Testers"):
    browser = api()
    browser.post("/auth/register", json={"display_name": "Pat", "email": email, "password": PASSWORD,
                                         "family_name": family_name})
    return browser


def cats(client):
    return client.get("/categories").get_json()["items"]


def test_a_new_family_starts_with_the_starter_set(api):
    pat = parent(api)
    items = cats(pat)
    assert [c["label"] for c in items] == ["Chores", "Learning", "Health", "Kindness", "Creativity", "Other"]
    assert items[0] == {**items[0], "key": "chores", "icon": "broom", "tone": "mint", "is_active": True, "used": 0}


def test_parents_add_their_own_and_kids_can_read_them(api):
    pat = parent(api)
    res = pat.post("/categories", json={"label": "Music practice", "icon": "music", "tone": "sky"})
    assert res.status_code == 201
    music = res.get_json()["category"]
    assert music["key"].startswith("c") and music["position"] > 5  # added at the end

    assert pat.post("/categories", json={"label": "music PRACTICE"}).status_code == 400  # same name
    assert pat.post("/categories", json={"label": "X", "icon": "rocket"}).status_code == 400  # unknown picture

    pat.post("/family/children", json={"display_name": "Mia", "username": "mia", "password": "kidpass1"})
    mia = api()
    mia.post("/auth/login", json={"identifier": "mia", "password": "kidpass1"})
    seen = cats(mia)
    assert len(seen) == 7 and "used" not in seen[0]  # kids don't get the usage counts
    assert mia.post("/categories", json={"label": "Mine"}).status_code == 403


def test_rename_restyle_hide_and_show(api):
    pat = parent(api)
    chores = cats(pat)[0]
    res = pat.patch(f"/categories/{chores['id']}", json={"label": "House jobs", "tone": "sky", "icon": "home"})
    assert res.status_code == 200
    assert res.get_json()["category"] == {**res.get_json()["category"], "key": "chores", "label": "House jobs",
                                          "tone": "sky", "icon": "home"}
    hidden = pat.patch(f"/categories/{chores['id']}", json={"is_active": False}).get_json()["category"]
    assert hidden["is_active"] is False
    assert pat.patch(f"/categories/{chores['id']}", json={"is_active": True}).get_json()["category"]["is_active"]


def test_reorder(api):
    pat = parent(api)
    ids = [c["id"] for c in cats(pat)]
    assert pat.put("/categories/order", json={"ids": list(reversed(ids))}).status_code == 200
    assert [c["id"] for c in cats(pat)] == list(reversed(ids))
    assert pat.put("/categories/order", json={"ids": ids[:-1]}).status_code == 400  # one missing
    assert pat.put("/categories/order", json={"ids": ["a"] * len(ids)}).status_code == 400


def test_remove_and_always_keep_one(api):
    pat = parent(api)
    items = cats(pat)
    res = pat.delete(f"/categories/{items[-1]['id']}")
    assert res.get_json() == {"removed": True, "hidden": False}
    assert len(cats(pat)) == 5

    for c in cats(pat)[1:]:
        pat.patch(f"/categories/{c['id']}", json={"is_active": False})
    last = cats(pat)[0]
    assert pat.patch(f"/categories/{last['id']}", json={"is_active": False}).status_code == 409
    assert pat.delete(f"/categories/{last['id']}").status_code == 409


def test_families_from_before_categories_get_the_starters_once(api, app):
    pat = parent(api)
    with app.app_context():  # like a family made before this step: no categories at all
        db.session.query(Category).delete()
        db.session.commit()
    assert len(cats(pat)) == 6
    assert len(cats(pat)) == 6  # filled once, not again


def test_other_families_cant_touch_your_categories(api):
    mine = parent(api)
    theirs = parent(api, email="sam@example.test", family_name="Other family")
    chores = cats(mine)[0]
    assert theirs.patch(f"/categories/{chores['id']}", json={"label": "Hacked"}).status_code == 404
    assert theirs.delete(f"/categories/{chores['id']}").status_code == 404
    assert cats(mine)[0]["label"] == "Chores"
