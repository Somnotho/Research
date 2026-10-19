import { createServer } from 'node:https';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';

if (process.env.PROVIDER_FIXTURE_CHILD === 'true') {
  const { request_analysis } = await import('../backend/services/agent_service/model_provider.ts');
  const { generate_image } = await import('../backend/services/visual_service/image_provider.ts');
  for (const role of ['planner', 'science', 'commercial', 'analytics', 'reviewer', 'director']) {
    const result = await request_analysis(
      role,
      'Provider contract fixture; not AI research',
      'Test evidence',
      { max_output_tokens: 500 },
    );
    assert.match(result.text, /MOCK PROVIDER/);
    assert.equal(result.usage?.completion_tokens, 8);
  }
  assert.ok((await generate_image('Fixture concept illustration')).length > 20);
} else {
  const directory = 'data/provider_fixture';
  mkdirSync(directory, { recursive: true });
  const certificate = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      `${directory}/key.pem`,
      '-out',
      `${directory}/cert.pem`,
      '-days',
      '1',
      '-subj',
      '/CN=localhost',
      '-addext',
      'subjectAltName=IP:127.0.0.1,DNS:localhost',
    ],
    { stdio: 'ignore' },
  );
  assert.equal(certificate.status, 0);
  const original_ca = process.env.NODE_EXTRA_CA_CERTS
    ? readFileSync(process.env.NODE_EXTRA_CA_CERTS, 'utf8')
    : '';
  writeFileSync(
    `${directory}/trusted_ca.pem`,
    original_ca + '\n' + readFileSync(`${directory}/cert.pem`, 'utf8'),
    { mode: 0o600 },
  );
  let chat_calls = 0;
  let image_calls = 0;
  const server = createServer(
    { key: readFileSync(`${directory}/key.pem`), cert: readFileSync(`${directory}/cert.pem`) },
    async (request, response) => {
      try {
        assert.equal(request.headers['api-key'], 'fixture-key-not-a-real-secret');
        let text = '';
        for await (const chunk of request) text += chunk.toString();
        const body = JSON.parse(text);
        assert.equal(body.model, 'fixture-deployment');
        response.setHeader('Content-Type', 'application/json');
        if (request.url === '/openai/v1/chat/completions') {
          chat_calls++;
          assert.ok(body.messages[1].content.includes('Test evidence'));
          response.end(
            JSON.stringify({
              choices: [{ message: { content: 'MOCK PROVIDER: test response, not AI analysis' } }],
              usage: { prompt_tokens: 12, completion_tokens: 8 },
            }),
          );
        } else if (request.url === '/openai/v1/images/generations') {
          image_calls++;
          response.end(
            JSON.stringify({
              data: [
                {
                  b64_json:
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==',
                },
              ],
            }),
          );
        } else {
          response.statusCode = 404;
          response.end('{}');
        }
      } catch (error) {
        response.statusCode = 500;
        response.end(JSON.stringify({ error: String(error) }));
      }
    },
  );
  await new Promise<void>((fulfill) => server.listen(4443, '127.0.0.1', fulfill));
  try {
    const environment = {
      ...process.env,
      PROVIDER_FIXTURE_CHILD: 'true',
      RESEARCH_MODEL_MODE: 'azure',
      AZURE_AI_ENDPOINT: 'https://127.0.0.1:4443/openai/v1',
      AZURE_IMAGE_ENDPOINT: 'https://127.0.0.1:4443/openai/v1/images/generations',
      AZURE_AI_MODEL: 'fixture-deployment',
      AZURE_IMAGE_MODEL: 'fixture-deployment',
      RESEARCH_AZURE_KEY: 'fixture-key-not-a-real-secret',
      NODE_EXTRA_CA_CERTS: resolve(`${directory}/trusted_ca.pem`),
    };
    for (const role of ['PLANNER', 'SCIENCE', 'COMMERCIAL', 'ANALYTICS', 'REVIEWER', 'DIRECTOR'])
      delete (environment as Record<string, string | undefined>)[`AZURE_${role}_MODEL`];
    const child = spawn('node_modules/.bin/tsx', ['tests/verify_model_http.ts'], {
      env: environment,
      stdio: 'inherit',
    });
    const code = await new Promise<number | null>((fulfill, reject) => {
      child.once('exit', fulfill);
      child.once('error', reject);
    });
    assert.equal(code, 0);
    assert.equal(chat_calls, 6);
    assert.equal(image_calls, 1);
    console.log(
      'PASS actual HTTPS chat and image provider contracts with a trusted local test certificate; TLS verification remained enabled. These are fixture responses, not live Azure validation.',
    );
  } finally {
    await new Promise<void>((fulfill) => server.close(() => fulfill()));
  }
}
