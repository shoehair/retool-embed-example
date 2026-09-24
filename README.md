# Retool embed example

A minimal host site that embeds a Retool app behind its own login, for testing
what your app looks and behaves like when embedded in someone else's page.

It is deliberately small: a login form, a page with one iframe, and one server
route that asks Retool for an embed URL.

## How it works

1. You sign in to *this* site. It stands in for your own product's login.
2. The server calls `POST /api/embed-url/external-user` on your Retool instance,
   using your access token, and gets back a single-use URL for that user.
3. The page drops that URL into an iframe.

The access token only ever exists on the server. The browser sees the minted URL
and nothing else — which is the point of the flow.

## Setup

Needs Node 18 or newer.

```bash
npm install
cp .env.example .env
```

Then open `.env` and fill in the four `INSERT_` values:

| Variable | Where to find it |
| --- | --- |
| `RETOOL_HOST` | Your Retool instance URL, no trailing slash |
| `RETOOL_PAT` | Settings → API tokens, with the `apps:embed` scope |
| `RETOOL_APP_UUID` | The id in your app's editor URL |
| `RETOOL_GROUP_IDS` | A non-admin group id — the admin group is ignored here |

The server refuses to start while any `INSERT_` value is still in place, and
tells you which ones are left.

```bash
npm start
```

Open http://localhost:4567 and sign in with the `AUTH_USERNAME` / `AUTH_PASSWORD`
from your `.env` (`demo` / `demo` unless you changed them). Your app should
appear in the frame.

## If the frame comes up empty

Embedding is gated in several places, and each one fails differently. In rough
order of how often they bite:

**The browser refuses to frame it.** The console says the URL "violates the
Content Security Policy directive: frame-ancestors". Your Retool org only lets
listed origins embed its apps — add `http://localhost:4567` under
Settings → Advanced → CSP, "Allows specified sites to embed your apps".

**`401 Unauthorized`** — the token is not valid for this instance. A token from
one instance will not work against another.

**`403 Page does not belong to organization`** — the app UUID belongs to a
different org than the token.

**`400 Embedding is not enabled...`** — the org has not opted in to embedding
yet. An admin needs to turn it on.

**The frame shows Retool's own login page.** The embed session cookie is not
reaching the app. This is normal when the app is served over plain `http` from
somewhere the browser treats as a different site, since the cookie needs
`SameSite=None`, which requires `Secure`, which requires https.

## Notes

This is a demo, not a template to ship. The login is a single hardcoded
credential, sessions live in memory, and there is no rate limiting. If you put
it anywhere reachable from the internet, anyone who finds it can mint embed
sessions against your org.
