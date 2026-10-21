import { Building2 } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useCompany } from '../../context/CompanyContext';
import './CompanyFilter.css';

// « Toutes · ● CAMI · ● GIMAV » — value: 'all' or a company id
export default function CompanyFilter({ value, onChange }) {
  const { t } = useLanguage();
  const { companies } = useCompany();
  if (!companies || companies.length < 2) return null;
  return (
    <div className="cf-chips" role="radiogroup" aria-label={t('ocfCompany')}>
      <span className="cf-chips__k"><Building2 size={13} /> {t('ocfCompany')}</span>
      <button type="button" role="radio" aria-checked={value === 'all'} className={value === 'all' ? 'is-on' : ''} onClick={() => onChange('all')}>
        {t('ocfAllCompanies')}
      </button>
      {companies.map(c => (
        <button key={c.id} type="button" role="radio" aria-checked={value === c.id}
          className={value === c.id ? 'is-on' : ''} style={{ '--cc': c.color || 'var(--500)' }}
          onClick={() => onChange(c.id)}>
          <span className="cf-chips__dot" />{c.name}
        </button>
      ))}
    </div>
  );
}

// Small coloured company tag for a table cell
export function CompanyTag({ name, color }) {
  if (!name) return <span className="pr-faint">—</span>;
  return <span className="cf-tag" style={{ '--cc': color || 'var(--500)' }}><span className="cf-chips__dot" />{name}</span>;
}
