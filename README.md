# Clean Links Plugin for Schrödinger

Pastes links without tracking parameters or redirect wrappers.

- Removes campaign and click identifiers (`utm_*`, `fbclid`, `gclid`, `si` on YouTube and Spotify, and many more)
- Unwraps redirect links from Google, Facebook, Outlook Safe Links, Slack and others to the address they point at
- Shortens Amazon product links to `/dp/<id>`
- Works on a single link or on every link inside a longer text

Only offered when it would change something. Nothing is fetched; all cleaning happens on your machine.

## Installation

Install from the Schrödinger Plugin Manager (Settings → Plugins → Browse).

To install manually or develop locally, symlink the plugin into your plugins directory:

```sh
ln -s "$(pwd)" ~/.schrodinger/plugins/clean-links
```

Requires Schrödinger 0.2 or later.

## License

MIT
