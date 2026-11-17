PASSWORD = "parent-pass-123"


def register(client, email="pat@example.test", **extra):
    payload = {"display_name": "Pat", "email": email, "password": PASSWORD}
    payload.update(extra)
    return client.post("/auth/register", json=payload)


def test_a_new_family_takes_the_browsers_time_zone(api):
    berlin = api()
    register(berlin, family_name="Berliners", timezone="Europe/Berlin")
    assert berlin.get("/family").get_json()["family"]["timezone"] == "Europe/Berlin"

    unknown = api()
    register(unknown, email="sam@example.test", family_name="Elsewhere", timezone="Mars/Olympus")
    assert unknown.get("/family").get_json()["family"]["timezone"] == "UTC"


def test_a_second_parent_joins_with_the_invite_code(api):
    pat = api()
    register(pat, family_name="The Testers")
    code = pat.get("/family").get_json()["family"]["invite_code"]

    sam = api()
    res = register(sam, email="sam@example.test", invite_code=code.lower())  # any letter case
    assert res.status_code == 201
    family = sam.get("/family").get_json()
    assert family["family"]["name"] == "The Testers"
    assert [m["display_name"] for m in family["members"]] == ["Pat", "Pat"]


def test_sign_up_needs_a_family_name_or_a_valid_code(api):
    res = register(api())
    assert res.status_code == 400 and "family_name" in res.get_json()["errors"]
    res = register(api(), invite_code="NOPE2345")
    assert res.status_code == 400 and res.get_json()["errors"]["invite_code"] == "This invite code is not valid."


def test_a_new_invite_code_replaces_the_old_one(api):
    pat = api()
    register(pat, family_name="The Testers")
    old = pat.get("/family").get_json()["family"]["invite_code"]
    new = pat.post("/family/invite-code").get_json()["invite_code"]
    assert new != old and len(new) == 8
    assert register(api(), email="sam@example.test", invite_code=old).status_code == 400
    assert register(api(), email="kim@example.test", invite_code=new).status_code == 201


def test_parents_rename_the_family_and_set_its_time_zone(api):
    pat = api()
    register(pat, family_name="The Testers")
    res = pat.patch("/family", json={"name": " The Riveras ", "timezone": "America/New_York"})
    assert res.status_code == 200
    assert res.get_json()["family"] == {**res.get_json()["family"], "name": "The Riveras",
                                        "timezone": "America/New_York"}

    bad = pat.patch("/family", json={"name": "", "timezone": "Not/AZone"})
    assert bad.status_code == 400 and set(bad.get_json()["errors"]) == {"name", "timezone"}
    assert pat.get("/family").get_json()["family"]["name"] == "The Riveras"  # nothing changed


def test_only_parents_change_family_settings(api):
    pat = api()
    register(pat, family_name="The Testers")
    pat.post("/family/children", json={"display_name": "Mia", "username": "mia", "password": "kidpass1"})
    mia = api()
    mia.post("/auth/login", json={"identifier": "mia", "password": "kidpass1"})
    assert mia.patch("/family", json={"name": "Mia's family"}).status_code == 403
    assert mia.post("/family/invite-code").status_code == 403
