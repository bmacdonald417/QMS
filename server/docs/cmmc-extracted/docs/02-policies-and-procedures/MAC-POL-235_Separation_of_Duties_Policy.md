# Separation of Duties Policy - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-05-11  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system) — MacTech CUI Enclave on Microsoft Azure Government.

---

## 1. Policy Statement

MacTech Solutions separates the duties of individuals to reduce the risk of malevolent activity without collusion, per **NIST SP 800-171 Rev. 2 §3.1.4 / CMMC AC.L2-3.1.4**. Specifically, MacTech:

- Identifies the workflows in scope (§4) where role separation matters.
- Names the roles involved in each workflow (requester, implementer, approver, auditor) and the explicit "may not be the same person" rules.
- Maintains an authoritative **Separation of Duties Matrix** (§5) and **Role Assignment Matrix** (§6) as operational registers, reviewed annually and on personnel/role changes.
- Identifies and prohibits **incompatible duty pairs** (§7) — pairs of duties that cannot be held by the same individual.

This policy is the personnel-level / governance complement to the technical user-vs-admin separation procedure in `MAC-SOP-243_User_vs_System_Management_Functionality.md`. Together they close the human side (this policy) and the system side (MAC-SOP-243) of the broader separation-of-duties control surface in CMMC L2.

---

## 2. Scope

**In scope:**

- All MacTech personnel (employees, contractors) who hold roles that touch any workflow listed in §4.
- All operational workflows where a single individual could otherwise act unilaterally to create, modify, approve, or audit their own work product on the CUI enclave or its supporting governance plane (QMS, Trust Codex, Risk Assessment, etc.).
- Role assignments in the SoD Matrix (§5) and Role Assignment Matrix (§6).

**Out of scope:**

