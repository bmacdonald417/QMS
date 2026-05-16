# Procedure: Quarterly Separation of Duties Review

**Document ID:** MAC-SOP-257
**Version:** 1.0
**Date:** 2026-05-16
**Effective date:** Upon approval
**Classification:** Internal — CUI Enclave
**Document owner:** Quality Manager (process owner) and CISO (approval authority)
**Approval authority:** CISO or designated Authorizing Official
**Cadence:** Quarterly (every 90 days from effective date), and on personnel/role-change events that affect the SoD matrix
**Related NIST controls:** AC.L2-3.1.4 (primary); cross-walk to AC.L2-3.1.5, AU.L2-3.3.1, CM.L2-3.4.1
**Parent policy:** `MAC-POL-235_Separation_of_Duties_Policy.md`
**Operational appendix:** `MAC-SOP-235_Separation_of_Duties_Matrix.md` (R1–R10 matrix for the CUI Vault)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | MacTech Compliance |

---

## 1. Purpose

This procedure operationalizes the quarterly review attestation required by MAC-POL-235 §8 and MAC-SOP-235 §7.3. The quarterly review verifies that the Separation of Duties matrix accurately reflects current operations, identifies any Prohibited or unjustified Compensating combinations held by active identities, and produces a signed register entry that closes the assessment objective AC.L2-3.1.4[c] for the period.

The review is signed in Trust Codex (SCTM 3.1.4 → Attestation tab) by the Quality Manager and countersigned by the CISO. The signed record is mirrored to QMS as a controlled record by the Codex auto-mirror; this procedure is the operational checklist that produces the inputs to that signature.

---

## 2. Scope

This procedure applies to:

- All identities holding membership in any `MAC-Vault-*` AD group (R1–R10 per MAC-SOP-235 §3).
- All Trust Codex `sod_findings` open at the start of the review.
- All Trust Codex `sod_provisioning_decisions` with decision `deny` or `fail_open` since the previous review.

It does not apply to:

- Identity changes that have not yet been provisioned (those go through MAC-SOP-258 Privileged Onboarding).
- Non-MAC-Vault-* groups in the Vault (out of SoD matrix scope).

---

## 3. Prerequisites

- The reviewer has Compliance or Admin role in Trust Codex.
- Phase 2A detective scan has run within the last 24 hours (verify via SCTM 3.1.4 → Findings tab → tab header shows recent run timestamp). If not, the reviewer triggers a manual scan first (manual API call documented in `docs/sod-scan-runbook.md` §"On-demand manual scan").
- MAC-SOP-235 is in Doc Control status `EFFECTIVE` (verify version + sha256 on the SCTM 3.1.4 → SoD Matrix tab banner).

---

## 4. Procedure

### 4.1 Refresh the evidence base

1. Trigger a manual SoD scan to ensure the findings list is current:
   ```bash
   # From an admin shell on the vault:
   Start-ScheduledTask -TaskName EnclaveWatch-SoD-Scan
   # Wait ~2 minutes, then verify:
   Get-Content C:\evidence\SoD-Scan-Runs\sod-scan-runs.log -Tail 5
   ```
2. Confirm in Codex audit log (`/admin/audit-logs`) a new `sod.detective_scan.completed` event for the current run.

### 4.2 Review open findings

