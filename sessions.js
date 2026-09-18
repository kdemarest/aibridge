// In-memory session registry: conversation key -> last known claude session_id.

const sessions = new Map();

function getSession(key) {
  return sessions.get(key) || null;
}

function upsertSession(key, { claudeSessionId, cwd }) {
  const now = Date.now();
  const existing = sessions.get(key);
  sessions.set(key, {
    claudeSessionId,
    cwd,
    createdAt: existing ? existing.createdAt : now,
    lastUsedAt: now,
  });
}

module.exports = { getSession, upsertSession };
