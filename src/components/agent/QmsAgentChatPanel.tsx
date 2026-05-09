import { useCallback, useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export type AssistantDraftSuggest = {
  moduleName?: string;
  componentName?: string | null;
  description?: string;
  businessReason?: string;
  priority?: string;
};

export type AssistantDraftWorkflow = {
  workflowName?: string;
  objective?: string;
  triggerEvent?: string;
  requiredRoles?: string[];
  approvalSteps?: string[];
  notificationNeeds?: string;
  auditTrailRequirements?: string;
  trainingLinkageRequired?: boolean;
  periodicReviewRequired?: boolean;
  outputType?: string;
  businessReason?: string;
  priority?: string;
};

type AssistantChatResponse = {
  reply: string;
  draftSuggest?: AssistantDraftSuggest | null;
  draftWorkflow?: AssistantDraftWorkflow | null;
  provider?: string;
  error?: boolean;
};

type Props = {
  mode: 'suggest' | 'workflow';
  routePath: string;
  token: string;
  /** Last structured draft from the assistant (for Apply button). */
  lastDraft: { suggest: AssistantDraftSuggest | null; workflow: AssistantDraftWorkflow | null };
  onLastDraftChange: (d: { suggest: AssistantDraftSuggest | null; workflow: AssistantDraftWorkflow | null }) => void;
  onApplySuggestDraft: (d: AssistantDraftSuggest) => void;
  onApplyWorkflowDraft: (d: AssistantDraftWorkflow) => void;
  /** Bubble into parent banner */
  onChatError: (msg: string) => void;
  onChatSuccess: (msg: string) => void;
};

function welcomeMessage(mode: 'suggest' | 'workflow', routePath: string): string {
  if (mode === 'suggest') {
    return `Hi — I’m here to help you refine a suggest update for "${routePath}". Describe what should change, who it affects, and any acceptance criteria. When you like the draft, use "Apply draft to form", review the Form tab, then submit the intake.`;
  }
  return `Hi — let’s design a workflow for "${routePath}". Tell me the trigger, roles, approvals, notifications, and audit needs. I’ll propose a structured draft you can edit and submit (governed intake only — nothing auto-applies to production).`;
}

export function QmsAgentChatPanel({
  mode,
  routePath,
  token,
  lastDraft,
  onLastDraftChange,
  onApplySuggestDraft,
  onApplyWorkflowDraft,
  onChatError,
  onChatSuccess,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMessages([{ role: 'assistant', content: welcomeMessage(mode, routePath) }]);
    setInput('');
    onLastDraftChange({ suggest: null, workflow: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset thread when route/mode changes
  }, [mode, routePath]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    onChatError('');
    onChatSuccess('');
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(nextMessages);
    setInput('');
    setLoading(true);
    try {
      const data = await apiRequest<AssistantChatResponse>('/api/agent/assistant/chat', {
        token,
        method: 'POST',
        body: {
          mode,
          routePath,
          messages: nextMessages,
        },
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
      onLastDraftChange({
        suggest: data.draftSuggest ?? null,
        workflow: data.draftWorkflow ?? null,
      });
      if (data.provider === 'offline') {
        onChatSuccess('Tip: set OPENAI_API_KEY on the server for richer, iterative coaching.');
      }
    } catch (e) {
      onChatError(e instanceof Error ? e.message : 'Chat failed');
      setMessages((prev) => prev.slice(0, -1));
      setInput(text);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, mode, routePath, token, onChatError, onChatSuccess, onLastDraftChange]);

  const applyDraft = () => {
    onChatError('');
    onChatSuccess('');
    if (mode === 'suggest' && lastDraft.suggest) {
      onApplySuggestDraft(lastDraft.suggest);
      onChatSuccess('Draft applied to the form tab. Review and submit when ready.');
      return;
    }
    if (mode === 'workflow' && lastDraft.workflow) {
      onApplyWorkflowDraft(lastDraft.workflow);
      onChatSuccess('Draft applied to the form tab. Review and submit when ready.');
      return;
    }
    onChatError('No draft yet — send a message so the assistant can propose structured fields.');
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-secondary/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-gray-300">Assistant</p>
        <span className="text-[10px] uppercase tracking-wide text-gray-600">Intake only</span>
      </div>
      <div className="max-h-[42vh] min-h-[180px] space-y-2 overflow-y-auto rounded border border-border bg-card/80 p-2">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`rounded-lg px-2.5 py-2 text-sm ${
              m.role === 'user' ? 'ml-6 bg-primary/15 text-gray-100' : 'mr-4 bg-secondary text-gray-200'
            }`}
          >
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
              {m.role === 'user' ? 'You' : 'Assistant'}
            </div>
            <div className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{m.content}</div>
          </div>
        ))}
        {loading ? <p className="text-xs text-gray-500">Thinking…</p> : null}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={2}
          placeholder={mode === 'suggest' ? 'Describe the change you want…' : 'Describe the workflow you need…'}
          className="min-h-[44px] flex-1 resize-y rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-gray-100"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <Button
          type="button"
          onClick={() => void send()}
          disabled={loading || !input.trim()}
          className="self-end"
          aria-label="Send message"
          title="Send"
        >
          <Send className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={applyDraft} disabled={loading}>
          Apply draft to form
        </Button>
      </div>
      <p className="text-[11px] text-gray-600">
        Chat is advisory. Submitting still uses the structured intake request so changes stay auditable and human-controlled.
      </p>
    </div>
  );
}
