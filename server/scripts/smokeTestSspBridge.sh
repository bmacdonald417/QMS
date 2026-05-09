#!/usr/bin/env bash
#
# Smoke test for the Codex SSP Doc Control bridge.
#
# Sends a synthetic SSP submission to the live QMS bridge endpoint and asserts
# a 202 response. Exercises:
#   - Bearer token + HMAC verification (auth middleware)
#   - All 7 contract validation gates (sspSubmissionContract)
#   - End-to-end transaction (FileAsset, Document seed, ExternalDocumentSubmission, junction tags)
#
# After a successful run the staging row is visible at
#   ${QMS_BASE_URL}/system/external-submissions
# and the seeded Document at
#   ${QMS_BASE_URL}/documents/${returned-qms-document-id}
#
# Run twice in a row — second call should return 200 (idempotent replay) with
# the same qms_submission_id, not create a duplicate.
#
# Required env vars:
#   QMS_BASE_URL        e.g. https://quality.mactechsolutionsllc.com
#   SSP_BRIDGE_TOKEN    matches QMS Railway env (Bearer)
#   SSP_BRIDGE_HMAC     matches QMS Railway env (HMAC shared secret)
#
# Usage:
#   QMS_BASE_URL=https://quality.mactechsolutionsllc.com \
#   SSP_BRIDGE_TOKEN=… SSP_BRIDGE_HMAC=… \
#   bash scripts/smokeTestSspBridge.sh

set -euo pipefail

: "${QMS_BASE_URL:?QMS_BASE_URL is required (e.g. https://quality.mactechsolutionsllc.com)}"
: "${SSP_BRIDGE_TOKEN:?SSP_BRIDGE_TOKEN is required}"
: "${SSP_BRIDGE_HMAC:?SSP_BRIDGE_HMAC is required}"

# Synthetic PDF (3 dummy bytes — real SSPs are megabytes; this is just the
# wire-format check). sha256 computed below.
PDF_BASE64="JVBERi0xLjQKJWZha2UtcGRmCiUlRU9G"  # "%PDF-1.4\n%fake-pdf\n%%EOF"
PDF_SHA256=$(printf '%s' "$PDF_BASE64" | base64 -d | shasum -a 256 | awk '{print $1}')

SUBMISSION_ID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
ORG_ID="00000000-0000-0000-0000-00000000aaaa"
SSP_DOC_ID="00000000-0000-0000-0000-00000000bbbb"
NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Build controls_mapped: 110 entries (3.1.1 .. 3.X.Y)
CONTROLS_JSON='['
for i in $(seq 1 110); do
  family=$((((i - 1) / 30) + 1))
  number=$((((i - 1) % 30) + 1))
  if [[ $i -gt 1 ]]; then CONTROLS_JSON+=","; fi
  CONTROLS_JSON+="\"3.${family}.${number}\""
done
CONTROLS_JSON+=']'

# canonical_json placeholder; sha256 has to be deterministic for the gate to
# pass. We pick an arbitrary 64-hex value and use it throughout — the contract
# only requires (canonical_json_sha256 === payload_sha256) AND every signoff
# data_hash matches. Codex computes the real hash; for smoke testing we just
# need wire-format consistency.
PAYLOAD_HASH="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

BODY=$(cat <<EOF
{
  "submission_id": "${SUBMISSION_ID}",
  "organization_id": "${ORG_ID}",
  "ssp_document_id": "${SSP_DOC_ID}",
  "ssp_version_number": 1,
  "document_number": "SSP-SMOKE-001",
  "payload_sha256": "${PAYLOAD_HASH}",
  "generated_at": "${NOW}",
  "generated_from_snapshot_at": "${NOW}",
  "boundary_id": "00000000-0000-0000-0000-00000000cccc",
  "boundary_name": "MacTech CUI Vault (smoke)",
  "bridge_version": "1",
  "tally": {
    "controls_covered": 110,
    "controls_met": 100,
    "controls_not_met": 8,
    "controls_na": 2,
    "controls_met_via_evidence": 60,
    "controls_met_via_esp": 0,
    "controls_met_via_enduring_exception": 1,
    "controls_met_via_dod_cio": 0,
    "controls_met_via_op_plan": 39
  },
  "controls_mapped": ${CONTROLS_JSON},
  "signoffs": [
    { "kind": "isso", "signer_display_name": "Smoke ISSO", "signer_title": "ISSO", "data_hash": "${PAYLOAD_HASH}", "signed_at": "${NOW}", "signature_alg": "attestation_only", "signature_value": "smoke" },
    { "kind": "system_owner", "signer_display_name": "Smoke SO", "signer_title": "System Owner", "data_hash": "${PAYLOAD_HASH}", "signed_at": "${NOW}", "signature_alg": "attestation_only", "signature_value": "smoke" },
    { "kind": "authorizing_official", "signer_display_name": "Smoke AO", "signer_title": "AO", "data_hash": "${PAYLOAD_HASH}", "signed_at": "${NOW}", "signature_alg": "attestation_only", "signature_value": "smoke" }
  ],
  "artifacts": {
    "pdf_base64": "${PDF_BASE64}",
    "pdf_sha256": "${PDF_SHA256}",
    "canonical_json": { "smoke": true },
    "canonical_json_sha256": "${PAYLOAD_HASH}"
  }
}
EOF
)

# Compute HMAC over the exact bytes we'll send. macOS uses BSD openssl;
# Linux uses GNU. Both speak `dgst -hmac -binary | xxd`.
SIG_HEX=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SSP_BRIDGE_HMAC" -binary | xxd -p -c 256)

echo "Submitting synthetic SSP to ${QMS_BASE_URL}/api/external-submissions/ssp"
echo "  submission_id: ${SUBMISSION_ID}"
echo "  document_number: SSP-SMOKE-001"
echo "  payload_sha256: ${PAYLOAD_HASH}"
echo

HTTP_RESPONSE=$(curl -sS -w "\n%{http_code}" -X POST \
  "${QMS_BASE_URL}/api/external-submissions/ssp" \
  -H "Authorization: Bearer ${SSP_BRIDGE_TOKEN}" \
  -H "X-Codex-Signature: sha256=${SIG_HEX}" \
  -H "Content-Type: application/json" \
  -d "${BODY}")

HTTP_BODY=$(printf '%s' "$HTTP_RESPONSE" | sed '$d')
HTTP_CODE=$(printf '%s' "$HTTP_RESPONSE" | tail -1)

echo "Response: HTTP ${HTTP_CODE}"
echo "${HTTP_BODY}" | sed 's/^/  /'
echo

if [[ "${HTTP_CODE}" == "202" ]]; then
  echo "✓ Smoke test passed (202 Accepted)"
  echo "  Staging row visible at ${QMS_BASE_URL}/system/external-submissions"
  echo "  Run again to verify idempotency (expect 200)."
elif [[ "${HTTP_CODE}" == "200" ]]; then
  echo "✓ Idempotent replay (200 OK)"
else
  echo "✗ FAILED: expected 202 (or 200 on replay), got ${HTTP_CODE}"
  exit 1
fi
