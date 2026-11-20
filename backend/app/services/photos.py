"""Photo proof for tasks: checking, cleaning and storing the files.

- Only JPEG and PNG, up to MAX_BYTES. The type comes from the file's own bytes,
  never its name.
- Location and camera details are removed before saving: JPEG APP1 (EXIF/XMP)
  segments and PNG eXIf/tEXt/iTXt/zTXt chunks are dropped. A photo from a kid's
  phone would otherwise carry the GPS position of the home.
- Files live in UPLOAD_FOLDER (default backend/instance/uploads) under random
  names, outside anything served directly. The API only sends them to the family.
"""
import os
import secrets
import struct

from flask import current_app

MAX_BYTES = 5 * 1024 * 1024
TOO_BIG = "The photo is too big. Use one under 5 MB."
_PNG_SIG = b"\x89PNG\r\n\x1a\n"
_PNG_DROP = {b"eXIf", b"tEXt", b"iTXt", b"zTXt"}
_HEX = set("0123456789abcdef")


class PhotoError(ValueError):
    """A photo we won't store. The message is shown to the kid."""


def upload_dir():
    path = current_app.config.get("UPLOAD_FOLDER") or os.path.join(current_app.instance_path, "uploads")
    os.makedirs(path, exist_ok=True)
    return path


def _clean_jpeg(data):
    out = bytearray(b"\xff\xd8")
    i = 2
    while i + 4 <= len(data):
        if data[i] != 0xFF:
            raise PhotoError("The photo file is damaged.")
        marker = data[i + 1]
        if marker == 0xDA:  # start of scan: the picture itself runs to the end
            out += data[i:]
            return bytes(out)
        length = struct.unpack(">H", data[i + 2:i + 4])[0]
        if marker != 0xE1:  # APP1 = EXIF / XMP (location, camera, owner)
            out += data[i:i + 2 + length]
        i += 2 + length
    raise PhotoError("The photo file is damaged.")


def _clean_png(data):
    out = bytearray(_PNG_SIG)
    i = len(_PNG_SIG)
    while i + 12 <= len(data):
        length = struct.unpack(">I", data[i:i + 4])[0]
        kind = data[i + 4:i + 8]
        if kind not in _PNG_DROP:
            out += data[i:i + 12 + length]
        i += 12 + length
        if kind == b"IEND":
            return bytes(out)
    raise PhotoError("The photo file is damaged.")


def save(file_storage):
    """Check, clean and store an uploaded photo. Returns its stored name."""
    data = file_storage.read(MAX_BYTES + 1)
    if not data:
        raise PhotoError("The photo is empty.")
    if len(data) > MAX_BYTES:
        raise PhotoError(TOO_BIG)
    if data.startswith(b"\xff\xd8"):
        clean, ext = _clean_jpeg(data), "jpg"
    elif data.startswith(_PNG_SIG):
        clean, ext = _clean_png(data), "png"
    else:
        raise PhotoError("Use a JPEG or PNG photo.")
    name = f"{secrets.token_hex(16)}.{ext}"
    with open(os.path.join(upload_dir(), name), "wb") as fh:
        fh.write(clean)
    return name


def path_for(name):
    """The file for a stored name, or None. Names are always our own random hex, so
    anything else (like "../") is refused."""
    base, _, ext = (name or "").partition(".")
    if len(base) != 32 or not set(base) <= _HEX or ext not in ("jpg", "png"):
        return None
    path = os.path.join(upload_dir(), name)
    return path if os.path.isfile(path) else None


def mimetype_for(name):
    return "image/png" if name.endswith(".png") else "image/jpeg"


def delete_files(names):
    """Remove stored photos. Call after the database change is committed."""
    for name in names or ():
        path = path_for(name)
        if path:
            try:
                os.remove(path)
            except OSError:
                pass
