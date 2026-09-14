/**
 * Auction backend - zero dependencies, Node's built-in http only.
 *
 *   node server.js          # then open http://localhost:3000
 *
 * Serves the operator UI, keeps an authoritative JSON database on disk, and
 * prints a running bid log to the console. After every sale it prints the
 * recomputed budget ledger for all six owners.
 *
 * The server is authoritative for money: it applies the price to the winning
 * owner itself rather than trusting a number sent by the browser.
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const PORT      = Number(process.env.PORT) || 3000;
const ROOT      = __dirname;
const DB_PATH   = path.join(ROOT, 'db.json');
const SEED_PATH = path.join(ROOT, 'db.seed.json');
const MAX_UNDO  = 50;

// ---------------------------------------------------------------- database

function loadSeed() {
  const seeded = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
  seeded.meta.seededAt = new Date().toISOString();
  return seeded;
}

// Write to a temp file then rename, so a crash mid-write cannot corrupt the db.
function saveDb(next) {
  const tmp = DB_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n');
  fs.renameSync(tmp, DB_PATH);
}

function loadDb() {
  if (!fs.existsSync(DB_PATH)) {
    const fresh = loadSeed();
    saveDb(fresh);
    console.log('  db.json not found - seeded a fresh one from db.seed.json');
    return fresh;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

let db = loadDb();
let undoStack = [];

function snapshot() {
  undoStack.push(structuredClone(db));
  if (undoStack.length > MAX_UNDO) undoStack.shift();
}

// ------------------------------------------------------------ money helpers

const FLOOR = () => db.meta.floor;

const fmt = n => {
  if (n < 0) n = 0;
  return n % 1000 === 0 ? (n / 1000) + 'k' : (n / 1000).toFixed(1) + 'k';
};

// Credits an owner must hold back to still afford a floor-price player in every
// tier they have not filled yet. Mirrors the rule the browser UI enforces.
function reserveFor(owner) {
  return [1, 2, 3, 4, 5]
    .filter(t => owner.roster[String(t)] === null)
    .reduce((sum, t) => sum + FLOOR()[String(t)], 0);
}

function ledger() {
  return Object.values(db.owners).map(o => {
    const reserve = reserveFor(o);
    return {
      name: o.name,
      spent: o.spent,
      budget: o.budget,
      reserve,
      spendable: Math.max(o.budget - reserve, 0),
      filled: [1, 2, 3, 4, 5].filter(t => o.roster[String(t)] !== null).length,
      roster: o.roster,
    };
  });
}

// ------------------------------------------------------------ console output

const C = {
  dim: s => '\x1b[90m' + s + '\x1b[0m',
  bold: s => '\x1b[1m' + s + '\x1b[0m',
};
const pad  = (s, n) => String(s).padEnd(n);
const lpad = (s, n) => String(s).padStart(n);
const stamp = () => new Date().toTimeString().slice(0, 8);

const TAG = {
  start:  '\x1b[36mSTART \x1b[0m',
  up:     '\x1b[36mUP    \x1b[0m',
  bid:    '\x1b[34mBID   \x1b[0m',
  pass:   '\x1b[90mPASS  \x1b[0m',
  sold:   '\x1b[32mSOLD  \x1b[0m',
  assign: '\x1b[32mASSIGN\x1b[0m',
  unsold: '\x1b[33mUNSOLD\x1b[0m',
  undo:   '\x1b[35mUNDO  \x1b[0m',
  reset:  '\x1b[31mRESET \x1b[0m',
  done:   '\x1b[32mDONE  \x1b[0m',
  warn:   '\x1b[31mREJECT\x1b[0m',
};

function logLine(type, text) {
  console.log(C.dim('[' + stamp() + ']') + ' ' + (TAG[type] || pad(type, 6)) + ' ' + text);
}

// Printed after every sale - the whole point of the exercise.
function printLedger(headline) {
  const rows = ledger();
  const rule = '-'.repeat(64);
  console.log('\n         ' + C.bold(headline));
  console.log('         ' + rule);
  console.log('         ' + C.dim(
    pad('OWNER', 10) + lpad('SPENT', 8) + lpad('BUDGET', 9) +
    lpad('RESERVE', 9) + lpad('SPENDABLE', 11) + lpad('SQUAD', 7)));
  for (const r of rows) {
    console.log('         ' + pad(r.name, 10) + lpad(fmt(r.spent), 8) +
      lpad(fmt(r.budget), 9) + lpad(fmt(r.reserve), 9) +
      lpad(fmt(r.spendable), 11) + lpad(r.filled + '/5', 7));
  }
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  console.log('         ' + rule);
  console.log('         ' + C.dim(db.sales.length + '/' + db.players.length +
    ' players sold - ' + fmt(totalSpent) + ' committed across the league') + '\n');
}

// ------------------------------------------------------------ event handling

function findPlayer(tier, name) {
  return db.players.find(p => p.tier === tier && p.name === name);
}

function record(ev) {
  const entry = Object.assign(
    { seq: db.events.length + 1, at: new Date().toISOString() }, ev);
  db.events.push(entry);
  return entry;
}

/**
 * Applies one operator action. Returns {ok, error?, entry?}.
 *
 * Mutating types snapshot the database first so `undo` can roll it back. A
 * rejected event must NOT leave its snapshot behind, or a later undo would pop
 * that no-op instead of the last real change - hence the pop on the failure
 * path below.
 */
