// Minimal host site for embedding a Retool app behind your own login.
//
// The shape it demonstrates: your backend authenticates the user however it already
// does, then asks Retool for a single-use embed URL on their behalf. The access token
// never reaches the browser — only the minted URL does.
const express = require('express');
const session = require('express-session');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

// Minimal .env loader, so the token stays out of the code and your shell history.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2];
  }
} catch {}

const PORT = process.env.PORT || 4567;

const REQUIRED_ENV = ['RETOOL_HOST', 'RETOOL_PAT', 'RETOOL_APP_UUID', 'RETOOL_GROUP_IDS', 'AUTH_USERNAME', 'AUTH_PASSWORD'];
const missing = REQUIRED_ENV.filter((k) => !process.env[k] || process.env[k].startsWith('INSERT_'));
if (missing.length) {
  console.error(`\nStill to fill in in .env: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and edit it, then start again.\n');
  process.exit(1);
}

const RETOOL = {
  host: process.env.RETOOL_HOST.replace(/\/$/, ''),
  pat: process.env.RETOOL_PAT,
  appUuid: process.env.RETOOL_APP_UUID,
  groupIds: (process.env.RETOOL_GROUP_IDS || '').split(',').filter(Boolean).map(Number),
};

const USER = {
  username: process.env.AUTH_USERNAME,
  password: process.env.AUTH_PASSWORD,
  email: process.env.AUTH_EMAIL || `${process.env.AUTH_USERNAME}@example.com`,
};

const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(
  session({
    // Regenerated each start, so restarting the server logs you out. Fine for a demo.
    secret: crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    cookie: { sameSite: 'lax', httpOnly: true },
  })
);

// Constant-time compare so a wrong password leaks nothing through response timing.
function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

function requireAuth(req, res, next) {
  if (req.session.user) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not logged in — reload the page and sign in again.' });
  }
  res.redirect('/login');
}

app.get('/', (req, res) => res.redirect(req.session.user ? '/embed' : '/login'));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!safeEqual(username, USER.username) || !safeEqual(password, USER.password)) {
    return res.redirect('/login?error=1');
  }
  req.session.user = { username: USER.username, email: USER.email };
  res.redirect('/embed');
});

app.post('/logout', (req, res) => req.session.destroy(() => res.redirect('/login')));

app.get('/embed', requireAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'embed.html')));
app.get('/api/me', requireAuth, (req, res) => res.json(req.session.user));

// Asks Retool for a single-use embed URL for the logged-in user. This is the only
// place the access token is used, and it stays on the server.
app.post('/api/retool-embed', requireAuth, async (req, res) => {
  const { username, email } = req.session.user;
  const body = {
    landingPageUuid: RETOOL.appUuid,
    groupIds: RETOOL.groupIds,
    // Identifies this person to Retool. Use your own stable user id in a real app.
    externalIdentifier: `embed-example|${username}`,
    userInfo: { firstName: username, lastName: 'Demo', email },
    metadata: { source: 'retool-embed-example' },
  };

  try {
    const resp = await fetch(`${RETOOL.host}/api/embed-url/external-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RETOOL.pat}` },
      body: JSON.stringify(body),
    });
    const text = await resp.text();
    if (!resp.ok) {
      console.error(`Retool embed API ${resp.status}:`, text);
      return res.status(resp.status).json({ error: `Retool returned ${resp.status}: ${text}` });
    }
    res.json(JSON.parse(text)); // { embedUrl }
  } catch (err) {
    console.error('Retool embed API request failed:', err);
    res.status(502).json({ error: `Request to ${RETOOL.host} failed: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`\nRetool embed example: http://localhost:${PORT}`);
  console.log(`Sign in as: ${USER.username}\n`);
});
