# Quest-Ed

Quest-Ed is a small web app for chores, routines and rewards. Parents set tasks and decide what
they're worth. Kids tick them off, a parent approves, and the points go towards rewards the family
agreed on, like extra screen time or picking Friday's movie.

I made it to bring a little play into everyday family life, and to help build trust and good
relationships between family members along the way.

https://github.com/user-attachments/assets/d262f446-c3a4-4739-b884-8274442a86d5

## What it does

- Tasks and routines. One-off jobs, or routines that come back on the days you pick. A missed
  routine drops off at the end of the day instead of piling up.
- Approvals. Kids press "I did it", with a note or a photo if they want. Points are only added once
  a parent approves, and every change to a balance is in a history the kid can see.
- Rewards. Parents fill the shop and set the prices, kids spend their points, and parents mark
  each reward as handed over.
- Badges, streaks and a focus timer for the kids. A family leaderboard too, but it's off until a
  parent turns it on.
- A page per kid with their last 30 days. Parents can also open a kid's account to see what they
  see, and need their own password to switch back.
- Kids don't need an email address. Parents make their sign-ins.
- An admin area for whoever runs the site: accounts, site switches, notices and an audit log.

Your family's data stays on your own server. There are no ads and no tracking, photos lose their
location data before they're saved, and you can export or delete a family's data at any time.

## Try it

You need Docker with Compose.

```bash
git clone https://github.com/its-ratcode/quest-ed.git
cd quest-ed
docker compose up -d
```

Then open <http://localhost:7373>. The first build takes a few minutes. On a new site, the first
page asks you to create the admin account. There's nothing to set up before that: the database,
photos and the site's secret keys live in a Docker volume called `quest-ed-data`, and the keys are
made on the first start. If port 7373 is taken, copy `.env.example` to `.env` and pick another one.

```bash
docker compose logs -f                          # see what it's doing
docker compose down                             # stop it (your data stays)
git pull                                        # update: get the latest code,
docker compose up --build -d                    # then rebuild and restart
docker compose cp api:/data ./quest-ed-backup   # back up the database, photos and keys
docker compose exec api flask --app run create-admin   # add an admin, or get back in if you're locked out
```

`docker compose down -v` deletes the volume too, so everything in it is gone. A backup contains the
site's secret keys, so keep it somewhere private.

To look around with some data in it, add my sample family (the Riveras: two parents, three kids,
two weeks of history). Their passwords are public, so only do this on a copy you're trying out.
The sign-ins are at the top of `backend/app/services/sample_data.py`.

```bash
docker compose exec -e APP_ENV=development api flask --app run seed-demo
```

For now it only works on the computer it runs on. Sign-ins use secure cookies, which browsers only
accept on `localhost` or over HTTPS, so using it from phones needs HTTPS in front of it, and I
haven't set that up yet.

## Working on the code

You'll need Python 3.11 or newer and Node 24 (22.22 or newer works). Run the API and the web app
in two terminals.

The API, in `backend/` (Flask and SQLite):

```bash
cd backend
pip install -r requirements-dev.txt
flask --app run db upgrade   # create or update the database
flask --app run seed-demo    # optional: the sample family
python run.py                # http://127.0.0.1:5050
```

The web app, in `frontend/` (React and Vite). It passes `/api` calls on to the API:

```bash
cd frontend
npm install
npm run dev                  # http://127.0.0.1:5173
```

Tests and checks:

```bash
cd backend && python -m pytest
cd frontend && npm test && npm run lint
```

After changing a model, write a migration with `flask --app run db migrate -m "what changed"` and
check it with `flask --app run db check`. The API docs are at <http://127.0.0.1:5050/api/v1/docs>
while it runs in development.

If you're on Windows and Application Control blocks SQLAlchemy's compiled files, that's handled:
`backend/pure_sqlalchemy.py` makes it use its plain-Python copies instead.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first, and
report security problems privately as described in [SECURITY.md](SECURITY.md).

## License

Quest-Ed is free software under the [GNU Affero General Public License v3.0 or later](LICENSE).
You can use it, change it and share it. If you run a changed version for other people, you share
your changes with them too.
