# valorant-fall-tournament

Manual auction operator for the **Celestian Fall Tournament** — 6 owners, 100k
credits each, 30 players across 5 tiers.

## First time here? Start with this

You need two free tools: **Git** (to download the code) and **Node.js** (to run
the backend). If you already have both, skip to [Running it](#running-it).

### 1. Install Git

<details>
<summary><b>Windows</b></summary>

Open PowerShell and run:

```powershell
winget install --id Git.Git
```

Or download the installer from <https://git-scm.com/download/win> and click
through it — every default option is fine.

**Close and reopen your terminal afterwards**, otherwise it will not find the
new `git` command yet.
</details>

<details>
<summary><b>macOS</b></summary>

```bash
xcode-select --install
```

That installs Git along with Apple's command line tools. If you use Homebrew,
`brew install git` works too.
</details>

<details>
<summary><b>Linux</b></summary>

```bash
sudo apt install git          # Debian / Ubuntu
sudo dnf install git          # Fedora
```
</details>

Check it worked — this should print a version number, not an error:

```bash
git --version
```

Then tell Git who you are (it stamps this on your commits, one time only):

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

### 2. Install Node.js

Download the **LTS** version from <https://nodejs.org> and install it, or on
Windows:

```powershell
winget install --id OpenJS.NodeJS.LTS
```

Reopen your terminal, then check:

```bash
node --version
```

Anything 18 or newer works.

### 3. Get the code

```bash
git clone https://github.com/sher1203/valorant-fall-tournament.git
cd valorant-fall-tournament
git checkout backend-including-spec-view
```

`git clone` downloads the project into a new folder in whatever directory you
are currently in. To come back to it in a future session, just `cd` into that
folder — you only clone once.

**That third line matters.** A fresh clone puts you on the `main` branch, which
only has the original single-file version — no `server.js`, so `node server.js`
would fail with *"Cannot find module"*. `backend-including-spec-view` is the
branch with the backend on it. Run `git branch --show-current` any time you want
to check where you are, and see [Branches](#branches) for what each one holds.

To pull down later changes:

```bash
git pull
```

There are no packages to install — the backend uses only what ships with Node.

## Running it

```bash
node server.js          # or: npm start
```

Then open <http://localhost:3000>. The bid log and the post-sale budget ledger
print to the terminal you started the server in.

`index.html` also still works opened straight off disk as a `file://` page — it
just runs fully offline with no backend logging.

## Layout

| File | What it is |
|---|---|
| `index.html` | The whole operator UI — self-contained, no build step |
| `server.js` | Zero-dependency Node backend (built-in `http` only) |
| `db.seed.json` | The dummy database: owners, players, floors, increments |
| `clear-db.js` | The only thing that wipes the database |
| `db.json` | Live database, created from the seed on first run (gitignored) |
| `backups/` | Timestamped copies made before each wipe (gitignored) |

## The auction resumes where it left off

Close the tab, refresh, crash the browser, restart the server, reboot the
machine — reopen <http://localhost:3000> and the draft is exactly as you left
it. The current player, the standing bid, who is leading, who has passed, the
queue order, the sold table and the log all come back:

> **Resumed the saved auction.** 3 of 30 players sold so far, last saved
> 14/09/2026, 17:32. Carry on where you left off — every action keeps saving.

The browser sends its full auction state with every action and the server keeps
the latest copy in `db.json`. That matters because the queue is shuffled in the
browser and exists nowhere else — without it, a reload could not put the draft
back in the same order.

Two things do **not** survive a reload:

- **Undo history.** Those snapshots belonged to the old page, so Undo starts
  greyed out after resuming. Everything already recorded is still intact.
- **A session that disagrees with the ledger.** If the saved screen and the
  database report different numbers of sales, the session is *not* restored —
  continuing from it would have the backend rejecting sales the screen thinks
  are legal. You get a red banner explaining the mismatch instead.

`db.json` survives everything except one explicit command. **Fresh Reset**
restarts the *on-screen* auction but leaves every recorded sale intact — a live
draft should never lose its record to a stray click.

On startup the server tells you which situation you are in:

```
  Loaded  7 sales, 41 events
  State   RESUMING THE SAVED AUCTION - saved 2026-09-14T21:32:44.886Z
          the browser will pick up where it left off
          run `node clear-db.js` to wipe it and start over
```

### Clearing it

```bash
node clear-db.js              # or: npm run clear-db
```

It prints what it is about to destroy, copies `db.json` into `backups/` with a
timestamp, and reseeds. Pass `--no-backup` to skip the copy.

Safe to run while the server is up — the server notices the file changed on disk
and reloads before its next write. Refresh the browser afterwards to clear the
banner.

## Driving the auction

Nothing sells automatically. You are the auctioneer: the screen tracks the
money and the rules, you decide when the hammer falls.

Per owner card:

| Control | What it does |
|---|---|
| **Bid** | Raises to the next legal amount — current bid plus the tier's increment |
| **Max** | Bids the most that owner can legally commit to this player, in one click |
| **Pass** | Drops them out of this player's bidding |
| **Jump** + box | Bids a specific amount, typed in thousands (`76` = 76,000) |

Across the top:

| Control | What it does |
|---|---|
| **Sell to Leader** | Awards the player at the current bid. Enabled only once someone leads |
| **Mark Unsold** | Returns the player to the pool for a later pass |
| **Assign to Remaining Owner** | Appears only when one eligible owner is left for a Tier 1 player; hands them the player at floor price |
| **Undo Last Action** | Steps back one action, in the browser *and* the database |
| **Fresh Reset** | Restarts the on-screen auction. Leaves the database alone |

### The Max button

**Max** bids the owner's *spendable* figure — their credits minus the reserve —
snapped down onto the tier's increment grid so it is always a legal amount. It
disables when even the next increment is out of reach, which is also what
happens to everyone else once someone has bid their true max: that bid cannot be
beaten, and the buttons say so.

It never touches the reserve, so a max bid can never cost an owner a later tier.

### Hidden budgets

Budgets are withheld from the screen so owners cannot count each other's money
mid-auction. That covers the owner-card figures, the Team Board's budget column
and the auction cap — *Live Max* and *Auction Cap* go too, because both are
computed from the budget and would give it straight back.

The rules still run on the real numbers; only the display changes. To put them
back, set the flag near the top of the script in `index.html`:

```js
const SHOW_BUDGETS = true;
```

The backend log is unaffected — the terminal always shows the full ledger.

## Auction rules encoded

- Every owner must end with **exactly one player per tier**, so owning a tier
  makes you ineligible to bid in it.
- **Floors / minimum increments:** T1 20k/2k · T2 10k/2k · T3 7k/2k ·
  T4 5k/1k · T5 2k/1k.
- An owner's **spendable** budget is their remaining credits minus a *reserve* —
  the floor price of every tier they still have to fill. That reserve is never
  bidable, so nobody can spend their way out of a complete roster.
- **Stage 1** auctions the six Tier 1 players alone; **Stage 2** shuffles the
  remaining 24 together. Unsold players return to the pool for a later pass.
- Final score per owner is `7 − rank` for each of their five players, out of 30.

## Backend

The browser mirrors every operator action to the server, which keeps the
authoritative ledger. It **applies the money itself** rather than trusting the
price in the request, and rejects anything illegal — selling a player twice,
giving an owner two players in one tier, or a price the owner cannot afford.

Console output is one line per action, plus a full budget table after every sale:

```
[16:58:43] BID    Vinnie      20k  on Rih#117 (T1) [increment]
[16:58:43] BID    Kazi        22k  on Rih#117 (T1) [increment]
[16:58:43] PASS   Zany          -  on Rih#117 (T1)
[16:58:43] BID    Vinnie      76k  on Rih#117 (T1) [max]
[16:58:43] SOLD   Rih#117 (T1) -> Vinnie for 76k

         BUDGETS AFTER SALE #1 - Rih#117 to Vinnie
         ----------------------------------------------------------------
         OWNER        SPENT   BUDGET  RESERVE  SPENDABLE  SQUAD
         Vinnie         76k      24k      24k         0k    1/5
         Sabid           0k     100k      44k        56k    0/5
         ...
```

### API

| Route | Purpose |
|---|---|
| `GET /api/state` | The entire database |
| `GET /api/status` | Whether the database is fresh or resumable, and what is already in it |
| `GET /api/session` | The saved auction state the browser resumes from |
| `GET /api/ledger` | Per-owner spent / budget / reserve / spendable / squad size |
| `GET /api/log?limit=n` | The recorded event log |
| `POST /api/event` | Record an action — `auction_start`, `player_up`, `bid`, `pass`, `sold`, `assigned`, `unsold`, `auction_complete`, `undo`, `reset` |
| `POST /api/reset` | Restart the on-screen auction — **does not clear the database** |

`undo` rolls the database back one action, matching the UI's Undo button.
Rejected events leave no trace, so an undo always targets the last real change.
There is no API route that wipes the database; only `clear-db.js` does that.

## Troubleshooting

**`Cannot find module ... server.js`** — you are on the `main` branch, which has
no backend. `git checkout backend-including-spec-view`.

**`EADDRINUSE: address already in use :::3000`** — a server is already running.
Close that terminal, or start this one on another port: `PORT=3001 node server.js`
(PowerShell: `$env:PORT=3001; node server.js`).

**The page loads but nothing appears in the terminal** — you opened `index.html`
off disk instead of through the server. Use <http://localhost:3000>.

**The red banner will not go away** — the database still has data. Run
`node clear-db.js`, then refresh the page. A *blue* banner is not a problem: it
means the auction resumed successfully.

**It resumed when I wanted a clean start** — that is the point, and
`node clear-db.js` is the way out. Fresh Reset restarts the screen but keeps the
record, so the next reload resumes from the reset state.

**Undo is greyed out after a refresh** — expected. Undo history lives in the
page, not the database, so it does not survive a reload.

**The backend rejected a sale** — the terminal prints the reason: the player is
already sold, the owner already holds that tier, or they cannot afford the
price. Usually it means the browser and database have drifted apart; clearing
the database and restarting both is the quickest fix.

## Branches

| Branch | Contents |
|---|---|
| `main` | Original single-file operator — the rollback point |
| `frontend/hide-budgets` | Budgets withheld from the UI, plus the **Max** bid button |
| `backend/auction-ledger` | The above, plus the backend and JSON database |
| `backend-including-spec-view` | Current work — everything above, plus database persistence, `clear-db.js` and the not-fresh warnings |

Check where you are with `git branch --show-current`.
