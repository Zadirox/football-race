'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';

export type SearchSelectOption = {
  id: string;
  name: string;
  context?: string;
};

type Props = {
  name: string;
  label: string;
  options: SearchSelectOption[];
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
};

export function SearchSelect({ name, label, options, placeholder, required, defaultValue }: Props) {
  const id = useId();
  const listId = `${id}-list`;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(defaultValue ?? '');
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => options.find((o) => o.id === selectedId) ?? null, [options, selectedId]);

  useEffect(() => {
    if (!selected) return;
    setQuery(selected.context ? `${selected.name} — ${selected.context}` : selected.name);
  }, [selected]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 50);
    const scored = options
      .map((o) => {
        const hay = `${o.name} ${o.context ?? ''}`.toLowerCase();
        const idx = hay.indexOf(q);
        return idx === -1 ? null : { o, idx };
      })
      .filter((x): x is { o: SearchSelectOption; idx: number } => x !== null)
      .sort((a, b) => a.idx - b.idx || a.o.name.localeCompare(b.o.name, 'ru'))
      .slice(0, 50)
      .map((x) => x.o);
    return scored;
  }, [options, query]);

  function choose(option: SearchSelectOption) {
    setSelectedId(option.id);
    setQuery(option.context ? `${option.name} — ${option.context}` : option.name);
    setOpen(false);
  }

  function onChange(next: string) {
    setQuery(next);
    setOpen(true);
    // Сбрасываем выбор, если пользователь меняет текст вручную.
    if (selected) {
      const labelText = selected.context ? `${selected.name} — ${selected.context}` : selected.name;
      if (next !== labelText) setSelectedId('');
    }
  }

  return (
    <div className="field" ref={rootRef} style={{ position: 'relative' }}>
      <label htmlFor={id}>{label}</label>
      <input type="hidden" name={name} value={selectedId} />
      <input
        id={id}
        className="input"
        type="text"
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        required={required}
        aria-expanded={open}
        aria-controls={listId}
        onFocus={() => setOpen(true)}
        onChange={(e) => onChange(e.target.value)}
      />
      {open && (
        <div
          id={listId}
          role="listbox"
          style={{
            position: 'absolute',
            zIndex: 30,
            left: 0,
            right: 0,
            top: '100%',
            marginTop: 4,
            maxHeight: 240,
            overflowY: 'auto',
            background: 'var(--panel, #12202d)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
          }}
        >
          {filtered.length === 0 ? (
            <div style={{ padding: '10px 12px', opacity: 0.7 }}>Ничего не найдено</div>
          ) : (
            filtered.map((o) => (
              <button
                key={o.id}
                type="button"
                role="option"
                aria-selected={o.id === selectedId}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(o)}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: o.id === selectedId ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <div style={{ fontWeight: 600 }}>{o.name}</div>
                {o.context && (
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{o.context}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}
      {required && !selectedId && (
        <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>Выберите значение из списка</div>
      )}
    </div>
  );
}
