// components/ProjectCard.jsx
import { useAuth } from '../../../context/AuthContext';
import { useState } from 'react';
import axios from 'axios';
import { User, PaintBucket, Paperclip, FileText, FileImage, Eye, LoaderCircle } from 'lucide-react';
import { DocViewer, PrintBtn } from './ProjectDocuments';
import { findRal, inkOn } from '../utils/ralColors';

// Tinted badge tones (dark theme): [text, background, border]
const STATUS_TONES = {
  non_entame:    ['var(--ink-grey)', 'rgba(161,161,170,.12)', 'rgba(161,161,170,.3)'],
  en_cours:      ['var(--ink-amber)', 'rgba(251,191,36,.12)',  'rgba(251,191,36,.3)'],
  fabrique:      ['var(--ink-blue)', 'rgba(96,165,250,.12)',  'rgba(96,165,250,.3)'],
  cloture:       ['var(--ink-green)', 'rgba(74,222,128,.12)',  'rgba(74,222,128,.3)'],
  non_vitre:     ['var(--ink-violet)', 'rgba(167,139,250,.12)', 'rgba(167,139,250,.3)'],
  pret_a_livrer: ['var(--ink-red)', 'rgba(248,113,113,.12)', 'rgba(248,113,113,.3)'],
};

const ETAT_COLORS = {
  non_entame: '#9ca3af',
  en_cours: '#f59e0b',
  non_vitre: '#a855f7',
  fabrique: '#3b82f6',
  pret_a_livrer: '#ef4444',
  livre: '#16a34a',
};

// Laquage stage of the bars sent for this project (least advanced lot) → [label key, text, bg, border]
const LAQ_STAGES = {
  sent_to_laquage:   ['lqStSent',      'var(--ink-amber)', 'rgba(251,191,36,.12)',  'rgba(251,191,36,.3)'],
  received_laquage:  ['lqStRecvLaq',   'var(--ink-blue)', 'rgba(96,165,250,.12)',  'rgba(96,165,250,.3)'],
  returned_to_coord: ['lqStReturned',  'var(--ink-violet)', 'rgba(167,139,250,.12)', 'rgba(167,139,250,.3)'],
  received_coord:    ['lqStRecvCoord', 'var(--ink-green)', 'rgba(74,222,128,.12)',  'rgba(74,222,128,.3)'],
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
    <div className={`project-card${project.ralColor ? ' has-ral' : ''}`} onClick={onOpen} style={project.ralColor ? { '--ral': project.ralColor } : undefined}>
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
          {project.ralCode && (() => {
            // the colour, big and readable: chip in the RAL colour with its number, then its name
            const r = findRal(project.ralCode);
            const bg = project.ralColor || r?.hex || 'var(--300)';
            return (
              <span className="project-card__ralchip" title={`${project.ralCode}${r ? ` — ${r.name}` : ''}`}>
                <span className="project-card__ralchip-sw" style={{ backgroundColor: bg, color: inkOn(project.ralColor || r?.hex) }}>
                  {r ? r.num : ''}
                </span>
                <span className="project-card__ralchip-txt">
                  <strong>{r && project.ralCode === r.code ? r.code : project.ralCode}</strong>
                  {r && <em>{r.name}</em>}
                </span>
              </span>
            );
          })()}
          <span>{dateStr}</span>
        </div>

        {project.clientId && (
          <div className="project-client-tag"><User size={13} /> {project.clientId.name}</div>
        )}

        {project.laquage?.lots > 0 && (() => {
          const st = LAQ_STAGES[project.laquage.stage] || LAQ_STAGES.sent_to_laquage;
          return (
            <div
              className="project-card__laq"
              style={{ '--lq-fg': st[1], '--lq-bg': st[2], '--lq-bd': st[3] }}
              title={t('pcLaqTitle')}
            >
              <PaintBucket size={13} />
              <span>{t(st[0])}</span>
              <span className="project-card__laq-lots">{t(project.laquage.lots > 1 ? 'pcLaqLots' : 'pcLaqLot', { n: project.laquage.lots })}</span>
            </div>
          );
        })()}

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
        {project.documentsCount > 0 && <CardDocsButton project={project} t={t} />}
      </div>
    </div>
  );
}
// « Documents (n) » on the card: the list is fetched on click, a file only when « Ouvrir » is clicked.
// A single document opens directly.
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
function CardDocsButton({ project, t }) {
  const [docs, setDocs] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState(null); // opened in the in-app viewer (print / download there)
  const id = project.id || project._id;
  const n = project.documentsCount;

  const click = async () => {
    if (open) { setOpen(false); return; }
    if (n === 1) {
      // a single document: straight into the viewer
      let list = docs;
      if (!list) {
        setLoading(true);
        try { list = (await axios.get(`${API_URL}/projects/${id}/documents`)).data.documents || []; setDocs(list); }
        catch (e) { list = []; }
        finally { setLoading(false); }
      }
      if (list[0]) setViewing(list[0]);
      return;
    }
    setOpen(true);
    if (!docs) {
      setLoading(true);
      try { setDocs((await axios.get(`${API_URL}/projects/${id}/documents`)).data.documents || []); }
      catch (e) { setDocs([]); }
      finally { setLoading(false); }
    }
  };

  return (
    <>
      <button type="button" className={`project-card__docs-btn${open ? ' is-open' : ''}`} onClick={click}
        title={n === 1 ? t('pdocOpenOne') : t('pdocShowList')}>
        <Paperclip size={13} /><em className="project-card__docs-label">{t('pdocCardLabel')}</em><span>{n}</span>
      </button>
      {open && (
        <ul className="project-card__docs">
          {loading && <li className="project-card__docs-wait"><LoaderCircle size={14} className="td-spin" /></li>}
          {(docs || []).map(d => {
            const Icon = d.contentType === 'application/pdf' ? FileText : FileImage;
            return (
              <li key={d.id}>
                <button type="button" onClick={() => setViewing(d)} title={d.name}>
                  <Icon size={14} /><span>{d.name}</span><Eye size={13} className="project-card__docs-eye" />
                </button>
                <PrintBtn doc={d} t={t} className="project-card__docs-print" size={14} />
              </li>
            );
          })}
        </ul>
      )}
      {viewing && <DocViewer doc={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
