# Quest-Ed

A modern platform where parents create achievement systems, and children learn
responsibility through gamified tasks and rewards.

> **Status:** early development. Not ready to use yet.

## Try it with Docker

You need Docker with Compose (Docker Desktop, or Docker Engine with the compose plugin).
This runs the API on a production server and the built web app, together on one address.

1. Get the code and start it. The first time builds the images, which takes a few minutes:

   ```bash
   git clone https://github.com/its-ratcode/quest-ed.git
   cd quest-ed
   docker compose up -d
   ```

2. Open <http://localhost:7373>. A new site first asks you to create the administrator account.

That's all: nothing needs setting up first. The database, task photos and the site's secret keys
are kept in the `quest-ed-data` volume (the keys are made on the first start), and the database is
brought up to date every time the API starts. If port 7373 is already taken on your computer, copy
`.env.example` to `.env` and pick another one there.

```bash
docker compose logs -f                     # watch what it's doing
docker compose down                        # stop it (your data stays)
git pull && docker compose up --build -d   # update to the latest version
docker compose cp api:/data ./quest-ed-backup   # copy the database, photos and keys out, as a backup
```

`docker compose down -v` also deletes the volume, so **everything in it is gone**. A backup holds
the site's secret keys, so keep it somewhere only you can open.

To look around with something in it, add the sample Rivera family (see Development below). Its
passwords are public, so only do this on a copy you're trying out:

```bash
docker compose exec -e APP_ENV=development api flask --app run seed-demo
```

**Only this computer can open it.** Sign-ins use secure cookies, which browsers accept on
`localhost` but otherwise only over HTTPS. To use it from phones or other computers, it needs a
web address with HTTPS in front of it. That isn't set up here yet.

## Development

To change the code, run the API and the web app directly (no Docker needed).

The API is a Flask app in `backend/` (Python 3.11 or newer).

```bash
cd backend
pip install -r requirements-dev.txt   # once
python -m pytest                      # run the tests
python run.py                         # API on http://127.0.0.1:5050
```

Check it's up: <http://127.0.0.1:5050/api/v1/health>. API docs: <http://127.0.0.1:5050/api/v1/docs>.

The database is SQLite (`backend/instance/quest_ed.db`), built and updated by migrations:

```bash
flask --app run db upgrade                     # create or update the database
flask --app run db migrate -m "what changed"   # after changing a model: write a new migration
flask --app run db check                       # are the models and migrations in sync?
```

To try the app with something in it, add the sample Rivera family (two parents, three kids, two
weeks of tasks, points, rewards and badges) and a sample admin. Their sign-ins are at the top of
`backend/app/services/sample_data.py`. Other families are never touched, and it refuses to run in production.

```bash
flask --app run seed-demo           # add the sample family
flask --app run seed-demo --reset   # delete it and build it again
```

On Windows machines whose Application Control blocks SQLAlchemy's compiled files,
`backend/pure_sqlalchemy.py` makes SQLAlchemy use its plain-Python copies instead
(set `QUESTED_USE_COMPILED_SQLALCHEMY=1` to turn that off).

The web app is React + Vite in `frontend/` (Node 24 LTS recommended; 22.22 or newer works). Start the API first;
the web app forwards `/api` calls to it.

```bash
cd frontend
npm install        # once, and after package.json changes
npm test           # run the tests
npm run lint       # check the code style
npm run dev        # web app on http://127.0.0.1:5173
```

## License

Quest-Ed is free software under the
[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-or-later).
You can use, change and share it; if you run a changed version for other people,
you share your changes too.

Official text: <https://www.gnu.org/licenses/agpl-3.0.txt>
