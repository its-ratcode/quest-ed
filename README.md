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

## License

Quest-Ed is free software under the
[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-or-later).
You can use, change and share it; if you run a changed version for other people,
you share your changes too.

Official text: <https://www.gnu.org/licenses/agpl-3.0.txt>
