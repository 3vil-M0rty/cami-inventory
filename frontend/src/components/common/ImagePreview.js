import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { XCircle } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import './ImagePreview.css';

// Article image shown big over the page (inventory cards, purchase orders…).
// Clicks and Escape stay inside: the card / window behind (often clickable) is not triggered.
export function ImagePreviewModal({ src, alt, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', handler, true); // before the order window's own Escape
    return () => window.removeEventListener('keydown', handler, true);
  }, [onClose]);

  const close = (e) => { e.stopPropagation(); onClose(); };
  return ReactDOM.createPortal(
    <div className="modal-overlay image-preview-overlay" onClick={close}>
      <div className="image-preview-modal" onClick={e => e.stopPropagation()}>
        <button type="button" className="image-preview-close" onClick={close}>
          <XCircle size={22} strokeWidth={2} />
        </button>
        <img src={src} alt={alt} className="image-preview-img" />
      </div>
    </div>,
    document.body
  );
}

// Small article image that opens the preview when clicked (without opening what is around it)
export function ZoomImg({ src, alt = '', className = '', ...rest }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  if (!src) return null;
  const show = (e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); };
  return (
    <>
      <img
        loading="lazy" decoding="async" {...rest}
        src={src} alt={alt} className={`zoom-img ${className}`.trim()}
        role="button" tabIndex={0} title={t('ivZoomImage')}
        onClick={show}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') show(e); }}
      />
      {open && <ImagePreviewModal src={src} alt={alt} onClose={() => setOpen(false)} />}
    </>
  );
}
