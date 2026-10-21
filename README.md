# aibridge

Local HTTP relay between the `aichat` Obsidian plugin and the Claude Code
CLI, running in Termux on Android. Dumb pipe — no parsing of Claude output,
just process spawn + verbatim relay. See `aibridge-design.md` for full spec.

## Architecture (one line each)

- `aichat` (Obsidian plugin, JS) → HTTP → `aibridge` (this repo, Node) →
  spawns `claude` CLI per turn → Anthropic API.
- Port `16161`, `127.0.0.1` only, no auth (MVP).
- Fresh `claude` subprocess per turn, `--resume <session_id>` for
  continuity. Session registry = in-memory `Map`.
- stdout/stderr relayed verbatim as JSONL envelopes over chunked HTTP.

## Dev environment setup

1. **F-Droid** — install from f-droid.org (not Play Store; Termux there is
   outdated/abandoned).
2. **Termux** — install via F-Droid.
3. Update packages:
   ```
   pkg update && pkg upgrade
   ```
4. Set a Termux mirror
```bash
termux-change-repo
```
1. Storage access (for sdcard project files):
   ```
   termux-setup-storage
   ```
2. **Node.js**:
   ```
   pkg install nodejs
   node --version
   ```
3. **git**:
   ```
   pkg install git
   ```
4. **Claude Code CLI** — follow official install instructions next
   (`claude.ai/code`). Then verify:
   ```
   claude --version
   claude "hello"
   ```
5. Init this repo, with `.git` storage split onto Termux's native
   filesystem — `/storage/emulated/0` is a FUSE mount and git's own
   internals (locks, refs) don't reliably work there:
   ```
   cd ~/storage/shared/aibridge   # or wherever
   git init --separate-git-dir=~/git-repos/aibridge.git
   git config --global --add safe.directory "$(pwd)"
   ```
6. Git credentials, scoped per-repo (needed since a single Android user
   account may push to several repos with different tokens):
   ```
   git config --global credential.helper store
   git config --global credential.useHttpPath true
   ```
   Generate a token per repo at github.com → Settings → Developer
   settings → Personal access tokens, then add one line per repo to
   `~/.git-credentials` (created if missing), **including the repo path**
   — without `useHttpPath` + path-scoped lines, git matches credentials
   by host only and will use the same token for every GitHub repo:
   ```
   https://<user>:<token>@github.com/<user>/<repo>.git
   ```
7. Run:
   ```
   npm start        # plain run
   npm run dev      # nodemon, auto-restart on change
   ```
   `nodemon` must be installed **globally** (`npm install -g nodemon`) —
   a local install fails because `/storage/emulated/0` is a FUSE mount
   that doesn't support the symlinks `npm` needs for `node_modules/.bin`.
   After installing, fix its shebang for Termux:
   ```
   termux-fix-shebang "$(npm root -g)/nodemon/bin/nodemon.js"
   ```
   (npm's default `#!/usr/bin/env node` shebang doesn't match Termux's
   `env` path — redo this after any global npm package reinstall/upgrade.)