- Technical user/admin separation on Azure + Windows VM (covered by MAC-SOP-243).
- Customer-side personnel SoD on external systems (covered by the counterparty's own controls per the ISA in MAC-POL-229).

---

## 3. Definitions

- **Incompatible duties:** Two activities that, if performed by the same individual, would allow that individual to circumvent a control without detection (e.g., requesting and approving a privileged access grant).
- **Separation of Duties Matrix (SoD Matrix):** A table — maintained as an operational register — that, for each in-scope workflow, lists the role(s) required to perform each step (requester, implementer, approver, auditor) and the "may not be the same person" rules between those roles.
- **Role Assignment Matrix:** A table — maintained as an operational register — listing who currently holds each named role from the SoD Matrix. Updated on hire/termination/role change.
- **Workflow:** A bounded operational sequence (e.g., "code change," "access provisioning," "risk assessment cycle") whose steps require separated participants.
- **Requester / Implementer / Approver / Auditor:** Canonical role labels used across all workflows. A given person may be a requester in one workflow and an approver in another; the constraint is **within** a single workflow instance, not across workflows.

---

## 4. Workflows in Scope

For each workflow listed below, the SoD Matrix (§5) records the per-step role requirements. The "may not be the same person" rules below apply per **instance** (one risk assessment cycle, one PR, one document release, etc.).

### 4.1 Code changes

- **Developer ≠ PR approver.** The author of a pull request may not approve their own PR. Branch protection rules enforce this in the repo.
- **Implementer ≠ post-merge auditor.** The person who merges to main may not be the same person who later reviews the change for control-effectiveness in the quarterly continuous monitoring walkthrough (see MAC-SOP-256).

### 4.2 External system connections / ISA workflow

Per MAC-POL-229 §8 (Separation of Duties for ISAs):

- **Requester ≠ ISSO (who reviews) ≠ AO (who authorizes).**
- ISA execution requires all three roles signed off; same-person collapse is prohibited.

This policy ratifies and is consistent with MAC-POL-229 §8; the matrix entry in §5 below references that table.

### 4.3 Risk Assessment cycle

Per the TrainOS risk-assessment state machine:

- **Assessor ≠ reviewer ≠ executive approver.**
- The state-machine prevents the same `user_id` from holding two of these roles in a single RA cycle.

### 4.4 QMS Doc Control

Per the consolidated CmmcGatePanel workflow on QMS Document Detail:

- **Author ≠ reviewer ≠ approver ≠ Quality Release signatory.**
- Additionally, per CMMC **CM.L2-3.4.4** (Security Impact Analysis): the **SIA recorder ≠ document author** AND **SIA recorder ≠ any reviewer who has already signed**.
- Server-side gates (`gateForRecordSIA`, `gateForApproverSign`, `gateForRelease` in `documentLifecycle.js`) enforce these constraints.

### 4.5 Privileged access activation (Entra ID PIM)

- **PIM activation requester ≠ PIM activation approver.**
- Just-in-time privileged role elevation on Azure (e.g., Global Administrator, Privileged Role Administrator) requires a second approver. Self-approval is disabled in PIM configuration.

### 4.6 System maintenance

Per MAC-SOP-238 (Maintenance Tool Control) and the forthcoming Maintenance Escort Policy:

- **Maintenance personnel ≠ ISSO who escorts.**
- An escort cannot escort themselves; the maintenance worker performing the action is distinct from the supervising / observing ISSO.

### 4.7 Access provisioning

For onboarding/offboarding and role changes:

- **HR (initiator) ≠ IT (implementer) ≠ ISSO (authorizer for privileged grants).**
- HR generates the request; IT executes the technical provisioning; ISSO authorizes any privileged or CUI-bearing access. No single person executes all three steps.

### 4.8 Audit log review

- **Reviewer ≠ subject of the events being reviewed.**
- A user's own activity in the audit log is reviewed by a different individual. For comprehensive admin coverage, audit log review of admin activity is performed by a non-admin reviewer (e.g., the Quality Manager or an independent auditor) per MAC-SOP-226.

---

## 5. Separation of Duties Matrix

The authoritative SoD Matrix is maintained as the `sod_matrix` operational register. The current snapshot is below; the register entry is the source of truth for assessor evidence.

| Workflow | Requester | Implementer | Approver | Auditor | Hard prohibitions |
|---|---|---|---|---|---|
| Code changes (§4.1) | PR author (any developer) | Developer who merges | PR reviewer (≥1 distinct from author) | Quarterly walkthrough lead (MAC-SOP-256) | Author ≠ PR reviewer; merger ≠ quarterly auditor for the same change |
| ISA / external connection (§4.2) | System owner | IT operations | ISSO (technical review) + AO (authorize) | Quality Manager | Requester ≠ ISSO ≠ AO |
| Risk Assessment cycle (§4.3) | Assessor | n/a (assessor is the implementer of the assessment artifact) | Reviewer + Executive Approver | TrainOS state-machine | Assessor ≠ reviewer ≠ executive approver |
| QMS Doc Control (§4.4) | Document author | Document author | Reviewer + Approver + Quality Release | SIA recorder | Author ≠ reviewer ≠ approver ≠ releaser; SIA recorder ≠ author + ≠ any reviewer who signed |
| Privileged access activation (§4.5) | PIM-eligible user | PIM (system) | Second approver (named per role) | Audit log review | Activation requester ≠ activation approver |
| System maintenance (§4.6) | Maintenance personnel | Maintenance personnel | ISSO (work authorization) | ISSO (escort + post-work review) | Maintenance worker ≠ escort |
| Access provisioning (§4.7) | HR | IT operations | ISSO (for privileged or CUI-bearing access) | Quality Manager (access review) | HR ≠ IT ≠ ISSO |
| Audit log review (§4.8) | Quality Manager / independent reviewer | Reviewer | Reviewer | n/a | Reviewer ≠ subject of events under review |

Updates to this matrix follow the QMS Doc Control workflow as a minor revision (v1.x → v1.x+1).

---

## 6. Role Assignment Matrix

The authoritative Role Assignment Matrix is maintained as the `role_assignment_matrix` operational register. The current snapshot below names personnel for each canonical role; the register is the source of truth and is updated on hire / termination / role change.

| Canonical role | Current holder(s) | Backup |
|---|---|---|
| Authorizing Official (AO) / CISO | *(Role Assignment Matrix register — populated per current Org chart)* | *(register)* |
| ISSO | *(register)* | *(register)* |
| Quality Manager | *(register)* | *(register)* |
| System Owner (CUI Enclave) | *(register)* | *(register)* |
| IT Operations Lead | *(register)* | *(register)* |
| HR Lead | *(register)* | *(register)* |
| PR Approvers (code) | *(register, ≥2 distinct from each developer)* | *(register)* |
| Risk Assessment Reviewer | *(register)* | *(register)* |
| Risk Assessment Executive Approver | *(register)* | *(register)* |
| PIM Approvers | *(register, per privileged role)* | *(register)* |

The register's per-person rows are the assessor-facing evidence. This document references the register; it does not name individuals inline (so role changes don't require a QMS Doc Control revision).

---

## 7. Incompatible Duty Pairs

The following duty pairs are **prohibited** from being held by the same individual in the same workflow instance. This list draws from NIST SP 800-171 Rev. 2 §3.1.4 discussion and operational practice at MacTech.

