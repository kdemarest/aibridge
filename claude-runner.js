// Spawns `claude` for a single turn and relays stdout/stderr lines verbatim.

const { spawn } = require('child_process');

function runTurn({ prompt, cwd, resumeSessionId, onLine }) {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--verbose'];
  if (resumeSessionId) {
    args.push('--resume', resumeSessionId);
  }

  const child = spawn('claude', args, { cwd });

  let sessionId = null;
  let stdoutBuf = '';
  let stderrBuf = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuf += chunk;
    let idx;
    while ((idx = stdoutBuf.indexOf('\n')) !== -1) {
      const line = stdoutBuf.slice(0, idx);
      stdoutBuf = stdoutBuf.slice(idx + 1);
      if (line.length === 0) continue;
      if (line.includes('"type":"result"')) {
        sessionId = JSON.parse(line).session_id;
      }
      onLine({ stream: 'stdout', line });
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrBuf += chunk;
    let idx;
    while ((idx = stderrBuf.indexOf('\n')) !== -1) {
      const line = stderrBuf.slice(0, idx);
      stderrBuf = stderrBuf.slice(idx + 1);
      if (line.length === 0) continue;
      onLine({ stream: 'stderr', line });
    }
  });

  return new Promise((resolve, reject) => {
    child.on('error', (err) => {
      reject(err);
    });
    child.on('exit', (code, signal) => {
      onLine({ stream: 'exit', code, signal });
      resolve({ sessionId });
    });
  });
}

module.exports = { runTurn };
