# Procedure: Privileged Onboarding to MAC-Vault-* Groups

**Document ID:** MAC-SOP-258
**Version:** 1.0
**Effective date:** Upon approval
**Classification:** Internal — CUI Enclave
**Document owner:** R5 (Identity Administrator) — process owner; CISO — approval authority
**Approval authority:** CISO or designated Authorizing Official
**Related NIST controls:** AC.L2-3.1.4 (primary); cross-walk to AC.L2-3.1.5 (least privilege), AC.L2-3.1.1 (account management), AU.L2-3.3.1 (auditable events)
**Parent policy:** `MAC-POL-235_Separation_of_Duties_Policy.md`
**Operational appendix:** `MAC-SOP-235_Separation_of_Duties_Matrix.md`

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | MacTech Compliance |

---

## 1. Purpose

This procedure defines the controlled workflow for adding any identity to a `MAC-Vault-*` AD group. The workflow routes every addition through Codex's preventive provisioning check (Phase 3C of AC.L2-3.1.4), which evaluates the proposed role set against the SoD matrix BEFORE the AD change commits. A Prohibited combination is blocked; a Compensating combination is permitted only with current attestation coverage.

Direct invocation of `Add-ADGroupMember -Identity <id> -Members <user>` against a `MAC-Vault-*` group is **prohibited**. The only sanctioned path is the wrapper script `Invoke-MacVaultGroupMembership.ps1` (alias `madd`), which:

1. Resolves the identity's current group memberships,
2. Calls Codex `/api/sod/provisioning-check`,
3. Performs the actual `Add-ADGroupMember` only if Codex returns `allow`,
4. Logs every call as an immutable `sod_provisioning_decisions` event.

---

## 2. Scope

In scope:

- All additions, modifications, or replacements of identity ↔ `MAC-Vault-*` group bindings.
- All privileged onboarding events — new hires, role changes, contractor activations, service-principal provisioning.

Out of scope:

- Removals from `MAC-Vault-*` groups (use standard `Remove-ADGroupMember`; removal cannot create a new conflict pair).
- Non-`MAC-Vault-*` group memberships (not subject to the SoD matrix).
- Cross-tenant guest provisioning (handled separately under MAC-POL-229 ISA workflow).

---

## 3. Prerequisites

