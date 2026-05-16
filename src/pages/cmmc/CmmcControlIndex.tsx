import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';
import { Badge, Input } from '@/components/ui';
import { FileText, Search, ChevronDown, ChevronRight, Link2, BookOpen } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DocRow {
  documentId: string;
  title: string;
  documentType: string;
  version: string;
  controls: string[];
}

interface CoverageData {
  documents: DocRow[];
}

// Full 110-control inventory with descriptions.
// Domain prefix → control list.
const CONTROLS: Array<{ id: string; title: string }> = [
  { id:'3.1.1',  title:'Limit system access to authorized users, processes acting on behalf of authorized users, and devices (including other systems)' },
  { id:'3.1.2',  title:'Limit system access to the types of transactions and functions that authorized users are permitted to execute' },
  { id:'3.1.3',  title:'Control the flow of CUI in accordance with approved authorizations' },
  { id:'3.1.4',  title:'Separate the duties of individuals to reduce the risk of malevolent activity without collusion' },
  { id:'3.1.5',  title:'Employ the principle of least privilege, including for specific security functions and privileged accounts' },
  { id:'3.1.6',  title:'Use non-privileged accounts or roles when accessing non-security functions' },
  { id:'3.1.7',  title:'Prevent non-privileged users from executing privileged functions and capture the execution of such functions in audit logs' },
  { id:'3.1.8',  title:'Limit unsuccessful logon attempts' },
  { id:'3.1.9',  title:'Provide privacy and security notices consistent with CUI rules' },
  { id:'3.1.10', title:'Use session lock with pattern-hiding displays after a period of inactivity' },
  { id:'3.1.11', title:'Terminate (automatically) a user session after a defined condition' },
  { id:'3.1.12', title:'Monitor and control remote access sessions' },
  { id:'3.1.13', title:'Employ cryptographic mechanisms to protect the confidentiality of remote access sessions' },
  { id:'3.1.14', title:'Route remote access via managed access control points' },
  { id:'3.1.15', title:'Authorize remote execution of privileged commands and access to security-relevant information via remote access only for documented operational needs' },
  { id:'3.1.16', title:'Authorize wireless access prior to allowing such connections' },
  { id:'3.1.17', title:'Protect wireless access using authentication and encryption' },
  { id:'3.1.18', title:'Control connection of mobile devices' },
  { id:'3.1.19', title:'Encrypt CUI on mobile devices and mobile computing platforms' },
  { id:'3.1.20', title:'Verify and control/limit connections to external systems' },
  { id:'3.1.21', title:'Limit use of portable storage devices on external systems' },
  { id:'3.1.22', title:'Control CUI posted or processed on publicly accessible systems' },
  { id:'3.2.1',  title:'Ensure that personnel are aware of the security risks associated with their activities' },
  { id:'3.2.2',  title:'Ensure that personnel are trained to carry out their assigned information security responsibilities' },
  { id:'3.2.3',  title:'Provide security awareness training on recognizing and reporting potential threats' },
  { id:'3.3.1',  title:'Create and retain system audit logs and records to enable the monitoring, analysis, investigation, and reporting of unlawful or unauthorized activity' },
  { id:'3.3.2',  title:'Ensure that the actions of individual system users can be uniquely traced to those users so they can be held accountable for their actions' },
  { id:'3.3.3',  title:'Review and update logged events' },
  { id:'3.3.4',  title:'Alert in the event of an audit logging process failure' },
  { id:'3.3.5',  title:'Correlate audit record review, analysis, and reporting processes for investigation and response to indications of unlawful, unauthorized, suspicious, or unusual activity' },
  { id:'3.3.6',  title:'Provide audit record reduction and report generation to support on-demand analysis and reporting' },
  { id:'3.3.7',  title:'Provide a system capability that compares and synchronizes internal clocks with an authoritative source' },
  { id:'3.3.8',  title:'Protect audit information and audit tools from unauthorized access, modification, and deletion' },
  { id:'3.3.9',  title:'Limit management of audit logging to a subset of privileged users' },
  { id:'3.4.1',  title:'Establish and maintain baseline configurations and inventories of organizational systems' },
  { id:'3.4.2',  title:'Establish and enforce security configuration settings for IT products' },
  { id:'3.4.3',  title:'Track, review, approve/disapprove, and log changes to organizational systems' },
  { id:'3.4.4',  title:'Analyze the security impact of changes prior to implementation' },
  { id:'3.4.5',  title:'Define, document, approve, and enforce physical and logical access restrictions associated with changes' },
  { id:'3.4.6',  title:'Employ the principle of least functionality by configuring organizational systems to provide only essential capabilities' },
  { id:'3.4.7',  title:'Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services' },
  { id:'3.4.8',  title:'Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software' },
  { id:'3.4.9',  title:'Control and monitor user-installed software' },
  { id:'3.5.1',  title:'Identify system users, processes acting on behalf of users, and devices' },
  { id:'3.5.2',  title:'Authenticate (or verify) the identities of those users, processes, or devices, as a prerequisite to allowing access' },
  { id:'3.5.3',  title:'Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts' },
  { id:'3.5.4',  title:'Employ replay-resistant authentication mechanisms' },
  { id:'3.5.5',  title:'Employ identifier management' },
  { id:'3.5.6',  title:'Disable inactive identifiers' },
  { id:'3.5.7',  title:'Enforce a minimum password complexity and change when new passwords are created' },
  { id:'3.5.8',  title:'Prohibit password reuse for a specified number of generations' },
  { id:'3.5.9',  title:'Allow temporary password use with an immediate change requirement' },
  { id:'3.5.10', title:'Store and transmit only cryptographically-protected passwords' },
  { id:'3.5.11', title:'Obscure feedback of authentication information' },
  { id:'3.6.1',  title:'Establish an operational incident-handling capability including preparation, detection, analysis, containment, recovery, and user response activities' },
  { id:'3.6.2',  title:'Track, document, and report incidents to appropriate officials and/or authorities' },
  { id:'3.6.3',  title:'Test the organizational incident response capability' },
  { id:'3.7.1',  title:'Perform maintenance on organizational systems' },
  { id:'3.7.2',  title:'Provide controls on the tools, techniques, mechanisms, and personnel for performing system maintenance' },
  { id:'3.7.3',  title:'Ensure equipment removed for off-site maintenance is sanitized' },
  { id:'3.7.4',  title:'Check media containing diagnostic and test programs for malicious code before using' },
  { id:'3.7.5',  title:'Require MFA to establish nonlocal maintenance sessions; terminate when complete' },
  { id:'3.7.6',  title:'Supervise the maintenance activities of personnel without required access authorization' },
  { id:'3.8.1',  title:'Protect (i.e., physically control and securely store) system media, both paper and digital' },
  { id:'3.8.2',  title:'Limit access to CUI on system media to authorized users' },
  { id:'3.8.3',  title:'Sanitize or destroy system media before disposal or reuse' },
  { id:'3.8.4',  title:'Mark media with necessary CUI markings and distribution limitations' },
  { id:'3.8.5',  title:'Control access to media containing CUI and maintain accountability for media during transport' },
  { id:'3.8.6',  title:'Implement cryptographic mechanisms to protect CUI during transport unless otherwise protected' },
  { id:'3.8.7',  title:'Control the use of removable media on system components' },
  { id:'3.8.8',  title:'Prohibit the use of portable storage devices when such devices have no identifiable owner' },
  { id:'3.8.9',  title:'Protect the confidentiality of backup CUI at storage locations' },
  { id:'3.9.1',  title:'Screen individuals prior to authorizing access to organizational systems containing CUI' },
  { id:'3.9.2',  title:'Ensure that CUI is protected during and after personnel actions such as terminations and transfers' },
  { id:'3.10.1', title:'Limit physical access to organizational systems to authorized individuals' },
  { id:'3.10.2', title:'Protect and monitor the physical facility and support infrastructure for organizational systems' },
  { id:'3.10.3', title:'Escort visitors and monitor visitor activity' },
  { id:'3.10.4', title:'Maintain audit logs of physical access' },
  { id:'3.10.5', title:'Control and manage physical access devices' },
  { id:'3.10.6', title:'Enforce safeguarding measures for CUI at alternate work sites' },
  { id:'3.11.1', title:'Periodically assess the risk to organizational operations, assets, and individuals resulting from CUI operations' },
  { id:'3.11.2', title:'Scan for vulnerabilities in organizational systems and applications periodically and when new vulnerabilities are identified' },
  { id:'3.11.3', title:'Remediate vulnerabilities in accordance with risk assessments' },
  { id:'3.12.1', title:'Periodically assess the security controls in organizational systems to determine if the controls are effective' },
  { id:'3.12.2', title:'Develop and implement plans of action designed to correct deficiencies' },
  { id:'3.12.3', title:'Monitor security controls on an ongoing basis' },
  { id:'3.12.4', title:'Develop, document, and periodically update system security plans' },
  { id:'3.13.1', title:'Monitor, control, and protect communications at the external boundaries and key internal boundaries of organizational systems' },
  { id:'3.13.2', title:'Employ architectural designs, software development techniques, and systems engineering principles that promote effective information security' },
  { id:'3.13.3', title:'Separate user functionality from system management functionality' },
  { id:'3.13.4', title:'Prevent unauthorized and unintended information transfer via shared system resources' },
  { id:'3.13.5', title:'Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks' },
  { id:'3.13.6', title:'Deny network communications traffic by default and allow by exception' },
  { id:'3.13.7', title:'Prevent remote devices from simultaneously using a VPN tunnel to connect to the system and communicating via some other connection' },
  { id:'3.13.8', title:'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission' },
  { id:'3.13.9', title:'Terminate network connections after a defined period of inactivity' },
  { id:'3.13.10', title:'Establish and manage cryptographic keys for required cryptography' },
  { id:'3.13.11', title:'Employ FIPS-validated cryptography when used to protect the confidentiality of CUI' },
  { id:'3.13.12', title:'Prohibit remote activation of collaborative computing devices and provide indication of use' },
  { id:'3.13.13', title:'Control and monitor the use of mobile code' },
  { id:'3.13.14', title:'Control and monitor the use of VoIP technologies' },
  { id:'3.13.15', title:'Protect the authenticity of communications sessions' },
  { id:'3.13.16', title:'Protect CUI at rest' },
  { id:'3.14.1', title:'Identify, report, and correct system flaws in a timely manner' },
  { id:'3.14.2', title:'Provide protection from malicious code at appropriate locations' },
  { id:'3.14.3', title:'Monitor system security alerts and advisories and take action in response' },
  { id:'3.14.4', title:'Update malicious code protection mechanisms when new releases are available' },
  { id:'3.14.5', title:'Perform periodic scans of organizational systems and real-time scans of files from external sources' },
  { id:'3.14.6', title:'Monitor organizational systems including inbound and outbound communications traffic' },
  { id:'3.14.7', title:'Identify unauthorized use of organizational systems' },
];

