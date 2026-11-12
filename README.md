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
