import { ReactNode, useEffect, useRef, useState } from 'react';

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="f">
      {label}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** Numeric input that keeps its own text while typing and reports valid numbers. */
export function NumInput({
  value, onChange, min, max, step, placeholder, allowEmpty, disabled
}: {
  value: number | undefined;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number | 'any';
  placeholder?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState(value === undefined || (allowEmpty && !value) ? '' : String(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      last.current = value;
      setText(value === undefined || (allowEmpty && !value) ? '' : String(value));
    }
  }, [value, allowEmpty]);
  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      min={min}
      max={max}
      step={step ?? 'any'}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => {
        setText(e.target.value);
        if (e.target.value === '') {
          if (allowEmpty) {
            last.current = 0;
            onChange(0);
          }
          return;
        }
        let n = Number(e.target.value);
        if (Number.isNaN(n)) return;
        if (min !== undefined && n < min) n = min;
        if (max !== undefined && n > max) n = max;
        last.current = n;
        onChange(n);
      }}
      onBlur={() => {
        if (text === '' && !allowEmpty) setText(String(value ?? 0));
      }}
    />
  );
}

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')}>
        <div className="row sp" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn sm" onClick={onClose}>✕ Mbyll</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'pos' | 'neg' }) {
  return (
    <div className="stat">
      <div className="l">{label}</div>
      <div className={'v ' + (tone ?? '')}>{value}</div>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div className="tabs">
      {tabs.map((t) => (
        <button key={t.key} className={value === t.key ? 'on' : ''} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const confirmDo = (msg: string) => window.confirm(msg);

export function Warnings({ errors, warnings }: { errors?: string[]; warnings?: string[] }) {
  return (
    <>
      {(errors ?? []).map((e, i) => (
        <div key={'e' + i} className="alert err">⚠ {e}</div>
      ))}
      {(warnings ?? []).map((e, i) => (
        <div key={'w' + i} className="alert warn">{e}</div>
      ))}
    </>
  );
}
