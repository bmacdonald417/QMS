# Procedures for User vs. System Management Functionality - CMMC Level 2

**Document Version:** 1.1  
**Date:** 2026-05-11  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system) — MacTech CUI Enclave on Microsoft Azure Government.

---

## 1. Purpose

This procedure addresses **CMMC L2 SC.L2-3.13.3** (Separate user functionality from system management functionality). It defines how user functionality is separated from system management (administrative) functionality within the MacTech CUI enclave, using account-level separation, role-based access control, and (where feasible) distinct management paths.

Personnel separation of duties — i.e., the policy preventing the same person from acting as requester, implementer, and approver across workflows — is governed separately under `MAC-POL-235_Separation_of_Duties_Policy.md` and is **not** within the scope of this procedure. This procedure is purely the technical mechanism that enforces the user-vs-administrator distinction on the system.

It applies only to the boundary in System Boundary and Scope (MAC-IT-105 / MAC-IT-105_System_Boundary): Microsoft Azure Government and the Windows VM(s), with user access via Entra ID, VPN, and MFA.

---

## 2. Scope

**In scope:**

- Distinction between (1) standard user accounts and access used for normal CUI work on the Windows VM(s), and (2) administrative accounts and access used to manage the VM(s) and Azure subscription.
- Use of separate accounts, roles, and (where applicable) jump/bastion or dedicated management paths.

**Out of scope:**

- Personnel separation-of-duties policy (see MAC-POL-235).
- Systems and workstations outside the Azure Government subscription.

---

## 3. Prerequisites

- Azure role assignments and Windows local/domain groups defined for user vs. administrator roles.
- Entra ID (Azure AD) groups and Privileged Identity Management (PIM) configuration for any just-in-time admin elevation.
- Bastion / jump-host configuration if a separate management path is in use.

---

## 4. Procedure

### 4.1 Separate administrative from user access (Azure and VM)

**Step 1: Azure subscription and resource management.**  
Use Azure role-based access control (RBAC) so that:

- **User role:** Personnel who only need to use the Windows VM for CUI work have access to connect (e.g., RDP) to the VM but do **not** have Azure roles that allow changing the VM, network, or subscription (e.g., no Contributor, no VM restart/deallocate, no NSG changes).
- **Administrator role:** Personnel who perform system management have appropriate Azure roles (e.g., Contributor or custom role) and use **separate, dedicated administrative accounts** (not the same account used for standard user work). Document the role assignments and the principle that admin and user functions use different identities.

**Step 2: Windows VM.**  
On the Windows VM(s):

- Standard users have accounts that allow logon and use of authorized applications/data but do **not** have local Administrator or other privileged group membership.
- System management (e.g., patching, configuration, user account provisioning) is performed using dedicated administrative accounts (local Administrator or designated admin accounts), **not** standard user accounts. Document how admin logon is performed (e.g., RDP with admin account, or Azure Bastion) and that it is separate from day-to-day user logon.

### 4.2 Management path (optional but recommended)

1. Where feasible, use a dedicated management path (e.g., Azure Bastion or a separate management subnet/VPN path) for administrative access to the VM(s), distinct from the path used by standard users for RDP. Document the approach (e.g., "Administrators use Azure Bastion; users use RDP over VPN").
2. If the same VPN and RDP path are used for both, separation is achieved by account and role (user vs. admin accounts and Azure RBAC), not by network path; document that and ensure account separation is enforced.

### 4.3 Review

1. **Frequency.** Review Azure RBAC and Windows VM admin/user account assignment at least annually or when personnel or roles change.
2. **Evidence.** Maintain dated summary or screenshot of role assignments and any changes.

---

## 5. Roles and Responsibilities

- **System owner / IT:** Assign Azure roles and Windows accounts; maintain separation between user and admin access; document configuration.
- **Compliance / Security:** Verify separation during assessments and ensure alignment with the Access Control Policy (MAC-POL-210) and this procedure.

The personnel-level SoD that governs *who may hold each role* (e.g., the IT admin may not also be the auditor of admin activity) is the subject of MAC-POL-235; this procedure assumes the role assignments themselves are SoD-compliant.

---

## 6. Evidence and Records

- Azure RBAC role assignment summary (or screenshot) for the subscription/VM.
- Windows VM local/domain group membership summary for admin vs. user.
- Documentation of the management path used (Azure Bastion / separate VPN subnet / shared path with account-level separation).
- **Retention:** Minimum three (3) years per Records Retention Policy.

---

## 7. Related Documents

- `MAC-IT-105_System_Boundary.md` *(in QMS bundle)*
- `MAC-POL-210_Access_Control_Policy.md` *(in QMS bundle)*
- `MAC-POL-235_Separation_of_Duties_Policy.md` *(governs personnel SoD; see §1 / §5 referenced separation of *who can hold which role*)*
- `MAC-POL-225_System_and_Communications_Protection_Policy.md` *(parent policy for the SC family controls including 3.13.3)*

---

## 8. controls_mapped

This procedure is registered against the following CMMC L2 / NIST SP 800-171 Rev. 2 controls:

```json
{ "controls_mapped": ["3.13.3"] }
```

Specifically: **SC.L2-3.13.3** (Separate user functionality from system management functionality). It does **not** claim coverage of AC.L2-3.1.4 — that's MAC-POL-235's responsibility.

---

## 11. NIST 800-171A 3.13.3 Crosswalk

The following table maps each procedure section to the corresponding NIST SP 800-171A assessment objective for 3.13.3. Assessor evidence walk should reference both the procedure step and the artifact cited in §6.

| 800-171A Objective | Statement | Procedure section | Evidence |
|---|---|---|---|
| **3.13.3 [a]** | User functionality is identified. | §4.1 Step 1 (User role definition); §4.1 Step 2 (standard users, no privileged group membership) | Azure RBAC role assignment summary; Windows VM standard-user account list |
| **3.13.3 [b]** | System management functionality is identified. | §4.1 Step 1 (Administrator role definition); §4.1 Step 2 (dedicated admin accounts for patching/configuration) | Azure RBAC role assignment summary; Windows VM admin account list |
| **3.13.3 [c]** | User functionality is separated from system management functionality. | §4.1 Step 1 (separate, dedicated admin accounts); §4.2 (distinct management path where feasible); §4.3 (annual review confirms separation) | RBAC + group membership summaries showing no overlap; documentation of management path; annual review record |

---

## 13. Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-05-07 | MacTech Compliance | Initial release. Covered both AC.L2-3.1.4 personnel SoD and SC.L2-3.13.3 technical separation. |
| 1.1 | 2026-05-11 | Patrick Caruso | **Minor revision — scope refocus.** Stripped all personnel separation-of-duties content (§3 prerequisite to MAC-SOP-235, §4.3 alignment-with-SoD-matrix, §6 evidence reference to SoD matrix) and renamed the procedure to "Procedures for User vs. System Management Functionality" to drop the "Separation of Duties" framing. Procedure now exclusively addresses CMMC SC.L2-3.13.3 (technical user/admin separation on Azure + Windows VM). Personnel SoD is governed by the new MAC-POL-235 Separation of Duties Policy. Added §11 NIST 800-171A 3.13.3 [a]–[c] crosswalk for assessor evidence walk. `controls_mapped` now `["3.13.3"]` only (was implicitly broader by virtue of the dual-scope phrasing). |
