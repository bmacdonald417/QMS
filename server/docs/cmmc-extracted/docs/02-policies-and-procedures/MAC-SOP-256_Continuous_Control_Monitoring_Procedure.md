# Continuous Control Monitoring Procedure - CMMC Level 2

**Document Version:** 1.0  
**Date:** 2026-05-07  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (Advanced)  
**Reference:** NIST SP 800-171 Rev. 2

**Applies to:** CMMC 2.0 Level 2 (FCI and CUI system)

---

## 1. Purpose

NIST SP 800-171 Rev. 2 §3.12.3 requires the organization to *"monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls."* This procedure defines how MacTech Solutions performs that ongoing monitoring as a recurring program activity, distinct from real-time log review and alerting. It closes the open POA&M item for control 3.12.3.

Specifically, this procedure governs:

- The cadence on which in-scope controls are reassessed for continued effectiveness.
- The walkthrough method by which control owners demonstrate operating effectiveness to the quality function.
- The sampling rules that define what evidence is pulled and how it is examined.
- The disposition of findings — whether closed at walkthrough, routed to CAPA, or escalated to the POA&M.

**What this procedure is not:**

- Not log review or SIEM alerting (covered by Audit & Accountability controls in family 3.3, e.g. §3.3.5).
- Not the annual or triennial external assessment (covered by §3.12.1 / §3.12.2 and the C3PAO assessment cycle).
- Not the security control implementation itself — this procedure assesses *whether the implementation still works*, not whether it exists.

This procedure supports the Security Assessment Policy (`MAC-POL-224_Security_Assessment_Policy.md`) and provides the operational mechanism for §3.12.3.

---

## 2. Scope

This procedure applies to:

- All 110 NIST SP 800-171 Rev. 2 security requirements that MacTech Solutions has determined to be in-scope for its CMMC Level 2 boundary, as enumerated in `MAC-IT-304_System_Security_Plan.md`.
- All control owners identified in MAC-IT-304 and the role mapping in `MAC-POL-210_Access_Control_Policy.md`.
- All evidence artifacts referenced by the SSP control narratives — including but not limited to: configuration exports, policy documents, signed acknowledgments, screenshots, log samples, training records, and code-level evidence cited in policy docs.
- All FCI and CUI system components in the boundary defined by `MAC-IT-105_System_Boundary.md` and `MAC-IT-305_CUI_Data_Flow_Diagram.md`.

**Out of scope:**

- Operational monitoring (log review, IDS/AV alerting, automated control checks) — covered by SI and AU family controls.
- Vendor / supplier control monitoring — covered separately under `MAC-POL-217_Ongoing_Stakeholder_Requirements.md`.

---

## 3. Roles and Responsibilities

| Role | Responsibility |
|---|---|
| **Quality Manager (program lead)** | Owns this procedure end-to-end. Plans the quarterly cycle, schedules walkthroughs, runs the disposition meeting, owns the program-level evidence package. |
| **CISO** | Signs off on each quarter's program report. Approves any control determined "ineffective." Owns escalation to the POA&M when remediation will exceed 30 days. |
| **Control Owner** | Identified per-control in MAC-IT-304. Hosts the walkthrough, produces requested evidence within sampling rules, attests to current implementation, owns any CAPA opened from findings. |
| **Internal Audit (rotating)** | Independent observer for at least 25% of walkthroughs per quarter. Cannot be the control owner for the same control. |
| **CAPA Owner (assigned at finding)** | Receives any CAPA routed from a "partially effective" finding. Standard CAPA workflow per `MAC-POL-216_System_Integrity_Policy_Reference.md` applies. |

**Separation of duties:** A control owner may not perform the walkthrough sampling for a control they own. The Quality Manager assigns walkthroughs to ensure independence.

---

## 4. Procedure

### 4.1 Cadence

The program runs on a **quarterly cycle aligned to calendar quarters** (Q1: Jan–Mar, Q2: Apr–Jun, Q3: Jul–Sep, Q4: Oct–Dec). Each quarter has a 30-day execution window opening on the first business day of the month following quarter end:

| Quarter | Execution window |
|---|---|
| Q1 walkthroughs | April 1 – April 30 |
| Q2 walkthroughs | July 1 – July 31 |
| Q3 walkthroughs | October 1 – October 31 |
| Q4 walkthroughs | January 1 – January 31 (following year) |

The Quality Manager schedules all walkthroughs within the window. Walkthroughs that slip past the window are tracked as overdue and escalated to the CISO.

### 4.2 Quarterly Sample Selection

Each quarter, a sample of in-scope controls is selected for walkthrough. The full population of 110 controls is reassessed across **a rolling 12-month window** — each control is walked through at least once per year, with riskier controls walked through more frequently.

**Sampling rules:**

1. **Tier-1 controls (every quarter, 100%):** All 17 governance-program controls in the codex Governance set as published at `docs/specs/governance-18-controls.json` (codex repo). These have the highest blast radius and the most external visibility (auditor-facing).
2. **Tier-2 controls (twice per year, 50% per quarter):** All Access Control (3.1.x), Identification and Authentication (3.5.x), and Configuration Management (3.4.x) controls. Half each quarter, alternating, so each is walked through every six months.
3. **Tier-3 controls (annual, 25% per quarter):** All remaining in-scope controls. Sample 25% of this pool each quarter, drawn so that no control goes more than 12 months between walkthroughs.

The Quality Manager publishes the quarter's sample list at the start of the execution window and links each control to its owner of record.

### 4.3 Walkthrough Procedure

For each selected control:

