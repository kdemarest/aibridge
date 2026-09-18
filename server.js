// HTTP server: routes a single POST /turn endpoint, relays claude output
// as chunked newline-delimited JSON envelopes.

const http = require('http');
const { getSession, upsertSession } = require('./sessions');
const { runTurn } = require('./claude-runner');

const HOST = '127.0.0.1';
const PORT = 16161;

function createServer() {
  return http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/turn') {
      res.writeHead(404).end();
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      let parsed;
      try {
        parsed = JSON.parse(body);
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ error: `invalid JSON body: ${err.message}` })
        );
        return;
      }

      const { sessionKey, prompt, cwd } = parsed;
      if (typeof sessionKey !== 'string' || sessionKey.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ error: '"sessionKey" is required and must be a non-empty string' })
        );
        return;
      }
      if (typeof prompt !== 'string' || prompt.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(
          JSON.stringify({ error: '"prompt" is required and must be a non-empty string' })
        );
        return;
      }

      const session = getSession(sessionKey);
      const resumeSessionId = session ? session.claudeSessionId : null;
      const effectiveCwd = cwd || (session ? session.cwd : process.cwd());

      let headersSent = false;
      function ensureHeaders() {
        if (headersSent) return;
        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson',
          'Transfer-Encoding': 'chunked',
        });
        headersSent = true;
      }

      runTurn({
        prompt,
        cwd: effectiveCwd,
        resumeSessionId,
        onLine: (envelope) => {
          ensureHeaders();
          res.write(JSON.stringify(envelope) + '\n');
        },
      }).then(({ sessionId }) => {
        upsertSession(sessionKey, {
          claudeSessionId: sessionId || resumeSessionId,
          cwd: effectiveCwd,
        });
        ensureHeaders();
        res.end();
      }).catch((err) => {
        const diagnostic = {
          error: 'failed to spawn claude subprocess',
          message: err.message,
          code: err.code,
          syscall: err.syscall,
          path: err.path,
          cwd: effectiveCwd,
        };
        if (!headersSent) {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(diagnostic));
        } else {
          res.write(JSON.stringify({ stream: 'error', ...diagnostic }) + '\n');
          res.end();
        }
      });
    });
  });
}

module.exports = { createServer, HOST, PORT };
