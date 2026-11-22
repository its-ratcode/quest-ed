"""The reward shop: parents set rewards up, kids buy them with points, parents hand them over."""
from app.extensions import db
from app.models import PointTransaction, Redemption, Reward
from tests.test_approvals import PASSWORD, setup_family


def family_with_points(api, points=50, email="pat@example.test"):
    """Pat, and Mia (signed in) with `points` to spend. Returns (pat, mia, mia_id)."""
    pat, mia, _ = setup_family(api, email=email)
    mia_id = mia.get("/auth/me").get_json()["user"]["id"]
    if points:
        pat.post("/points/adjustments", json={"child_id": mia_id, "amount": points, "reason": "Starting points"})
    return pat, mia, mia_id


def add_reward(pat, **fields):
    data = {"title": "Movie night", "cost": 30, **fields}
    res = pat.post("/rewards", json=data)
    assert res.status_code == 201, res.get_json()
    return res.get_json()["reward"]


def balance(mia):
    return mia.get("/points/summary").get_json()["balance"]


def test_parents_set_up_the_shop_and_kids_see_whats_in_it(api):
    pat, mia, _ = family_with_points(api, points=0)
    cheap = add_reward(pat, title="Sticker", cost=5)
    assert (cheap["emoji"], cheap["stock"], cheap["is_active"]) == ("🎁", None, True)
    pricey = add_reward(pat, title="Zoo trip", cost=200, emoji="🦁", description="A whole day", stock=1)
    gone = add_reward(pat, title="Old one", cost=1)
    assert pat.delete(f"/rewards/{gone['id']}").get_json()["reward"]["is_active"] is False

    assert [r["title"] for r in mia.get("/rewards").get_json()["items"]] == ["Sticker", "Zoo trip"]
    assert [r["title"] for r in pat.get("/rewards").get_json()["items"]] == ["Sticker", "Zoo trip", "Old one"]

    changed = pat.patch(f"/rewards/{pricey['id']}", json={"cost": 150, "stock": None})
    assert (changed.get_json()["reward"]["cost"], changed.get_json()["reward"]["stock"]) == (150, None)
    assert pat.patch(f"/rewards/{gone['id']}", json={"is_active": True}).get_json()["reward"]["is_active"] is True


def test_reward_fields_are_checked(api):
    pat, mia, _ = family_with_points(api, points=0)
    res = pat.post("/rewards", json={"title": " ", "cost": 0, "stock": -1})
    assert res.status_code == 400 and set(res.get_json()["errors"]) == {"title", "cost", "stock"}
    reward = add_reward(pat)
    assert pat.patch(f"/rewards/{reward['id']}", json={"emoji": ""}).status_code == 400
    assert mia.post("/rewards", json={"title": "Free stuff", "cost": 1}).status_code == 403


def test_buying_takes_the_points_and_handing_over_finishes_it(api, app):
    pat, mia, mia_id = family_with_points(api, points=50)
    reward = add_reward(pat, title="Movie night", cost=30, emoji="🎬")

    res = mia.post(f"/rewards/{reward['id']}/redeem")
    assert res.status_code == 201 and res.get_json()["balance"] == 20
    bought = res.get_json()["redemption"]
    assert (bought["status"], bought["reward_title"], bought["cost"]) == ("pending", "Movie night", 30)

    history = mia.get("/points/transactions").get_json()["items"]
    assert (history[0]["amount"], history[0]["description"], history[0]["redemption_id"]) == (-30, "Bought: Movie night", bought["id"])

    # The price changing later doesn't change what she paid.
    pat.patch(f"/rewards/{reward['id']}", json={"title": "Film night", "cost": 40})
    waiting = pat.get("/rewards/redemptions?status=pending").get_json()
    assert waiting["total"] == 1 and waiting["items"][0]["reward_title"] == "Movie night"
    assert waiting["items"][0]["child"]["display_name"] == "Mia"

    done = pat.post(f"/rewards/redemptions/{bought['id']}/fulfill")
    assert done.status_code == 200 and done.get_json()["redemption"]["status"] == "fulfilled"
    assert done.get_json()["redemption"]["resolved_by"]["display_name"] == "Pat"
    assert pat.post(f"/rewards/redemptions/{bought['id']}/fulfill").status_code == 409
    assert pat.post(f"/rewards/redemptions/{bought['id']}/cancel").status_code == 409  # too late
    assert balance(mia) == 20


