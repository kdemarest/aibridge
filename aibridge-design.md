# aibridge — Design Document

## Purpose

`aibridge` is a local relay service that connects an Obsidian mobile plugin
(`aichat`) to the Claude Code CLI (`claude`) running in Termux on Android.
It is intentionally "dumb": it does not interpret, transform, or repackage
any Claude Code output. All parsing of `stream-json` events, session-state
UI, and chat rendering happens in `aichat` (the Obsidian plugin, written
separately in JavaScript). `aibridge`'s only job is process management and
verbatim relay.

## Environment

- Runs inside Termux on Android.
- Node.js is already required on this device because the `claude` CLI
  itself is a Node/npm package — `aibridge` should also be Node, so there
  is exactly one runtime dependency on the whole device, not two.
- No external npm packages required. Use only Node core modules:
  `http`, `child_process`, `crypto` (if needed later), etc.
- Target Node version: whatever ships current LTS in Termux's `nodejs`
  package (Node 20+ assumed fine).

## High-Level Architecture

```
Obsidian mobile (aichat plugin, JS)
        │  HTTP requests, localhost only
        ▼
aibridge (Node.js, this project)
        │  spawns per-turn subprocess
        ▼
claude CLI (Termux, Node-based binary)
        │  stream-json over stdout/stderr
        ▼
Anthropic API
```

Data flows verbatim in both directions through `aibridge`. It never parses
the *content* of a `stream-json` line — only enough of the outer JSON
envelope to detect the final `result` event and pull out the `session_id`
field, which it needs for its own session registry (see below). Everything
else is forwarded as opaque text lines.

## HTTP Server

- Built with Node's built-in `http` module. No Express, no other web
  framework or dependency.
- Binds to `127.0.0.1` only — never `0.0.0.0`. This service must not be
  reachable from other devices on the network, only from apps on the same
  Android device.
- Listens on port **16161**.
- No authentication / shared secret for this MVP. This is an accepted
  risk for v1, revisit later if needed (e.g. other apps on-device hitting
  localhost).

## Startup Behavior

On process start, before opening the HTTP listener:

1. Run `claude --version` as a child process.
2. If it fails to spawn or exits non-zero, log a clear fatal error to
   stdout/stderr and exit `aibridge` with a non-zero exit code. Do not
   start the HTTP server if `claude` is not available — fail fast and
   loud, since a silently-broken bridge is worse than a bridge that
   refuses to start.
3. If it succeeds, log the detected version and proceed to start the
   HTTP listener on port 16161.

## Session Model — Fresh Process Per Turn (Decision: Option B)

Two designs were considered for keeping conversational continuity across
turns:

- **(a) Long-lived subprocess**, feeding follow-up turns via
  `--input-format stream-json` on the same process's stdin.
  **Rejected** — the exact stdin message schema for this mode is not
  documented (see upstream Anthropic issue
  `anthropics/claude-code#24594`), making this fragile and effectively
  requiring reverse-engineering an undocumented protocol.
- **(b) Fresh subprocess per turn**, passing `--resume <session_id>`
  (captured from the previous turn's `result` event) so `claude` itself
  reloads the conversation state. **Chosen.** Uses only documented,
  stable CLI flags. Slightly higher per-turn process-spawn overhead,
  which is acceptable on this device for interactive chat use.

### Session Registry

Maintain an in-memory registry, e.g.:

```js
// key: some client-supplied session key (e.g. a UUID or conversation id
//      the aichat plugin generates per chat thread)
// value: { claudeSessionId: string|null, cwd: string, createdAt, lastUsedAt }
const sessions = new Map();
```

- The registry stores **only the last known Claude `session_id` string**
  per conversation key — not a process handle, since there is no
  long-lived process under design (b).
- On first turn of a new conversation, `claudeSessionId` is `null` — spawn
  `claude` without `--resume`.
- After each turn completes, parse the final `result` line just enough to
  extract `session_id` and update the registry entry for that
  conversation key.
- On subsequent turns for the same conversation key, spawn `claude` with
  `--resume <claudeSessionId>`.
- The registry is purely in-memory and does not need to persist across
  `aibridge` restarts for the MVP.

## Request Flow (per chat message)

1. `aichat` sends an HTTP request to `aibridge` with:
   - the user's prompt text
   - a conversation/session key
   - (optionally) a working directory / project path
2. `aibridge` looks up the session key in the registry to find any
   existing `claudeSessionId`.
3. `aibridge` spawns:
   ```
   claude -p "<prompt>" \
     --output-format stream-json \
     --verbose \
     [--resume <claudeSessionId>]   # only if one exists for this session key
   ```
   (Do **not** use `--input-format stream-json` under design (b) — the
   prompt is passed as a normal `-p` argument, not via stdin, since each
   turn is a fresh process.)
4. `aibridge` opens the HTTP response using **chunked transfer encoding**
   and begins relaying immediately — do not buffer and send at the end.
5. For each line the `claude` subprocess writes to **stdout**, `aibridge`
   forwards that line verbatim to the HTTP response as a chunk, as soon
   as it arrives.
6. In parallel, for each line written to **stderr**, `aibridge` forwards
   it too, but tagged/distinguished from stdout lines (see "Framing"
   below) so `aichat` can tell CLI errors apart from normal output.
7. `aibridge` inspects stdout lines only enough to detect a line with
   `"type":"result"`, parse the session_id out of it, and update the
   session registry entry. It still forwards this line verbatim as well
   — inspection is a side effect, not a transformation.
8. When the subprocess exits, `aibridge` forwards the exit code/signal as
   a final framed event, then ends the HTTP response.

## Framing Over HTTP

Since both stdout and stderr need to reach `aichat`, and `aichat` needs to
tell them apart (and detect end-of-process), wrap each forwarded line in a
minimal outer envelope rather than sending raw mixed text. Suggested
shape (one JSON object per line, newline-delimited — i.e. the transport
framing is JSONL even though `aibridge` treats the inner `claude` payload
as an opaque string):

```json
{"stream":"stdout","line":"<verbatim line from claude>"}
{"stream":"stderr","line":"<verbatim line from claude>"}
{"stream":"exit","code":0,"signal":null}
```

`aibridge` constructs these envelope objects itself, but the `"line"`
field value is always passed through untouched — `aibridge` must not
parse, reformat, or otherwise interpret the contents of that string
(except for the narrow `session_id` extraction in step 7 above, which
reads but does not alter it).

## Explicitly Out of Scope for aibridge

- No parsing of Claude Code's event types (`system`, `assistant`,
  `text_delta`, etc.) beyond the minimal `session_id` extraction needed
  for the session registry.
- No text accumulation, deduplication, or structured-output extraction.
- No authentication / shared-secret handling (deferred post-MVP).
- No persistence of the session registry across restarts.
- No support for `--input-format stream-json` / long-lived subprocess
  mode.

All of the above either live in `aichat` or are deferred to a later
version of `aibridge`.

## Suggested File Layout

```
aibridge/
  server.js       # http server, request routing
  claude-runner.js  # spawns claude, wires stdout/stderr forwarding
  sessions.js     # in-memory session registry (Map wrapper)
  index.js        # startup check (claude --version) + boot
```

Single-file is also acceptable given the small scope — split only if it
becomes unwieldy.
