// SPDX-FileCopyrightText: 2026 Atanas G. Rusev
// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef, useState } from 'react';
import { EditPencilIcon } from './icons';

/** The displayed text remains in flow so editing never changes its outer box. */
export function EditableIssueTitle({title, className, onSave, label, as: Tag = "div"}: {
  as?: "div" | "h2"; title: string; className: string; label: string;
  onSave?: (title: string, expectedTitle: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [original, setOriginal] = useState(title);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const cancelled = useRef(false);
  useEffect(() => { if (!onSave) { setDraft(null); setError(''); } }, [!!onSave]);
  const start = () => { if (!onSave || pending.current) return; cancelled.current = false; setOriginal(title); setDraft(title); setError(''); };
  const save = async () => {
    if (cancelled.current || pending.current || draft === null || !onSave) return;
    const next = draft.trim();
    if (!next || next.length > 255) { setError('Use 1 to 255 characters.'); return; }
    if (next === original) { setDraft(null); return; }
    pending.current = true; setSaving(true); setError('');
    try { await onSave(next, original); setDraft(null); }
    catch (error) { setError((error as Error).message); }
    finally { pending.current = false; setSaving(false); }
  };
  return <>
    <Tag className={`${className} editable-issue-title${draft !== null ? ' is-editing' : ''}`}>
      <span className="issue-title-text">{draft !== null ? original : title}</span>
      {draft === null && onSave ? <button type="button" className="issue-title-trigger" aria-label={label} title="Edit title" onClick={start}><span className="issue-title-pencil"><EditPencilIcon /></span></button> : null}
      {draft !== null ? <textarea autoFocus aria-label={label} aria-invalid={!!error} maxLength={255} value={draft} readOnly={saving}
        onChange={event => setDraft(event.target.value)} onBlur={() => { void save(); }}
        onKeyDown={event => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape' && !pending.current) { event.preventDefault(); cancelled.current = true; setDraft(null); setError(''); }
          if (event.key === 'Enter') { event.preventDefault(); void save(); }
        }} /> : null}
    </Tag>
    {error ? <p className="issue-title-error" role="alert">{error}</p> : null}
  </>;
}
