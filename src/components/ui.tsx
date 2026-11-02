import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

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

/** Last pointer position, so a window can "fly out" of whatever was just clicked. */
let lastPointer: { x: number; y: number; t: number } | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', (e) => { lastPointer = { x: e.clientX, y: e.clientY, t: Date.now() }; }, true);
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  const close = () => {
    if (closing) return;
    if (reducedMotion()) return closeRef.current();
    setClosing(true);
    window.setTimeout(() => closeRef.current(), 230);
  };

  // Start the window at the point that was clicked, then let CSS animate it into place.
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = lastPointer && Date.now() - lastPointer.t < 1500 ? lastPointer : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    el.style.setProperty('--dx', `${Math.round(p.x - (r.left + r.width / 2))}px`);
    el.style.setProperty('--dy', `${Math.round(p.y - (r.top + Math.min(r.height, window.innerHeight) / 2))}px`);
  }, []);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', k);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', k);
      document.body.classList.remove('modal-open');
    };
  });

  return (
    <div className={'modal-bg' + (closing ? ' closing' : '')} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={box} className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="row sp modal-head">
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn sm" onClick={close}>✕ Mbyll</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Adds the `in` class once the element scrolls into view (staggered reveal). */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]:not(.in)'));
    if (reducedMotion() || !('IntersectionObserver' in window)) {
      items.forEach((i) => i.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12 });
    items.forEach((i, n) => {
      i.style.setProperty('--d', `${Math.min(n, 10) * 60}ms`);
      io.observe(i);
    });
    return () => io.disconnect();
  });
  return ref;
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
