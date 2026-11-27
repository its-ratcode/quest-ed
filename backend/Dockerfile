# The Quest-Ed API on a production server. Built and started by compose.yaml at the root.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    # Linux has no Application Control blocking SQLAlchemy's fast compiled files.
    QUESTED_USE_COMPILED_SQLALCHEMY=1 \
    APP_ENV=production \
    # The database, task photos and the site's secrets live in /data, which compose keeps in
    # a volume. The secrets are made on the first start (unless SECRET_KEY and JWT_SECRET_KEY are set).
    DATABASE_URL=sqlite:////data/quest_ed.db \
    UPLOAD_FOLDER=/data/uploads \
    SECRETS_FILE=/data/secrets.json

WORKDIR /app

COPY requirements.txt requirements-docker.txt ./
RUN pip install -r requirements-docker.txt

COPY . .

# Run as a normal user that owns only /data.
RUN useradd --create-home --uid 10001 quested \
    && mkdir -p /data/uploads \
    && chown -R quested:quested /data
USER quested
VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health', timeout=4)"

# Bring the database up to date, then start the server. One process with several threads:
# the limits on wrong passwords are kept in memory, so they must all be in one process.
CMD ["sh", "-c", "flask --app run db upgrade && exec gunicorn --bind 0.0.0.0:8000 --workers 1 --threads 8 --access-logfile - run:app"]
