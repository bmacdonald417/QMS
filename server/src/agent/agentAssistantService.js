/**
 * QMS Agent conversational assistant (suggest vs workflow coaching).
 * Uses OpenAI when OPENAI_API_KEY is set; otherwise returns an offline template response.
 * Does not persist to DB — intake submission remains explicit via POST /api/agent/requests.
 */

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

/**
 * @param {{ mode: 'suggest' | 'workflow'; routePath: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }} input
 */
export async function runAgentAssistantChat({ mode, routePath, messages }) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  const model = process.env.OPENAI_AGENT_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    return buildOfflineAssistantResponse({ mode, routePath, messages });
  }

  const system = buildSystemPrompt(mode, routePath);
  const openAiMessages = [
    { role: 'system', content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 55000);
  try {
    const res = await fetch(OPENAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 2200,
        response_format: { type: 'json_object' },
        messages: openAiMessages,
      }),
      signal: controller.signal,
    });
    const raw = await res.text();
    if (!res.ok) {
      console.error('OpenAI agent chat error:', res.status, raw.slice(0, 500));
      return {
        reply: `Assistant is temporarily unavailable (HTTP ${res.status}). You can still use the form and submit an intake request.`,
        draftSuggest: null,
        draftWorkflow: null,
        provider: 'openai',
        error: true,
      };
    }
    const json = JSON.parse(raw);
    const content = json?.choices?.[0]?.message?.content;
    if (!content || typeof content !== 'string') {
      return {
        reply: 'Unexpected model response shape. Please try again or use the form.',
        draftSuggest: null,
        draftWorkflow: null,
        provider: 'openai',
        error: true,
      };
    }
    const parsed = safeParseModelJson(content);
    return { ...parsed, provider: 'openai', error: false };
  } catch (err) {
    console.error('OpenAI agent chat exception:', err);
    return {
      reply: 'Assistant request failed or timed out. You can still complete the structured form and submit.',
      draftSuggest: null,
      draftWorkflow: null,
      provider: 'openai',
      error: true,
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string} content
 */
function safeParseModelJson(content) {
  try {
    const obj = JSON.parse(content);
    const narrative = typeof obj.narrative === 'string' ? obj.narrative : obj.reply || '';
    const draftSuggest = obj.draftSuggest && typeof obj.draftSuggest === 'object' ? obj.draftSuggest : null;
    const draftWorkflow = obj.draftWorkflow && typeof obj.draftWorkflow === 'object' ? obj.draftWorkflow : null;
    return {
      reply: narrative || 'Here is an updated draft you can apply to the form.',
      draftSuggest,
      draftWorkflow,
    };
  } catch {
    return {
      reply: content,
      draftSuggest: null,
      draftWorkflow: null,
    };
  }
}

/**
 * @param {'suggest' | 'workflow'} mode
 * @param {string} routePath
 */
function buildSystemPrompt(mode, routePath) {
  const base =
    'You are the MacTech QMS Agent assistant. You help Quality and System roles think through governed changes. ' +
    'You must NOT claim to have changed production data, applied migrations, or executed code. ' +
    'Everything is advisory until a human submits an intake request in the QMS. ' +
    `Current UI route context: ${routePath}. ` +
    'Always respond with a single JSON object only (no markdown fences) using keys: ' +
    '"narrative" (string, conversational guidance and suggestions), ' +
    '"draftSuggest" (object or null), "draftWorkflow" (object or null). ' +
    'For suggest mode: fill draftSuggest and set draftWorkflow to null. For workflow mode: fill draftWorkflow and set draftSuggest to null.';

  if (mode === 'suggest') {
    return (
      base +
      ' draftSuggest fields: moduleName (string), componentName (string|null), description (string), businessReason (string), priority (one of LOW|MEDIUM|HIGH|CRITICAL). ' +
      'Keep descriptions concrete and testable.'
    );
  }
  return (
    base +
    ' draftWorkflow fields: workflowName, objective, triggerEvent, requiredRoles (string array), approvalSteps (string array), ' +
    'notificationNeeds, auditTrailRequirements, trainingLinkageRequired (boolean), periodicReviewRequired (boolean), ' +
    'outputType (one of PLAN|SCHEMA|UI|FULL_SCAFFOLD), businessReason, priority (LOW|MEDIUM|HIGH|CRITICAL). ' +
    'Align with typical regulated QMS patterns: segregation of duties, approvals, audit trail, training linkage when relevant.'
  );
}

/**
 * @param {{ mode: 'suggest' | 'workflow'; routePath: string; messages: Array<{ role: string; content: string }> }} params
 */
function buildOfflineAssistantResponse({ mode, routePath, messages }) {
  const lastUser = [...messages].reverse().find((m) => m.role === 'user');
  const text = (lastUser?.content || '').trim();
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (mode === 'suggest') {
    const moduleGuess = guessModuleFromRoute(routePath);
    const draftSuggest = {
      moduleName: moduleGuess,
      componentName: null,
      description: text || `Describe the change you want on ${routePath}.`,
      businessReason:
        text.length > 40
          ? 'Derived from your last message; refine with validation and training impact.'
          : 'Add business / compliance justification (risk, audit, customer impact).',
      priority: 'MEDIUM',
    };
    const reply =
      'Offline assistant (set OPENAI_API_KEY on the server for richer coaching).\n\n' +
      '- I captured your last message and drafted fields you can use with "Apply draft to form".\n' +
      `- Current route: ${routePath}.\n` +
      '- Next: tighten acceptance criteria (what "done" looks like) and any training / document control touchpoints.';
    return { reply, draftSuggest, draftWorkflow: null, provider: 'offline', error: false };
  }

  const roles = lines.filter((l) => /manager|owner|admin|quality|approver/i.test(l)).slice(0, 12);
  const steps = lines
    .filter((l) => /review|approve|verify|release|effectiveness/i.test(l))
    .slice(0, 12);
  const draftWorkflow = {
    workflowName: lines[0]?.slice(0, 120) || `Workflow for ${routePath}`,
    objective: text || 'Define the objective: what outcome and compliance controls does this workflow enforce?',
    triggerEvent: 'Describe the triggering event (e.g., document submitted for review, CAPA opened).',
    requiredRoles: roles.length ? roles : ['Quality Manager', 'Document Owner'],
    approvalSteps: steps.length ? steps : ['Draft review', 'Quality approval', 'Release / effective'],
    notificationNeeds: 'Notify owners on state transitions; avoid leaking sensitive payloads.',
    auditTrailRequirements: 'Immutable audit entries for state changes; attributable actors.',
    trainingLinkageRequired: /training|read-and-understood|competency/i.test(text),
    periodicReviewRequired: /periodic|review/i.test(text),
    outputType: 'PLAN',
    businessReason: 'Governed workflow change aligned to QMS expectations.',
    priority: 'MEDIUM',
  };
  const reply =
    'Offline assistant (set OPENAI_API_KEY on the server for interactive refinement).\n\n' +
    'I turned your last message into a starter workflow draft. Use "Apply draft to form", edit the Form tab, then submit the workflow request when ready.';
  return { reply, draftSuggest: null, draftWorkflow, provider: 'offline', error: false };
}

/**
 * @param {string} routePath
 */
function guessModuleFromRoute(routePath) {
  const p = (routePath || '').toLowerCase();
  if (p.includes('change')) return 'Change Control';
  if (p.includes('document')) return 'Document Control';
  if (p.includes('capa')) return 'CAPA';
  if (p.includes('training')) return 'Training';
  if (p.includes('audit')) return 'Audits';
  return 'General';
}