function handleEvent(ev) {
  const type = ev && ev.type;

  if (type === 'undo') {
    if (undoStack.length === 0) return { ok: false, error: 'nothing to undo' };
    db = undoStack.pop();
    record({ type: 'undo', note: 'database rolled back one action' });
    saveDb(db);
    logLine('undo', 'reverted last action - database rolled back');
    return { ok: true };
  }

  if (type === 'reset') {
    snapshot();
    db = loadSeed();
    record({ type: 'reset', note: 'database reseeded' });
    saveDb(db);
    logLine('reset', 'auction reset - database reseeded from db.seed.json');
    return { ok: true };
  }

  snapshot();
  const result = applyEvent(ev, type);
  if (!result.ok) {
    undoStack.pop();          // discard the snapshot for an action that never happened
    return result;
  }
  saveDb(db);
  return result;
}

function applyEvent(ev, type) {
  let entry;

  switch (type) {
    case 'auction_start':
      entry = record({ type });
      logLine('start', 'auction started - Tier 1 order randomized');
      break;

    case 'player_up':
      entry = record({ type, player: ev.player, tier: ev.tier, rank: ev.rank });
      logLine('up', C.bold(ev.player) + ' (T' + ev.tier + ' #' + ev.rank + ') is up' +
        ' - floor ' + fmt(FLOOR()[String(ev.tier)]));
      break;

    case 'bid': {
      if (!db.owners[ev.owner]) return { ok: false, error: 'unknown owner ' + ev.owner };
      entry = record({ type, owner: ev.owner, amount: ev.amount, player: ev.player,
                       tier: ev.tier, via: ev.via || 'click' });
      logLine('bid', pad(ev.owner, 9) + lpad(fmt(ev.amount), 6) + '  on ' +
        ev.player + ' (T' + ev.tier + ')' +
        (ev.via && ev.via !== 'click' ? ' ' + C.dim('[' + ev.via + ']') : ''));
      break;
    }

    case 'pass':
      entry = record({ type, owner: ev.owner, player: ev.player, tier: ev.tier });
      logLine('pass', pad(ev.owner, 9) + lpad('-', 6) + '  on ' +
        ev.player + ' (T' + ev.tier + ')');
      break;

    case 'sold':
    case 'assigned': {
      const o = db.owners[ev.owner];
      const p = findPlayer(ev.tier, ev.player);
      if (!o) return { ok: false, error: 'unknown owner ' + ev.owner };
      if (!p) return { ok: false, error: 'unknown player ' + ev.player };
      if (p.sold) return { ok: false, error: p.name + ' is already sold' };
      if (o.roster[String(ev.tier)] !== null) {
        return { ok: false, error: o.name + ' already owns a T' + ev.tier + ' player' };
      }
      const price = Number(ev.price);
      if (!Number.isFinite(price) || price < 0) {
        return { ok: false, error: 'bad price ' + ev.price };
      }
      if (price > o.budget) {
        return { ok: false, error: o.name + ' cannot afford ' + fmt(price) };
      }

      // The server applies the money itself - browser figures are not trusted.
      o.budget -= price;
      o.spent  += price;
      o.roster[String(ev.tier)] = p.name;
      p.sold = true;
      p.soldTo = o.name;
      p.price = price;
      db.sales.push({ seq: db.sales.length + 1, player: p.name, tier: p.tier,
                      rank: p.rank, owner: o.name, price, at: new Date().toISOString() });

      entry = record({ type, owner: o.name, player: p.name, tier: p.tier, price });
      logLine(type === 'assigned' ? 'assign' : 'sold',
        C.bold(p.name) + ' (T' + p.tier + ') -> ' + C.bold(o.name) +
        ' for ' + C.bold(fmt(price)) +
        (type === 'assigned' ? ' ' + C.dim('[floor assignment]') : ''));
      printLedger('BUDGETS AFTER SALE #' + db.sales.length +
        ' - ' + p.name + ' to ' + o.name);
      break;
    }

    case 'unsold':
      entry = record({ type, player: ev.player, tier: ev.tier });
      logLine('unsold', ev.player + ' (T' + ev.tier + ') went unsold - back in the pool');
      break;

    case 'auction_complete':
      entry = record({ type });
      logLine('done', 'all ' + db.players.length + ' players sold - auction complete');
      printLedger('FINAL BUDGETS');
      break;

    default:
      return { ok: false, error: 'unknown event type ' + type };
  }

  return { ok: true, entry };
}

