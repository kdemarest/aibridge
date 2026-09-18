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
5. Clone/init this repo:
   ```
   cd ~/storage/shared/aibridge   # or wherever
   git init
   ```
6. Run:
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
