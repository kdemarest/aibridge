// Startup check (claude --version) + boot. Single error-handling point
// per CLAUDE.md: all uncaught errors land here and are logged to lastErr.log.

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createServer, HOST, PORT } = require('./server');

const ERR_LOG = path.join(__dirname, 'lastErr.log');

function logFatal(err) {
  const entry = `[${new Date().toISOString()}] ${err && err.stack ? err.stack : err}\n`;
  fs.appendFileSync(ERR_LOG, entry);
  console.error(entry);
}

process.on('uncaughtException', (err) => {
  logFatal(err);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  logFatal(err);
  process.exit(1);
});

const check = spawnSync('claude', ['--version'], { encoding: 'utf8' });
if (check.error || check.status !== 0) {
  console.error('FATAL: claude CLI is not available.');
  if (check.error) console.error(check.error.message);
  if (check.stderr) console.error(check.stderr);
  process.exit(1);
}
console.log(`claude CLI detected: ${check.stdout.trim()}`);

const server = createServer();
server.listen(PORT, HOST, () => {
  console.log(`aibridge listening on http://${HOST}:${PORT}`);
});
