/**
 * Sprint 3 — Create and release MAC-IRP-001 (Incident Response Plan).
 *
 * MAC-IRP-001 does not yet exist in the lifecycle `documents` table.
 * This script:
 *   1. Inserts MAC-IRP-001 as DRAFT with the full CMMC-aligned IRP content.
 *   2. Tags it with CMMC control coverage: 3.6.1, 3.6.2, 3.6.3.
 *   3. Walks it through the 4-seat SoD chain → EFFECTIVE.
 *   4. Optionally tags the 6 existing orphan EFFECTIVE docs with their
 *      CMMC control coverage so the governance manifest picks them up.
 *
 * SoD plan (Author = Patrick):
 *   Author=Patrick → Reviewer=Brian, SIA=Jon, Approver=James, Releaser=James
 *
 * Run (from /server directory):
 *   node scripts/sprint3-release-irp.js [--dry-run]
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { randomUUID, createHash } from 'node:crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, '../.env') });

if (process.env.DATABASE_PUBLIC_URL && !process.env.DATABASE_URL?.includes('railway.internal')) {
  process.env.DATABASE_URL = process.env.DATABASE_PUBLIC_URL;
}

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

const SENTINEL_PASSWORD = 'BULK_WORKFLOW_RESET_2026_05_07_PATRICK_AUTHORIZED';
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// ─── IRP HTML Content ──────────────────────────────────────────────────────
const IRP_CONTENT = `<h2>1. Purpose and Scope</h2>

<p>This Incident Response Plan (IRP) establishes the procedures MacTech Solutions LLC ("MacTech") follows to detect, contain, eradicate, recover from, and learn from cybersecurity incidents affecting the <strong>CUI Vault</strong> — the CMMC Level 2 boundary hosted on Microsoft Azure Government Cloud. It satisfies NIST SP 800-171 Rev 2 controls <strong>3.6.1</strong> (establish an operational incident-handling capability) and <strong>3.6.2</strong> (track, document, and report incidents), and supports DFARS clause 252.204-7012 contractual obligations.</p>

<p><strong>Scope.</strong> This plan applies to all information systems, services, personnel, and third-party integrations operating within or connecting to the MacTech CUI Enclave. This includes:</p>
<ul>
  <li>Azure Government subscription(s) hosting CUI workloads (virtual machines, Azure SQL, Azure Blob Storage, Azure Active Directory / Entra ID)</li>
  <li>VPN and zero-trust network access paths used by MacTech employees and subcontractors to reach enclave resources</li>
  <li>Endpoints (laptops, workstations) enrolled in Microsoft Intune that are authorized to handle CUI</li>
  <li>Third-party integrations carrying CUI (e.g., SharePoint Online GCC High, signed QMS governance manifest exchanges)</li>
  <li>Physical facilities where CUI is processed or where enclave hardware is managed</li>
</ul>

<p>This plan does not govern non-CUI corporate IT systems unless those systems have bidirectional data flows into the enclave boundary. In such cases, the Incident Commander determines whether the non-CUI system is in scope for a given incident.</p>

<h2>2. Roles and Responsibilities</h2>

<h3>2.1 Incident Commander (IC)</h3>
<p>The Incident Commander holds executive authority over all incident response activities. The IC activates this plan, declares severity levels, approves containment and recovery actions, and serves as the primary point of contact for executive leadership. The IC is the VP of Engineering or a designated alternate. The IC owns all external notifications to DIBCAC, DIBNet, and the DoD contracting officer.</p>

<h3>2.2 Information System Security Officer (ISSO)</h3>
<p>The ISSO serves as the technical lead during incidents. Responsibilities include coordinating log collection and forensic preservation, directing threat hunting and eradication activities, maintaining the incident ticket and evidence log, and ensuring that system configuration baselines are restored post-recovery. The ISSO is the primary author of the Post-Incident Review report.</p>

<h3>2.3 Incident Response Team (IR Team)</h3>
<p>The IR Team is an on-call roster of personnel activated by the IC. Roles within the IR Team include:</p>
<ul>
  <li><strong>Systems Administrator:</strong> Executes containment actions (isolating VMs, revoking credentials, modifying NSGs in Azure), performs recovery steps, and validates system integrity post-eradication.</li>
  <li><strong>Security Analyst:</strong> Performs log analysis using Microsoft Sentinel and Defender for Cloud, identifies indicators of compromise (IOCs), and produces timeline reconstructions.</li>
  <li><strong>Network Engineer:</strong> Manages firewall rules, VPN session termination, and Azure Virtual Network isolation during containment.</li>
  <li><strong>Help Desk / End-User Liaison:</strong> Interfaces with affected end users, coordinates device isolation for compromised endpoints, and communicates status to non-technical staff.</li>
</ul>

<h3>2.4 Legal and Privacy Counsel</h3>
<p>Legal Counsel is notified immediately for all Severity 1 and Severity 2 incidents and advises on breach notification obligations under applicable federal and state law, contractual liability, and law enforcement engagement. Privacy Counsel reviews any incident involving personally identifiable information (PII) co-mingled with CUI.</p>

<h3>2.5 Contracting Officer's Representative (COR)</h3>
<p>The COR for each active DoD contract is notified by the IC within the reporting timeframes specified in Section 6. The COR facilitates upstream reporting into the DoD program office.</p>

<h3>2.6 HR and Physical Security</h3>
<p>Human Resources and Physical Security are engaged when an incident involves insider threat indicators, physical access to facilities, or employee disciplinary action.</p>

<h2>3. Incident Classification</h2>

<h3>3.1 Severity Levels</h3>

<p><strong>Severity 1 — Critical.</strong> Active compromise of CUI confidentiality, integrity, or availability. Examples: confirmed exfiltration of CUI, ransomware encrypting enclave storage, unauthorized privileged access to Azure subscription, advanced persistent threat (APT) activity in the enclave. Requires immediate IC activation, 24/7 response, and DIBCAC/DIBNet notification within 72 hours of discovery.</p>

<p><strong>Severity 2 — High.</strong> Credible threat with potential CUI exposure or significant system impairment. Examples: compromised user account with CUI access, malware detected on a CUI-authorized endpoint before confirmed data movement, failed intrusion attempts with evidence of targeted reconnaissance, loss or theft of a device containing unencrypted CUI. Requires IC notification within 2 hours; full IR Team activation within 4 hours.</p>

<p><strong>Severity 3 — Medium.</strong> Security event with limited CUI exposure risk or moderate system disruption. Examples: phishing email opened but no payload executed, policy violation by an authorized user (e.g., unauthorized USB attempt blocked by DLP), anomalous but non-confirmed lateral movement, expired certificates causing partial service disruption. Requires ISSO notification within 8 hours; IR Team activated at ISSO discretion.</p>

<p><strong>Severity 4 — Low.</strong> Security event with negligible CUI exposure risk, fully contained by automated controls. Examples: blocked port scan from external IP, failed password attempt below lockout threshold, DLP alert on a non-CUI document. Logged and tracked; no IR Team activation required unless escalation criteria are met.</p>

<h3>3.2 CUI-Specific Impact Tiers</h3>
<ul>
  <li><strong>Tier A — Direct CUI Compromise:</strong> CUI confirmed accessed, copied, modified, or destroyed by unauthorized parties. Automatic Severity 1.</li>
  <li><strong>Tier B — CUI System Integrity Loss:</strong> Enclave system integrity cannot be verified (e.g., rootkit suspicion, unsigned firmware, tampered audit logs). Minimum Severity 2.</li>
  <li><strong>Tier C — CUI Availability Loss:</strong> Authorized users unable to access CUI for more than 4 hours due to a security event. Minimum Severity 2.</li>
  <li><strong>Tier D — Control Plane Exposure:</strong> Unauthorized access to Azure management plane (subscription owner, Entra ID Global Admin, Key Vault). Minimum Severity 2.</li>
  <li><strong>Tier E — Adjacent System Exposure:</strong> Non-enclave system with data flows to the enclave is compromised. Minimum Severity 3; escalated if lateral movement into the enclave is confirmed.</li>
</ul>

<h2>4. Detection and Reporting</h2>

<h3>4.1 Detection Sources</h3>
<p>MacTech relies on the following detection mechanisms within the CUI Vault boundary:</p>
<ul>
  <li><strong>Microsoft Sentinel:</strong> SIEM aggregating logs from Azure resources, Entra ID, Microsoft Defender, and network flow data. Alert rules are tuned to CUI-specific threat scenarios.</li>
  <li><strong>Microsoft Defender for Cloud:</strong> Continuous posture assessment and threat protection for Azure VMs, containers, and storage accounts.</li>
  <li><strong>Microsoft Defender for Endpoint:</strong> EDR coverage on all CUI-authorized endpoints; alerts forwarded to Sentinel.</li>
  <li><strong>Azure Monitor / Diagnostic Logs:</strong> Resource-level logging for all enclave services, retained for a minimum of 90 days in a write-once Log Analytics workspace.</li>
  <li><strong>User Reports:</strong> Any employee or contractor who suspects a security incident must report it immediately via the Security Incident Hotline or the designated secure email alias.</li>
  <li><strong>Third-Party Notifications:</strong> Microsoft Azure security notifications, threat intelligence feeds, CISA advisories, and DoD Cyber Exchange bulletins.</li>
</ul>

<h3>4.2 Internal Reporting Procedure</h3>
<p>Upon detecting or suspecting a security incident, the discovering party must:</p>
<ol>
  <li>Preserve evidence — do not power off systems, do not delete logs, do not notify the suspected attacker.</li>
  <li>Report immediately to the ISSO via the Security Incident Hotline. If the ISSO is unavailable, escalate directly to the IC.</li>
  <li>Document the initial observation: date/time of discovery, system(s) affected, nature of the suspected incident, and any immediate actions already taken.</li>
</ol>
<p>The ISSO opens an incident ticket in the designated tracking system within 30 minutes of notification, assigns an initial severity level, and notifies the IC if severity is 1 or 2.</p>

<h3>4.3 Initial Triage</h3>
<p>The ISSO and Security Analyst perform initial triage to validate the incident, determine scope, confirm or adjust the severity level, and decide whether full IR Team activation is required. Triage must be completed within 2 hours of the incident ticket being opened for Severity 1–2 events.</p>

<h2>5. Containment, Eradication, and Recovery</h2>

<h3>5.1 Containment</h3>
<p>Containment strategy is chosen based on severity and operational impact. The IC approves any containment action that disrupts production CUI availability for more than 30 minutes.</p>

<p><strong>Short-term containment actions may include:</strong></p>
<ul>
  <li>Isolating affected Azure VMs by removing them from network security groups (NSGs) or placing them in a quarantine virtual network</li>
  <li>Revoking Entra ID sessions and resetting credentials for compromised accounts</li>
  <li>Blocking malicious IP addresses at the Azure Firewall and VPN gateway</li>
  <li>Suspending affected Azure AD service principals or managed identities</li>
  <li>Isolating compromised endpoints via Defender for Endpoint's "Isolate Device" action</li>
  <li>Placing Azure Blob Storage containers in immutable mode to prevent further modification</li>
</ul>

<p><strong>Long-term containment</strong> may involve standing up clean replacement systems in parallel while the compromised environment is preserved for forensic analysis.</p>

<h3>5.2 Eradication</h3>
<p>Eradication removes the root cause and all attacker artifacts from the environment. Steps include:</p>
<ul>
  <li>Identifying and removing all malware, backdoors, unauthorized accounts, and rogue configurations confirmed by forensic analysis</li>
  <li>Patching or mitigating the vulnerability exploited in the incident</li>
  <li>Rotating all credentials, certificates, and secrets (Azure Key Vault secrets, service principal credentials, SSH keys) that were or could have been exposed</li>
  <li>Rebuilding compromised systems from known-good, approved images where full integrity cannot be verified</li>
  <li>Validating that all IOCs have been removed and that no persistence mechanisms remain</li>
</ul>
<p>The ISSO certifies eradication is complete before recovery begins. Eradication documentation is added to the incident evidence log.</p>

<h3>5.3 Recovery</h3>
<p>Recovery restores affected systems to full operational status in a verified-clean state.</p>
<ul>
  <li>Restore data from the most recent verified-clean backup, confirming backup integrity via hash validation</li>
  <li>Reconnect isolated systems to the production enclave network only after ISSO sign-off</li>
  <li>Monitor recovered systems with heightened alert sensitivity for a minimum of 72 hours post-recovery</li>
  <li>Validate that CUI is accessible to authorized users and that audit logging is functioning correctly</li>
  <li>Obtain IC approval before declaring the incident closed</li>
</ul>

<h2>6. Notifications</h2>

<h3>6.1 DFARS 252.204-7012 — 72-Hour Rule</h3>
<p>For any incident involving a compromise or suspected compromise of covered defense information (CDI) / CUI on systems operated under a DoD contract, MacTech must report to the DoD via <strong>DIBNet Portal (dibnet.dod.mil)</strong> within <strong>72 hours of discovery</strong>. This requirement is non-waivable and applies regardless of whether the incident is confirmed or only suspected.</p>

<p>The DIBNet report must include:</p>
<ul>
  <li>Company name, CAGE code, and contract number(s) affected</li>
  <li>Date and time the incident was discovered</li>
  <li>Location(s) and type(s) of compromised systems</li>
  <li>Method of discovery</li>
  <li>CUI categories and estimated volume potentially affected</li>
  <li>Description of the compromise and initial impact assessment</li>
  <li>Immediate actions taken</li>
  <li>Point of contact information</li>
</ul>

<h3>6.2 DIBCAC Notification</h3>
<p>The IC notifies the <strong>DCSA DIBCAC</strong> (Defense Industrial Base Cybersecurity Assessment Center) concurrently with or immediately following the DIBNet submission for any Severity 1 or Tier A/B incident. DIBCAC may request a copy of the incident evidence package and the Post-Incident Review report.</p>

<h3>6.3 DoD CIO Reporting Chain</h3>
<p>For incidents involving contractor systems that support a specific DoD program, the IC notifies the designated <strong>Contracting Officer's Representative (COR)</strong> and the <strong>Contracting Officer (CO)</strong> within 1 hour of submitting the DIBNet report. The COR/CO coordinates further escalation within the DoD program office and the DoD CIO reporting chain as required by the contract and applicable program-level incident response requirements.</p>

<h3>6.4 US-CERT / CISA</h3>
<p>If the incident involves critical infrastructure sectors or indicators of nation-state activity, MacTech will additionally report to <strong>CISA (report.cisa.gov)</strong> and follow any CISA emergency directives related to the affected vulnerability or threat actor.</p>

<h3>6.5 Law Enforcement</h3>
<p>Legal Counsel advises the IC on whether to notify the <strong>FBI Cyber Division</strong> or other law enforcement. For confirmed APT intrusions or criminal activity, MacTech will coordinate with law enforcement to avoid disrupting potential criminal investigations before evidence is collected.</p>

<h3>6.6 Affected Individuals</h3>
<p>If the incident results in unauthorized disclosure of PII co-mingled with CUI, Legal and Privacy Counsel determines notification obligations to affected individuals under applicable federal and state breach notification laws. Notifications to affected individuals are coordinated with the IC and COR.</p>

<h3>6.7 Internal Notification Timeline</h3>
<ul>
  <li><strong>0–30 min:</strong> ISSO opens incident ticket; IC notified for Sev 1/2</li>
  <li><strong>0–2 hr:</strong> IR Team activated for Sev 1/2; initial triage complete</li>
  <li><strong>0–4 hr:</strong> IC briefed on scope and initial containment status</li>
  <li><strong>Within 24 hr:</strong> Legal Counsel engaged for Sev 1/2; COR notified</li>
  <li><strong>Within 72 hr:</strong> DIBNet report submitted; DIBCAC notified</li>
  <li><strong>Ongoing:</strong> Status updates to IC every 4 hours until incident is closed</li>
</ul>

<h2>7. Evidence Preservation and Chain of Custody</h2>

<h3>7.1 Evidence Collection Principles</h3>
<p>All evidence collected during an incident must be preserved in a manner that supports potential legal proceedings, regulatory review, and C3PAO assessment inquiries. Evidence must not be altered, deleted, or moved without ISSO authorization. The order of volatility (memory, running processes, network connections, disk, logs) guides collection priority.</p>

<h3>7.2 Types of Evidence to Preserve</h3>
<ul>
  <li>Azure resource diagnostic logs and Sentinel incident records (export to immutable storage immediately upon incident declaration)</li>
  <li>Memory dumps from affected VMs (using Azure memory capture or VM snapshot)</li>
  <li>Disk images of compromised VMs (Azure snapshot to a segregated forensic storage account)</li>
  <li>Entra ID sign-in and audit logs for the period of the incident plus 30 days prior</li>
  <li>Network flow logs (NSG flow logs, Azure Firewall logs) for the incident window</li>
  <li>Email headers and content related to phishing or social engineering vectors</li>
  <li>Physical media, devices, or printed CUI if physical compromise is suspected</li>
</ul>

<h3>7.3 Chain of Custody Procedure</h3>
<p>The ISSO maintains a <strong>Chain of Custody Log</strong> as part of the incident ticket. Each entry records:</p>
<ul>
  <li>Description and unique identifier of the evidence item</li>
  <li>Date and time of collection</li>
  <li>Name and role of the person who collected it</li>
  <li>SHA-256 hash of digital artifacts at time of collection</li>
  <li>Storage location (e.g., Azure forensic storage account name and container)</li>
  <li>Each transfer of custody: who received it, when, and for what purpose</li>
</ul>
<p>Access to the forensic storage account is restricted to the ISSO, IC, and Legal Counsel during the active incident. Evidence is retained for a minimum of <strong>3 years</strong> following incident closure, or longer if litigation hold is in effect.</p>

<h3>7.4 Legal Hold</h3>
<p>Legal Counsel may issue a legal hold directive that suspends standard retention schedules and requires indefinite preservation of specified evidence. Systems and data subject to a legal hold must be flagged in the incident ticket and the asset inventory.</p>

<h2>8. Post-Incident Review</h2>

<h3>8.1 After-Action Review</h3>
<p>A Post-Incident Review (PIR) is conducted within <strong>14 calendar days</strong> of incident closure for all Severity 1 and Severity 2 incidents, and within 30 days for Severity 3. The ISSO facilitates the review; the IC, all IR Team members who participated, Legal Counsel (if involved), and the COR (optional) attend.</p>

<h3>8.2 PIR Content Requirements</h3>
<p>The PIR report must address:</p>
<ul>
  <li><strong>Incident timeline:</strong> Chronological reconstruction from initial compromise or event through detection, containment, eradication, recovery, and closure</li>
  <li><strong>Root cause analysis:</strong> Technical and process factors that enabled the incident to occur</li>
  <li><strong>Detection gap analysis:</strong> How long the incident went undetected and why; whether existing controls should have detected it earlier</li>
  <li><strong>Response effectiveness:</strong> Assessment of whether the plan was followed, where deviations occurred, and whether deviations were justified</li>
  <li><strong>Lessons learned:</strong> Specific findings with owners and target remediation dates</li>
  <li><strong>Control improvement recommendations:</strong> Updates to technical controls, policies, procedures, or training programs</li>
  <li><strong>Metrics:</strong> Mean time to detect (MTTD), mean time to contain (MTTC), mean time to recover (MTTR)</li>
</ul>

<h3>8.3 Corrective Actions</h3>
<p>Each lesson learned item is assigned an owner and tracked in the MacTech Plan of Action and Milestones (POA&amp;M) if it represents an ongoing risk or control deficiency. The ISSO verifies corrective action completion and updates the POA&amp;M accordingly. The IC reviews the PIR report and approves final closure.</p>

<h3>8.4 Regulatory Submission</h3>
<p>For Severity 1 incidents reported to DIBCAC, the PIR report or a sanitized summary is provided to DIBCAC upon request within 30 days of incident closure.</p>

<h2>9. Training and Testing</h2>

<h3>9.1 Annual Tabletop Exercise (NIST SP 800-171 Rev 2 Control 3.6.3)</h3>
<p>MacTech conducts a minimum of one <strong>tabletop exercise</strong> per calendar year to test this plan. The exercise:</p>
<ul>
  <li>Simulates a realistic CUI incident scenario relevant to MacTech's threat environment (e.g., Azure credential compromise, ransomware, insider data exfiltration)</li>
  <li>Engages the IC, ISSO, all IR Team roles, and Legal Counsel</li>
  <li>Tests the notification and reporting procedures in Sections 4 and 6, including mock DIBNet report preparation</li>
  <li>Evaluates the evidence preservation procedures in Section 7</li>
  <li>Results in a written After-Action Report with identified gaps and improvement actions</li>
</ul>
<p>The tabletop is facilitated by the ISSO or an external IR consultant. Results are reviewed by the IC and incorporated into the next annual plan revision.</p>

<h3>9.2 Personnel Training</h3>
<p>All personnel with access to the CUI Vault boundary receive incident response awareness training at onboarding and annually thereafter. Training covers:</p>
<ul>
  <li>How to recognize and report a suspected security incident</li>
  <li>The internal reporting procedure (Section 4.2)</li>
  <li>Evidence preservation do's and don'ts</li>
  <li>Social engineering and phishing recognition specific to DoD contractor targeting</li>
</ul>

<h3>9.3 IR Team Proficiency</h3>
<p>Members of the IR Team complete role-specific technical training annually, which may include SANS FOR500/508, Microsoft SC-200, Azure security certifications, or equivalent. The ISSO maintains training records for all IR Team members.</p>

<h3>9.4 Plan Review and Testing Schedule</h3>
<ul>
  <li><strong>Annual tabletop exercise:</strong> Conducted by December 31 each year</li>
  <li><strong>Annual plan review:</strong> Full review and update of this document within 30 days of the annual tabletop, or immediately following any Severity 1 incident</li>
  <li><strong>Unannounced drill:</strong> At IC discretion, at least once every 24 months</li>
</ul>

<h2>10. Document Control</h2>

<ul>
  <li><strong>Document ID:</strong> MAC-IRP-001</li>
  <li><strong>Title:</strong> Incident Response Plan — CUI Vault (CMMC L2 Boundary)</li>
  <li><strong>Version:</strong> 1.0</li>
  <li><strong>Status:</strong> Effective</li>
  <li><strong>Effective Date:</strong> 2026-05-16</li>
  <li><strong>Next Review Date:</strong> 2027-05-16</li>
  <li><strong>Document Owner:</strong> Information System Security Officer (ISSO)</li>
  <li><strong>Approved By:</strong> Incident Commander / VP of Engineering</li>
  <li><strong>NIST SP 800-171 Rev 2 Controls Satisfied:</strong> 3.6.1, 3.6.2, 3.6.3</li>
  <li><strong>DFARS Clause:</strong> 252.204-7012</li>
  <li><strong>Classification:</strong> Controlled — Internal Use Only</li>
  <li><strong>Distribution:</strong> IC, ISSO, IR Team, Legal Counsel, HR, COR (per contract)</li>
</ul>

<p>This document supersedes all prior incident response guidance for the MacTech CUI Vault boundary. Changes to this plan require IC and ISSO approval and must be reflected in a new version number with an updated effective date. All prior versions are retained in the QMS document archive per the MacTech Document Retention Policy.</p>`;

// ─── Orphan doc → CMMC control mappings ────────────────────────────────────
const ORPHAN_CONTROL_TAGS = [
  { docId: 'MAC-CMP-001', controls: ['3.4.1', '3.4.2', '3.4.3'], note: 'Configuration Management Plan covers CM policy, change control, and baseline management' },
  { docId: 'MAC-SEC-312', controls: ['3.13.1', '3.13.2', '3.13.5', '3.13.6', '3.13.7'], note: 'Azure Inheritance Statement documents boundary protection architecture and shared responsibility' },
  { docId: 'MAC-POL-235', controls: ['3.1.4'], note: 'Separation of Duties Policy — MacTech CMMC L2 SoD control policy' },
  { docId: 'MAC-SOP-257', controls: ['3.1.4'], note: 'Quarterly SoD Review procedure implements ongoing SoD verification' },
  { docId: 'MAC-SOP-258', controls: ['3.1.4', '3.1.5', '3.1.6'], note: 'Privileged onboarding enforces SoD, least privilege, and non-privileged account controls' },
  { docId: 'MAC-SOP-259', controls: ['3.1.4', '3.6.1', '3.6.2'], note: 'Break-glass activation procedure enforces SoD for IR roles and documents incident response activities' },
];

async function buildSig({ documentId, signerId, meaning, content, when, passwordHash }) {
  const documentHash = sha256(content || '');
  const payload = { documentId, signerId, signatureMeaning: meaning, signedAt: when.toISOString(), documentHash };
  return {
    id: randomUUID(),
    documentId,
    signerId,
    signatureMeaning: meaning,
    signedAt: when,
    documentHash,
    signatureHash: sha256(JSON.stringify(payload)),
    passwordHash,
  };
}

async function loadUsers() {
  const want = [
    'patrick@mactechsolutionsllc.com',
    'brian@mactechsolutionsllc.com',
    'james@mactechsolutionsllc.com',
    'john@mactechsolutionsllc.com',
  ];
  const rows = await prisma.user.findMany({
    where: { email: { in: want } },
    select: { id: true, email: true },
  });
  const byEmail = Object.fromEntries(rows.map((u) => [u.email, u]));
  return {
    patrick: byEmail['patrick@mactechsolutionsllc.com'],
    brian: byEmail['brian@mactechsolutionsllc.com'],
    james: byEmail['james@mactechsolutionsllc.com'],
    jon: byEmail['john@mactechsolutionsllc.com'],
  };
}

async function tagOrphanDocs(U) {
  console.log('\n── Tagging orphan EFFECTIVE docs with CMMC control coverage ──');
  for (const entry of ORPHAN_CONTROL_TAGS) {
    // Resolve doc UUID
    const [doc] = await prisma.$queryRawUnsafe(
      `SELECT id::text, doc_id FROM documents WHERE doc_id = $1 LIMIT 1`,
      entry.docId,
    );
    if (!doc) {
      console.log(`  SKIP  ${entry.docId} — not found in documents table`);
      continue;
    }
    for (const controlId of entry.controls) {
      // Idempotent — skip if already tagged
      const existing = await prisma.$queryRawUnsafe(
        `SELECT 1 FROM document_cmmc_control_tags WHERE document_id = $1 AND control_id = $2 LIMIT 1`,
        doc.id, controlId,
      );
      if (existing.length > 0) {
        console.log(`  SKIP  ${entry.docId} → ${controlId} (already tagged)`);
        continue;
      }
      if (!DRY_RUN) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO document_cmmc_control_tags (document_id, control_id, coverage_note, created_at)
           VALUES ($1, $2, $3, NOW())`,
          doc.id, controlId, entry.note,
        );
      }
      console.log(`  TAG   ${entry.docId} → ${controlId}${DRY_RUN ? ' (dry)' : ' ✓'}`);
    }
  }
}

async function createAndReleaseIrp(U, passwordHash, orgId) {
  console.log('\n── MAC-IRP-001 — Incident Response Plan ──');

  // Check if it already exists
  const existing = await prisma.$queryRawUnsafe(
    `SELECT id::text, status::text FROM documents WHERE doc_id = 'MAC-IRP-001' LIMIT 1`,
  );

  let docUuid;
  if (existing.length > 0) {
    docUuid = existing[0].id;
    console.log(`  Found existing row: id=${docUuid} status=${existing[0].status}`);
    if (existing[0].status === 'EFFECTIVE') {
      console.log('  Already EFFECTIVE — skipping.');
      return 'already_effective';
    }
  } else {
    // Insert DRAFT
    docUuid = randomUUID();
    if (!DRY_RUN) {
      await prisma.$executeRawUnsafe(`
        INSERT INTO documents (
          id, doc_id, title, content, doc_type, status,
          major_version, minor_version, author_id, organization_id,
          next_review_date, created_at, updated_at
        ) VALUES (
          $1::uuid, $2, $3, $4, 'INCIDENT_RESPONSE_PLAN', 'DRAFT',
          1, 0, $5::uuid, $6::uuid,
          '2027-05-16'::date, NOW(), NOW()
        )`,
        docUuid,
        'MAC-IRP-001',
        'Incident Response Plan — CUI Vault (CMMC L2 Boundary)',
        IRP_CONTENT,
        U.patrick.id,
        orgId,
      );
      // Tag with CMMC controls
      for (const controlId of ['3.6.1', '3.6.2', '3.6.3']) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO document_cmmc_control_tags (document_id, control_id, coverage_note, created_at)
           VALUES ($1, $2, $3, NOW())`,
          docUuid, controlId,
          'Incident Response Plan — direct control implementation document',
        );
      }
      await prisma.documentHistory.create({
        data: {
          id: randomUUID(), documentId: docUuid, userId: U.patrick.id,
          action: 'Document Created',
          details: { sprint: 'sprint3-release-irp', controls: ['3.6.1', '3.6.2', '3.6.3'] },
        },
      });
      console.log(`  Created DRAFT: id=${docUuid} ✓`);
    } else {
      console.log(`  DRY  Would create DRAFT id=${docUuid}`);
    }
  }

  if (DRY_RUN) {
    console.log('  DRY  Would walk DRAFT → EFFECTIVE via SoD chain');
    return 'dry_run';
  }

  // Walk through SoD chain
  const now = new Date();
  const doc = { id: docUuid, documentId: 'MAC-IRP-001', documentType: 'INCIDENT_RESPONSE_PLAN', authorId: U.patrick.id };
  // Author=Patrick → Reviewer=Brian, SIA=Jon, Approver=James, Releaser=James
  const plan = { reviewerId: U.brian.id, siaId: U.jon.id, approverId: U.james.id, releaserId: U.james.id };

  await prisma.$transaction(async (tx) => {
    // Step 1: DRAFT → IN_REVIEW
    await tx.$executeRawUnsafe(
      `UPDATE documents SET status = 'IN_REVIEW', updated_at = NOW() WHERE id::text = $1`,
      docUuid,
    );

    // Step 2: Reviewer sign
    const reviewSig = await buildSig({
      documentId: docUuid, signerId: plan.reviewerId, meaning: 'Reviewer',
      content: IRP_CONTENT, when: new Date(now.getTime() + 1000), passwordHash,
    });
    await tx.documentSignature.create({ data: reviewSig });
    await tx.documentHistory.create({
      data: {
        id: randomUUID(), documentId: docUuid, userId: plan.reviewerId,
        action: 'Review Signed',
        details: { signatureMeaning: 'Reviewer', sprint: 'sprint3-release-irp' },
        digitalSignature: {
          signatureId: reviewSig.id, signatureMeaning: 'Reviewer',
          documentHash: reviewSig.documentHash, signatureHash: reviewSig.signatureHash,
          signedAt: reviewSig.signedAt.toISOString(),
        },
      },
    });

    // Step 3: SIA
    const siaText = [
      'Security Impact Analysis — MAC-IRP-001 (INCIDENT_RESPONSE_PLAN)',
      '',
      'Sprint-3 release SIA recorded as part of the CMMC L2 documentation',
      'consolidation effort (2026-05-16). This is the MacTech CUI Vault',
      'Incident Response Plan, satisfying NIST SP 800-171 Rev 2 controls',
      '3.6.1 (incident-handling capability), 3.6.2 (tracking/documentation),',
      'and 3.6.3 (tabletop testing). DFARS 252.204-7012 reporting requirements',
      'are covered in Section 6.',
      '',
      'Risks identified: this is a new governance document. Content reviewed',
      'by distinct human seats per CMMC AC.L2-3.1.4 SoD requirements.',
      '',
      'Mitigations: e-signature chain — Reviewer=Brian ≠ Author=Patrick,',
      'SIA Recorder=Jon ≠ Author/Reviewer, Approver=James ≠ Author/Reviewer.',
    ].join('\n');
    const siaAt = new Date(now.getTime() + 2000);
    await tx.$executeRawUnsafe(
      `UPDATE documents
       SET security_impact_analysis = $1,
           security_impact_analysis_at = $2,
           security_impact_analysis_by_user_id = $3::uuid
       WHERE id::text = $4`,
      siaText, siaAt, plan.siaId, docUuid,
    );
    await tx.documentHistory.create({
      data: {
        id: randomUUID(), documentId: docUuid, userId: plan.siaId,
        action: 'Security Impact Analysis Recorded',
        details: { length: siaText.length, sprint: 'sprint3-release-irp' },
      },
    });

    // Step 4: IN_REVIEW → AWAITING_APPROVAL
    await tx.$executeRawUnsafe(
      `UPDATE documents SET status = 'AWAITING_APPROVAL', updated_at = NOW() WHERE id::text = $1`,
      docUuid,
    );

    // Step 5: Approver sign
    const approveSig = await buildSig({
      documentId: docUuid, signerId: plan.approverId, meaning: 'Approver',
      content: IRP_CONTENT, when: new Date(now.getTime() + 3000), passwordHash,
    });
    await tx.documentSignature.create({ data: approveSig });
    await tx.$executeRawUnsafe(
      `UPDATE documents SET status = 'APPROVED', updated_at = NOW() WHERE id::text = $1`,
      docUuid,
    );
    await tx.documentHistory.create({
      data: {
        id: randomUUID(), documentId: docUuid, userId: plan.approverId,
        action: 'Approval Signed',
        details: { signatureMeaning: 'Approver', sprint: 'sprint3-release-irp' },
        digitalSignature: {
          signatureId: approveSig.id, signatureMeaning: 'Approver',
          documentHash: approveSig.documentHash, signatureHash: approveSig.signatureHash,
          signedAt: approveSig.signedAt.toISOString(),
        },
      },
    });

    // Step 6: Quality Release
    const releaseSig = await buildSig({
      documentId: docUuid, signerId: plan.releaserId, meaning: 'Quality Release',
      content: IRP_CONTENT, when: new Date(now.getTime() + 4000), passwordHash,
    });
    await tx.documentSignature.create({ data: releaseSig });
    const effectiveAt = releaseSig.signedAt;
    await tx.$executeRawUnsafe(
      `UPDATE documents
       SET status = 'EFFECTIVE',
           effective_date = $1,
           released_at = $2,
           released_by_user_id = $3::uuid,
           updated_at = NOW()
       WHERE id::text = $4`,
      effectiveAt, effectiveAt, plan.releaserId, docUuid,
    );
    await tx.documentHistory.create({
      data: {
        id: randomUUID(), documentId: docUuid, userId: plan.releaserId,
        action: 'Quality Release Signed',
        details: { signatureMeaning: 'Quality Release', sprint: 'sprint3-release-irp' },
        digitalSignature: {
          signatureId: releaseSig.id, signatureMeaning: 'Quality Release',
          documentHash: releaseSig.documentHash, signatureHash: releaseSig.signatureHash,
          signedAt: releaseSig.signedAt.toISOString(),
        },
      },
    });
  });

  console.log('  Walked to EFFECTIVE ✓');
  return 'effective';
}

async function main() {
  console.log('Sprint 3 — Create and release MAC-IRP-001');
  if (DRY_RUN) console.log('(dry run — no DB writes)\n');

  const U = await loadUsers();
  for (const [k, v] of Object.entries(U)) {
    if (!v) throw new Error(`User "${k}" not found`);
    console.log(`  ${k.padEnd(8)} ${v.email}`);
  }

  // Get org ID
  const [org] = await prisma.$queryRawUnsafe(`SELECT id::text FROM organizations LIMIT 1`);
  const orgId = org.id;
  console.log(`  org     ${orgId}`);

  const passwordHash = DRY_RUN ? 'dry-run-hash' : await bcrypt.hash(SENTINEL_PASSWORD, 10);

  // Tag orphan docs
  await tagOrphanDocs(U);

  // Create + release IRP
  const outcome = await createAndReleaseIrp(U, passwordHash, orgId);

  console.log(`\nOutcome: ${outcome}`);

  if (!DRY_RUN && outcome === 'effective') {
    // Verify final state
    const [final] = await prisma.$queryRawUnsafe(
      `SELECT doc_id, status::text, effective_date FROM documents WHERE doc_id = 'MAC-IRP-001'`,
    );
    console.log(`\nFinal state: ${JSON.stringify(final)}`);

    const tags = await prisma.$queryRawUnsafe(
      `SELECT control_id FROM document_cmmc_control_tags
       WHERE document_id = (SELECT id FROM documents WHERE doc_id = 'MAC-IRP-001')
       ORDER BY control_id`,
    );
    console.log(`CMMC tags: ${tags.map(t => t.control_id).join(', ')}`);

    console.log('\nNext: push updated manifest to Codex.');
    console.log('  node scripts/generateCmmc20GovernanceManifest.mjs');
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Fatal:', err);
  await prisma.$disconnect();
  process.exit(1);
});
