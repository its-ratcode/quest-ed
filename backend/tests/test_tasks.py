PASSWORD = "parent-pass-123"


def family(api, email="pat@example.test"):
    """A parent with two kids, Mia and Leo. Returns (parent, mia_id, leo_id)."""
    pat = api()
    pat.post("/auth/register", json={"display_name": "Pat", "email": email, "password": PASSWORD,
                                     "family_name": "The Testers"})
    prefix = email.split("@")[0]
    ids = [pat.post("/family/children", json={"display_name": name, "username": f"{prefix}-{name.lower()}",
                                              "password": "kidpass1"}).get_json()["child"]["id"]
           for name in ("Mia", "Leo")]
    return pat, *ids


def kid(api, username):
    browser = api()
    browser.post("/auth/login", json={"identifier": username, "password": "kidpass1"})
    return browser


def test_give_a_task_to_one_kid(api):
    pat, mia_id, _ = family(api)
    res = pat.post("/tasks", json={"title": "Tidy your room", "points": 10, "assigned_to_id": mia_id,
                                   "due_date": "2026-12-01", "description": "Bed made too"})
    assert res.status_code == 201
    task = res.get_json()["task"]
    assert task == {**task, "title": "Tidy your room", "points": 10, "status": "open", "category": "chores",
                    "due_date": "2026-12-01"}  # no category given: the family's first one
    assert task["assigned_to"]["display_name"] == "Mia" and task["created_by"]["display_name"] == "Pat"


def test_give_the_same_task_to_several_kids(api):
    pat, mia_id, leo_id = family(api)
    res = pat.post("/tasks", json={"title": "Feed the cat", "points": 5, "category": "kindness",
                                   "assigned_to_ids": [mia_id, leo_id, mia_id]})  # Mia twice: one copy each
    tasks = res.get_json()["tasks"]
    assert res.status_code == 201 and len(tasks) == 2
    assert {t["assigned_to"]["display_name"] for t in tasks} == {"Mia", "Leo"}
    assert len({t["id"] for t in tasks}) == 2


def test_new_tasks_are_checked(api):
    pat, mia_id, _ = family(api)
    res = pat.post("/tasks", json={"title": "", "points": 0, "category": "nope", "due_date": "soon"})
    assert res.status_code == 400
    assert set(res.get_json()["errors"]) == {"title", "points", "category", "due_date", "assigned_to_id"}
    assert pat.post("/tasks", json={"title": "X", "points": 1001, "assigned_to_id": mia_id}).status_code == 400
    assert pat.post("/tasks", json={"title": "X", "points": 1, "assigned_to_ids": []}).status_code == 400


def test_kids_see_only_their_own_tasks_and_cant_create(api):
    pat, mia_id, leo_id = family(api)
    pat.post("/tasks", json={"title": "Mia's job", "points": 5, "assigned_to_id": mia_id})
    leos = pat.post("/tasks", json={"title": "Leo's job", "points": 5, "assigned_to_id": leo_id}).get_json()["task"]
    mia = kid(api, "pat-mia")
    assert [t["title"] for t in mia.get("/tasks").get_json()["items"]] == ["Mia's job"]
    assert mia.get(f"/tasks/{leos['id']}").status_code == 404
    assert mia.post("/tasks", json={"title": "Easy points", "points": 1000, "assigned_to_id": mia_id}).status_code == 403
    assert len(pat.get("/tasks").get_json()["items"]) == 2


def test_list_filters_search_and_pages(api):
    pat, mia_id, leo_id = family(api)
    for i in range(25):
        pat.post("/tasks", json={"title": f"Read chapter {i}", "points": 1, "assigned_to_id": mia_id})
    pat.post("/tasks", json={"title": "Walk the dog", "points": 3, "assigned_to_id": leo_id})

    page = pat.get("/tasks?page=2&per_page=10").get_json()
    assert page["total"] == 26 and page["page"] == 2 and len(page["items"]) == 10
    assert pat.get(f"/tasks?child_id={leo_id}").get_json()["items"][0]["title"] == "Walk the dog"
    assert [t["title"] for t in pat.get("/tasks?q=DOG").get_json()["items"]] == ["Walk the dog"]
    assert pat.get("/tasks?q=%25").get_json()["items"] == []  # "%" is matched as itself
    assert pat.get("/tasks?status=done").status_code == 400


def test_edit_and_archive(api):
    pat, mia_id, leo_id = family(api)
    task = pat.post("/tasks", json={"title": "Dishes", "points": 5, "assigned_to_id": mia_id}).get_json()["task"]
    res = pat.patch(f"/tasks/{task['id']}", json={"title": "Dishes after dinner", "points": 8,
                                                  "assigned_to_id": leo_id, "due_date": None})
    assert res.status_code == 200
    assert res.get_json()["task"] == {**res.get_json()["task"], "title": "Dishes after dinner", "points": 8,
                                      "due_date": None}
    assert res.get_json()["task"]["assigned_to"]["display_name"] == "Leo"

    assert pat.delete(f"/tasks/{task['id']}").get_json()["task"]["status"] == "archived"
    assert pat.get("/tasks").get_json()["items"] == []  # "active" leaves archived out
    assert len(pat.get("/tasks?status=archived").get_json()["items"]) == 1
    assert pat.patch(f"/tasks/{task['id']}", json={"title": "Again"}).status_code == 409


def test_categories_count_their_tasks(api):
    pat, mia_id, _ = family(api)
    pat.post("/tasks", json={"title": "Practise", "points": 5, "category": "learning", "assigned_to_id": mia_id})
    learning = next(c for c in pat.get("/categories").get_json()["items"] if c["key"] == "learning")
    assert learning["used"] == 1
    # A used category is hidden, not deleted, so the task keeps its name.
    assert pat.delete(f"/categories/{learning['id']}").get_json()["hidden"] is True


def test_removing_a_kid_removes_their_tasks(api):
    pat, mia_id, _ = family(api)
    pat.post("/tasks", json={"title": "Dishes", "points": 5, "assigned_to_id": mia_id})
    assert pat.delete(f"/family/children/{mia_id}", json={"password": PASSWORD}).status_code == 200
    assert pat.get("/tasks").get_json()["items"] == []


def test_other_families_cant_see_or_touch_your_tasks(api):
    pat, mia_id, _ = family(api)
    task = pat.post("/tasks", json={"title": "Dishes", "points": 5, "assigned_to_id": mia_id}).get_json()["task"]
    sam, *_ = family(api, email="sam@example.test")
    assert sam.get(f"/tasks/{task['id']}").status_code == 404
    assert sam.patch(f"/tasks/{task['id']}", json={"title": "Hacked"}).status_code == 404
    assert sam.delete(f"/tasks/{task['id']}").status_code == 404
    assert sam.post("/tasks", json={"title": "X", "points": 1, "assigned_to_id": mia_id}).status_code == 404
