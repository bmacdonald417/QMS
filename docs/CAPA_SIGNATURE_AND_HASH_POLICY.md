# CAPA: hash policy and signature meanings

This document records the **chosen binding model** for CAPA electronic records and how it maps to **QMS-internal (Part 11–style) signing** versus **Governance (external) signing**.

## Hash policy decision: Policy 1 (narrow `qmsHash`)

**We retain the current narrow CAPA canonical payload** in `buildCanonicalPayload` for entity type `CAPA`: identity, `capaId`, `status`, `title`, `description`, and `updatedAt`. The Governance layer computes `qmsHash` as SHA-256 of that canonical JSON string (see `server/src/governance.js`).

**Rationale**

- Expanding the payload (Policy 2) would mark Governance artifacts **STALE** after routine edits to investigation text, RCA JSON, or tasks—often undesirable for day-to-day workflow.
- A separate closure snapshot entity (Policy 3) remains a future option if a regulator or QAP requires a single immutable “investigation bundle” hash without changing day-to-day Governance behavior.

**Implication for compliance narrative**

- Governance signature means **attestation to the high-level CAPA metadata** (and thus the `qmsHash`) at the time of signing, **not** a hash over the full investigation, attachments, or task completion state.
- The **complete evidentiary record** is the combination of: CAPA fields, structured RCA (`rcaJson`), tasks, `CapaHistory`, system `AuditLog`, file assets (with `sha256` where stored), and internal `CapaSignature` rows.

## QMS-internal signatures (`CapaSignature`)

**Purpose:** Bind the authenticated user to a **defined workflow action** at a point in time (plan approval, closure), with password re-verification when `ESignConfig` requires it and the user holds `capa:esign`.

**What is hashed**

- Internal signing uses a **small JSON payload** (e.g. CAPA id, status, action type, timestamp) to derive `recordHash` / `signatureHash`—**not** the full CAPA content or governance canonical string.

**What is stored**

- `signatureMeaning`: e.g. `PLAN_APPROVAL`, `CLOSURE`.
- `signatureReason` (when provided): free-text **reason for signing** aligned with Part 11 intent (who did what, and why), also reflected in `CapaHistory` / audit log `reason` where applicable.

**Validation stance:** Document in IQ/OQ/PQ or equivalent that internal signatures mean **approval of the stated action** under the configured controls, not “entire investigation frozen.”

## Governance signatures (`SignatureRequest` / `SignatureArtifact`)

**Purpose:** Cross-system or external attestation that a **specific `qmsHash`** (narrow CAPA payload) was signed with the configured Ed25519 key (`GOV_ED25519_PUBLIC_KEY`).

**Verification**

- `verifyGovernanceSignature` recomputes the canonical payload and hash; mismatch yields **STALE** (record changed after sign).

**Validation stance:** Governance artifacts support **identity + hash linkage** to the narrow metadata contract above; they do not replace internal signing for workflow meaning.

## Summary table

| Mechanism            | Typical meaning                         | Content binding                          |
|---------------------|-----------------------------------------|------------------------------------------|
| `CapaSignature`     | I approve plan / I close (with controls) | Action payload + optional sign reason  |
| `SignatureArtifact` | External attestation to `qmsHash`       | Narrow CAPA metadata only (Policy 1)    |

For a future **Policy 2** or **Policy 3**, update this document, `buildCanonicalPayload`, and any external Governance signer contract together.
