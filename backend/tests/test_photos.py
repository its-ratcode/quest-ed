"""Photo proof with "I did it": cleaned of location data, and only seen by the family."""
import io
import os
import struct
import zlib

from app.extensions import db
from app.models import TaskSubmission
from tests.test_approvals import PASSWORD, setup_family


def jpeg_with_location():
    exif = b"Exif\x00\x00" + b"GPS-LOCATION-SECRET" * 4
    app1 = b"\xff\xe1" + struct.pack(">H", len(exif) + 2) + exif
    table = b"\xff\xdb" + struct.pack(">H", 4) + b"\x00\x01"  # a tiny stand-in table
    return b"\xff\xd8" + app1 + table + b"\xff\xda\x00\x02" + b"image-bytes" + b"\xff\xd9"


def png_with_text():
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    header = struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"tEXt", b"Author\x00Mia's phone")
            + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00")) + chunk(b"IEND", b""))


def stored_path(app, submission_id):
    with app.app_context():
        name = db.session.get(TaskSubmission, submission_id).photo
    return os.path.join(app.config["UPLOAD_FOLDER"], name)


def test_photo_is_cleaned_and_only_the_family_sees_it(api, app):
    pat, mia, task = setup_family(api)
    res = mia.upload(f"/tasks/{task['id']}/submit",
                     {"note": "Look!", "photo": (io.BytesIO(jpeg_with_location()), "room.jpg")})
    assert res.status_code == 201, res.get_json()
    sub = res.get_json()["submission"]
    assert sub["has_photo"] is True and sub["note"] == "Look!"

    photo = pat.get(f"/tasks/submissions/{sub['id']}/photo")
    assert photo.status_code == 200 and photo.mimetype == "image/jpeg"
    assert b"GPS-LOCATION-SECRET" not in photo.data and b"image-bytes" in photo.data
    assert photo.headers["Cache-Control"] == "private, no-store"
    assert mia.get(f"/tasks/submissions/{sub['id']}/photo").status_code == 200

    sam, sams_kid, _ = setup_family(api, email="sam@example.test")
    assert sam.get(f"/tasks/submissions/{sub['id']}/photo").status_code == 404
    assert sams_kid.get(f"/tasks/submissions/{sub['id']}/photo").status_code == 404


def test_png_works_and_other_files_are_refused(api):
    pat, mia, task = setup_family(api)
    bad = mia.upload(f"/tasks/{task['id']}/submit", {"photo": (io.BytesIO(b"<svg>not a photo</svg>"), "x.jpg")})
    assert bad.status_code == 400 and "photo" in bad.get_json()["errors"]
    assert mia.get(f"/tasks/{task['id']}").get_json()["task"]["status"] == "open"  # nothing was sent

    png = mia.upload(f"/tasks/{task['id']}/submit", {"photo": (io.BytesIO(png_with_text()), "x.png")})
    assert png.status_code == 201
    data = pat.get(f"/tasks/submissions/{png.get_json()['submission']['id']}/photo").data
    assert b"Mia's phone" not in data and data.endswith(b"IEND\xaeB`\x82")


def test_too_big_and_without_a_photo(api, app):
    pat, mia, task = setup_family(api)
    huge = b"\xff\xd8" + b"\x00" * (app.config["MAX_CONTENT_LENGTH"] + 10)
    res = mia.upload(f"/tasks/{task['id']}/submit", {"photo": (io.BytesIO(huge), "big.jpg")})
    assert res.status_code == 413 and "photo" in res.get_json()["errors"]

    plain = mia.upload(f"/tasks/{task['id']}/submit", {"note": "No photo this time"}).get_json()["submission"]
    assert plain["has_photo"] is False and plain["note"] == "No photo this time"
    assert pat.get(f"/tasks/submissions/{plain['id']}/photo").status_code == 404


def test_removing_a_kid_deletes_their_photos(api, app):
    pat, mia, task = setup_family(api)
    sub = mia.upload(f"/tasks/{task['id']}/submit",
                     {"photo": (io.BytesIO(jpeg_with_location()), "room.jpg")}).get_json()["submission"]
    path = stored_path(app, sub["id"])
    assert os.path.exists(path)

    mia_id = mia.get("/auth/me").get_json()["user"]["id"]
    assert pat.delete(f"/family/children/{mia_id}", json={"password": PASSWORD}).status_code == 200
    assert not os.path.exists(path)
