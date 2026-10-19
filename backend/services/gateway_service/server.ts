import '../../shared/configuration.ts';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import rate_limit from '@fastify/rate-limit';
import static_files from '@fastify/static';
import { createHmac, scryptSync, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { compare_secrets } from '../../shared/http.ts';
import { read_configuration, service_ports } from '../../shared/configuration.ts';
import {
  create_session,
  verify_nonce,
  revoke_session,
  revoke_other_sessions,
  list_sessions,
} from './sessions.ts';

const server = Fastify({
  logger: { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers.set-cookie'] },
  disableRequestLogging: true,
  bodyLimit: 22 * 1024 * 1024,
});
const session_secret = read_configuration('SESSION_SECRET');
const owner_password = read_configuration('OWNER_PASSWORD');
const password_salt = randomBytes(32);
const password_hash = scryptSync(owner_password, password_salt, 64).toString('hex');
const production = process.env.NODE_ENV === 'production';
if (owner_password.length < 14 || session_secret.length < 32)
  throw new Error('Owner password must be at least 14 characters; session secret at least 32.');
await server.register(cookie);
await server.register(rate_limit, { max: 200, timeWindow: '1 minute' });

function sign_session(payload: string) {
  return createHmac('sha256', session_secret).update(payload).digest('base64url');
}

function verify_session(value: string | undefined) {
  if (!value) return false;
  const [expiration, nonce, signature, ...remainder] = value.split('.');
  if (!expiration || !nonce || !signature || remainder.length) return false;
  return (
    Number(expiration) > Date.now() &&
    compare_secrets(signature, sign_session(`${expiration}.${nonce}`)) &&
    verify_nonce(nonce)
  );
}

server.addHook('onRequest', async (request, reply) => {
  const pathname = request.url.split('?')[0];
  const public_asset =
    request.method === 'GET' &&
    (['/', '/index.html', '/manifest.webmanifest', '/sw.js', '/icon.svg'].includes(pathname) ||
      /^\/assets\/[A-Za-z0-9_.-]+$/.test(pathname));
  if (public_asset) return;
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.headers.origin;
    const expected_origin = process.env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${service_ports.gateway}`;
    if (origin !== expected_origin)
      return reply.code(403).send({ error: 'Request origin does not match PUBLIC_ORIGIN' });
  }
  if (pathname === '/api/auth/login') return;
  if (!verify_session(request.cookies.research_session))
    return reply.code(401).send({ error: 'Owner login required' });
});
server.setErrorHandler((error, request, reply) => {
  if (error instanceof z.ZodError) return reply.code(400).send({ error: 'Invalid request' });
  request.log.error(
    { message: error instanceof Error ? error.message : 'Unknown error' },
    'Gateway request failed',
  );
  return reply.code((error as { statusCode?: number }).statusCode ?? 500).send({ error: 'Request failed' });
});
server.post(
  '/api/auth/login',
  { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
  async (request, reply) => {
    const input = z.object({ password: z.string().max(1000) }).parse(request.body);
    const candidate = scryptSync(input.password, password_salt, 64).toString('hex');
    if (!compare_secrets(candidate, password_hash))
      return reply.code(401).send({ error: 'Incorrect owner password' });
    const expiration = Date.now() + 8 * 60 * 60 * 1000;
    const nonce = randomBytes(24).toString('base64url');
    const payload = `${expiration}.${nonce}`;
    create_session(nonce, expiration);
    reply.setCookie('research_session', `${payload}.${sign_session(payload)}`, {
      path: '/',
      httpOnly: true,
      secure: production,
      sameSite: 'strict',
      maxAge: 8 * 60 * 60,
    });
    return { authenticated: true };
  },
);
server.post('/api/auth/logout', async (request, reply) => {
  revoke_session(request.cookies.research_session!.split('.')[1]);
  reply.clearCookie('research_session', { path: '/' });
  return { authenticated: false };
});
server.get('/api/auth/devices', async () => list_sessions());
server.post('/api/auth/revoke_others', async (request) => {
  revoke_other_sessions(request.cookies.research_session!.split('.')[1]);
  return { revoked: true };
});
server.get('/api/auth/session', async () => ({ authenticated: true }));

const upstream_services = [
  'workspace',
  'knowledge',
  'research',
  'analytics',
  'report',
  'visual',
  'scientific',
  'evidence',
  'execution',
] as const;
// Streaming upload bodies avoids JSON conversion and keeps gateway/service boundaries intact.
server.removeAllContentTypeParsers();
server.addContentTypeParser('*', { parseAs: 'buffer', bodyLimit: 22 * 1024 * 1024 }, (_, body, done) =>
  done(null, body),
);
// The login route needs JSON even though proxy routes forward raw request bodies.
server.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_, body, done) => done(null, body));
server.addHook('preValidation', async (request) => {
  if (request.url.split('?')[0] === '/api/auth/login' && Buffer.isBuffer(request.body)) {
    try {
      request.body = JSON.parse(request.body.toString());
    } catch {
      throw Object.assign(new Error('Invalid JSON'), { statusCode: 400 });
    }
  }
});
for (const service of upstream_services) {
  server.all(`/api/${service}/*`, async (request, reply) => {
    const prefix = `/api/${service}`;
    const path = request.url.slice(prefix.length);
    if (!path.startsWith('/') || path.startsWith('//'))
      return reply.code(400).send({ error: 'Invalid service path' });
    const base =
      process.env[`${service.toUpperCase()}_SERVICE_URL`] ?? `http://127.0.0.1:${service_ports[service]}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${read_configuration('INTERNAL_SERVICE_TOKEN')}`,
    };
    if (request.headers['content-type']) headers['Content-Type'] = request.headers['content-type'];
    const response = await fetch(base + path, {
      method: request.method,
      headers,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : new Uint8Array(request.body as Buffer),
      redirect: 'error',
      signal: AbortSignal.timeout(service === 'knowledge' || service === 'evidence' ? 120000 : 45000),
    });
    for (const header of ['content-type', 'content-disposition']) {
      const value = response.headers.get(header);
      if (value) reply.header(header, value);
    }
    return reply.code(response.status).send(Buffer.from(await response.arrayBuffer()));
  });
}
server.addHook('onSend', async (_, reply, payload) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'no-referrer');
  reply.header('Cache-Control', 'no-store');
  reply.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  return payload;
});
const frontend_root = resolve('frontend/dist');
if (existsSync(frontend_root)) {
  await server.register(static_files, { root: frontend_root });
  server.get('/', async (_, reply) => reply.sendFile('index.html'));
}
await server.listen({
  port: Number(process.env.PORT ?? service_ports.gateway),
  host: process.env.GATEWAY_HOST ?? '127.0.0.1',
});