**Step 1: Schedule.**  
Quality Manager opens a 30-minute walkthrough on the calendar with the control owner and (for at least 25% of walkthroughs) an Internal Audit observer.

**Step 2: Evidence pull.**  
The control owner brings the artifacts cited in the SSP narrative for that control. The Quality Manager verifies that:

- Each cited artifact exists at its referenced location.
- File-path / line-number citations still resolve (for code-evidence controls).
- Document references resolve to a current EFFECTIVE version in QMS.
- Configuration exports are dated within the current quarter.

**Step 3: Implementation attestation.**  
The control owner narrates how the control operates today, in current production. The walkthrough captures any drift between the SSP narrative and the live implementation.

**Step 4: Evidence sampling.**  
For controls that produce ongoing operational evidence (training completion, access reviews, log retention, etc.), the Quality Manager pulls a sample of recent artifacts:

| Evidence type | Sample size |
|---|---|
| Discrete events (access grants, training records, signatures) | Greater of 10 records or 5% of population in the quarter |
| Continuous artifacts (config exports, policy docs) | 1 current snapshot |
| Logs / time-series | 1 randomly-selected day in the quarter |

The sample is examined for completeness, accuracy, and conformance to the control's stated implementation.

**Step 5: Determination.**  
At the end of the walkthrough the Quality Manager records one of three determinations:

- **Effective.** Implementation matches SSP narrative; sampled evidence conforms; no drift.
- **Partially effective.** Implementation matches narrative but evidence sampling reveals exceptions, OR drift between narrative and implementation that does not break the control. Routes to disposition step 4.4.
- **Ineffective.** Control is not operating, or sampling reveals systemic exceptions, or implementation has materially diverged from narrative such that the control no longer satisfies the requirement. Routes to disposition step 4.4 with CISO notification within 24 hours.

**Step 6: Sign-off.**  
The control owner and Quality Manager both sign the walkthrough record (electronic signatures via the QMS e-sign flow). Internal Audit observers, when present, also sign.

### 4.4 Disposition of Findings

| Determination | Disposition |
|---|---|
| Effective | Closed at walkthrough. Recorded in the quarterly program report. |
| Partially effective | A CAPA is opened in QMS within 5 business days, owned by the control owner, with a remediation target of ≤30 days. Standard CAPA effectiveness check applies. |
| Ineffective | A CAPA is opened in QMS within 1 business day. CISO notified within 24 hours of the walkthrough. If remediation will exceed 30 days, the finding is escalated to the POA&M and tracked there until closure. SSP narrative is updated within 5 business days to reflect the gap and the remediation plan. |

Findings that affect a control already on the POA&M reset the remediation clock and require an updated POA&M entry, not a new one.

### 4.5 Quarterly Program Report

Within 10 business days of the close of each execution window, the Quality Manager produces a program report containing:

- The sample list for the quarter (controls and tiers).
- The determination for each walkthrough.
- All CAPAs opened, with QMS CAPA IDs.
- All POA&M escalations or updates.
- Coverage analysis: which controls have been walked through in the trailing 12 months, which are due in the next quarter.
- Any procedural exceptions (walkthroughs missed, deferred, or rescheduled).

The report is signed by the Quality Manager and countersigned by the CISO. The signed report is the primary evidence artifact for §3.12.3.

---

## 5. Records and Retention

| Record | Storage | Retention |
|---|---|---|
| Walkthrough records (per-control) | QMS — linked to control via the codex CMMC tagging junctions | 7 years |
| Quarterly program report | QMS document control as a controlled record | 7 years |
| CAPAs opened from findings | QMS CAPA module, standard CAPA retention | 7 years |
| POA&M entries | POA&M tracker (codex side); reference linked from QMS | 7 years or until closed + 3 years, whichever is longer |
| Sampled evidence artifacts | Attached to the walkthrough record OR linked by stable reference | Same as the walkthrough record |

Retention aligns with `MAC-POL-217_Ongoing_Stakeholder_Requirements.md` and the Retention Policy table maintained in QMS (`security_policies` and `retention_policies` rows).

---

## 6. Distinction from Adjacent Activities

| Activity | What it is | Where it lives | This SOP's relationship |
|---|---|---|---|
| Log review and SIEM alerting | Real-time, automated, event-driven | Operations / SOC | Out of scope — covered by family 3.3 controls |
| External annual assessment | Point-in-time, third-party | C3PAO engagement | Out of scope — covered by 3.12.1 / 3.12.2 |
| Internal audit program | Broader QMS audit (process audits, supplier audits, etc.) | QMS audit module | Adjacent — internal audit observers participate in this procedure but the procedure is distinct |
| Periodic document review | QMS-driven cadence on individual controlled documents | QMS PeriodicReview model | Adjacent — a doc-review finding may trigger a walkthrough; a walkthrough finding may trigger a doc revision |

---

## 7. References

- NIST SP 800-171 Rev. 2, §3.12.1, §3.12.2, §3.12.3
- CMMC 2.0 Level 2 Assessment Guide (DoD)
- `MAC-IT-304_System_Security_Plan.md`
- `MAC-POL-210_Access_Control_Policy.md`
- `MAC-POL-217_Ongoing_Stakeholder_Requirements.md`
- `MAC-POL-216_System_Integrity_Policy_Reference.md` (CAPA workflow reference)
- `MAC-POL-224_Security_Assessment_Policy.md`
- POA&M tracker (codex side)
- Codex Governance-controls JSON: `docs/specs/governance-18-controls.json` (codex repo)

---

## 8. Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-05-07 | Patrick Caruso | Initial release. Closes POA&M item for §3.12.3. |
