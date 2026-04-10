/**
 * Integration auth sanity tests.
 * Run: RUN_INTEGRATION_TESTS=1 node src/integrations/integration.test.js
 * Requires: server running, INTEGRATION_JWT_SECRET set, JWT token for System Admin.
 *
 * Validates:
 * - create client
 * - mint token
 * - call form-records endpoint with token succeeds
 * - call without proper scope fails 403
 * - inactive client fails 401
 */

const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';

async function api(method, path, { body, token, integrationToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (integrationToken) headers['Authorization'] = `Bearer ${integrationToken}`;
  else if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function run() {
  if (process.env.RUN_INTEGRATION_TESTS !== '1') {
    console.log('Set RUN_INTEGRATION_TESTS=1 and provide JWT_TOKEN (System Admin) to run.');
    return;
  }

  const jwtToken = process.env.JWT_TOKEN;
  if (!jwtToken) {
    console.log('JWT_TOKEN required (System Admin JWT for creating clients).');
    return;
  }

  console.log('Integration auth sanity tests...');

  // 1. Create client with formrecords:read only
  const createRes = await api('POST', '/api/system/integrations/clients', {
    body: { name: 'Test Client', scopes: ['formrecords:read'] },
    token: jwtToken,
  });
  if (createRes.status !== 201) {
    console.error('Create client failed:', createRes.status, createRes.data);
    process.exit(1);
  }
  const { clientId, clientSecret } = createRes.data;
  console.log('  Created client:', clientId);

  // 2. Mint token
  const tokenRes = await api('POST', '/api/integrations/token', {
    body: { clientId, clientSecret },
  });
  if (tokenRes.status !== 200) {
    console.error('Token issuance failed:', tokenRes.status, tokenRes.data);
    process.exit(1);
  }
  const accessToken = tokenRes.data.access_token;
  console.log('  Obtained token');

  // 3. Call form-records with token succeeds
  const listRes = await api('GET', '/api/form-records', { integrationToken: accessToken });
  if (listRes.status !== 200) {
    console.error('Form records GET failed:', listRes.status, listRes.data);
    process.exit(1);
  }
  console.log('  GET /api/form-records with token: OK');

  // 4. Call without proper scope (formrecords:write) fails 403 for POST
  const postRes = await api('POST', '/api/form-records', {
    body: { templateCode: 'FRM-001', title: 'Test' },
    integrationToken: accessToken,
  });
  if (postRes.status !== 403) {
    console.error('Expected 403 for POST without formrecords:write, got:', postRes.status);
    process.exit(1);
  }
  console.log('  POST without formrecords:write returns 403: OK');

  // 5. Deactivate client and verify token fails
  await api('PATCH', `/api/system/integrations/clients/${clientId}`, {
    body: { isActive: false },
    token: jwtToken,
  });
  const failRes = await api('POST', '/api/integrations/token', {
    body: { clientId, clientSecret },
  });
  if (failRes.status !== 401) {
    console.error('Expected 401 for inactive client, got:', failRes.status);
    process.exit(1);
  }
  console.log('  Inactive client returns 401: OK');

  // Reactivate for cleanup
  await api('PATCH', `/api/system/integrations/clients/${clientId}`, {
    body: { isActive: true },
    token: jwtToken,
  });

  console.log('All integration auth tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
