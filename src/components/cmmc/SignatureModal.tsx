import { useState } from 'react';
import { Modal, Button, Input } from '@/components/ui';
import { SignatureCanvas } from './SignatureCanvas';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSign: (data: { method: 'TYPED' | 'DRAWN' | 'CLICKWRAP'; role: 'APPROVER' | 'ACKNOWLEDGER'; signatureData: string; password?: string }) => void;
  documentCode: string;
  documentTitle: string;
}

export function SignatureModal({ isOpen, onClose, onSign, documentCode, documentTitle }: SignatureModalProps) {
  const [method, setMethod] = useState<'TYPED' | 'DRAWN' | 'CLICKWRAP'>('TYPED');
  const [role, setRole] = useState<'APPROVER' | 'ACKNOWLEDGER'>('APPROVER');
  const [typedSignature, setTypedSignature] = useState('');
  const [drawnSignature, setDrawnSignature] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmText, setConfirmText] = useState('');

  const handleSign = () => {
    let signatureData = '';
    if (method === 'TYPED') {
      if (!typedSignature.trim()) {
        alert('Please enter your full legal name');
        return;
      }
      signatureData = typedSignature;
    } else if (method === 'DRAWN') {
      if (!drawnSignature) {
        alert('Please draw your signature');
        return;
      }
      signatureData = drawnSignature;
    } else {
      // CLICKWRAP
      signatureData = 'CLICKWRAP_ACKNOWLEDGED';
    }

    // For typed signatures, require password confirmation
    if (method === 'TYPED' && !password) {
      alert('Please enter your password to confirm');
      return;
    }

    // For clickwrap, require confirmation text
    if (method === 'CLICKWRAP' && confirmText !== 'I UNDERSTAND') {
      alert('Please type "I UNDERSTAND" to confirm');
      return;
    }

    onSign({
      method,
      role,
      signatureData,
      password: method === 'TYPED' ? password : undefined,
    });

    // Reset form
    setTypedSignature('');
    setDrawnSignature(null);
    setPassword('');
    setConfirmText('');
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Sign Document">
      <div className="space-y-6">
        <div>
          <p className="text-sm text-gray-400 mb-2">
            You are signing: <span className="font-semibold text-white">{documentCode}</span>
          </p>
          <p className="text-sm text-gray-400">{documentTitle}</p>
        </div>

        <div>
          <label className="label-caps block mb-2">Signature Method</label>
          <div className="flex gap-2">
            <Button
              variant={method === 'TYPED' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setMethod('TYPED')}
            >
              Typed
            </Button>
            <Button
              variant={method === 'DRAWN' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setMethod('DRAWN')}
            >
              Drawn
            </Button>
            <Button
              variant={method === 'CLICKWRAP' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setMethod('CLICKWRAP')}
            >
              Clickwrap
            </Button>
          </div>
        </div>

        <div>
          <label className="label-caps block mb-2">Role</label>
          <select
            className="w-full rounded-lg border border-surface-border bg-surface-elevated px-3 py-2 text-gray-100"
            value={role}
            onChange={(e) => setRole(e.target.value as 'APPROVER' | 'ACKNOWLEDGER')}
          >
            <option value="APPROVER">Approver</option>
            <option value="ACKNOWLEDGER">Acknowledger</option>
          </select>
        </div>

        {method === 'TYPED' && (
          <>
            <Input
              label="Full Legal Name"
              placeholder="Type your full legal name"
              value={typedSignature}
              onChange={(e) => setTypedSignature(e.target.value)}
            />
            <Input
              label="Password Confirmation"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}

        {method === 'DRAWN' && (
          <div>
            <label className="label-caps block mb-2">Draw Your Signature</label>
            <SignatureCanvas onSignatureChange={setDrawnSignature} />
          </div>
        )}

        {method === 'CLICKWRAP' && (
          <div>
            <label className="label-caps block mb-2">
              Type "I UNDERSTAND" to acknowledge
            </label>
            <Input
              placeholder="I UNDERSTAND"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
            />
          </div>
        )}

        <div className="flex gap-3 justify-end pt-4 border-t border-surface-border">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleSign}>
            Sign Document
          </Button>
        </div>
      </div>
    </Modal>
  );
}