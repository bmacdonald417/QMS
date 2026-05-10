# External System Connections & ISA Policy - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-05-10  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2 §3.1.20; NIST SP 800-171 Rev. 3 §3.12.5; NIST SP 800-47 Rev. 1 (Information Exchange Security Agreements)

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system) — MacTech CUI Enclave (single Windows VM hosted in Microsoft Azure IaaS)

---

## 1. Policy Statement

MacTech Solutions identifies, authorizes, controls, and limits every connection between the **MacTech CUI Enclave** and any external system. Every information exchange with a system outside the CUI Enclave's authorization boundary is governed by a written agreement — an Interconnection Security Agreement (ISA), Memorandum of Understanding (MOU), or Memorandum of Agreement (MOA) — that defines the data types exchanged, the security controls each side commits to maintain, the agreement's effective and expiration dates, and the named signatories on both sides. No exchange of CUI with an external system occurs without (a) an executed agreement and (b) sign-off by the MacTech Authorizing Official (AO) and Information System Security Officer (ISSO).

This policy is the governance wrapper for the operational `external_system_connections` register. The register holds the per-connection rows (one row per active or historical interconnection); this policy is the authoritative document that names the register, mandates its use, and defines the workflow that produces, reviews, and retires its entries.

This policy aligns with:

- **NIST SP 800-171 Rev. 2 §3.1.20** — "Verify and control/limit connections to and use of external systems." (CMMC L2 practice **AC.L2-3.1.20** per the v2.13 Assessment Guide.)
- **NIST SP 800-171 Rev. 3 §3.12.5** — "Information Exchange." Manage information exchanges using ISAs, IXSAs, MOUs/MOAs, SLAs, user agreements, NDAs, or organization-defined agreement types. Forward-looking alignment for CMMC's transition to Rev. 3.
- **NIST SP 800-47 Rev. 1** — *Managing the Security of Information Exchanges* (the canonical reference for ISA/IXSA structure, lifecycle, and signatory roles).
- **FAR 52.204-21 (b)(1)(iii)** — limit access to authorized users and authenticated processes; cited as a key reference for AC.L2-3.1.20.

---

## 2. Scope

This policy applies to:

- All connections from external systems INTO the MacTech CUI Enclave (Azure IaaS Windows VM).
- All connections FROM the CUI Enclave OUT to external systems (federal customer portals, Microsoft Azure platform services consumed by the enclave, contracted assessor uplinks, etc.).
- All exchanges of CUI between the CUI Enclave and any external system, regardless of direction or transport.
- All exchanges of FCI with external systems where the FCI is contractually scoped under DFARS 252.204-7012, FAR 52.204-21, or any successor clause.
- All MacTech personnel, contractors, and supplier representatives who initiate, operate, or authorize an external connection.

**System Scope:** The CUI Enclave is a **single Windows VM hosted in Microsoft Azure IaaS** (see `MAC-IT-306_CUI_Vault_Architecture_Diagram.md` and `MAC-SEC-312_Inherited_Control_Statement_Azure_Infrastructure_and_Physical_Security.md`). All CUI bytes are stored, processed, and transmitted only within the enclave VM. Every system outside that enclave VM — including MacTech's own non-CUI systems, the customer's federal systems, third-party services, and the Microsoft Azure management plane components MacTech consumes — is treated as **external** for the purposes of this policy. The Azure platform itself is governed by the inherited / shared-responsibility statement at `MAC-SEC-312`; this policy covers the connection-level governance that sits on top of that inheritance.

**Out of scope:** Internal communications fully contained within the CUI Enclave VM, supplier security posture for the Azure platform itself (covered by `MAC-SEC-312` and supplier provisions in `MAC-POL-217_Ongoing_Stakeholder_Requirements.md`), and intra-MacTech administrative communications that do not touch CUI and remain outside the CUI Enclave authorization boundary.

---

## 3. Definitions