| Incompatible pair | Reason | Workflows it covers |
|---|---|---|
| **Configuration Management vs. Quality Assurance** | A person who configures cannot also test their own configuration for correctness (control bypass risk). | Change Control, system maintenance |
| **System Management (admin) vs. Programming (developer)** | An admin who can deploy may not also be the developer who authored the code being deployed without independent review. | Code changes, deployment workflows |
| **Security Administration vs. Audit Administration** | The administrator who can grant/revoke access may not also administer the logs that capture those grants/revokes. | Access provisioning, audit log review |
| **Requester vs. Approver (universal)** | Across every workflow listed in §4, the person requesting an action may not be the person approving it. | All §4 workflows |
| **SIA Recorder vs. Document Author** | Per CMMC CM.L2-3.4.4: the security impact analysis must be recorded by someone other than the author whose change is being analyzed. | QMS Doc Control |
| **SIA Recorder vs. Prior Reviewer** | Same control: the SIA must be a fresh-eyes view, not a self-confirmation by a prior reviewer. | QMS Doc Control |
| **Maintenance Worker vs. Escort** | Per CMMC MA.L2-3.7.6: an escort cannot escort themselves. | System maintenance |
| **Reviewer vs. Subject of Events** | A person cannot audit their own activity. | Audit log review |

---

## 8. Periodic Review

- **Annual review cadence.** The SoD Matrix and Role Assignment Matrix are reviewed at least annually. The Quality Manager owns the review; the AO countersigns the resulting attestation.
- **On personnel / role changes.** Any hire, termination, or role change that affects a canonical role in §6 triggers a review of the Role Assignment Matrix within 5 business days and an update to the register.
- **On workflow changes.** Adding a new workflow (e.g., a new external-system class, a new compliance system) triggers a §4 review and matrix update within 30 days of the workflow going live.
- **Review record.** Each annual review produces a dated attestation that lists: workflows reviewed, role-holders confirmed, any incompatible-duty findings detected and remediated. The attestation is stored in QMS as a controlled record, retention per Records Retention Policy.

---

## 11. NIST 800-171A 3.1.4 Crosswalk

The following table maps each policy section to the corresponding NIST SP 800-171A assessment objective for 3.1.4. Assessor evidence walk should reference both the policy text and the artifact cited (registers, signed attestations).

| 800-171A Objective | Statement | Policy section | Evidence |
|---|---|---|---|
| **3.1.4 [a]** | The duties of individuals requiring separation are defined. | §4 Workflows in Scope (8 enumerated workflows with role definitions); §7 Incompatible Duty Pairs | This policy, §4 and §7; sod_matrix register snapshot |
| **3.1.4 [b]** | Responsibilities for duties that require separation are assigned to separate individuals. | §5 Separation of Duties Matrix; §6 Role Assignment Matrix | sod_matrix register; role_assignment_matrix register; current snapshots in §5 and §6 of this policy |
| **3.1.4 [c]** | Access privileges that enable individuals to exercise the duties are granted to separate individuals. | §4 workflow-by-workflow access rules (especially §4.4 QMS gates, §4.5 PIM, §4.7 HR/IT/ISSO split); server-side enforcement in QMS `documentLifecycle.js` (`gateForRecordSIA`, `gateForApproverSign`, `gateForRelease`); TrainOS RA state-machine guards; Entra ID PIM configuration | RBAC summaries; PIM activation logs; QMS audit logs showing SoD-gate failures (when same-person attempts were rejected); annual review attestation |

---

## 12. Related Documents

- `MAC-POL-210_Access_Control_Policy.md` *(parent policy for the AC family controls including 3.1.4)*
- `MAC-POL-229_External_System_Connections_and_ISA_Policy.md` *(§8 SoD-for-ISAs table cross-referenced from §4.2)*
- `MAC-POL-225_System_and_Communications_Protection_Policy.md` *(parent for SC.L2-3.13.3 technical separation)*
- `MAC-SOP-243_User_vs_System_Management_Functionality.md` *(technical user/admin separation on Azure + VM; complement to this personnel-level policy)*
- `MAC-SOP-238_Maintenance_Tool_Control_Procedure.md` *(SoD for maintenance, §4.6)*
- `MAC-SOP-226_Audit_Log_Review_Procedure.md` *(SoD for audit log review, §4.8)*
- `MAC-SOP-256_Continuous_Control_Monitoring_Procedure.md` *(quarterly walkthrough auditor role, §4.1)*

---

## 13. Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-05-11 | Patrick Caruso | Initial release. Establishes personnel separation-of-duties policy for the MacTech CUI Enclave, complementing the technical user/admin separation in MAC-SOP-243. Maps to AC.L2-3.1.4 / NIST SP 800-171 Rev. 2 §3.1.4. Names the `sod_matrix` and `role_assignment_matrix` operational registers as the source-of-truth for assessor evidence. |
