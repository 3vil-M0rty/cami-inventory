// components/ProjectCard.jsx
import { useAuth } from '../../../context/AuthContext';

const STATUS_COLORS = {
  en_cours: '#f59e0b',
  fabrique: '#3b82f6',
  cloture: '#16a34a',
  non_vitre: '#a855f7',
  pret_a_livrer: 'red',
};

const ETAT_COLORS = {
  non_entame: '#9ca3af',
  en_cours: '#f59e0b',
  non_vitre: '#a855f7',
  fabrique: '#3b82f6',
  pret_a_livrer: 'rgb(255,0,0)',
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

  const statusColor = STATUS_COLORS[project.status] || '#999';
  const statusLabel = t(`status_${project.status}`) || project.status || '';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  // Prefer the cached counts the list endpoint already sends (cheap, no chassis needed).
  // Fall back to local computation only if a full project (with .chassis) was passed.
  const etatCounts = project.etatCounts || computeEtatCounts(project.chassis);
  const total = Object.values(etatCounts).reduce((a, b) => a + b, 0);
  const activeEtats = ETAT_ORDER.filter(e => etatCounts[e] > 0);

  return (
    <div className="project-card" onClick={onOpen} style={{ borderTopColor: project.ralColor || '#ccc' }}>
      <div className="project-card__ral" style={{ backgroundColor: project.ralColor || '#eee' }} />

      <div className="project-card__body">
        <div className="project-card__top">
          <h3 className="project-card__name">{project.name}</h3>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {project.companyId && (
              <span className="project-company-tag">
                {project.companyId.name === "CANDIDO & MICHEL Aluminium Italien S.A.R.L"
                  ? "CAMI SARL"
                  : project.companyId.name}
              </span>
            )}
            <span className="project-card__status" style={{ backgroundColor: statusColor }}>
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="project-card__meta">
          <span>{t('ref')} <strong>{project.reference}</strong></span>
          <span>{t('ral')} <strong>{project.ralCode}</strong></span>
          <span>{dateStr}</span>
        </div>

        {project.clientId && (
          <div className="project-client-tag">👤 {project.clientId.name}</div>
        )}

        {total > 0 && (
          <>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: '#f3f4f6', margin: '8px 0 4px' }}>
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
        {canEdit && <button className="edit-btn" onClick={onEdit}>  {t('edit')}   </button>}
        {isAdmin && <button className="delete-btn" onClick={onDelete}>{t('delete')} </button>}
      </div>
    </div>
  );
}