| Term | Definition |
|---|---|
| **External system** | Any system or component for which MacTech does not have direct supervision over the application of security requirements and controls. Per NIST 800-171 Rev. 2 §3.1.20 discussion, "external" can also include MacTech-owned systems outside the CUI Enclave authorization boundary. |
| **Information exchange** | The transmission of CUI or FCI between the CUI Enclave and any external system, in either direction, by any transport (HTTPS API, signed URL, SFTP, email-with-attachment, manual upload, etc.). |
| **Interconnection Security Agreement (ISA)** | A written agreement governing a system-to-system network interconnection that exchanges CUI. Per NIST SP 800-47 Rev. 1, includes technical specifications and security commitments from both organizations. |
| **Information Exchange Security Agreement (IXSA)** | The Rev. 3 successor term for ISA when used in a NIST 800-171 Rev. 3 context. This policy treats ISA and IXSA as synonymous; the template at §5 satisfies both. |
| **MOU / MOA** | Memorandum of Understanding / Memorandum of Agreement. Used for higher-level governance commitments between organizations that may include but are not limited to system interconnections. |
| **Authorizing Official (AO)** | The MacTech executive (today: the President or designee documented in `MAC-IT-304_System_Security_Plan.md`) accountable for authorizing the CUI Enclave to operate and for accepting residual risk on behalf of MacTech for any external connection. |
| **Information System Security Officer (ISSO)** | The MacTech security role accountable for maintaining the security posture of the CUI Enclave day-to-day; the technical reviewer of every external connection request. |
| **`external_system_connections` register** | The operational record (database table or controlled spreadsheet — see §4.4) holding one row per current or historical external connection, with pointers to the executed ISA / MOU / MOA artifact. |

---

## 4. Authorization Workflow

### 4.1 Pre-connection requirements (gate at the start of every new connection)

Before any data exchange with a new external system is permitted, the following must be true:

1. The requested connection is identified in writing (initial request ticket), naming the external organization, the system at each end, the data types in scope, the business purpose, and the requester.
2. A draft ISA / MOU / MOA (per the §5 template) exists with both organizations' inputs captured.
3. The ISSO has performed a technical review covering: data sensitivity classification, transport mechanism + encryption posture (TLS 1.3 minimum for CUI in transit), authentication mechanism on each side, network controls required (firewall allow-list rules, DNS, certificate pinning where applicable), and logging / audit coverage at the connection boundary.
4. The Authorizing Official has reviewed the residual risk and signed off in writing on the executed agreement.
5. A row exists in the `external_system_connections` register (status = `pending_activation`) capturing the agreement's identifiers (organization, system, ISA/MOU id, effective date, expiry date, controls each side commits to, signatories).

A connection cannot be activated (firewall opened, DNS resolved, credentials issued, or any data exchanged) until all five gates are true. The ISSO operates the activation; the AO does not.

### 4.2 Sign-off authority

| Sign-off | Role | What it certifies |
|---|---|---|
| Technical sign-off | **ISSO** | The connection has been technically reviewed; the ISA reflects the as-implemented controls; the technical implementation matches what the ISA documents. |
| Authorization sign-off | **Authorizing Official** | MacTech accepts the residual risk of the connection; the connection is authorized to operate within the MacTech CUI Enclave authorization boundary; the agreement is binding on MacTech. |

Both sign-offs are **mandatory**, in this order, before activation. SoD is enforced: the ISSO and the AO must be different individuals; neither may also be the requester or the operational maintainer of the external system at MacTech.