// ------------------------------------------------------------ http plumbing

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json',
  '.js':   'text/javascript',
  '.css':  'text/css',
};

function send(res, code, body, type) {
  type = type || 'application/json';
  const payload = type.indexOf('application/json') === 0 ? JSON.stringify(body) : body;
  res.writeHead(code, {
    'Content-Type': type,
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => {
      raw += c;
      if (raw.length > 1e6) { reject(new Error('body too large')); req.destroy(); }
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(new Error('invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  const route = url.pathname;

  if (req.method === 'OPTIONS') return send(res, 204, {});

  // --- API ---
  if (route === '/api/state') return send(res, 200, db);

  if (route === '/api/ledger') {
    return send(res, 200, { ledger: ledger(), sales: db.sales.length });
  }

  if (route === '/api/log') {
    const limit = Number(url.searchParams.get('limit')) || 100;
    return send(res, 200, { total: db.events.length, events: db.events.slice(-limit) });
  }

  if (route === '/api/event' && req.method === 'POST') {
    let ev;
    try { ev = await readBody(req); }
    catch (e) { return send(res, 400, { ok: false, error: e.message }); }
    const result = handleEvent(ev);
    if (!result.ok) logLine('warn', (ev && ev.type) + ': ' + result.error);
    return send(res, result.ok ? 200 : 409, result);
  }

  if (route === '/api/reset' && req.method === 'POST') {
    return send(res, 200, handleEvent({ type: 'reset' }));
  }

  // --- static files (index.html and friends, path-traversal guarded) ---
  const rel  = route === '/' ? 'index.html' : decodeURIComponent(route.slice(1));
  const file = path.join(ROOT, rel);
  if (file.indexOf(ROOT) !== 0 || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, { error: 'not found' });
  }
  send(res, 200, fs.readFileSync(file), MIME[path.extname(file)] || 'text/plain');
});

server.listen(PORT, () => {
  console.log('\n  ' + C.bold('Auction backend'));
  console.log('  UI      http://localhost:' + PORT);
  console.log('  API     /api/state - /api/ledger - /api/log - POST /api/event');
  console.log('  DB      ' + path.basename(DB_PATH) + ' (seed: ' + path.basename(SEED_PATH) + ')');
  console.log('  Loaded  ' + db.sales.length + ' sales, ' + db.events.length + ' events\n');
  printLedger('OPENING BUDGETS');
});
