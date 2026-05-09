#!/usr/bin/env node
/**
 * One-shot generator for the Codex SSP Doc Control bridge shared secrets.
 *
 * Generates two 32-byte cryptographically random values, base64-encoded.
 * Output goes to stdout ONLY — never written to disk, never logged elsewhere.
 *
 *   node scripts/generateSspBridgeSecrets.js
 *
 * Workflow:
 *   1. Run this script in a terminal whose scrollback you control.
 *   2. Copy both values into 1Password (or Signal to the codex-side operator).
 *   3. Set them in QMS Railway env (this service):
 *        SSP_BRIDGE_TOKEN, SSP_BRIDGE_HMAC
 *   4. Set the SAME two values in Codex Railway env (codex.mactechsolutionsllc.com):
 *        SSP_DOC_CONTROL_BRIDGE_TOKEN, SSP_DOC_CONTROL_BRIDGE_HMAC
 *   5. Clear your terminal scrollback.
 *
 * To rotate: re-run, update both Railway services, restart both. Two env-var
 * swaps per side. Codex will fail closed during the few seconds between
 * rotations if anything is mid-flight.
 */
import { randomBytes } from 'node:crypto';

const token = randomBytes(32).toString('base64');
const hmac = randomBytes(32).toString('base64');

process.stdout.write(`
SSP Doc Control Bridge — generated secrets
==========================================

QMS Railway env (this service):
  SSP_BRIDGE_TOKEN=${token}
  SSP_BRIDGE_HMAC=${hmac}

Codex Railway env (codex.mactechsolutionsllc.com):
  SSP_DOC_CONTROL_BRIDGE_TOKEN=${token}
  SSP_DOC_CONTROL_BRIDGE_HMAC=${hmac}

Hand off via 1Password or Signal. Do not paste into chat, docs, source
control, or any persistent log. Clear your terminal scrollback when done.
`);
