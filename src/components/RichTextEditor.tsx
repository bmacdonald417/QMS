import { useCallback, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table/kit';

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
}

/**
 * Rich text editor with table support. Accepts paste from Word/Excel with tables and formatting.
 * Outputs HTML; use DocumentContentRender to display safely.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Enter content… You can paste tables and formatted text.',
  minHeight = '200px',
  className = '',
}: RichTextEditorProps) {
  const editorRef = useRef<ReturnType<typeof useEditor> | null>(null);
  const editor = useEditor({
    extensions: [
      StarterKit,
      TableKit,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert max-w-none min-h-[120px] p-3 focus:outline-none',
      },
    },
  });
  editorRef.current = editor;

  const emitHtml = useCallback(() => {
    if (!editor) return;
    const html = editor.getHTML();
    if (html !== value) onChange(html);
  }, [editor, value, onChange]);

  useEffect(() => {
    if (!editor) return;
    editor.on('update', emitHtml);
    return () => {
      editor.off('update', emitHtml);
    };
  }, [editor, emitHtml]);

  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    const norm = (s: string) => (s || '').trim() || '<p></p>';
    if (norm(value) !== norm(current)) editor.commands.setContent(value || '<p></p>', { emitUpdate: false });
  }, [value, editor]);

  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom;
    const onPaste = (e: ClipboardEvent) => {
      const html = e.clipboardData?.getData('text/html');
      if (html && editorRef.current) {
        editorRef.current.chain().focus().insertContent(html, { parseOptions: { preserveWhitespace: 'full' } }).run();
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener('paste', onPaste);
    return () => el.removeEventListener('paste', onPaste);
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={`rounded-lg border border-surface-border bg-surface-elevated overflow-hidden ${className}`}
      style={{ minHeight }}
    >
      <EditorContent editor={editor} />
      <style>{`
        .ProseMirror p { margin: 0.25em 0; }
        .ProseMirror table { border-collapse: collapse; width: 100%; margin: 0.5em 0; }
        .ProseMirror th, .ProseMirror td { border: 1px solid var(--color-surface-border, #374151); padding: 6px 10px; text-align: left; }
        .ProseMirror th { background: rgba(255,255,255,0.06); font-weight: 600; }
        .ProseMirror-focused { outline: none; }
      `}</style>
    </div>
  );
}