3. Open SCTM 3.1.4 → **Findings** tab → filter "Open".
4. For each open finding:
   - Verify the conflict pair is real (cross-reference the principal's AD memberships in `Get-ADUser -Identity <id> -Properties MemberOf`).
   - Disposition the finding via the modal:
     - **Remediated** if the membership has been removed since the scan.
     - **Justified** if the compensating-control catalog (MAC-SOP-235 §6) is in force AND the operator has confirmed each control is exercised. Capture the evidence pointers (ticket id, log query, peer-review note) in the justification text.
     - **Accepted risk** if the CISO has signed off on the exception in writing. The justification must include the CISO sign-off date and document reference.
5. Re-filter to "Open" — if any remain, escalate to the CISO before signing the attestation.

### 4.3 Review preventive-control activity

6. Open SCTM 3.1.4 → **Pre-flight** tab → filter "Denied".
7. For each Denied decision since the previous quarterly review:
   - Verify the rejection is documented in the corresponding request ticket (or a written justification in the run log).
   - Note any operator who appears in ≥3 Denied attempts in the quarter — refer to MAC-SOP-258 §6 for training/coaching action.
8. Switch to filter "Fail-open". For each fail-open event:
   - Verify the detective scan within 4 hours of the event opened or did not open a matching finding.
   - Document the Codex availability incident (root cause, duration) in the operational journal.

### 4.4 Review break-glass activity

9. Open SCTM 3.1.4 → **Break-glass** tab → filter "All".
10. For each activation in the review period:
    - Confirm the post-hoc review row (status = Reviewed) is signed by a non-activator.
    - Spot-check the review notes for substance — "tested, fine" is not adequate; an assessor will read these.
    - For any row still in "Pending review" or "Overdue", escalate before signing the attestation.

### 4.5 Sign the quarterly attestation

11. Open SCTM 3.1.4 → **Attestation** tab.
12. Set the review period (e.g., 2026-04-01 to 2026-06-30 for Q2 2026).
13. Select every identity currently holding a Compensating-cell pair (the form lists them with a checkbox). Selecting an identity attests that its compensating controls are in force per MAC-SOP-235 §6.
14. Choose result:
    - **No change** if the matrix and role assignments are unchanged since last attestation.
    - **Exceptions present** if there are open justified-or-accepted findings carrying into the next quarter.
15. In **Notes**, capture:
    - Total open findings entering the period, total closed, total remaining.
    - Total Denied decisions in the period.
    - Total break-glass activations in the period.
    - Any compensating-control changes that occurred during the period.
16. Click **Sign quarterly attestation**.

### 4.6 Counter-signature (CISO)

17. The CISO reviews the Codex audit log entry `sod.quarterly_attestation.signed` and confirms the principal list + result match the operational reality.
18. The CISO countersigns by adding a follow-up Codex audit-log entry via the Admin → Audit Note interface, referencing the attestation entry id.

---

## 5. Evidence produced

| Artifact | Where | Auto-generated |
|---|---|---|
| Signed `sod_matrix_review` register entry (source = `quarterly_attestation`) | Codex `sod_matrix` register | Yes (POST `/api/sod/attestations`) |
| Auto-closed C-cell findings | Codex `sod_findings` (status = `justified`, justification cites the attestation entry id) | Yes (same txn as the attestation) |
| Audit log: `sod.quarterly_attestation.signed` | Codex audit log | Yes |
| CISO countersignature audit-log note | Codex audit log | Manual (CISO action) |

All artifacts are durable in Codex and visible to the assessor on the SCTM 3.1.4 Attestation tab and the Codex audit log.

---

## 6. Roles and Responsibilities

- **Quality Manager (R-Aud-equivalent in MAC-POL-235 §4.4 vocabulary):** Performs §4.1–§4.5; signs the attestation in Codex.
- **CISO / AO:** Counter-signs per §4.6; resolves escalations from §4.2–§4.4.
- **R2 Security Administrator:** Provides operational input on any matrix gaps observed in the period.
- **R3 Audit Administrator:** Confirms the detective scan source data is intact (no tampering, no gaps in WEF subscription per MAC-SOP-235 §5.5).

A single identity may not perform both §4.5 (sign attestation) and §4.6 (CISO countersignature). This is itself a 3.1.4 enforcement on the quarterly review process — same-person collapse is prohibited (per MAC-POL-235 §7 "Requester vs. Approver" universal rule).

---

## 7. Frequency and triggers

- **Quarterly** — every 90 days from the previous attestation's `reviewed_at`. The Codex Attestation tab surfaces an OVERDUE pill at >100 days.
- **On personnel events** — any hire, termination, or role change affecting R1–R10 holders triggers an off-cycle attestation within 5 business days (matches MAC-POL-235 §8 cadence).
- **On matrix changes** — any released revision of MAC-SOP-235 triggers a full re-attestation within 30 days, even mid-quarter.

---

## 8. Related Documents

- `MAC-POL-235_Separation_of_Duties_Policy.md` — parent policy.
- `MAC-SOP-235_Separation_of_Duties_Matrix.md` — R1–R10 operational appendix.
- `MAC-POL-210_Access_Control_Policy.md` §8.1 — access-control policy summary.
- `MAC-SOP-258_Privileged_Onboarding_Procedure.md` — addition-time SoD checks.
- `MAC-SOP-259_R10_Break_Glass_Procedure.md` — incident-responder elevation review.
- Trust Codex `sod_matrix` register entries (rendered at SCTM 3.1.4 → Attestation tab).

---

## 9. Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner / Quality Manager | _________________________ | _________________________ | __________ |
| System Security Officer (ISSM) | _________________________ | _________________________ | __________ |

---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Doc Control workflow. On release, Quality Doc Control signs over the canonical bytes of this document; Trust Codex records the release in `governance_documents`. The QMS itself enforces author ≠ releaser per its own implementation of AC.L2-3.1.4 — this document's author cannot release it.

**Expected location (written by the manual app):**

- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-257-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-257-signoff.md`