const DOMAINS = [
  { id: 'AC', prefix: '3.1',  name: 'Access Control' },
  { id: 'AT', prefix: '3.2',  name: 'Awareness & Training' },
  { id: 'AU', prefix: '3.3',  name: 'Audit & Accountability' },
  { id: 'CM', prefix: '3.4',  name: 'Configuration Management' },
  { id: 'IA', prefix: '3.5',  name: 'Identification & Authentication' },
  { id: 'IR', prefix: '3.6',  name: 'Incident Response' },
  { id: 'MA', prefix: '3.7',  name: 'Maintenance' },
  { id: 'MP', prefix: '3.8',  name: 'Media Protection' },
  { id: 'PS', prefix: '3.9',  name: 'Personnel Security' },
  { id: 'PE', prefix: '3.10', name: 'Physical Protection' },
  { id: 'RA', prefix: '3.11', name: 'Risk Assessment' },
  { id: 'CA', prefix: '3.12', name: 'Security Assessment' },
  { id: 'SC', prefix: '3.13', name: 'System & Comms Protection' },
  { id: 'SI', prefix: '3.14', name: 'System & Info Integrity' },
];

function domainFor(controlId: string) {
  return DOMAINS.find((d) => controlId.startsWith(d.prefix + '.'));
}

export function CmmcControlIndex() {
  const { token } = useAuth();
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set(DOMAINS.map((d) => d.id)));

  useEffect(() => {
    if (!token) return;
    apiRequest<CoverageData>('/api/cmmc/section/coverage', { token })
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token]);

  // Build control → docs map
  const controlToDocs = useMemo(() => {
    const m = new Map<string, DocRow[]>();
    if (!data) return m;
    for (const doc of data.documents) {
      for (const c of doc.controls) {
        const arr = m.get(c) ?? [];
        arr.push(doc);
        m.set(c, arr);
      }
    }
    return m;
  }, [data]);

  const filteredControls = useMemo(() => {
    if (!search) return CONTROLS;
    const q = search.toLowerCase();
    return CONTROLS.filter(
      (c) =>
        c.id.includes(q) ||
        c.title.toLowerCase().includes(q) ||
        (controlToDocs.get(c.id) ?? []).some(
          (d) => d.documentId.toLowerCase().includes(q) || d.title.toLowerCase().includes(q),
        ),
    );
  }, [search, controlToDocs]);

  const toggle = (domainId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(domainId) ? next.delete(domainId) : next.add(domainId);
      return next;
    });
  };

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Sticky search */}
      <div className="sticky top-0 z-10 border-b border-border bg-background px-5 py-3 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search controls or documents…"
            className="pl-8 h-8 text-sm"
          />
        </div>
        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setExpanded(new Set(DOMAINS.map((d) => d.id)))}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Expand all
          </button>
          <span className="text-muted-foreground">·</span>
          <button
            onClick={() => setExpanded(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Collapse all
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-3">
        {DOMAINS.map((domain) => {
          const domainControls = filteredControls.filter((c) =>
            c.id.startsWith(domain.prefix + '.'),
          );
          if (domainControls.length === 0) return null;
          const isOpen = expanded.has(domain.id);

          return (
            <div key={domain.id} className="rounded-lg border border-border overflow-hidden">
              {/* Domain header */}
              <button
                onClick={() => toggle(domain.id)}
                className="w-full flex items-center gap-3 px-4 py-3 bg-muted/50 hover:bg-muted transition-colors text-left"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                )}
                <span className="font-mono text-xs font-bold text-muted-foreground">{domain.id}</span>
                <span className="text-sm font-semibold">{domain.name}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {domainControls.length} control{domainControls.length !== 1 ? 's' : ''}
                </span>
              </button>

              {/* Controls */}
              {isOpen && (
                <div className="divide-y divide-border">
                  {domainControls.map((ctrl) => {
                    const docs = controlToDocs.get(ctrl.id) ?? [];
                    return (
                      <div key={ctrl.id} className="px-4 py-3 flex gap-4">
                        {/* Control ID */}
                        <div className="w-16 shrink-0">
                          <span className="font-mono text-xs font-semibold text-muted-foreground">
                            {ctrl.id}
                          </span>
                        </div>
                        {/* Description + coverage */}
                        <div className="flex-1 min-w-0 space-y-1.5">
                          <p className="text-sm text-muted-foreground leading-snug">{ctrl.title}</p>
                          {docs.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {docs.map((doc) => (
                                <Link
                                  key={doc.documentId}
                                  to={`/documents/by-code/${doc.documentId}`}
                                  className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-0.5 text-xs hover:bg-secondary transition-colors"
                                >
                                  <FileText className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-mono">{doc.documentId}</span>
                                  <span className="text-muted-foreground truncate max-w-[12rem]">
                                    {doc.title}
                                  </span>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Link2 className="h-3 w-3" />
                              <span>Covered by register or Option B — see</span>
                              <Link to="/cmmc" className="underline hover:text-foreground">
                                CMMC Overview
                              </Link>
                            </div>
                          )}
                        </div>
                        {/* Coverage badge */}
                        <div className="shrink-0">
                          {docs.length > 0 ? (
                            <Badge variant="success" className="text-[10px]">
                              {docs.length} doc{docs.length !== 1 ? 's' : ''}
                            </Badge>
                          ) : (
                            <Badge variant="neutral" className="text-[10px]">
                              <BookOpen className="h-2.5 w-2.5 mr-0.5" />
                              Register
                            </Badge>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