def test_not_enough_points_or_out_of_the_shop(api, app):
    pat, mia, _ = family_with_points(api, points=20)
    reward = add_reward(pat, cost=30, stock=3)
    res = mia.post(f"/rewards/{reward['id']}/redeem")
    assert res.status_code == 409 and res.get_json()["error"] == "insufficient_points"
    assert res.get_json()["message"] == "You need 10 more points for this."
    with app.app_context():  # nothing happened: no purchase, and the stock is untouched
        assert db.session.query(Redemption).count() == 0
        assert db.session.get(Reward, reward["id"]).stock == 3

    pat.delete(f"/rewards/{reward['id']}")
    res = mia.post(f"/rewards/{reward['id']}/redeem")
    assert res.status_code == 409 and res.get_json()["error"] == "reward_inactive"
    assert balance(mia) == 20


def test_stock_runs_out_and_comes_back_when_cancelled(api):
    pat, mia, _ = family_with_points(api, points=100)
    reward = add_reward(pat, title="Ice cream", cost=10, stock=1)
    first = mia.post(f"/rewards/{reward['id']}/redeem").get_json()
    assert first["reward"]["stock"] == 0
    sold_out = mia.post(f"/rewards/{reward['id']}/redeem")
    assert sold_out.status_code == 409 and sold_out.get_json()["error"] == "out_of_stock"
    assert balance(mia) == 90  # only paid once

    # Mia changes her mind: the points come back, and so does the ice cream.
    back = mia.post(f"/rewards/redemptions/{first['redemption']['id']}/cancel")
    assert back.status_code == 200 and back.get_json()["balance"] == 100
    assert back.get_json()["redemption"]["status"] == "cancelled"
    assert pat.get("/rewards").get_json()["items"][0]["stock"] == 1
    newest = mia.get("/points/transactions").get_json()["items"][0]
    assert (newest["amount"], newest["description"], newest["kind"]) == (10, "Cancelled: Ice cream", "refund")
    assert mia.post(f"/rewards/redemptions/{first['redemption']['id']}/cancel").status_code == 409


def test_redemption_lists_and_who_can_do_what(api):
    pat, mia, mia_id = family_with_points(api, points=100)
    leo_id = pat.post("/family/children", json={"display_name": "Leo", "username": "pat-leo",
                                                "password": "kidpass1"}).get_json()["child"]["id"]
    pat.post("/points/adjustments", json={"child_id": leo_id, "amount": 50, "reason": "Start"})
    leo = api()
    leo.post("/auth/login", json={"identifier": "pat-leo", "password": "kidpass1"})
    reward = add_reward(pat, cost=10)
    mias = mia.post(f"/rewards/{reward['id']}/redeem").get_json()["redemption"]
    leo.post(f"/rewards/{reward['id']}/redeem")
    pat.post(f"/rewards/redemptions/{mias['id']}/fulfill")

    assert pat.get("/rewards/redemptions").get_json()["total"] == 2
    assert pat.get(f"/rewards/redemptions?child_id={leo_id}").get_json()["total"] == 1
    assert pat.get("/rewards/redemptions?status=pending").get_json()["items"][0]["child"]["display_name"] == "Leo"
    done = pat.get("/rewards/redemptions?status=done").get_json()  # the history: handed over or cancelled
    assert [r["id"] for r in done["items"]] == [mias["id"]] and done["total"] == 1
    assert pat.get("/rewards/redemptions?status=nope").status_code == 400
    assert [r["id"] for r in mia.get("/rewards/redemptions").get_json()["items"]] == [mias["id"]]  # only her own

    leos = leo.get("/rewards/redemptions").get_json()["items"][0]
    assert mia.post(f"/rewards/redemptions/{leos['id']}/cancel").status_code == 404  # not hers
    assert mia.post(f"/rewards/redemptions/{leos['id']}/fulfill").status_code == 403  # kids don't hand over
    assert pat.post(f"/rewards/{reward['id']}/redeem").status_code == 403  # parents don't buy

    sam, sams_kid, _ = family_with_points(api, points=100, email="sam@example.test")
    assert sams_kid.post(f"/rewards/{reward['id']}/redeem").status_code == 404  # not their shop
    assert sam.post(f"/rewards/redemptions/{leos['id']}/fulfill").status_code == 404
    assert sam.patch(f"/rewards/{reward['id']}", json={"cost": 1}).status_code == 404
    assert sams_kid.get("/rewards").get_json()["items"] == []


def test_removing_a_kid_removes_what_they_bought(api, app):
    pat, mia, mia_id = family_with_points(api, points=50)
    reward = add_reward(pat, cost=10)
    bought = mia.post(f"/rewards/{reward['id']}/redeem").get_json()["redemption"]
    mia.post(f"/rewards/redemptions/{bought['id']}/cancel")
    assert pat.delete(f"/family/children/{mia_id}", json={"password": PASSWORD}).status_code == 200
    with app.app_context():
        assert db.session.query(Redemption).count() == 0
        assert db.session.query(PointTransaction).count() == 0
        assert db.session.query(Reward).count() == 1  # the shop stays
