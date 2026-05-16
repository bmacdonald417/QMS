# Separation of Duties Matrix — MacTech CUI Vault (Windows Server 2025 Operational Appendix)

**Document ID:** MAC-SOP-235
**Version:** 2.0
**Effective date:** Upon approval
**Classification:** Internal — CUI Enclave
**Document owner:** CISO or designated System Owner
**Approval authority:** CISO or designated Authorizing Official
**Next review date:** Annually from effective date, or upon role/architecture change
**Parent policy:** `MAC-POL-235_Separation_of_Duties_Policy.md` (workflow-level personnel SoD across MacTech operations — this document is the Windows Server 2025 enclave-specific operational appendix)
**Related NIST controls:** AC.L2-3.1.4 (primary); cross-walk to AC.L2-3.1.5 (least privilege) and AU.L2-3.3.1 (auditable events)
**System scope:** MacTech CUI Vault — Windows Server 2025 Datacenter on Azure Government

---

## Document control

| Version | Date | Description | Author |
|---------|------|-------------|--------|
| 1.0 | 2026-01-23 | Initial release (legacy web-app scope: 2-role matrix) | MacTech Compliance |
| 1.1 | 2026-01-23 | Operational controls and enforcement mechanisms | MacTech Compliance |
| 2.0 | — | **Major rewrite.** Re-scoped to MacTech CUI Vault (Windows Server 2025 Datacenter). Replaces the 2-role ADMIN/USER matrix with the 10-role R1–R10 model and conflict matrix. Adds AD/Entra group mapping, tier model, JEA/PIM/GPO enforcement, compensating-control catalog, detective/preventive scan integration, quarterly attestation workflow. Superseding scope: web-app RBAC content from v1.x is retired with the legacy NextJS architecture and is no longer in CMMC L2 scope. | MacTech Compliance |

---

## 1. Purpose

This document is the **Windows Server 2025 operational appendix** to `MAC-POL-235_Separation_of_Duties_Policy.md`. MAC-POL-235 is the parent policy and the workflow-level authority for personnel SoD across MacTech (code changes, ISAs, risk assessments, QMS Doc Control, PIM activation, maintenance, access provisioning, audit log review). This document narrows to the MacTech CUI Vault — Windows Server 2025 Datacenter inside Azure Government — and specifies the operational role-to-role matrix, AD/Entra group mapping, tier model, and JEA/PIM/GPO/WDAC enforcement detail for the 10 named administrative roles (R1–R10) that operate the Vault. Together, MAC-POL-235 (workflow lens) and this appendix (operational role lens) satisfy AC.L2-3.1.4 assessment objectives [a], [b], and [c] for the CUI Vault.

Where MAC-POL-235 §5 says "the authoritative SoD Matrix is maintained as the `sod_matrix` operational register," entries written from this appendix's release event represent the Windows-Server-2025 enclave snapshot; entries written from non-enclave workflows (PR approval, ISA execution, etc.) represent MAC-POL-235's domain. Both surface as `sod_matrix` register entries in Trust Codex and roll up to the same CMMC AC.L2-3.1.4 control.

---

## 2. Scope

This matrix applies to:

- All identities (human or service principal) holding privileged access to the MacTech CUI Vault.
- All Active Directory and Microsoft Entra groups, Privileged Identity Management (PIM) eligible-and-active role assignments, and Just-Enough-Administration (JEA) endpoints provisioned for the Vault.
- All application-layer roles inside Vault-resident applications that touch CUI workflow (ingest, classify, release, retire).

It does not apply to:

