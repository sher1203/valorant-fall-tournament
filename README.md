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
| `db.json` | Live database, created from the seed on first run (gitignored) |

Delete `db.json` (or `npm run reset`) to start a fresh auction; it reseeds on
the next request.

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
| `GET /api/ledger` | Per-owner spent / budget / reserve / spendable / squad size |
| `GET /api/log?limit=n` | The recorded event log |
| `POST /api/event` | Record an action — `auction_start`, `player_up`, `bid`, `pass`, `sold`, `assigned`, `unsold`, `auction_complete`, `undo`, `reset` |
| `POST /api/reset` | Reseed the database |

`undo` rolls the database back one action, matching the UI's Undo button.
Rejected events leave no trace, so an undo always targets the last real change.

## Branches

- `main` — original single-file operator
- `frontend/hide-budgets` — budgets withheld from the UI, plus the **Max** bid button
- `backend/auction-ledger` — the above, plus the backend and JSON database
