"""Points: the balance with totals, the history, and parents adding or taking away points."""
from tests.test_approvals import setup_family


def approve(pat, mia, task):
    sub = mia.post(f"/tasks/{task['id']}/submit", json={}).get_json()["submission"]
    pat.post(f"/tasks/submissions/{sub['id']}/approve", json={})


def mia_id(mia):
    return mia.get("/auth/me").get_json()["user"]["id"]


def test_summary_and_history_after_a_task_and_a_bonus(api):
    pat, mia, task = setup_family(api)
    approve(pat, mia, task)
    kid = mia_id(mia)
    res = pat.post("/points/adjustments", json={"child_id": kid, "amount": 5, "reason": "Helped a neighbour"})
    assert res.status_code == 201 and res.get_json()["balance"] == 15

    summary = mia.get("/points/summary").get_json()
    assert (summary["balance"], summary["earned_total"], summary["spent_total"]) == (15, 15, 0)
    assert pat.get(f"/points/summary?child_id={kid}").get_json()["balance"] == 15

    history = mia.get("/points/transactions").get_json()
    assert history["total"] == 2
    newest, oldest = history["items"]
    assert (newest["description"], newest["amount"], newest["balance_after"]) == ("Helped a neighbour", 5, 15)
    assert newest["kind"] == "adjustment" and newest["created_by"]["display_name"] == "Pat"
    assert (oldest["description"], oldest["kind"]) == ("Completed: Tidy your room", "task_reward")


def test_taking_points_away_never_goes_below_zero(api):
    pat, mia, task = setup_family(api)
    approve(pat, mia, task)  # 10 points
    kid = mia_id(mia)
    ok = pat.post("/points/adjustments", json={"child_id": kid, "amount": -4, "reason": "Counted twice"})
    assert ok.status_code == 201 and ok.get_json()["balance"] == 6

    too_much = pat.post("/points/adjustments", json={"child_id": kid, "amount": -7, "reason": "Oops"})
    assert too_much.status_code == 409 and too_much.get_json()["error"] == "insufficient_points"
    assert "only has 6 points" in too_much.get_json()["message"]
    summary = mia.get("/points/summary").get_json()
    assert (summary["balance"], summary["earned_total"], summary["spent_total"]) == (6, 10, 4)
    assert mia.get("/points/transactions").get_json()["total"] == 2  # the refused one left no trace


def test_adjustments_need_a_reason_and_a_sensible_amount(api):
    pat, mia, _ = setup_family(api)
    kid = mia_id(mia)
    res = pat.post("/points/adjustments", json={"child_id": kid, "amount": 0, "reason": " "})
    assert res.status_code == 400 and set(res.get_json()["errors"]) == {"amount", "reason"}
    big = pat.post("/points/adjustments", json={"child_id": kid, "amount": 10001, "reason": "Too generous"})
    assert big.status_code == 400 and "amount" in big.get_json()["errors"]


def test_history_pages_and_whole_family(api):
    pat, mia, _ = setup_family(api)
    kid = mia_id(mia)
    leo = pat.post("/family/children", json={"display_name": "Leo", "username": "pat-leo",
                                             "password": "kidpass1"}).get_json()["child"]["id"]
    for i in range(7):
        pat.post("/points/adjustments", json={"child_id": kid, "amount": 1, "reason": f"Bonus {i}"})
    pat.post("/points/adjustments", json={"child_id": leo, "amount": 3, "reason": "Leo's bonus"})

    first = mia.get("/points/transactions?per_page=5").get_json()
    assert first["total"] == 7 and len(first["items"]) == 5 and first["items"][0]["description"] == "Bonus 6"
    second = mia.get("/points/transactions?per_page=5&page=2").get_json()
    assert [t["description"] for t in second["items"]] == ["Bonus 1", "Bonus 0"]

    family = pat.get("/points/transactions").get_json()
    assert family["total"] == 8 and family["items"][0]["child"]["display_name"] == "Leo"
    assert pat.get(f"/points/transactions?child_id={leo}").get_json()["total"] == 1


def test_who_can_see_and_change_points(api):
    pat, mia, _ = setup_family(api)
    kid = mia_id(mia)
    leo = pat.post("/family/children", json={"display_name": "Leo", "username": "pat-leo",
                                             "password": "kidpass1"}).get_json()["child"]["id"]
    pat.post("/points/adjustments", json={"child_id": leo, "amount": 3, "reason": "Leo's bonus"})

    # Kids can't change points, and only ever see their own (child_id is ignored for them).
    assert mia.post("/points/adjustments", json={"child_id": kid, "amount": 50, "reason": "Me"}).status_code == 403
    assert mia.get(f"/points/transactions?child_id={leo}").get_json()["total"] == 0
    assert mia.get(f"/points/summary?child_id={leo}").get_json()["child"]["id"] == kid

    assert pat.get("/points/summary").status_code == 400  # a parent has to say which kid
    sam, _, _ = setup_family(api, email="sam@example.test")
    assert sam.get(f"/points/summary?child_id={kid}").status_code == 404  # not their family
    assert sam.post("/points/adjustments", json={"child_id": kid, "amount": 5, "reason": "x"}).status_code == 404
    assert sam.get("/points/transactions").get_json()["total"] == 0
