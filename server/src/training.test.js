/**
 * Training API tests: X-INTEGRATION-KEY support (read-only).
 * Run: node src/training.test.js
 * Integration tests (requires server + INTEGRATION_KEY): RUN_API_TESTS=1 node src/training.test.js
 */
import { trainingAuthMiddleware } from './auth.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- Unit: trainingAuthMiddleware rejects non-GET when using integration key
async function testIntegrationKeyRejectsNonGet() {
  const originalKey = process.env.INTEGRATION_KEY;
  process.env.INTEGRATION_KEY = 'test-key';
  try {
    const req = {
      method: 'POST',
      headers: { 'x-integration-key': 'test-key' },
    };
    const res = {
      statusCode: null,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(obj) {
        this.body = obj;
        return this;
      },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    await trainingAuthMiddleware(req, res, next);
    assert(res.statusCode === 403, 'POST with integration key should return 403');
    assert(!nextCalled, 'next should not be called');
    assert(res.body?.error?.includes('read-only'), 'Error should mention read-only');
  } finally {
    process.env.INTEGRATION_KEY = originalKey;
  }
  console.log('  integration key rejects non-GET: OK');
}

// --- Unit: trainingAuthMiddleware allows GET with valid integration key
async function testIntegrationKeyAllowsGet() {
  const req = {
    method: 'GET',
    headers: { 'x-integration-key': 'test-key' },
  };
  const res = {
    statusCode: null,
    status(code) { this.statusCode = code; return this; },
    json() { return this; },
  };
  let nextCalled = false;
  const next = () => { nextCalled = true; };
  const originalKey = process.env.INTEGRATION_KEY;
  process.env.INTEGRATION_KEY = 'test-key';
  try {
    await trainingAuthMiddleware(req, res, next);
    assert(nextCalled, 'next should be called for GET with valid key');
    assert(req.trainingActor === 'integration', 'trainingActor should be integration');
  } finally {
    process.env.INTEGRATION_KEY = originalKey;
  }
  console.log('  integration key allows GET: OK');
}

// --- Integration: API tests (when RUN_API_TESTS=1 and server is running)
async function runApiTests() {
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
  const key = process.env.INTEGRATION_KEY;
  if (!key) {
    console.log('  Skipping API tests: INTEGRATION_KEY not set');
    return;
  }
  const headers = { 'X-INTEGRATION-KEY': key };

  try {
    // GET /api/training/modules with integration key
    const modulesRes = await fetch(`${baseUrl}/api/training/modules`, { headers });
    if (!modulesRes.ok) {
      console.log(`  Skipping API tests: server returned ${modulesRes.status} (is server running?)`);
      return;
    }
    const modulesData = await modulesRes.json();
    assert(Array.isArray(modulesData.modules), 'Response should have modules array');
    console.log('  GET /api/training/modules with X-INTEGRATION-KEY: OK');

    // POST with integration key should fail with 403
    const postRes = await fetch(`${baseUrl}/api/training/complete/fake-id`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert(postRes.status === 403, `POST with integration key should return 403: ${postRes.status}`);
    console.log('  POST with X-INTEGRATION-KEY returns 403: OK');
  } catch (err) {
    if (err.code === 'ECONNREFUSED' || err.message?.includes('fetch')) {
      console.log('  Skipping API tests: server not reachable (start server first)');
      return;
    }
    throw err;
  }
}

async function run() {
  console.log('Training API tests');
  await testIntegrationKeyRejectsNonGet();
  await testIntegrationKeyAllowsGet();
  if (process.env.RUN_API_TESTS === '1') {
    await runApiTests();
  } else {
    console.log('  (Set RUN_API_TESTS=1 and start server to run integration tests)');
  }
  console.log('All training tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
