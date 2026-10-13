import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, XCircle, X } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import './dialog.css';

/**
 * App-wide dialogs that replace window.alert / confirm / prompt.
 * Usable anywhere (components, helpers): the <DialogHost /> mounted once in App renders them.
 *
 *   if (!(await dialog.confirm({ message: t('deleteClientConfirm'), danger: true }))) return;
 *   await dialog.alert(t('saveError'));                       // error / info message
 *   const note = await dialog.prompt({ title, message, defaultValue: '' }); // null when cancelled
 *   dialog.toast(t('exportSuccess'));                          // small notification, no button
 */

let push = null;          // set by <DialogHost />
const queue = [];         // calls made before the host is mounted

function open(kind, options) {
  return new Promise((resolve) => {
    const req = { kind, options, resolve };
    if (push) push(req); else queue.push(req);
  });
}

const asOptions = (o) => (typeof o === 'string' ? { message: o } : (o || {}));

export const dialog = {
  /** Resolves true / false */
  confirm: (o) => open('confirm', asOptions(o)),
  /** Resolves when closed. variant: 'error' (default) | 'info' | 'success' | 'warning' */
  alert: (o) => open('alert', { variant: 'error', ...asOptions(o) }),
  /** Resolves the typed string, or null when cancelled */
  prompt: (o) => open('prompt', asOptions(o)),
  /** Non-blocking notification. type: 'success' | 'error' | 'info' */
  toast: (message, type = 'success') => {
    if (push) push({ kind: 'toast', options: { message, type } });
    else queue.push({ kind: 'toast', options: { message, type }, resolve: () => {} });
  },
};

/** Error message from an axios / fetch error, with a translated fallback */
export const errorMessage = (e, fallback) =>
  e?.response?.data?.error || e?.message || fallback;

const ICONS = {
  error: <XCircle size={20} />,
  warning: <AlertTriangle size={20} />,
  info: <Info size={20} />,
  success: <CheckCircle2 size={20} />,
};

function DialogBox({ req, onDone, t }) {
  const { kind, options } = req;
  const [value, setValue] = useState(options.defaultValue != null ? String(options.defaultValue) : '');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const confirmRef = useRef(null);

  const variant = kind === 'alert' ? options.variant : (options.danger ? 'warning' : 'info');
  const title = options.title || (
    kind === 'alert'
      ? (variant === 'success' ? t('dlgDone') : variant === 'info' ? t('dlgInfo') : variant === 'warning' ? t('dlgWarning') : t('dlgError'))
      : kind === 'prompt' ? t('dlgEnterValue') : t('dlgConfirmTitle')
  );

  const cancel = () => onDone(kind === 'confirm' ? false : kind === 'prompt' ? null : undefined);
  const submit = () => {
    if (kind === 'prompt') {
      if (options.required && !value.trim()) { setError(t('dlgRequired')); return; }
      if (options.validate) {
        const msg = options.validate(value);
        if (msg) { setError(msg); return; }
      }
      onDone(value);
    } else onDone(kind === 'confirm' ? true : undefined);
  };

  useEffect(() => {
    (kind === 'prompt' ? inputRef : confirmRef).current?.focus();
    if (kind === 'prompt') inputRef.current?.select?.();
  }, [kind]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); }
      if (e.key === 'Enter' && !(kind === 'prompt' && options.multiline) && !e.shiftKey) { e.preventDefault(); submit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const confirmLabel = options.confirmLabel || (kind === 'alert' ? t('dlgOk') : options.danger ? t('dlgConfirm') : t('dlgConfirm'));
  const cancelLabel = options.cancelLabel || t('dlgCancel');

  return (
    <div className="dlg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) cancel(); }}>
      <div className={`dlg dlg--${variant}`} role="dialog" aria-modal="true" aria-labelledby="dlg-title">
        <div className="dlg__head">
          <span className="dlg__icon">{ICONS[variant] || ICONS.info}</span>
          <h2 id="dlg-title" className="dlg__title">{title}</h2>
          <button type="button" className="dlg__close" onClick={cancel} aria-label={t('close')}><X size={16} /></button>
        </div>
        {options.message && <div className="dlg__message">{options.message}</div>}
        {options.details && <div className="dlg__details">{options.details}</div>}
        {kind === 'prompt' && (
          <div className="dlg__field">
            {options.label && <label className="dlg__label">{options.label}</label>}
            {options.multiline ? (
              <textarea ref={inputRef} className="dlg__input" rows={3} value={value}
                placeholder={options.placeholder || ''} onChange={(e) => { setValue(e.target.value); setError(''); }} />
            ) : (
              <input ref={inputRef} className="dlg__input" type={options.inputType || 'text'} value={value}
                min={options.min} step={options.step}
                placeholder={options.placeholder || ''} onChange={(e) => { setValue(e.target.value); setError(''); }} />
            )}
            {error && <div className="dlg__error">{error}</div>}
          </div>
        )}
        <div className="dlg__actions">
          {kind !== 'alert' && (
            <button type="button" className="dlg__btn dlg__btn--ghost" onClick={cancel}>{cancelLabel}</button>
          )}
          <button ref={confirmRef} type="button"
            className={`dlg__btn ${options.danger ? 'dlg__btn--danger' : 'dlg__btn--primary'}`} onClick={submit}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Mount once, inside <LanguageProvider> */
export function DialogHost() {
  const { t } = useLanguage();
  const [stack, setStack] = useState([]);
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    push = (req) => {
      if (req.kind === 'toast') {
        const id = Math.random().toString(36).slice(2);
        setToasts(ts => [...ts, { id, ...req.options }]);
        setTimeout(() => setToasts(ts => ts.filter(x => x.id !== id)), 3500);
        return;
      }
      setStack(s => [...s, { ...req, id: Math.random().toString(36).slice(2) }]);
    };
    queue.splice(0).forEach(push);
    return () => { push = null; };
  }, []);

  const top = stack[stack.length - 1];
  const done = (result) => {
    top.resolve(result);
    setStack(s => s.slice(0, -1));
  };

  return ReactDOM.createPortal(
    <>
      {top && <DialogBox key={top.id} req={top} onDone={done} t={t} />}
      {toasts.length > 0 && (
        <div className="dlg-toasts" aria-live="polite">
          {toasts.map(x => (
            <div key={x.id} className={`dlg-toast dlg-toast--${x.type}`}>
              {ICONS[x.type] || ICONS.info}
              <span>{x.message}</span>
            </div>
          ))}
        </div>
      )}
    </>,
    document.body
  );
}
