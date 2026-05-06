import { useEffect, useState } from 'react';
import { Navigate, Link, useParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { apiRequest } from '@/lib/api';

// Permalink shim. The codex CMMC contract emits permalinks keyed off the
// human document code (e.g. MAC-POL-210), not the row UUID — codes are
// stable across version-row turnover, UUIDs are not. This component
// resolves the code to the canonical /documents/:uuid URL via
// GET /api/documents/by-code/:documentId and redirects.
export default function DocumentByCodeRedirect() {
  const { documentId } = useParams<{ documentId: string }>();
  const { token } = useAuth();
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (!documentId) {
      setNotFound(true);
      return;
    }
    let cancelled = false;
    apiRequest<{ id: string }>(
      `/api/documents/by-code/${encodeURIComponent(documentId)}`,
      { token }
    )
      .then((data) => {
        if (cancelled) return;
        if (data?.id) setResolvedId(data.id);
        else setNotFound(true);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const status = (err as { status?: number } | null)?.status;
        if (status === 404) setNotFound(true);
        else setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId, token]);

  if (resolvedId) {
    return <Navigate to={`/documents/${resolvedId}`} replace />;
  }

  if (notFound) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold text-gray-900">
          Document not found
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          No document with code <code className="rounded bg-gray-100 px-1.5 py-0.5">{documentId}</code> exists in this workspace.
        </p>
        <Link to="/documents" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Back to documents
        </Link>
      </div>
    );
  }

  if (errored) {
    return (
      <div className="mx-auto max-w-xl p-8">
        <h1 className="text-xl font-semibold text-gray-900">
          Could not resolve document
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Something went wrong looking up <code className="rounded bg-gray-100 px-1.5 py-0.5">{documentId}</code>. Try again, or browse the document list.
        </p>
        <Link to="/documents" className="mt-4 inline-block text-sm text-blue-600 hover:underline">
          ← Back to documents
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl p-8 text-sm text-gray-500">
      Resolving permalink…
    </div>
  );
}