If the external connection is to **another federal customer system** (e.g., a federal contracting officer's portal that ingests deliverables from the enclave), the AO sign-off acknowledges that MacTech has accepted the customer's stated controls and that the customer has formally authorized MacTech as a connecting party. Where the customer requires its own AO concurrence, the executed agreement carries both AOs' signatures.

### 4.3 ISA authoring process

ISAs are authored using the §5 template. The MacTech-side fields are populated by the ISSO in coordination with the requester and the AO. The external organization's fields are populated by their security/AO equivalents. Drafts iterate over signed email or shared encrypted workspace until both sides agree; the executed copy carries wet or 21 CFR Part 11–compliant electronic signatures from both AOs and is preserved as a controlled record (see §10).

### 4.4 Operational evidence — `external_system_connections` register

The authoritative operational view of "which external systems is the CUI Enclave currently connected to?" lives in the **`external_system_connections` register**. The register is implemented as a database table inside the QMS (preferred) or, as an interim fallback during initial population, a controlled spreadsheet in the MacTech document control system referenced from this policy. Each row carries:

| Column | Meaning |
|---|---|
| `connection_id` | Stable identifier (e.g. `EXTCONN-001`) |
| `external_organization` | Counterparty organization legal name |
| `external_system_name` | Counterparty system name + version where relevant |
| `direction` | `inbound`, `outbound`, or `bidirectional` |
| `data_types` | CUI subcategory codes (per E.O. 13556 Registry) and/or FCI scope |
| `transport` | TLS 1.3 HTTPS, SFTP, signed-URL retrieval, etc. |
| `mactech_controls_committed` | Free text: what MacTech has committed to in the ISA |
| `external_controls_committed` | Free text: what the counterparty has committed to in the ISA |
| `isa_artifact_ref` | Document control identifier of the executed ISA / MOU / MOA |
| `effective_date` | When the agreement took effect |
| `expiry_date` | Scheduled review/renewal date (≤ 12 months from effective_date — see §6) |
| `next_review_due` | Soft-due date for the annual review (typically 60 days before `expiry_date`) |
| `status` | `pending_activation`, `active`, `under_review`, `renewing`, `expired`, `terminated` |
| `isso_signoff_at` / `isso_signoff_by` | Technical sign-off timestamp + user |
| `ao_signoff_at` / `ao_signoff_by` | Authorization sign-off timestamp + user |
| `terminated_at` / `terminated_reason` / `terminated_by` | Populated on termination per §7 |

The register is the single source of truth for "which external connections are currently authorized and active." It is the artifact the ISSO presents to a C3PAO during assessment of AC.L2-3.1.20.

This policy does NOT define the register's storage technology — it mandates the data model and the workflow that populates and maintains the register. The register implementation is owned by the QMS and may evolve (e.g. moved from spreadsheet to typed table) without revising this policy, provided the data model and workflow remain intact.

---

## 5. ISA / MOU / MOA Template

Every information exchange covered by this policy uses an executed agreement built from the following template. Sections marked `[mandatory]` are required for every agreement; sections marked `[as applicable]` are populated when relevant to the connection type.

### 5.1 Identification — `[mandatory]`

- Agreement title (e.g. "Interconnection Security Agreement between MacTech Solutions and {Counterparty}")
- Agreement identifier (issued by MacTech document control, e.g. `ISA-2026-001`)
- Effective date
- Expiration date (≤ 12 months from effective date — see §6)
- Agreement type (ISA / IXSA / MOU / MOA)
- Cross-reference to `external_system_connections` register row

### 5.2 Parties — `[mandatory]`

- MacTech Solutions, LLC. — system: MacTech CUI Enclave (Azure IaaS Windows VM)
- Counterparty organization legal name
- Counterparty system name and version
- Counterparty hosting environment if known (FedRAMP Authorized? GovCloud? On-prem? Other?)

### 5.3 Purpose and scope — `[mandatory]`

- Business purpose of the exchange (one paragraph)
- Description of data flowing in each direction
- Data types and sensitivity classification: CUI subcategories per E.O. 13556 Registry and/or FCI scope
- Volume and frequency expectations (e.g. "≤ 50 deliverable PDFs per quarter")
- Non-CUI data flows that share the connection, if any

### 5.4 Technical specifications — `[mandatory]`

- Endpoint description: hostnames, ports, protocols
- Transport security: cryptographic protocol (TLS 1.3 minimum for CUI), cipher suites, certificate authority
- Authentication mechanism: mTLS, OAuth, API key + IP allow-list, etc.
- Authorization model on each side
- Network controls: firewall rules (source IP ranges + destination ports), DNS records, intrusion detection signatures
- Logging and audit: which logs are kept on each side, retention, who can request access during incident response

### 5.5 Security controls each side commits to maintain — `[mandatory]`

- MacTech-side controls: list relevant NIST SP 800-171 Rev. 2 control IDs MacTech commits to maintain for this connection (typically AC, IA, AU, SC family)
- Counterparty controls: list the counterparty's stated security framework (FedRAMP Mod / FedRAMP High / NIST 800-171 / ISO 27001 / etc.) and any specific control commitments
- For each side, the artifact reference (e.g. SSP, ATO letter, FedRAMP Authorization listing, SOC 2 Type II report, ISO certificate) supporting the commitment

### 5.6 Incident response coordination — `[mandatory]`

- Notification window for security incidents affecting the connection (e.g. ≤ 8 hours from detection)
- Each party's incident contact (role + email)
- Reference to MacTech incident response policy (`MAC-POL-215_Incident_Response_Policy.md`)
- Joint exercise cadence (if applicable)

### 5.7 Periodic review and termination — `[mandatory]`

- Annual review cadence (per §6 of this policy)
- Conditions that trigger early review (per §6.2)
- Termination procedure (per §7) and minimum notice window for unilateral termination
- Disposition of CUI in transit at the time of termination

### 5.8 Signatories — `[mandatory]`

| Role | Name | Title | Signature | Date |
|---|---|---|---|---|
| MacTech Authorizing Official | | | | |
| MacTech ISSO | | | | |
| Counterparty Authorizing Official (or equivalent) | | | | |
| Counterparty technical lead (or equivalent) | | | | |

Both MacTech signatures are mandatory. Counterparty signatures are mandatory unless the connection is to a federal customer system where the customer's authorizing instrument (e.g. a contract clause or signed connection-authorization letter) is recorded as a substitute and referenced under §5.10.

### 5.9 Data handling on agreement expiry — `[mandatory]`

- What happens to CUI in transit at the moment of expiry
- Whether the counterparty must purge MacTech-originated CUI (and within what window)
- Whether MacTech must purge counterparty-originated CUI

### 5.10 Supporting documents — `[as applicable]`

- Counterparty's Authorization to Operate (ATO) letter or FedRAMP Authorization listing
- Counterparty's most recent SOC 2 Type II or equivalent assessment
- Federal contract clause that authorizes the exchange (if applicable)
- Diagrams illustrating the connection topology

---

## 6. Periodic Review and Renewal

### 6.1 Annual cadence

Every active row in the `external_system_connections` register is reviewed at minimum annually. The `next_review_due` field is set to 60 days before `expiry_date` so the ISSO has a full review window without lapsing the agreement.

### 6.2 Trigger events for early review

In addition to the annual cycle, an active connection is reviewed early when any of the following occurs:

- A material change to either side's security posture (ATO revoked, FedRAMP status change, SOC 2 Type II finding, breach disclosure, etc.).
- A change to the data types or volume flowing across the connection (new CUI subcategory introduced, scope expansion, etc.).
- A change to the technical specifications (new endpoint, cipher suite deprecation, authentication mechanism change).
- A change to either signatory role (new AO or new ISSO on either side; the new AO's concurrence is required for the existing agreement to remain in force).
- Discovery of a security incident affecting the connection on either side.

### 6.3 Review procedure

The ISSO conducts the review using a checklist that covers, at minimum:

1. Counterparty security posture is unchanged (or, if changed, materially equivalent or better than at last review).
2. Technical specifications still match what the ISA documents.
3. Logs from the connection over the prior period show no anomalous activity.
4. Data volume and type are within ISA-stated bounds.
5. Both signatories on each side are still in their roles (or successor agreements are in place).

The review is recorded as a history event on the `external_system_connections` register row with the ISSO's signed-off determination: `current_for_renewal`, `renew_with_changes`, or `do_not_renew`. A `renew_with_changes` outcome triggers a new ISA cycle (§4 + §5); a `do_not_renew` outcome triggers termination (§7).

The AO countersigns each annual renewal. Renewal sign-off uses the same authorization workflow as initial activation (§4.2).

---

## 7. Termination Procedure

### 7.1 Triggers for termination

A connection is terminated when:

- The agreement reaches its expiry date and the renewal review (§6) returns `do_not_renew`.
- Either party gives notice per the ISA's termination clause.
- A security incident makes continued operation unacceptable (the ISSO may suspend access immediately; AO sign-off is required to convert suspension to termination).
- The business purpose ends (contract complete, project closed, counterparty system retired, etc.).

### 7.2 Termination steps

The ISSO executes the following sequence for every termination, in order:

1. **Notify the counterparty** in writing per the ISA's termination clause.
2. **Drain in-flight exchanges** if a graceful drain is possible and the termination is not security-driven; otherwise hard-stop.
3. **Remove network controls** at the boundary:
   - Firewall: remove allow-list entries for the counterparty's source/destination IP ranges.
   - DNS: remove counterparty-specific DNS records the enclave was relying on.
   - VPN / mTLS: revoke certificates issued to the counterparty; revoke MacTech credentials issued for the connection.
   - API gateway: revoke API keys and OAuth client credentials.
4. **Disposition of CUI** per ISA §5.9: confirm counterparty has purged MacTech-originated CUI within the agreed window; confirm MacTech has purged counterparty-originated CUI.
5. **Archive the register row**: set `status = terminated`, populate `terminated_at`, `terminated_by`, `terminated_reason`. The row is NOT deleted — termination preserves the historical record for audit. The `isa_artifact_ref` continues to point at the executed ISA, which is retained per the records retention policy (see §10).
6. **Document control update**: the executed ISA artifact is moved to a "retired" state in the document control system but retained for the retention period.
7. **Audit log entry**: a single audit event captures the termination with all the above evidence pointers.
8. **AO notification**: the AO is notified that the termination is complete and the connection is no longer active.

### 7.3 Verification window

Within 30 days of every termination, the ISSO verifies:

- No traffic is being exchanged with the counterparty's endpoint (firewall logs, network monitoring).
- No MacTech-issued credentials for the connection remain valid.
- The counterparty has confirmed in writing that MacTech-originated CUI has been purged per §5.9.

The verification record is appended to the register row.

---

## 8. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **Authorizing Official (AO)** | Final sign-off on all new ISAs and renewals. Accepts residual risk on behalf of MacTech. Reviews termination decisions where security-driven. |
| **ISSO** | Technical review of every connection request. Authors the MacTech side of the ISA. Operates the activation, periodic review, and termination workflows. Owns the `external_system_connections` register day-to-day. SoD: cannot also be the requester or the operational maintainer of the counterparty system at MacTech. |
| **Connection Requester** | Files the initial request describing the business purpose, counterparty, and data types. Provides counterparty contact information. SoD: cannot also be the ISSO or AO for the same connection. |
| **Operational maintainer** | The MacTech individual responsible for the day-to-day operation of MacTech's side of the connection (e.g. the platform engineer who maintains the firewall rule). SoD: cannot also be the ISSO or AO for the same connection; may be the same person as the requester. |
| **Counterparty AO and security lead** | Co-signatories on the ISA. Notify MacTech of changes to their side per §6.2. |
| **Quality Manager** | Owns the records retention compliance for executed ISAs (per §10). |

---

## 9. Inherited and Shared Responsibility (Microsoft Azure)

The MacTech CUI Enclave runs as a single Windows VM on **Microsoft Azure IaaS** (see `MAC-SEC-312_Inherited_Control_Statement_Azure_Infrastructure_and_Physical_Security.md`). For external connections that traverse the Azure platform between the enclave VM and an external system, responsibility is split as follows:

| Concern | Inherited from Azure | Shared | MacTech-only |
|---|---|---|---|
| Physical security of the Azure datacenter | ✓ |  |  |
| Hypervisor isolation between tenants | ✓ |  |  |
| Underlying network fabric | ✓ |  |  |
| Azure platform DDoS protection at the edge | ✓ |  |  |
| Network Security Group (NSG) / Azure Firewall configuration |  | ✓ (Azure provides the capability; MacTech configures and maintains) |  |
| TLS 1.3 endpoint configuration on the enclave VM |  |  | ✓ |
| Application-level authentication (OAuth, mTLS, API keys) |  |  | ✓ |
| ISA authorship, sign-off, register population |  |  | ✓ |
| Counterparty security posture |  |  | ✓ (verified by MacTech ISSO during the §6 review) |

The Microsoft Azure shared-responsibility model authoritative reference is the [Shared Responsibility in the Cloud](https://learn.microsoft.com/en-us/azure/security/fundamentals/shared-responsibility) page; Azure Government compliance scope is documented at the [Azure Government compliance documentation](https://learn.microsoft.com/en-us/azure/azure-government/compliance/) page. MacTech does not claim to inherit the connection-level governance from Azure; that governance is MacTech's responsibility under this policy.

---

## 10. Records and Retention

| Record | Storage | Retention |
|---|---|---|
| Executed ISA / MOU / MOA artifact (PDF + signed) | MacTech document control system, controlled record | 7 years from `terminated_at`, or per the records retention policy (`MAC-POL-227_Records_Retention_Policy.md`), whichever is longer |
| `external_system_connections` register rows (incl. terminated rows — never hard-deleted) | QMS database (preferred) or controlled spreadsheet (interim) | Same as above |
| ISSO + AO sign-off audit trail (workflow history) | QMS audit log | Same as above |
| Annual review records (the §6.3 checklist outputs) | Appended to the register row's history | Same as above |
| Termination verification records (the §7.3 checks) | Appended to the register row's history | Same as above |

Retention aligns with `MAC-POL-217_Ongoing_Stakeholder_Requirements.md` and the Retention Policy table maintained in QMS (`security_policies` and `retention_policies` rows). When `MAC-POL-227_Records_Retention_Policy.md` is published, this policy defers to it for retention specifics.

---

## 11. Control Crosswalk

### 11.1 NIST SP 800-171 Rev. 2 §3.1.20 (CMMC L2 AC.L2-3.1.20)

Per the v2.13 Assessment Guide page-context, the assessment objectives [a]–[f] are satisfied as follows:

| Obj. | "Determine if…" | This policy's coverage |
|---|---|---|
| [a] | connections to external systems are identified | Every connection is recorded as a row in `external_system_connections` (§4.4); pre-connection requirement #1 in §4.1. |
| [b] | the use of external systems is identified | Same register; the register's `direction` and `data_types` columns capture inbound/outbound and data-type identification. |
| [c] | connections to external systems are verified | ISSO technical review (§4.1 #3) and annual re-review (§6.3) verify connections against the documented configuration. |
| [d] | the use of external systems is verified | Same review process; §6.3 step 4 specifically verifies data volume and type against the ISA. |
| [e] | connections to external systems are controlled/limited | Network controls (firewall allow-list, DNS, mTLS, etc.) per §5.4 enforce control; §7.2 step 3 ensures controls are removed on termination. |
| [f] | the use of external systems is controlled/limited | The ISA's specification of permitted data types, volume, and frequency (§5.3) limits use; the ISSO monitors per §6.3 step 3. |

### 11.2 NIST SP 800-171 Rev. 3 §3.12.5 (Information Exchange)

The Rev. 3 control's selection menu (ISAs, IXSAs, MOUs/MOAs, SLAs, user agreements, NDAs, organization-defined types) is satisfied by this policy's §5 template (which covers ISA/IXSA/MOU/MOA in a single unified document) plus the supplier provisions in `MAC-POL-217_Ongoing_Stakeholder_Requirements.md` (which covers SLAs and supplier NDAs). Where a connection requires a user-level NDA in addition to the system-level ISA, the NDA is referenced under §5.10 and stored alongside the ISA artifact.

---

## 12. References

- NIST SP 800-171 Rev. 2 §3.1.20 (External Connections [CUI Data])
- NIST SP 800-171 Rev. 3 §3.12.5 (Information Exchange)
- NIST SP 800-171A §3.1.20 (Assessment objectives [a]–[f])
- NIST SP 800-47 Rev. 1 — *Managing the Security of Information Exchanges*
- CMMC Assessment Guide — Level 2 Version 2.13 (AC.L2-3.1.20 page context)
- FAR 52.204-21 (b)(1)(iii)
- DFARS 252.204-7012
- E.O. 13556 — Controlled Unclassified Information (CUI Registry)
- `MAC-IT-304_System_Security_Plan.md`
- `MAC-IT-105_System_Boundary.md`
- `MAC-IT-305_CUI_Data_Flow_Diagram.md`
- `MAC-IT-306_CUI_Vault_Architecture_Diagram.md`
- `MAC-SEC-302_FCI_and_CUI_Scope_and_Data_Boundary_Statement.md`
- `MAC-SEC-312_Inherited_Control_Statement_Azure_Infrastructure_and_Physical_Security.md`
- `MAC-POL-210_Access_Control_Policy.md`
- `MAC-POL-215_Incident_Response_Policy.md`
- `MAC-POL-217_Ongoing_Stakeholder_Requirements.md`
- `MAC-POL-225_System_and_Communications_Protection_Policy.md`
- `MAC-POL-227_Records_Retention_Policy.md` (planned, referenced by `MAC-SEC-312`)
- Microsoft Azure shared responsibility model: https://learn.microsoft.com/en-us/azure/security/fundamentals/shared-responsibility
- Microsoft Azure Government compliance: https://learn.microsoft.com/en-us/azure/azure-government/compliance/

---

## 13. Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-05-10 | Patrick Caruso | Initial release. Establishes external-system connection governance and ISA/MOU/MOA workflow for the MacTech CUI Enclave. Maps to AC.L2-3.1.20 (Rev. 2) and §3.12.5 (Rev. 3 forward-looking). Names the `external_system_connections` operational register that holds per-connection rows. |
