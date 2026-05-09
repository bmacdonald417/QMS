/**
 * Tests for inboundBridgeAuth.js — exercises the middleware against a
 * synthetic Express req/res so we don't have to spin up the real app.
 * Run:  node src/lib/inboundBridgeAuth.test.js
 */
import { createHmac } from 'node:crypto';
import { inboundBridgeAuth } from './inboundBridgeAuth.js';

function assert(cond, message) {
  if (!cond) throw new Error(`ASSERT FAIL: ${message}`);
}

const TOKEN = 'token-from-codex-side';
const SECRET = 'hmac-shared-secret';
process.env.TEST_TOKEN = TOKEN;
process.env.TEST_HMAC = SECRET;

const middleware = inboundBridgeAuth({ tokenEnv: 'TEST_TOKEN', hmacEnv: 'TEST_HMAC' });

function makeReq({ body = '{}', token = TOKEN, signature, signatureHeader = 'x-codex-signature' } = {}) {
  const buf = Buffer.from(body, 'utf8');
  const sig = signature ?? `sha256=${createHmac('sha256', SECRET).update(buf).digest('hex')}`;
  return {
    headers: {
      authorization: token ? `Bearer ${token}` : undefined,
      [signatureHeader]: sig,
    },
    body: buf,
  };
}

function makeRes(resolve) {
  const res = { _status: 200, _body: null, statusCalled: false, _resolved: false };
  res.status = (code) => {
    res._status = code;
    res.statusCalled = true;
    return res;
  };
  res.json = (body) => {
    res._body = body;
    if (!res._resolved && resolve) {
      res._resolved = true;
      resolve({ err: null });
    }
    return res;
  };
  return res;
}

function callMiddleware(req, res) {
  return new Promise((resolve) => {
    // Resolve on either next() or res.json() — the middleware uses one or the other.
    res._resolveFn = resolve;
    const origJson = res.json;
    res.json = (body) => {
      const r = origJson.call(res, body);
      if (!res._resolved) {
        res._resolved = true;
        resolve({ err: null });
      }
      return r;
    };
    middleware(req, res, (err) => {
      if (!res._resolved) {
        res._resolved = true;
        resolve({ err: err ?? null });
      }
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Happy path
// ─────────────────────────────────────────────────────────────────────────────

async function testHappyPath() {
  const req = makeReq({ body: '{"hello":"world"}' });
  const res = makeRes();
  await callMiddleware(req, res);
  assert(!res.statusCalled, `should call next(); got status ${res._status} body=${JSON.stringify(res._body)}`);
  assert(req.parsedJson?.hello === 'world', 'parsedJson populated');
  assert(req.bridgeActor?.type === 'BRIDGE', 'bridgeActor stamped');
  console.log('  happy path: OK');
}

// ─────────────────────────────────────────────────────────────────────────────
// Bearer
// ─────────────────────────────────────────────────────────────────────────────

async function testMissingBearer() {
  const req = makeReq({ token: null });
  const res = makeRes();
  await callMiddleware(req, res);
  assert(res._status === 401, `expected 401; got ${res._status}`);
  assert(res._body?.error === 'unauthorized_token', 'error code unauthorized_token');
  console.log('  missing Bearer: 401 unauthorized_token');
}

async function testWrongBearer() {
  const req = makeReq({ token: 'wrong' });
  const res = makeRes();
  await callMiddleware(req, res);
  assert(res._status === 401, `expected 401; got ${res._status}`);
  assert(res._body?.error === 'unauthorized_token', 'error code unauthorized_token');
  console.log('  wrong Bearer: 401 unauthorized_token');
}

// ─────────────────────────────────────────────────────────────────────────────
// HMAC
// ─────────────────────────────────────────────────────────────────────────────

async function testMissingSignature() {
  const req = makeReq();
  delete req.headers['x-codex-signature'];
  const res = makeRes();
  await callMiddleware(req, res);
  assert(res._status === 403, `expected 403; got ${res._status}`);
  assert(res._body?.error === 'invalid_signature', 'error code invalid_signature');
  console.log('  missing signature: 403 invalid_signature');
}

async function testWrongSignature() {
  const req = makeReq({ signature: 'sha256=' + 'f'.repeat(64) });
  const res = makeRes();
  await callMiddleware(req, res);
  assert(res._status === 403, `expected 403; got ${res._status}`);
  assert(res._body?.error === 'invalid_signature', 'error code invalid_signature');
  console.log('  wrong HMAC: 403 invalid_signature');
}

async function testMalformedSignaturePrefix() {
  const req = makeReq({ signature: 'md5=' + 'f'.repeat(32) });
  const res = makeRes();
  await callMiddleware(req, res);
  assert(res._status === 403, `expected 403; got ${res._status}`);
  console.log('  wrong sig prefix (md5=): 403 invalid_signature');
}

async function testHmacOverDifferentBytesFails() {
  // Compute HMAC over body A, then send body B. Catches the "re-stringify" bug.
  const sigForA = `sha256=${createHmac('sha256', SECRET).update(Buffer.from('{"a":1}', 'utf8')).digest('hex')}`;
  const req = makeReq({ body: '{"b":2}', signature: sigForA });
  const res = makeRes();
  await callMiddleware(req, res);
  assert(res._status === 403, `HMAC over different bytes must fail; got ${res._status}`);
  console.log('  HMAC over different bytes: 403 invalid_signature');
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON parse
// ─────────────────────────────────────────────────────────────────────────────

async function testNonJsonBody() {
  const req = makeReq({ body: 'not-json' });
  const res = makeRes();
  await callMiddleware(req, res);
  assert(res._status === 400, `expected 400; got ${res._status}`);
  assert(res._body?.error === 'invalid_payload', 'error code invalid_payload');
  console.log('  non-JSON body: 400 invalid_payload');
}

// ─────────────────────────────────────────────────────────────────────────────
// Misconfiguration
// ─────────────────────────────────────────────────────────────────────────────

async function testMissingEnvVars() {
  process.env.TEST_TOKEN = '';
  const req = makeReq();
  const res = makeRes();
  await callMiddleware(req, res);
  assert(res._status === 500, `expected 500 on env misconfig; got ${res._status}`);
  assert(res._body?.error === 'internal_error', 'error code internal_error');
  process.env.TEST_TOKEN = TOKEN; // restore
  console.log('  env misconfig: 500 internal_error');
}

async function testRawBodyMissing() {
  // simulate someone forgetting express.raw() — body is a string, not Buffer.
  const req = makeReq();
  req.body = req.body.toString('utf8'); // string, not Buffer
  const res = makeRes();
  await callMiddleware(req, res);
  assert(res._status === 500, `expected 500 when body is not a Buffer; got ${res._status}`);
  console.log('  raw-body discipline: 500 when body is not a Buffer');
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

const tests = [
  testHappyPath,
  testMissingBearer,
  testWrongBearer,
  testMissingSignature,
  testWrongSignature,
  testMalformedSignaturePrefix,
  testHmacOverDifferentBytesFails,
  testNonJsonBody,
  testMissingEnvVars,
  testRawBodyMissing,
];

console.log('inboundBridgeAuth tests…');
let passed = 0;
let failed = 0;
for (const t of tests) {
  try {
    await t();
    passed++;
  } catch (err) {
    failed++;
    console.error(`  FAIL: ${t.name}: ${err.message}`);
  }
}
console.log(`\n${passed}/${tests.length} passed${failed > 0 ? `, ${failed} failed` : ''}`);
if (failed > 0) process.exit(1);
