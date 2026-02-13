/**
 * CAPA module tests (minimum).
 * Run: node src/capas.test.js
 */
import { VALID_TRANSITIONS, isAllowedTransition } from './capas.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// --- Transition validation: reject invalid transitions
function testInvalidTransitions() {
  assert(!isAllowedTransition('DRAFT', 'CLOSED'), 'DRAFT -> CLOSED should be invalid');
  assert(!isAllowedTransition('OPEN', 'DRAFT'), 'OPEN -> DRAFT should be invalid');
  assert(!isAllowedTransition('CLOSED', 'OPEN'), 'CLOSED -> OPEN should be invalid');
  assert(!isAllowedTransition('CANCELLED', 'OPEN'), 'CANCELLED -> OPEN should be invalid');
  assert(!isAllowedTransition('PLAN_APPROVAL', 'CLOSED'), 'PLAN_APPROVAL -> CLOSED should be invalid');
  assert(!isAllowedTransition('INVESTIGATION', 'CLOSED'), 'INVESTIGATION -> CLOSED should be invalid');
  console.log('  invalid transitions: OK');
}

// --- Transition validation: allow valid transitions
function testValidTransitions() {
  assert(isAllowedTransition('DRAFT', 'OPEN'), 'DRAFT -> OPEN should be valid');
  assert(isAllowedTransition('DRAFT', 'CANCELLED'), 'DRAFT -> CANCELLED should be valid');
  assert(isAllowedTransition('OPEN', 'CONTAINMENT'), 'OPEN -> CONTAINMENT should be valid');
  assert(isAllowedTransition('PENDING_CLOSURE', 'CLOSED'), 'PENDING_CLOSURE -> CLOSED should be valid');
  assert(isAllowedTransition('EFFECTIVENESS_CHECK', 'PENDING_CLOSURE'), 'EFFECTIVENESS_CHECK -> PENDING_CLOSURE should be valid');
  console.log('  valid transitions: OK');
}

// --- Permission check behavior: requirePermission is middleware (tested via API)
// --- Audit log: createAuditLog called on update/close (tested via API)
// To run API tests: start server, set RUN_API_TESTS=1, then run this file with an extra API test step
// that POSTs to /api/auth/login, then POST /api/capas, PUT /api/capas/:id with reason, and GET
// /api/system/audit (or audit log table) to confirm CAPA_UPDATED entry; and POST transition with
// invalid toStatus and expect 400.

function run() {
  console.log('CAPA tests');
  testInvalidTransitions();
  testValidTransitions();
  console.log('All CAPA unit tests passed.');
}

run();
