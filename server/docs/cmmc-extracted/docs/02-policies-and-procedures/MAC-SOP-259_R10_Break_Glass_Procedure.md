# Procedure: R10 Incident-Responder Break-Glass Activation and Post-Hoc Review

**Document ID:** MAC-SOP-259
**Version:** 1.0
**Effective date:** Upon approval
**Classification:** Internal — CUI Enclave
**Document owner:** R10 process owner (Incident Response Lead) — process owner; CISO — approval authority
**Approval authority:** CISO or designated Authorizing Official
**Related NIST controls:** AC.L2-3.1.4 (primary); cross-walk to IR.L2-3.6.1 (incident response capability), AU.L2-3.3.1 (auditable events), AC.L2-3.1.5 (least privilege)
**Parent policy:** `MAC-POL-235_Separation_of_Duties_Policy.md`
**Operational appendix:** `MAC-SOP-235_Separation_of_Duties_Matrix.md` (R10 definition in §3, enforcement in §5.3)

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | — | Initial release | MacTech Compliance |

---

## 1. Purpose

This procedure defines how R10 (Incident Responder, `MAC-Vault-IR`) elevates into the CUI Vault during a declared security incident, and how the resulting activation gets a mandatory post-hoc review by a non-activator within 24 hours.

The control architecture for R10 (per MAC-SOP-235 §3 and §5.3):

- **R10 is JIT-only** — no standing membership in `MAC-Vault-IR`.
- **Activation is via Entra PIM** with MFA, time-boxed (max 4 hours per incident).
- **Codex is NOT in the activation path** — incident response cannot be gated on the availability of a non-CUI compliance plane. PIM (Entra-native) handles the elevation directly.
- **Codex audits the activation post-hoc** — EnclaveWatch ingests the PIM event within 6 hours; the responder's manager (or another non-activator) signs the review in Codex within 24 hours.

This split is itself the AC.L2-3.1.4 implementation for R10: the *activation* doesn't go through the SoD plane (operational availability), but the *review* enforces the SoD principle (activator ≠ reviewer), and the *audit trail* provides the forensic record.

---

## 2. Scope

In scope:

- Any PIM activation of `MAC-Vault-IR` for the CUI Vault.
- The post-hoc review of every activation.

Out of scope:

