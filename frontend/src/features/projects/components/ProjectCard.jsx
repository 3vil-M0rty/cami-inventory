// components/ProjectCard.jsx
import { useAuth } from '../../../context/AuthContext';

// Tinted badge tones (dark theme): [text, background, border]
const STATUS_TONES = {
  non_entame:    ['#d4d4d8', 'rgba(161,161,170,.12)', 'rgba(161,161,170,.3)'],
  en_cours:      ['#fcd34d', 'rgba(251,191,36,.12)',  'rgba(251,191,36,.3)'],
  fabrique:      ['#93c5fd', 'rgba(96,165,250,.12)',  'rgba(96,165,250,.3)'],
  cloture:       ['#86efac', 'rgba(74,222,128,.12)',  'rgba(74,222,128,.3)'],
  non_vitre:     ['#c4b5fd', 'rgba(167,139,250,.12)', 'rgba(167,139,250,.3)'],
  pret_a_livrer: ['#fca5a5', 'rgba(248,113,113,.12)', 'rgba(248,113,113,.3)'],
};

const ETAT_COLORS = {
  non_entame: '#9ca3af',
  en_cours: '#f59e0b',
  non_vitre: '#a855f7',
  fabrique: '#3b82f6',
  pret_a_livrer: '#ef4444',
  livre: '#16a34a',
};

const ETAT_ORDER = ['non_entame', 'en_cours', 'non_vitre', 'fabrique', 'livre', 'pret_a_livrer'];

function getUnit(ch, idx) {
  return (ch.units || []).find(u => u.unitIndex === idx) || { unitIndex: idx, etat: 'non_entame', componentStates: [] };
}

function deriveCompositeEtat(unit, components) {
  if (!components.length) return unit.etat || 'non_entame';
  const states = components.map((_, i) => {
    const cs = (unit.componentStates || []).find(c => c.compIndex === i);
    return cs ? cs.etat : 'non_entame';
  });
  const allowed = ['non_vitre', 'fabrique', 'livre', 'pret_a_livrer'];
  if (states.every(e => allowed.includes(e)) && states.some(e => e === 'non_vitre')) return 'non_vitre';
  if (states.every(e => e === 'livre')) return 'livre';
  if (states.every(e => e === 'pret_a_livrer' || e === 'livre')) return 'pret_a_livrer';
  if (states.every(e => e === 'fabrique' || e === 'pret_a_livrer' || e === 'livre')) return 'fabrique';
  if (states.some(e => e !== 'non_entame')) return 'en_cours';
  return 'non_entame';
}

export function computeEtatCounts(chassis) {
  const counts = { non_entame: 0, en_cours: 0, non_vitre: 0, fabrique: 0, livre: 0, pret_a_livrer: 0 };
  for (const ch of chassis || []) {
    const isComp = (ch.components || []).length > 0;
    for (let i = 0; i < (ch.quantity || 1); i++) {
      const unit = getUnit(ch, i);
      const etat = isComp ? deriveCompositeEtat(unit, ch.components) : (unit.etat || 'non_entame');
      counts[etat] = (counts[etat] || 0) + 1;
    }
  }
  return counts;
}

export default function ProjectCard({ project, t, onOpen, onEdit, onDelete }) {
  const { user } = useAuth();
  const userRole = user?.role;
  const isAdmin =
    userRole === 'Admin' ||
    (userRole === 'Laquage' && project?.tab === 'laquage') ||
    (userRole === 'Coordinateur-vitrage' && project?.tab === 'vitrage');
  const canEdit =
    userRole === 'Admin' ||
    userRole === 'LOGISTIQUE' ||
    (userRole === 'Laquage' && project?.tab === 'laquage') ||
    (userRole === 'Coordinateur-vitrage' && project?.tab === 'vitrage');

  const statusTone = STATUS_TONES[project.status] || STATUS_TONES.non_entame;
  const statusLabel = t(`status_${project.status}`) || project.status || '';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  // Prefer the cached counts the list endpoint already sends (cheap, no chassis needed).
  // Fall back to local computation only if a full project (with .chassis) was passed.
  const etatCounts = project.etatCounts || computeEtatCounts(project.chassis);
  const total = Object.values(etatCounts).reduce((a, b) => a + b, 0);
  const activeEtats = ETAT_ORDER.filter(e => etatCounts[e] > 0);

  return (
    <div className="project-card" onClick={onOpen}>
      <div className="project-card__ral" style={{ backgroundColor: project.ralColor || 'var(--300)' }} />

      <div className="project-card__body">
        <div className="project-card__top">
          <h3 className="project-card__name">{project.name}</h3>
          <div className="project-card__badges">
            {project.companyId && (
              <span className="project-company-tag">
                {project.companyId.name === "CANDIDO & MICHEL Aluminium Italien S.A.R.L"
                  ? "CAMI SARL"
                  : project.companyId.name}
              </span>
            )}
            <span
              className="project-card__status"
              style={{ '--st-fg': statusTone[0], '--st-bg': statusTone[1], '--st-bd': statusTone[2] }}
            >
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="project-card__meta">
          <span>{t('ref')} <strong>{project.reference}</strong></span>
          <span>
            {project.ralColor && <span className="project-card__ral-dot" style={{ backgroundColor: project.ralColor }} />}
            {t('ral')} <strong>{project.ralCode}</strong>
          </span>
          <span>{dateStr}</span>
        </div>

        {project.clientId && (
          <div className="project-client-tag">👤 {project.clientId.name}</div>
        )}

        {total > 0 && (
          <>
            <div className="project-card__bar">
              {activeEtats.map(e => (
                <div
                  key={e}
                  title={`${t('etat_' + e) || e}: ${etatCounts[e]}`}
                  style={{ width: `${(etatCounts[e] / total) * 100}%`, background: ETAT_COLORS[e] }}
                />
              ))}
            </div>
            <div className="project-card__etat-row">
              {activeEtats.map(e => (
                <span key={e} className="project-card__etat-dot" title={`${t('etat_' + e) || e}: ${etatCounts[e]}`}>
                  <span className="project-card__etat-pip" style={{ backgroundColor: ETAT_COLORS[e] }} />
                  <span className="project-card__etat-count">{etatCounts[e]}</span>
                </span>
              ))}
              <span className="project-card__etat-total">{total}</span>
            </div>
          </>
        )}
      </div>

      <div className="project-card__actions" onClick={e => e.stopPropagation()}>
        {canEdit && <button className="edit-btn" onClick={onEdit}>{t('edit')}</button>}
        {isAdmin && <button className="delete-btn" onClick={onDelete}>{t('delete')}</button>}
      </div>
    </div>
  );
}