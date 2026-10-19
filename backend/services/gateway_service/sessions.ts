import { createHash, createHmac } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { read_configuration } from '../../shared/configuration.ts';

type Session = { id: string; created_at: number; expires_at: number };
const filename = 'data/owner_sessions.json';
const version = createHmac('sha256', read_configuration('SESSION_SECRET'))
  .update(read_configuration('OWNER_PASSWORD'))
  .digest('hex');
let sessions: Session[] = [];
if (existsSync(filename)) {
  const saved = JSON.parse(readFileSync(filename, 'utf8'));
  if (saved.version === version && Array.isArray(saved.sessions))
    sessions = saved.sessions.filter((session: Session) => session.expires_at > Date.now());
}
function hash_nonce(nonce: string) {
  return createHash('sha256').update(nonce).digest('hex');
}
function save_sessions() {
  mkdirSync('data', { recursive: true });
  writeFileSync(filename + '.tmp', JSON.stringify({ version, sessions }), { mode: 0o600 });
  renameSync(filename + '.tmp', filename);
}
export function create_session(nonce: string, expiration: number) {
  sessions = sessions.filter((session) => session.expires_at > Date.now());
  sessions.push({ id: hash_nonce(nonce), created_at: Date.now(), expires_at: expiration });
  save_sessions();
}
export function verify_nonce(nonce: string) {
  return sessions.some((session) => session.id === hash_nonce(nonce) && session.expires_at > Date.now());
}
export function revoke_session(nonce: string) {
  sessions = sessions.filter((session) => session.id !== hash_nonce(nonce));
  save_sessions();
}
export function revoke_other_sessions(nonce: string) {
  sessions = sessions.filter((session) => session.id === hash_nonce(nonce));
  save_sessions();
}
export function list_sessions() {
  return sessions
    .filter((session) => session.expires_at > Date.now())
    .map(({ created_at, expires_at }) => ({ created_at, expires_at }));
}