- Routine, non-emergency R10 work (there shouldn't be any — R10 only activates during declared incidents).
- Other JIT roles (R1 SysAdmin and R5 Identity Admin also use PIM but follow different audit cadences; see MAC-SOP-258 for routine privileged onboarding).

---

## 3. Prerequisites

- The activator holds R10 eligibility in Entra PIM (eligibility was provisioned per MAC-SOP-258).
- The activator's account passes MFA at activation time.
- A declared incident (IR ticket open in the IR system, ISSO acknowledgement of the incident) exists for the activation reason. **R10 activation without a declared incident is itself a finding.**
- The EnclaveWatch `EnclaveWatch-R10-BreakGlass` scheduled task is running on cadence (verify via `Get-ScheduledTask`). If it's stopped, the post-hoc audit chain is broken and the activation must be manually backfilled into Codex per `docs/r10-break-glass-runbook.md` § "On-demand manual ingest."

---

## 4. Activation procedure (responder)

### 4.1 At activation time

1. Open the incident ticket (or create one) and note the ticket id. This is the `activation_reason` the responder will type into the PIM dialog.
2. In Entra PIM (https://portal.azure.com → PIM → My roles), activate `MAC-Vault-IR` with:
   - **Duration:** the minimum needed to contain the incident, NOT the maximum permitted. Default 1 hour; extend in 30-minute increments only if necessary.
   - **Reason:** incident ticket id + one-line description (e.g., `INC-2026-05-12: vault tamper investigation — anomalous WDAC block at 18:42 UTC`).
   - **MFA:** complete the prompt with a phishing-resistant authenticator (FIDO2 / Windows Hello / authenticator-app push).
3. Entra applies the eligibility-to-active transition and records the event in the directory audit log.

### 4.2 During the elevation

4. Use the elevated role ONLY for the incident-response work that justified the activation. Routine work performed under R10 elevation is itself an SoD finding.
5. Record significant actions in the incident ticket as you take them. The post-hoc review (§5) will reference these.
6. If the activation duration is approaching expiry and the incident is ongoing, request a fresh activation rather than extending — fresh activations re-fire the post-hoc review obligation and re-affirm MFA.

### 4.3 At deactivation

7. Deactivate explicitly (do not rely on the expiry timer) so the duration in audit logs matches the work performed.
8. Add a closing note to the incident ticket summarizing actions taken under R10 elevation.

---

## 5. Post-hoc review procedure (reviewer)

### 5.1 Triggering

9. Within 6 hours of activation, the EnclaveWatch scheduled task imports the PIM event into Codex. A new row appears in SCTM 3.1.4 → **Break-glass** tab → status `Pending review`.
10. Codex computes a 24-hour SLA from `activation_started_at`. The Break-glass tab badges rows past the SLA as `Overdue`.

### 5.2 Reviewer selection

11. The reviewer MUST NOT be the activator. The Codex API enforces this with a same-person heuristic against email/UPN local-part; an attempted self-review returns `SOD_SELF_REVIEW_BLOCKED`.
12. Eligible reviewers (in priority order):
    - The activator's direct manager (if they hold Compliance or Admin role in Codex).
    - The CISO.
    - Any Compliance-role holder who was NOT involved in the incident response.

### 5.3 Review steps

13. Open SCTM 3.1.4 → Break-glass tab → click the pending activation.
14. Cross-check the activation against the cited incident ticket:
    - Does the activation_started_at correlate to ticket activity?
    - Was the duration proportional to the work performed?
    - Are the activator's logged actions consistent with R10 (containment / forensics) and NOT routine admin work?
15. Compose the review notes covering:
    - **Ticket reference** — incident id + URL.
    - **Findings summary** — one-line summary of what the activator did.
    - **Outcome** — incident resolved / referred / closed-no-action.
    - **Lessons** — any procedural gap, training need, or matrix update that surfaced.
16. Click **Sign post-hoc review**. The row moves to `Reviewed`; the audit log records `sod.r10_break_glass.reviewed` including `sla_breached: true|false`.

### 5.4 Overdue handling

17. If a row reaches `Overdue` (>24h pending), the row stays in pending state — the SLA breach is real and is captured forensically. The review is still required; closure with `sla_breached: true` is the operational reality. Investigate the operational failure that caused the breach.

---

## 6. Escalations

The CISO is automatically notified if any of:

- An activation has no corresponding incident ticket (operational discipline failure — activator must explain).
- An activation's duration exceeded 4 hours (against MAC-SOP-235 §5.3 max time-box).
- ≥3 activations by the same identity within a 30-day rolling window without a corresponding cluster of incidents.
- Any review is overdue >72 hours (escalation to CISO + ISSO).

The Quality Manager reviews the cumulative break-glass log at each quarterly attestation (MAC-SOP-257 §4.4) and references the data in the attestation notes.

---

## 7. Evidence produced

| Artifact | Where | Notes |
|---|---|---|
| `r10_break_glass_activations` row, status `pending_review` | Codex (SCTM 3.1.4 → Break-glass) | Auto-created by EnclaveWatch ingest; idempotent. |
| `r10_break_glass_activations` row, status `reviewed` | Same | After reviewer signs; carries reviewer id, notes, and `sla_breached` flag. |
| Audit log: `sod.r10_break_glass.ingested` | Codex audit log | Payload counts per scheduled run. |
| Audit log: `sod.r10_break_glass.reviewed` | Codex audit log | Per review, with `sla_breached` flag. |
| Entra directory-audit event | Microsoft Graph / Entra audit log | The actual activation record; independent of Codex. |
| Incident ticket | IR system | Activation reason + actions taken; cross-referenced from the review notes. |

---

## 8. Roles and Responsibilities

- **R10 holder (activator):** Performs §4 end to end. Records actions in the incident ticket.
- **R10's direct manager OR CISO OR another Compliance-role holder (reviewer):** Performs §5 within 24 hours. Cannot be the activator.
- **CISO:** Handles §6 escalations.
- **Quality Manager:** Aggregates the period's break-glass activity into the quarterly attestation notes.
- **R3 Audit Administrator:** Confirms the WEF subscription is capturing PIM events to the independent SIEM (MAC-SOP-235 §5.5).

---

## 9. Related Documents

- `MAC-POL-235_Separation_of_Duties_Policy.md` — parent policy.
- `MAC-SOP-235_Separation_of_Duties_Matrix.md` §5.3 — R10 enforcement architecture.
- `MAC-SOP-257_SoD_Quarterly_Review_Procedure.md` §4.4 — break-glass activity is reviewed at quarterly attestation.
- `MAC-SOP-258_Privileged_Onboarding_Procedure.md` — pathway for non-emergency role additions (NOT this procedure).
- `MAC-POL-215_Incident_Response_Policy.md` — incident-declaration triggers that authorize R10 activation.
- `docs/r10-break-glass-runbook.md` (in EnclaveWatch repo) — install / scheduled-task setup for the EnclaveWatch collector.

---

## 10. Approval

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner / IR Lead | _________________________ | _________________________ | __________ |
| System Security Officer (ISSM) | _________________________ | _________________________ | __________ |

---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Doc Control workflow. The QMS itself enforces author ≠ releaser per its own implementation of AC.L2-3.1.4 — this document's author cannot release it.

**Expected location (written by the manual app):**

- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-259-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-259-signoff.md`