- Trust Codex compliance plane (separate system; out-of-band non-CUI; covered by Trust Codex's own RBAC documented separately in the SSP).
- End-user devices outside the Vault boundary except where they hold an identity in one of the R-roles defined below.

---

## 3. Role Definitions (R1–R10)

| ID | Role | Primary duties | AD/Entra group | Admin tier | Enforcement mechanism |
|----|------|----------------|----------------|------------|----------------------|
| R1 | System Administrator | OS patching, configuration, performance; Hyper-V host, guest OS, Windows roles | `MAC-Vault-SysAdmins` | Tier 1 | JIT activation via PIM; PAW required; LAPS for local-admin rotation |
| R2 | Security Administrator | Baselines, GPO hardening, EDR/AV policy, cryptography; STIG/HVS, BitLocker, AppLocker/WDAC | `MAC-Vault-SecAdmins` | Tier 0 | Separate forest admin tier; signed GPO workflow; WDAC policy authorship |
| R3 | Audit Administrator | Audit policy configuration, log forwarding, SIEM ingestion; Event Viewer, WEF subscriptions, SIEM rules | `MAC-Vault-AuditAdmins` | Tier 0 (isolated) | Dedicated audit-collector VM; write-once log storage; isolated from R1/R2 span of control |
| R4 | Auditor / Reviewer | Read-only review of audit records; no modify rights | `MAC-Vault-Auditors` | n/a | Event Log Readers built-in group only; no shell access; no write rights |
| R5 | Identity / Account Administrator | User and group provisioning, MFA enrollment; AD and Entra accounts touching the Vault | `MAC-Vault-Identity` | Tier 1 | Delegated OU rights only; not a member of Domain Admins; PIM-eligible |
| R6 | Access Approver (Data Owner) | Authorizes CUI access; approval workflow only | `MAC-Vault-DataOwners` | n/a | Approval workflow inside ticketing / Trust Codex; no AD rights of any kind |
| R7 | Backup Operator | Scheduled backup and restore, media handling | `MAC-Vault-Backup` | Tier 2 | Built-in Backup Operators on backup hosts only; not granted on Vault hosts; cannot read CUI in clear |
| R8 | CUI Custodian | CUI ingest, classification, release inside Vault applications | `MAC-Vault-Custodians` | n/a | Application-layer RBAC inside Vault apps; no OS logon rights to Vault servers |
| R9 | Change Manager / CCB | Approves changes pre-implementation | `MAC-Vault-CCB` | n/a | Ticketing approver role; no production access |
| R10 | Incident Responder | Containment, forensics during declared incidents | `MAC-Vault-IR` | Tier 1 (JIT only) | Break-glass via PIM activation with MFA, time-boxed; activity forwarded to independent SIEM; post-incident review required |

---

## 4. Conflict Matrix

The matrix lists the combination of roles a single identity may or may not simultaneously hold. The matrix is symmetric: the cell at row R*x*, column R*y* is identical to row R*y*, column R*x*.

**Legend:**

- **P — Prohibited.** A single identity must never hold both roles. Preventive controls (deny-logon GPOs, group-exclusion rules, application RBAC enforcement) block the combination; detective controls flag any drift.
- **C — Compensating controls required.** The combination is allowed only with documented compensating controls — at minimum, dual control on sensitive actions, enhanced logging, and quarterly peer review. The compensating control catalog (§6) specifies the requirement per C-cell pair.
- **A — Allowed.** The combination is permitted without additional controls.

|       | R1 SA | R2 Sec | R3 AuA | R4 Aud | R5 Id | R6 Apv | R7 Bkp | R8 Cus | R9 Chg | R10 IR |
|-------|:-----:|:------:|:------:|:------:|:-----:|:------:|:------:|:------:|:------:|:------:|
| **R1 SA**  | — | C | P | P | C | P | C | P | P | C |
| **R2 Sec** | C | — | P | P | C | P | A | P | P | C |
| **R3 AuA** | P | P | — | C | P | A | A | A | A | P |
| **R4 Aud** | P | P | C | — | P | A | A | A | A | P |
| **R5 Id**  | C | C | P | P | — | P | A | C | A | A |
| **R6 Apv** | P | P | A | A | P | — | A | C | A | A |
| **R7 Bkp** | C | A | A | A | A | A | — | A | A | A |
| **R8 Cus** | P | P | A | A | C | C | A | — | A | A |
| **R9 Chg** | P | P | A | A | A | A | A | A | — | A |
| **R10 IR** | C | C | P | P | A | A | A | A | A | — |

---

## 5. Enforcement Architecture

Enforcement is layered. No single mechanism is solely relied upon for any P-cell.

### 5.1 Microsoft tiered admin model

- **Tier 0** (R2, R3) — forest-level identity and security stores; isolated administrative workstations; no down-tier credential exposure permitted.
- **Tier 1** (R1, R5, R10) — Vault server administration; PAWs required; PIM-mediated activation only.
- **Tier 2** (R7) — backup hosts only; cannot pivot to Vault hosts.
- Tier crossings are blocked by Authentication Policy Silos and Protected Users group membership.

### 5.2 Just-Enough-Administration (JEA)

R1 administrative access to Vault servers is exposed exclusively through JEA endpoints with role capability files signed by R2. Direct PowerShell remoting outside of JEA is denied by GPO and WDAC policy. JEA session transcripts forward to the independent audit collector (R3's domain).

### 5.3 PIM / PAM elevation

- Eligible-vs-active separation: R1, R5, R10 hold no standing privileges; activation requires MFA, business justification, and time-boxing (R1/R5 max 8 hours; R10 max 4 hours per incident).
- Approval chain: R10 activation requires R2 approval (or R9 if R2 unavailable); R1 and R5 self-activate with MFA and audit-only post-hoc review.
- All activations logged to Entra audit log and mirrored to the independent SIEM under R3's control.

### 5.4 GPO logon-right enforcement

Group Policy "Deny logon" entries explicitly block prohibited combinations:

- Members of `MAC-Vault-Auditors` (R4) are listed in **Deny logon locally** and **Deny logon as a service** on Vault hosts.
- Members of `MAC-Vault-AuditAdmins` (R3) are listed in **Deny logon locally** on Vault hosts (their span is the audit collector only).
- Members of `MAC-Vault-Custodians` (R8) are listed in **Deny logon locally** and **Deny logon via RDP** on Vault hosts; their access is exclusively application-layer.
- Members of `MAC-Vault-DataOwners` (R6), `MAC-Vault-CCB` (R9) have no OS logon rights to Vault hosts at any tier.

### 5.5 Windows Event Forwarding (WEF) to independent collector

A WEF subscription, configured by R3, captures privileged-action events from all Vault hosts (admin logon, group membership change, GPO modification, WDAC policy change, scheduled task creation, PowerShell module logging, JEA transcript creation). The collector VM is in R3's span of control and not modifiable by R1 or R2. Storage is configured as write-once via Azure Storage immutability policy.

### 5.6 WDAC / AppLocker

WDAC code-integrity policies are authored and signed by R2 exclusively. R1 cannot author or modify code-integrity policies. Policy enforcement is verified post-deployment by R3 via WEF event 3076/3077.

### 5.7 Application-layer RBAC (Vault apps and Trust Codex)

R8 (Custodians) and R6 (Approvers) operate exclusively inside Vault application UIs and the Trust Codex compliance plane. Their identities have no OS-level logon rights on Vault hosts. Application RBAC inside each app enforces role-conflict rules consistent with this matrix (e.g., the same identity cannot both submit and approve an access request).

### 5.8 Service principals and managed identities

Service principals operating the Vault are mapped to the R-role appropriate to their function (typically R1, R3, or R8) and are subject to the same matrix. The provisioning workflow (§7) inspects service-principal directory roles against the matrix on every assignment change.

---

## 6. Compensating Controls Catalog (C-cells)

Each C-cell in §4 references the compensating controls required for that combination. Compensating controls must be documented, approved by the CISO or designated AO, reviewed quarterly, and re-evaluated on any role or architectural change.

| Pair | Combination | Minimum compensating control set |
|------|-------------|----------------------------------|
| R1 ∩ R2 | SA + Sec | Dual-control change tickets for all GPO and WDAC modifications; R3 reviews change diff before deploy; enhanced session logging on PAW |
| R1 ∩ R5 | SA + Id | Dual control on privileged-group additions; separate approval chain (R2 or R9) for any AD privileged group change; enhanced WEF logging on identity events |
| R1 ∩ R7 | SA + Bkp | Backup operations restricted to backup hosts only; no SA tooling on backup hosts; restore operations require dual control with R5 or R9 |
| R1 ∩ R10 | SA + IR | R10 PIM activation requires R2 approval (cannot be self-approved by an SA holder); incident-only timeboxing; mandatory post-incident SoD review for any R1/R10-combined identity |
| R2 ∩ R5 | Sec + Id | Dual control on Tier 0 group changes; identity changes touching `MAC-Vault-SecAdmins` require R9 (CCB) sign-off; enhanced Entra audit alerts on the combined identity |
| R2 ∩ R10 | Sec + IR | R10 activation by a Sec-role holder requires R9 (CCB) approval; standing review of all incident actions by an independent R3-domain auditor |
| R3 ∩ R4 | AuA + Aud | Discouraged but permitted in small teams; quarterly peer review of audit configuration changes by an external reviewer; written CISO acknowledgment of the residual risk |
| R5 ∩ R8 | Id + Cus | Custodian activities by an identity that also provisions accounts must be peer-reviewed; provisioning actions for own role family prohibited |
| R6 ∩ R8 | Apv + Cus | Same identity cannot approve and process the same access request; ticket workflow enforces approver ≠ requester ≠ processor |

For every C-cell active in production, the responsible role owner produces a quarterly compensating-control attestation that lists: the identity holding the C-pair, the compensating controls in force, evidence that they were exercised in the quarter (sample tickets, log entries, peer-review notes), and any exceptions or near-misses observed.

---

## 7. Provisioning and Detective Workflows

### 7.1 Preventive (provisioning-time matrix check)

When R5 (Identity Admin) or an authorized service principal proposes adding an identity to any `MAC-Vault-*` group, the request routes through Trust Codex's provisioning API. The API loads the current matrix (this document, hash-pinned via Doc Control release), reads the identity's existing group memberships, and either:

- Approves the change if the resulting combination is **A**.
- Approves with a mandatory compensating-control attestation record if the resulting combination is **C** (link to §6 catalog).
- Rejects the change with a structured reason if the resulting combination is **P**, and writes the rejected attempt to the SoD findings register.

Preventive controls **fail open with detective backstop**: if Trust Codex is unreachable, AD provisioning is permitted but the fail-open event is logged to the audit collector, and the detective scan (§7.2) catches any resulting prohibited combination within the next scan cycle. The fail-open SLA on detective remediation is **4 hours** for P-cells and **24 hours** for C-cells.

### 7.2 Detective (continuous scan)

A scheduled job inside Trust Codex (running at minimum every 6 hours, on-change-triggered ideally) ingests an export of all `MAC-Vault-*` group memberships and Entra PIM eligible/active role assignments. The exporter runs in the Vault enclave under an R3-domain service principal and produces a signed JSON artifact. Trust Codex evaluates each identity's role set against the matrix and writes:

- One open `sod_finding` record per identity holding a Prohibited combination, with severity = high.
- One open `sod_finding` record per identity holding a Compensating combination without a current quarterly attestation, with severity = medium.
- One `sod_matrix_review` register entry per scan cycle (success or failure) — the operational evidence of continuous matrix monitoring.

Each `sod_finding` requires disposition: **Remediate** (provisioning is reversed), **Justify** (a `sod_exception_approved` record is created and signed), or **Accept Risk** (CISO sign-off with date-bounded review). Aged findings escalate to the CISO.

### 7.3 Quarterly attestation

At the end of each quarter, Trust Codex opens an attestation in the responsible role owner's queue. The attestation lists every R-role in scope, the identities currently holding it, any open C-pair compensating-control records, any unresolved findings, and the cumulative count of P-rejections from the preventive workflow. The role owner signs the attestation in Trust Codex; the signed record is mirrored to the QMS as a controlled record and pinned in the `sod_matrix` register with `entry_type = sod_matrix_review`.

---

## 8. Cross-Walks

### 8.1 To AC.L2-3.1.5 (Least Privilege)

This matrix supports least privilege by constraining the duty set an identity may hold. R1, R5, and R10 each rely on PIM eligible-vs-active separation, which is also the primary technical evidence for 3.1.5. Trust Codex SCTM detail for 3.1.5 references this document via cross-walk.

### 8.2 To AU.L2-3.3.1 (Auditable Events)

R3's audit collector is the independent sink for the privileged-action events catalogued in §5.5. The events captured in support of 3.1.4 enforcement also satisfy 3.3.1's auditable-events requirement. The WEF subscription manifest is mirrored in the `audit_log_review` register for joint evidence.

### 8.3 To CM.L2-3.4.x (Change Management)

R9 (CCB) approves Vault changes pre-implementation. Changes that affect group structure, PIM definitions, JEA endpoints, or WDAC policies require CCB approval per change-management procedure and create reciprocal entries in this matrix's evidence trail.

---

## 9. Related Documents

- **Separation of Duties Policy (parent)** — `MAC-POL-235_Separation_of_Duties_Policy.md`. Workflow-level authority for personnel SoD across all MacTech operations; this appendix narrows to the Windows Server 2025 enclave.
- **Access Control Policy** — `MAC-POL-210_Access_Control_Policy.md` (§8.1 references this appendix alongside MAC-POL-235).
- **Identification and Authentication Policy** — `MAC-POL-211_Identification_and_Authentication_Policy.md`.
- **Audit and Accountability Policy** — `MAC-POL-218_Audit_and_Accountability_Policy.md`.
- **User Account Provisioning Procedure** — `MAC-SOP-221_User_Account_Provisioning_and_Deprovisioning_Procedure.md` (provisioning intake feeds §7.1).
- **Account Lifecycle Enforcement** — `MAC-SOP-222_Account_Lifecycle_Enforcement_Procedure.md`.
- **Audit Log Review Procedure** — `MAC-SOP-226_Audit_Log_Review_Procedure.md`.
- **System Security Plan** — `../01-system-scope/MAC-IT-304_System_Security_Plan.md` (Section 3.1.4 narrative).
- **POA&M Tracking Log** — `../04-self-assessment/MAC-AUD-405_POA&M_Tracking_Log.md`.

---

## 10. Roles and Responsibilities (this document)

- **Document owner (CISO):** Maintains this matrix; signs every revision; reviews quarterly attestations.
- **R2 Security Administrator:** Operationalizes enforcement (§5); authors and signs GPO/WDAC supporting policies.
- **R3 Audit Administrator:** Operationalizes detective scanning and WEF subscription targeting privileged-action events.
- **R5 Identity Administrator:** Submits provisioning changes through the §7.1 workflow.
- **Trust Codex (system):** Holds the hash-pinned copy of this matrix; runs preventive and detective workflows; opens quarterly attestations.
- **Compliance / ISSM:** Counter-signs the quarterly attestation; reviews finding-disposition log; consumes evidence for CMMC assessment.

---

## 11. Approval

This matrix is approved for use within the MacTech CUI Vault.

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Authorizing Official / CISO | _________________________ | _________________________ | __________ |
| Document Owner | _________________________ | _________________________ | __________ |
| System Security Officer (ISSM) | _________________________ | _________________________ | __________ |

---

## Signature & evidence record (enclave deployment)

Approval record is maintained via the Trust Codex Doc Control workflow. On release, Quality Doc Control signs over the canonical bytes of this document and produces a manifest entry consumed by Trust Codex; the manifest carries the document number (`MAC-SOP-235`), the released version (`2.0`), the release date, and the SHA-256 hash. Trust Codex records the release as a `sod_matrix_review` register entry with `entry_type = sod_matrix_review`, status `final`, and reviewer attributed to Quality Doc Control (QMS-attested).

**What counts as the approval record** is the QMS-signed manifest entry plus the per-document sign-off artifact written under `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-235-signoff.{json,md}`, which includes:

- attestor identity (name/title/org)
- timestamp (UTC)
- **document SHA-256 hash** (the exact version reviewed)
- **stored record location** (where the sign-off record is retained)

**Expected location (written by the manual app):**

- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-235-signoff.json`
- `C:\evidence\CUI-Doc-Signoff-<RunId>\MAC-SOP-235-signoff.md`
