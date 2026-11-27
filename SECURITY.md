# Security

Quest-Ed stores information about children, so I treat security reports as the most urgent thing.

## Reporting a problem

Please don't open a public issue. Use GitHub's private reporting instead: the repository's
**Security** tab, then **Report a vulnerability**.

Tell me what you found, how to reproduce it, and what someone could do with it. I'll reply as soon
as I can, keep you posted, and credit you in the fix unless you'd rather not be named.

## What counts

- Getting into another family's data: tasks, points, photos or exports.
- A kid getting a parent's powers, or a parent getting the admin's.
- Changing points or balances in a way the rules don't allow.
- Getting around the limits on password guessing.
- Photos leaking their location or other hidden data.

## What the app does today

- Sessions live in HttpOnly cookies, with CSRF protection, and signing out ends the session on the server.
- Every family's records are checked against the signed-in person's family. Anyone else gets "not found".
- Wrong passwords are limited to 5 per account in 15 minutes, and to 30 from one address. That
  covers signing in, switching back from a kid's account, and confirming a delete. The counts are
  kept in memory, so the server runs as one process.
- Task photos: JPEG or PNG only, at most 5 MB, with location and camera details removed. They're
  stored under random names outside the web root and only sent to the same family.
- Deleting a kid or a family removes their data and photos for good, after the parent's password.
- No analytics and no tracking. The one outside request is the font, which the web app loads from
  Google Fonts.

## If you host it yourself

- Run it with `APP_ENV=production`. The Docker setup does this, and makes long random secret keys
  on the first start. Without Docker, set `SECRET_KEY` and `JWT_SECRET_KEY` yourself.
- Anything other than `localhost` needs HTTPS, with the web app and the API on the same address.
- Create the admin account on the first-run page before anyone else can reach the site.
- Back up the database and the photos, and keep the backups private (with Docker, they also hold the keys).
- Keep Python, npm packages and the Docker images up to date.
