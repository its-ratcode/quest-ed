# Quest-Ed

A modern platform where parents create achievement systems, and children learn
responsibility through gamified tasks and rewards.

> **Status:** early development. Not ready to use yet.

## Development

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
