## Coding philosophy
Fail-fast, YAGNI, single-source-of-truth. One clean, authoritative implementation beats defensive compatibility code — a loud runtime failure is better than silently masking a wrong assumption.

## Coding Rules
* **One code path per responsibility.** No duplicate, legacy, fallback, or shim implementations.
* **Fail fast on programmer errors.** Never catch, suppress, or default around bugs or invalid internal state.
* **Assume required objects exist.** Don't add speculative null-checks for things the architecture guarantees.
* **Remove completely.** Deleting a feature means deleting all of it — no toggles, dead code, or path back to resurrecting it.
* **Refactor completely.** When responsibility moves to a new module, everything related moves with it — no leftover wrappers in the old one.
* **No unrequested functionality.** No speculative features, config knobs, or compatibility layers.

## Error Handling
* **Boundary failures get reported to the requester.** Bad client input, a subprocess that won't spawn, etc. are the outside world being the outside world, not bugs — catch them at the point of contact and return a clear, diagnostic error. This is what keeps `aibridge` a transparent relay instead of a black box that silently dies.
* **Programmer errors are never caught locally.** They propagate to the single handler in `index.js`, which logs to `lastErr.log` and exits.
