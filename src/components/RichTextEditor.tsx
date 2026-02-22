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
        class: 'prose prose-invert max-w-none min-h-[120px] p-3 focus:outline-none break-words',
      },
      handlePaste: (view, event) => {
        const text = event.clipboardData?.getData('text/plain');
        const html = event.clipboardData?.getData('text/html');
        const textLines = text ? text.split(/\r?\n/) : [];

        const esc = (s: string) =>
          s
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

        const usePlainText = text && text.trim().length > 0 && (textLines.length > 1 || !html || html.trim().length === 0);
        if (usePlainText) {
          event.preventDefault();
          const htmlContent = textLines
            .map((line) => `<p>${esc(line.trim()) || '&nbsp;'}</p>`)
            .join('');
          editorRef.current?.chain().focus().insertContent(htmlContent, { parseOptions: { preserveWhitespace: 'full' } }).run();
          return true;
        }
        if (html && html.trim().length > 0) {
          event.preventDefault();
          editorRef.current?.chain().focus().insertContent(html, { parseOptions: { preserveWhitespace: 'full' } }).run();
          return true;
        }
        return false;
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

  if (!editor) return null;

  return (
    <div
      className={`rounded-lg border border-surface-border bg-surface-elevated overflow-hidden ${className}`}
      style={{ minHeight }}
    >
      <EditorContent editor={editor} />
      <style>{`
        .ProseMirror { overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; }
        .ProseMirror p { margin: 0.25em 0; }
        .ProseMirror ul, .ProseMirror ol { margin: 0.5em 0 0.5em 1.5em; padding-left: 2em; list-style-position: outside; }
        .ProseMirror ul { list-style-type: disc; }
        .ProseMirror ol { list-style-type: decimal; }
        .ProseMirror li { margin: 0.25em 0; padding-left: 0.25em; display: list-item; overflow-wrap: break-word; word-wrap: break-word; text-indent: 0; }
        .ProseMirror table { border-collapse: collapse; width: 100%; margin: 0.5em 0; table-layout: fixed; }
        .ProseMirror th, .ProseMirror td { border: 1px solid var(--color-surface-border, #374151); padding: 6px 10px; text-align: left; overflow-wrap: break-word; word-wrap: break-word; word-break: break-word; }
        .ProseMirror th { background: rgba(255,255,255,0.06); font-weight: 600; }
        .ProseMirror-focused { outline: none; }
      `}</style>
    </div>
  );
}
