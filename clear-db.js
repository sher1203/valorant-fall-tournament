/**
 * clear-db.js - wipe the auction database and start over.
 *
 *   node clear-db.js            # back up db.json, then reseed it
 *   node clear-db.js --no-backup
 *
 * The database persists across sessions on purpose: stopping the server, or
 * hitting Fresh Reset in the browser, leaves every sale intact. This script is
 * the ONLY thing that clears it, so it can never happen by accident.
 *
 * Safe to run while the server is up - it notices the file changed on disk and
 * reloads before its next write.
 */

const fs   = require('fs');
const path = require('path');

const ROOT      = __dirname;
const DB_PATH   = path.join(ROOT, 'db.json');
const SEED_PATH = path.join(ROOT, 'db.seed.json');
const BACKUP_DIR = path.join(ROOT, 'backups');

const noBackup = process.argv.includes('--no-backup');

const fmt = n => (n < 0 ? 0 : n) % 1000 === 0
  ? (n / 1000) + 'k'
  : (n / 1000).toFixed(1) + 'k';

if (!fs.existsSync(SEED_PATH)) {
  console.error('  db.seed.json is missing - cannot reseed. Restore it from git:');
  console.error('    git checkout db.seed.json');
  process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
  console.log('\n  db.json does not exist - nothing to clear.');
  console.log('  The server will seed a fresh one the next time it starts.\n');
  process.exit(0);
}

// --- report what is about to be destroyed --------------------------------

let old;
try {
  old = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
} catch (e) {
  console.warn('\n  db.json is unreadable (' + e.message + ') - reseeding anyway.');
  old = null;
}

if (old) {
  const spent = Object.values(old.owners).reduce((s, o) => s + o.spent, 0);
  console.log('\n  Clearing db.json');
  console.log('    ' + old.sales.length + '/' + old.players.length + ' players sold');
  console.log('    ' + old.events.length + ' events logged');
  console.log('    ' + fmt(spent) + ' committed across the league');
  if (old.sales.length) {
    const byOwner = {};
    for (const s of old.sales) byOwner[s.owner] = (byOwner[s.owner] || 0) + 1;
    console.log('    squads: ' + Object.entries(byOwner)
      .map(([o, n]) => o + ' ' + n).join(', '));
  }
}

// --- back it up, then reseed ---------------------------------------------

if (!noBackup && old) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const name = 'db-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json';
  const dest = path.join(BACKUP_DIR, name);
  fs.copyFileSync(DB_PATH, dest);
  console.log('\n  Backed up to backups/' + name);
}

const seed = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));
seed.meta.seededAt = new Date().toISOString();

const tmp = DB_PATH + '.tmp';
fs.writeFileSync(tmp, JSON.stringify(seed, null, 2) + '\n');
fs.renameSync(tmp, DB_PATH);

console.log('  Database cleared - ' + Object.keys(seed.owners).length + ' owners back to ' +
  fmt(seed.meta.startBudget) + ', ' + seed.players.length + ' players unsold.');
console.log('  Refresh the browser to clear the warning banner.\n');
