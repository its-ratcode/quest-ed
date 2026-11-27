# Contributing

Thanks for wanting to help. Quest-Ed is meant to stay small, private and kind to kids, so here's
how I decide what goes in.

## Before you build something

For anything bigger than a small fix, open an issue first and say what problem it solves for a
family. That saves you from building something that doesn't fit.

I'll take a feature when it:

1. helps many families, not just one household's setup;
2. is easy to keep working: small, tested, and no new outside services;
3. fits the app: simple, private, no ads or tracking, and no pressure on kids.

If it doesn't fit, that's fine. Keep it in your own fork, or propose it behind a site switch that's
off by default, so families who want it can turn it on.

## A few rules

- Every part of the screen has a job. No decoration that does nothing, and one place for each action.
- The server decides. Points, roles and permissions are checked in the API, never only in the browser.
- Kids' data stays private. Nothing new should collect more about a child than it needs, or send
  it anywhere.
- No AI features inside the app. The JSON export is there for families who want to use their own tools.
- Plain, friendly words. Kids read this too.

## Setting up

See "Working on the code" in the [README](README.md). Before you open a pull request, these must pass:

```bash
cd backend && python -m pytest
cd frontend && npm test && npm run lint && npm run build
```

Add tests for what you change, especially anything to do with points, permissions or deleting data.
If you change a model, include the migration.

## Signing off your commits

I use the [Developer Certificate of Origin](https://developercertificate.org/): a short statement
that you wrote the code (or have the right to submit it) and that it can be shared under the
project's license. Sign off each commit:

```bash
git commit -s -m "Explain what changed"
```

That adds `Signed-off-by: Your Name <you@example.com>` to the message.

## License

By contributing, you agree that your work is shared under the
[GNU Affero General Public License v3.0 or later](LICENSE), like the rest of the project.

## Security problems

Please don't open a public issue for those. See [SECURITY.md](SECURITY.md).