- The operator performing the addition holds R5 (Identity Administrator) per MAC-SOP-235 §3.
- The operator has the `Invoke-MacVaultGroupMembership.ps1` wrapper available (installed under `$env:ProgramFiles\EnclaveWatch\scripts\` by the standard EnclaveWatch deploy).
- The Codex bearer token is staged at `C:\ProgramData\EnclaveWatch\codex-sod.token` with the documented ACL (see `docs/sod-scan-runbook.md` §1).
- The addition is documented in an approved request ticket (HR-initiated, manager-approved, ISSO-authorized for any privileged grant — same chain MAC-POL-235 §4.7 requires).

---

## 4. Procedure

### 4.1 Validate the request before invoking the wrapper

1. Confirm the request ticket exists and shows the required approval chain (HR → manager → ISSO for privileged grants).
2. Confirm the target identity exists in AD and is not in `Disabled` state.
3. Confirm the target group is one of the canonical R1–R10 groups listed in MAC-SOP-235 §3. If the request names a group outside this set, escalate — it may indicate a matrix gap.

### 4.2 Run a pre-flight (no-AD-change) check

4. Run the wrapper with `-WhatIf`:
   ```powershell
   Invoke-MacVaultGroupMembership `
     -Identity <upn> `
     -TargetGroup <MAC-Vault-Group> `
     -WhatIf
   ```
5. Read the decision in the log. If `deny` or `allow_with_attestation`, do NOT proceed to §4.3 — go to §4.5 (deny path) or §4.6 (attestation path).

### 4.3 Execute the addition (allow path)

6. If the dry-run returned `allow`, re-run the wrapper without `-WhatIf`:
   ```powershell
   Invoke-MacVaultGroupMembership `
     -Identity <upn> `
     -TargetGroup <MAC-Vault-Group>
   ```
7. Verify exit code 0 and the log entry `Add-ADGroupMember succeeded`.
8. Update the request ticket with the Codex decision id (visible in SCTM 3.1.4 → Pre-flight tab) and the wrapper run timestamp.

### 4.4 Post-add verification

9. Within 30 minutes of the addition, the next detective scan (every 6h cadence with overlapping windows) will pick up the new state. Verify SCTM 3.1.4 → Findings tab shows no new open findings for this principal.
10. If a new finding appears, the wrapper or Codex disagreed about the resulting state. Open an investigation immediately — this indicates either an AD replication delay or a wrapper logic gap.

### 4.5 Deny path

11. If the pre-flight returned `deny`, reject the request:
    - Reply to the requester citing the conflict pair and MAC-SOP-235 §4 entry.
    - Note in the ticket: "Denied per Codex pre-flight (request_id `<uuid>`); conflict pair `<R-id × R-id>` — see SCTM 3.1.4 → Pre-flight tab → Denied filter."
12. Discuss alternative role assignments with the requesting manager. Possible mitigations:
    - Assign the duty to a different identity that doesn't hold the conflicting role.
    - Split the duty across two identities so neither holds both ends of the matrix pair.
    - Escalate to the CISO if no alternative is operationally viable — the CISO may approve an exception only if a compensating-control package is documented AND ratified by an off-cycle quarterly attestation (MAC-SOP-257 §7 "On personnel events" trigger).

### 4.6 Allow-with-attestation path

13. If the pre-flight returned `allow_with_attestation`, do NOT use `-Force` as the first step. Open a quarterly attestation in Codex (SCTM 3.1.4 → Attestation tab) covering this identity for the period the C-cell will be active.
14. After signing the attestation, re-run the wrapper. The decision should now be `allow` (the freshly-signed attestation suppresses the C-flag for this principal). Proceed to §4.3.
15. `-Force` is permitted ONLY for documented transition periods (e.g., during a CISO-approved exception window) and must be accompanied by a written justification in the ticket. The wrapper logs the override.

### 4.7 Fail-open path

16. If the wrapper exits with code 5 ("fail-open"), Codex was unreachable and the wrapper performed `Add-ADGroupMember` per the fail-open contract.
17. Within 4 hours, the next detective scan will evaluate the resulting state. If the addition produced a P-cell, a `high` severity finding opens automatically.
18. The operator who triggered the fail-open path is responsible for monitoring SCTM 3.1.4 → Findings for any related finding and disposing it (remediate, justify, or accept-risk per MAC-SOP-235 §7).

---

## 5. Evidence produced

| Artifact | Where | Notes |
|---|---|---|
| `sod_provisioning_decisions` row | Codex (SCTM 3.1.4 → Pre-flight tab) | Every wrapper invocation, regardless of decision. |
| `sod.preventive_check.decided` audit-log entry | Codex audit log | Includes decision, conflict pair, principal, requesting operator. |
| Local wrapper run log | `C:\evidence\Provisioning-Wrapper-Runs\provisioning-runs.log` | UTC timestamps, exit codes; forensic backup if Codex audit log is later subpoenaed. |
| AD audit event 4728 / 4756 | Vault host Security log → forwarded via WEF | The actual group-membership-changed event; independent of Codex. |

---

## 6. Operator coaching

If an operator appears in ≥3 Denied decisions within a quarter (visible in SCTM 3.1.4 → Pre-flight tab by filtering "Denied" and inspecting `requestedByPrincipal`), the Quality Manager should:

1. Review whether the operator misunderstands the matrix (training gap) or is testing edge cases (intentional, document).
2. If training gap → schedule a 1:1 walking the operator through MAC-SOP-235 §4 + §6.
3. Document the coaching in the operator's training register entry (MAC-SOP-227).

This is itself defensible operating evidence — an assessor seeing the Denied count fall after coaching sees the control responding to feedback.

---

## 7. Roles and Responsibilities

- **R5 Identity Administrator:** Performs §4 end to end.
- **Manager (requesting identity's reporting chain):** Approves the request ticket pre-§4.
- **ISSO:** Authorizes any privileged grant per MAC-POL-235 §4.7 — required for additions to R2, R3, R5, R10 specifically.
- **CISO:** Reviews escalations from §4.5; approves any `-Force` override per §4.6.
- **Quality Manager:** Performs §6 quarterly review of operator behavior.

---

## 8. Related Documents

- `MAC-POL-235_Separation_of_Duties_Policy.md` — parent policy.
- `MAC-SOP-235_Separation_of_Duties_Matrix.md` — R1–R10 matrix.
- `MAC-SOP-257_SoD_Quarterly_Review_Procedure.md` — periodic review that consumes the wrapper output.
- `MAC-SOP-259_R10_Break_Glass_Procedure.md` — incident-responder elevation, which uses a different pathway (PIM, not this wrapper).
- `MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md` — non-privileged account lifecycle.
- `MAC-SOP-227_Security_Awareness_Training_Procedure.md` — where operator coaching is logged.
- `docs/sod-provisioning-wrapper-runbook.md` (in EnclaveWatch repo) — wrapper exit codes, fail-open contract.

---

## 9. Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner / R5 Identity Administrator | _________________________ | _________________________ | __________ |
| System Security Officer (ISSM) | _________________________ | _________________________ | __________ |

---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Doc Control workflow. The QMS itself enforces author ≠ releaser per its own implementation of AC.L2-3.1.4 — this document's author cannot release it.

**Expected location (written by the manual app):**

- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-258-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-258-signoff.md`
