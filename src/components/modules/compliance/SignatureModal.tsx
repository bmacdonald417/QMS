import { useState } from 'react';
import { Modal, Button, Input } from '@/components/ui';
import { z } from 'zod';

/** 21 CFR Part 11 — electronic signature: re-validate credentials for critical actions */
const signSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  reason: z.string().min(1, 'Reason for signature is required'),
});

export type SignatureResult = z.infer<typeof signSchema> & { signedAt: string };

export interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSign: (result: SignatureResult) => void;
  title?: string;
  intent?: string;
}

export function SignatureModal({
  isOpen,
  onClose,
  onSign,
  title = 'Electronic Signature',
  intent = 'approve this action',
}: SignatureModalProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signSchema.safeParse({ username, password, reason });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        const path = err.path[0] as string;
        if (path) fieldErrors[path] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    onSign({
      ...parsed.data,
      signedAt: new Date().toISOString(),
    });
    setUsername('');
    setPassword('');
    setReason('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="signature-form" variant="success">
            Sign & Submit
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-400 mb-4">
        Re-enter your credentials to electronically sign and {intent}. This action will be recorded
        in the audit trail per 21 CFR Part 11.
      </p>
      <form id="signature-form" onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          error={errors.username}
          autoComplete="username"
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          autoComplete="current-password"
        />
        <Input
          label="Reason for signature"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          error={errors.reason}
          placeholder="e.g. Approved after review"
        />
      </form>
    </Modal>
  );
}
