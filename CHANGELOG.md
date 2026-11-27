# Changelog

All notable changes to Quest-Ed are listed here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-27

The first public release. It runs on one computer for now: using it from phones needs HTTPS in
front of it, which isn't set up yet.

### For families
- Parent accounts with email; kids' accounts with a username and password made by a parent, so
  kids don't need an email address. A second parent can join with an invite code.
- Tasks, once or as routines on chosen days. A missed routine drops off at the end of the day
  instead of piling up.
- "I did it" with an optional note and photo. Points are only added when a parent approves, and a
  parent can send a task back with a note.
- Points with a full history the kid can see. Parents can add or take points by hand, with a reason.
- A reward shop: parents set the rewards and prices, kids spend their points and can save for one,
  and parents mark each reward as handed over (or cancel it and refund the points).
- Badges (a starter set every family can change, plus their own), and streaks.
- A focus timer for kids, which the site admin can switch off.
- A family leaderboard, off until a parent turns it on.
- A page per kid with what they have to do, their badges and their last 30 days.
- Parents can open a kid's account to see what they see, and need their own password to switch back.
- Export a family's data as JSON, or delete a kid or the whole family, after the parent's password.

### For whoever runs the site
- First-run setup for the admin account, and `flask --app run create-admin` to add another admin
  or get back in.
- An admin area: accounts (switch off, set a parent's password), site switches, notices and an
  audit log.
- `docker compose up -d` runs it on <http://localhost:7373>, with the database, photos and secret
  keys kept in a volume and the keys made on the first start.
- Sample data for trying it out: `flask --app run seed-demo`.

### Privacy and safety
- Sessions in HttpOnly cookies with CSRF protection, and limits on password guessing.
- Every family's records are checked against the signed-in family.
- Photos lose their location and camera data before they're saved.
- No analytics, no tracking and no outside requests: the font is served by the app itself.

[0.1.0]: https://github.com/its-ratcode/quest-ed/releases/tag/v0.1.0
