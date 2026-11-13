"""Development server: python run.py  (or: flask --app run run)."""
import os

import pure_sqlalchemy  # noqa: F401  must come before anything that imports SQLAlchemy
from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5050)),
            debug=app.config["APP_ENV"] == "development")
