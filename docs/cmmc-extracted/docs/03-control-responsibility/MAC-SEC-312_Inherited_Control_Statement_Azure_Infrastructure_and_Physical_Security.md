# Azure Inheritance and Shared Responsibility Statement (CUI Enclave)

**Document Code:** MAC-SEC-312  
**Document Title:** Azure Inheritance and Shared Responsibility — Infrastructure and Physical Security  
**Document Version:** 1.1  
**Date:** 2026-03-02  
**Classification:** Internal Use  
**Compliance Framework:** CMMC 2.0 Level 2 (NIST SP 800-171 Rev. 2)

**Authoritative reference (shared responsibility model):** [Shared responsibility in the cloud — Microsoft Azure](https://learn.microsoft.com/en-us/azure/security/fundamentals/shared-responsibility). Azure Government compliance scope: [Azure Government compliance documentation](https://learn.microsoft.com/en-us/azure/azure-government/compliance/).

---

## 1. Purpose

This artifact is the **formal statement of Azure inheritance and shared responsibility** for the MacTech CUI Enclave. It documents which controls are **inherited** from Microsoft Azure, which are **shared** (Azure provides capability; MacTech configures and operates), and which remain **customer responsibility**. It is written to be assessor-defensible and is the single canonical reference for:

- **Inherited controls**: protections provided and operated by Azure; MacTech does not directly operate them and relies on Azure attestations and documentation.
- **Shared responsibility**: Azure provides platform capabilities; MacTech is responsible for configuration, enablement, monitoring, and evidence within the customer boundary.
- **Customer-responsible controls**: controls MacTech implements and operates inside the Windows VM and its governance (policies, procedures, evidence).

---

## 2. Boundary and scope

### 2.1 In-scope system

The **MacTech CUI Enclave** is a **single Windows VM hosted in Azure IaaS**. All CUI bytes are stored/processed/transmitted **only within the enclave VM**.

### 2.2 Out-of-scope components

- User endpoints and external systems are out of scope for CUI storage/processing.
- Access into the enclave is performed via a restricted remote session/bastion approach; those access mechanisms are treated as **management plane** components and do not store/process CUI bytes.

---

## 3. Inherited controls (Azure-provided)

The following control areas are **inherited** from Azure (subject to Azure’s contractual commitments, attestations, and service documentation applicable to the tenant/subscription):

- **Physical security of datacenters**: facility access control, guards, CCTV, visitor controls, environmental protections.
- **Hypervisor and host infrastructure security**: isolation between tenants, host patching, secure boot/hardware controls (provider-operated).
- **Underlying compute, storage, and networking fabric**: platform protection of the datacenter network, storage systems, and managed infrastructure.

**Assessor note:** MacTech does not claim to directly operate Azure physical safeguards; instead MacTech claims these are inherited, and MacTech provides evidence by referencing Azure attestations and platform documentation appropriate to the assessment.

### 3.1 NIST 800-171 / CMMC control mapping (inherited)

| NIST 800-171 | CMMC Practice | Control summary | Responsibility |
|--------------|---------------|-----------------|----------------|
| 3.10.1 | PE.L2-3.10.1 | Limit physical access to organizational systems, equipment, and operating environments | **Inherited** — Azure datacenter physical access |
| 3.10.2 | PE.L2-3.10.2 | Protect and monitor the physical facility and support infrastructure | **Inherited** — Azure facility protection and monitoring |
| 3.10.3 | PE.L2-3.10.3 | Escort and monitor visitors | **Inherited** — Azure datacenter visitor controls |
| 3.10.4 | PE.L2-3.10.4 | Maintain audit logs of physical access | **Inherited** — Azure facility access logging |
| 3.10.5 | PE.L2-3.10.5 | Control and manage physical access devices | **Inherited** — Azure physical access devices |

Evidence for inherited controls: provider attestations (e.g., FedRAMP, SOC, Azure Government compliance docs) retained per Records Retention Policy (MAC-POL-227); boundary and responsibility documented in this statement.

---

## 4. Shared responsibility (Azure + MacTech)

Azure and MacTech share responsibility for:

- **Network boundary configuration**: Azure provides VNet/NSG primitives; MacTech configures allowed ingress/egress and verifies it periodically.
- **Identity and access configuration for Azure resources**: Azure provides IAM primitives; MacTech manages accounts/roles, MFA, and least privilege.
- **Logging/monitoring configuration**: Azure provides logging capabilities; MacTech decides what is enabled, retention, and alerting—ensuring **no CUI bytes are exported**.

*Relevant NIST 800-171 families where responsibility is shared (Azure provides platform; MacTech configures/operates): AC (access control configuration in Azure/Entra), IA (identity/authentication configuration), SC (network segmentation, encryption configuration), AU (audit logging configuration).*

---

## 5. MacTech responsibilities (customer-operated)

MacTech is responsible for controls implemented in the enclave VM and its operations, including but not limited to:

- Windows OS hardening and configuration management
- Account management, MFA enforcement (where applicable), and least privilege within the enclave
- Disk encryption, key management procedures, and access control to encrypted data
- Audit logging, review, and incident response procedures
- Evidence generation and validation workflows under `C:\evidence\`
- Remote access restrictions (e.g., disabling copy/paste/clipboard/file redirection in the remote session configuration)

---

## 6. Evidence expectations (for assessment package)

This inherited statement is supported by:

- Azure compliance/attestation artifacts appropriate to the environment (e.g., SOC reports, ISO certificates, FedRAMP package where applicable)
- Tenant/subscription configuration exports demonstrating network/access posture (as applicable)
- Enclave VM evidence demonstrating local enforcement (e.g., BitLocker status, firewall rules, audit logs, evidence bundle metadata)

---

## 7. Document control

**Prepared By:** MacTech Solutions Compliance Team  
**Reviewed By:** [To be completed]  
**Approved By:** [To be completed]  
**Next Review Date:** [To be completed]

**Related documents:**  
- Record Retention Policy (MAC-POL-227); Physical Security Policy (MAC-POL-212); Visitor Control Procedure (MAC-SOP-249); System Boundary and Scope (MAC-SCOPE-001); CUI Vault Architecture Diagram (MAC-IT-306); System Control Traceability Matrix (MAC-AUD-408).

---

## 8. Change history

| Version | Date | Summary |
|---|---:|---|
| 1.1 | 2026-03-02 | Formalized as Azure Inheritance and Shared Responsibility artifact; added Microsoft reference, NIST 800-171 control mapping table, document control |
| 1.0 | 2026-02-09 | Initial Azure inherited control statement for single-VM Windows CUI enclave boundary |

