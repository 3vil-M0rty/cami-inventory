import React, { useState, useEffect, useCallback } from 'react';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import ChassisForm from './ChassisForm';
import ChassisTypeManager from './ChassisTypeManager';
import UsedBarsPanel from './UsedBarsPanel';
import LabelPrint, { buildLabelHTML } from './LabelPrint';
import { exportProjectPDF, exportBarsPDF } from '../utils/pdfExport';
import { fetchChassisTypes, buildChassisLabels, CHASSIS_LABELS as STATIC_LABELS } from './ChassisTypesConfig';
import './ProjectDetail.css';

const ETAT_OPTIONS  = ['non_entame', 'en_cours', 'fabrique', 'livre'];
const ETAT_COLORS   = { non_entame: '#9ca3af', en_cours: '#f59e0b', fabrique: '#3b82f6', livre: '#16a34a' };
const STATUS_COLORS = { en_cours: '#f59e0b', fabrique: '#3b82f6', cloture: '#16a34a' };

const BACKEND_URL = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace('/api', '')
  : 'http://localhost:3001';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUnit(ch, idx) {
  return (ch.units || []).find(u => u.unitIndex === idx) || {
    unitIndex: idx, etat: 'non_entame', deliveryDate: null, notes: '', componentStates: []
  };
}
function getComponentEtat(unit, compIdx, comp) {
  const cs = (unit.componentStates || []).find(c => c.compIndex === compIdx);
  return cs ? cs.etat : (comp.etat || 'non_entame');
}
function deriveCompositeEtat(unit, components) {
  const n = components.length;
  if (!n) return unit.etat || 'non_entame';
  const states = components.map((comp, i) => getComponentEtat(unit, i, comp));
  if (states.every(e => e === 'livre'))                     return 'livre';
  if (states.every(e => e === 'fabrique' || e === 'livre')) return 'fabrique';
  if (states.some(e => e !== 'non_entame'))                 return 'en_cours';
  return 'non_entame';
}
function fmtDate(d)     { if (!d) return ''; return new Date(d).toLocaleDateString('fr-FR'); }
function toDateInput(d) { if (!d) return ''; return new Date(d).toISOString().split('T')[0]; }

function resolveCompany(project) {
  const co = project.companyId;
  if (co && typeof co === 'object' && co.name) return co;
  return { name: '', logo: '', address: '', phone: '', email: '', rc: '', ice: '', color: '' };
}

function resolveLogoUrl(logo) {
  if (!logo) return '';
  if (logo.startsWith('http')) return logo;
  return `${BACKEND_URL}${logo}`;
}

// ─── FIX: Fetch logo as Base64 so it renders correctly in print popups ────────
async function fetchLogoBase64(logoUrl) {
  if (!logoUrl) return '';
  try {
    const resp = await fetch(logoUrl);
    if (!resp.ok) return '';
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = () => resolve(reader.result); // "data:image/...;base64,..."
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Logo fetch failed, will fall back to initials:', e);
    return '';
  }
}

// ─── BL HTML generator ───────────────────────────────────────────────────────
// logoBase64 is now passed in — either a data-URI string or '' for fallback
function generateBLHtml(bl, project, logoBase64 = '') {
  const co = resolveCompany(project);

  const companyName  = co.name    || '';
  const companyColor = co.color   || '#1a1a1a';
  const companyAddr  = co.address || '';
  const companyPhone = co.phone   || '';
  const companyEmail = co.email   || '';
  const companyRC    = co.rc      || '';
  const companyICE   = co.ice     || '';

  const clientName = project.clientId?.name    || bl.client?.name    || '';
  const clientAddr = project.clientId?.address || bl.client?.address || '';
  const clientCity = project.clientId?.city    || bl.client?.city    || '';

 
  // FIX: prefer the pre-fetched base64; only fall back to URL if we have nothing
  const logoSrc = logoBase64 || resolveLogoUrl(co.logo || '');



  const logoBlock = logoSrc
    ? `<img src="${logoSrc}" alt="${companyName}" style="height:52px;max-width:180px;object-fit:contain;display:block;">`
    : `<div style="height:52px;width:52px;border-radius:10px;background:${companyColor};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#fff;">${(companyName || '?').charAt(0)}</div>`;

    
  const coLines = [
    companyAddr  && `<div>${companyAddr}</div>`,
    companyPhone && `<div>Tél : ${companyPhone}</div>`,
    companyEmail && `<div>${companyEmail}</div>`,
    companyRC    && `<div>RC : ${companyRC}</div>`,
    companyICE   && `<div>ICE : ${companyICE}</div>`,
  ].filter(Boolean).join('');

  const clientBlock = clientName ? `
    <div class="client-block">
      <div class="block-label">Destinataire</div>
      <div class="client-name">${clientName}</div>
      ${clientAddr ? `<div class="client-detail">${clientAddr}</div>` : ''}
      ${clientCity ? `<div class="client-detail">${clientCity}</div>` : ''}
    </div>` : '';

  const rows = bl.units.map((u, i) => `
    <tr class="${u.isComponent ? 'row-sub' : (i % 2 === 0 ? 'row-even' : 'row-odd')}">
      <td class="td-c">${i + 1}</td>
      <td><strong>${u.unitLabel}</strong></td>
      <td>${u.chassisType || '—'}</td>
      <td class="td-c">${u.dimension}</td>
      <td class="td-c">${fmtDate(u.deliveryDate)}</td>
      <td>${u.notes || '—'}</td>
    </tr>`).join('');

  const closeScript = '<' + '/script>';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <title>${bl.blId}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:32px 40px}

    .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:20px;margin-bottom:24px;border-bottom:3px solid ${companyColor}}
    .header-left{display:flex;align-items:flex-start;gap:14px}
    .company-name{font-size:18px;font-weight:800;color:${companyColor};margin-bottom:3px}
    .company-info{font-size:11px;color:#555;line-height:1.75}
    .doc-label{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#999;margin-bottom:5px}
    .bl-num{font-size:26px;font-weight:900;color:#1a1a1a;letter-spacing:-.5px}
    .date-label{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin-top:10px;margin-bottom:3px}
    .date-val{font-size:22px;font-weight:800;color:${companyColor}}

    .info-row{display:flex;gap:10px;margin-bottom:18px;flex-wrap:wrap}
    .info-card{flex:1;min-width:110px;padding:10px 14px;border:1px solid #e5e7eb;border-radius:8px;background:#f9fafb}
    .info-card__label{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin-bottom:4px}
    .info-card__val{font-size:14px;font-weight:700;color:#1a1a1a;display:flex;align-items:center;gap:6px}

    .client-block{padding:12px 16px;border:1px solid #e5e7eb;border-left:4px solid ${companyColor};border-radius:8px;margin-bottom:18px;background:#f9fafb}
    .block-label{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#999;margin-bottom:4px}
    .client-name{font-size:15px;font-weight:700}
    .client-detail{font-size:12px;color:#555;margin-top:2px}

    table{width:100%;border-collapse:collapse;margin-bottom:24px}
    thead tr{background:${companyColor};color:#fff}
    th{padding:10px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:.06em;font-weight:600}
    .th-c{text-align:center}
    td{padding:10px 12px;font-size:12.5px;border-bottom:1px solid #f0f0f0}
    .td-c{text-align:center}
    .row-even{background:#fff}
    .row-odd{background:#f9fafb}
    .row-sub{background:#f3f4f6;color:#555;font-size:12px}

    .sig-row{display:flex;justify-content:space-between;margin-top:48px;gap:24px}
    .sig-box{flex:1;border-top:1.5px solid #1a1a1a;padding-top:8px;font-size:11px;color:#555;text-align:center}

    .footer{margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#aaa;text-align:center;line-height:1.7}

    /* FIX: force browsers to print background colors and images */
    @media print{
      *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
      body{padding:14mm 16mm}
      @page{margin:0;size:A4}
    }
  </style>
</head>
<body>

<div class="header">
  <div class="header-left">
    ${logoBlock}
    <div>
      <div class="company-name">${companyName}</div>
      <div class="company-info">${coLines}</div>
    </div>
  </div>
  <div style="text-align:right">
    <div class="doc-label">Bon de Livraison</div>
    <div class="bl-num">${bl.blId}</div>
    <div class="date-label">Date de livraison</div>
    <div class="date-val">${new Date(bl.deliveryDate + 'T00:00:00').toLocaleDateString('fr-FR')}</div>
  </div>
</div>

<div class="info-row">
  <div class="info-card"><div class="info-card__label">Projet</div><div class="info-card__val">${project.name}</div></div>
  <div class="info-card"><div class="info-card__label">Référence</div><div class="info-card__val">${project.reference}</div></div>
  <div class="info-card"><div class="info-card__label">RAL</div><div class="info-card__val"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${project.ralColor||'#eee'};border:1px solid #ddd;flex-shrink:0"></span>${project.ralCode}</div></div>
  <div class="info-card"><div class="info-card__label">Pièces livrées</div><div class="info-card__val">${bl.units.length}</div></div>
</div>

${clientBlock}

<table>
  <thead>
    <tr>
      <th class="th-c" style="width:36px">#</th>
      <th>Repère</th>
      <th>Désignation</th>
      <th class="th-c">Dimension</th>
      <th class="th-c">Date livraison</th>
      <th>Notes</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="sig-row">
  <div class="sig-box">Signature livreur</div>
  <div class="sig-box">Signature réceptionnaire</div>
</div>

<div class="footer">
  ${[companyName, companyAddr, companyPhone ? 'Tél : ' + companyPhone : '', companyRC ? 'RC : ' + companyRC : '', companyICE ? 'ICE : ' + companyICE : ''].filter(Boolean).join(' &nbsp;·&nbsp; ')}<br>
  
</div>

<script>
  // Wait for all images to load before printing
  window.onload = () => {
    const images = document.querySelectorAll('img');
    if (images.length === 0) { window.print(); return; }
    let loaded = 0;
    const tryPrint = () => { loaded++; if (loaded >= images.length) window.print(); };
    images.forEach(img => {
      if (img.complete) { tryPrint(); }
      else { img.onload = tryPrint; img.onerror = tryPrint; }
    });
  };
${closeScript}
</body>
</html>`;
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ chassis, t }) {
  if (!chassis || chassis.length === 0) return null;
  const counts = { non_entame: 0, en_cours: 0, fabrique: 0, livre: 0 };
  let total = 0;
  for (const ch of chassis) {
    const qty = ch.quantity || 1;
    const isComp = (ch.components || []).length > 0;
    for (let i = 0; i < qty; i++) {
      const unit = getUnit(ch, i);
      const etat = isComp ? deriveCompositeEtat(unit, ch.components) : (unit.etat || 'non_entame');
      counts[etat] = (counts[etat] || 0) + 1;
      total++;
    }
  }
  const pct = k => total === 0 ? 0 : Math.round(counts[k] / total * 100);
  return (
    <div className="progress-section">
      <div className="progress-bar">
        {ETAT_OPTIONS.filter(e => counts[e] > 0).map(e => (
          <div key={e} className="progress-bar__segment"
            style={{ width: `${pct(e)}%`, backgroundColor: ETAT_COLORS[e] }}
            title={`${t('etat_' + e)}: ${counts[e]}`} />
        ))}
      </div>
      <div className="progress-legend">
        {ETAT_OPTIONS.map(e => (
          <span key={e} className="progress-legend__item">
            <span className="progress-legend__dot" style={{ backgroundColor: ETAT_COLORS[e] }} />
            {t('etat_' + e)}: <strong>{counts[e]}</strong>
          </span>
        ))}
        <span className="progress-legend__total">Total: <strong>{total}</strong></span>
      </div>
    </div>
  );
}

// ─── Delivery Date Modal ──────────────────────────────────────────────────────
function DeliveryDateModal({ defaultDate, onConfirm, onCancel, t }) {
  const [date, setDate] = useState(defaultDate || new Date().toISOString().split('T')[0]);
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" style={{ maxWidth: 360 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>📦 {t('blTitle')}</h3>
        <div className="form-group">
          <label>{t('deliveryDate')}</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div className="modal-actions">
          <button onClick={onCancel}>{t('cancel')}</button>
          <button className="primary" onClick={() => onConfirm(date)}>{t('confirm')}</button>
        </div>
      </div>
    </div>
  );
}

// ─── BL Panel ─────────────────────────────────────────────────────────────────
function BLPanel({ project, t }) {
  const { getBonsLivraison } = useProjects();
  const [bls,     setBls]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [openBL,  setOpenBL]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try   { setBls(await getBonsLivraison(project.id)); }
    catch { setBls([]); }
    finally { setLoading(false); }
  }, [project.id, getBonsLivraison]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="bl-loading">{t('loading')}</div>;

  if (bls.length === 0) return (
    <div className="bl-empty">
      <div className="bl-empty__icon">📦</div>
      <p><strong>{t('noBL')}</strong></p>
      <p className="bl-empty__hint">Marquez des unités comme « Livré » pour générer des BL automatiquement.</p>
    </div>
  );

  const co = resolveCompany(project);

  // FIX: async print handler — fetches logo as Base64 before opening the popup
  const handlePrintBL = async (e, bl) => {
    e.stopPropagation();
    const logoUrl    = resolveLogoUrl(co.logo || '');
    const logoBase64 = await fetchLogoBase64(logoUrl);
    const html       = generateBLHtml(bl, project, logoBase64);
    const w          = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  return (
    <div className="bl-panel">
      <div className="bl-panel__header">
        <h3>{t('blHistory')} <span className="tab-count">{bls.length}</span></h3>
      </div>
      <div className="bl-list">
        {bls.map(bl => (
          <div key={bl.deliveryDate} className="bl-card">
            <div className="bl-card__header" onClick={() => setOpenBL(openBL === bl.deliveryDate ? null : bl.deliveryDate)}>
              <div className="bl-card__info">
                <span style={{
                  display: 'inline-block', width: 4, height: 20, borderRadius: 2,
                  background: co.color || '#1a1a1a', marginRight: 10, verticalAlign: 'middle', flexShrink: 0,
                }} />
                <span className="bl-card__id">{bl.blId}</span>
                <span className="bl-card__date">📅 {fmtDate(bl.deliveryDate + 'T00:00:00')}</span>
                <span className="bl-card__count">{bl.units.length} pièce{bl.units.length > 1 ? 's' : ''}</span>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 8px', borderRadius: 5, fontSize: 11,
                  background: (co.color || '#1a1a1a') + '18',
                  color: co.color || '#1a1a1a', fontWeight: 600,
                }}>
                  {co.logo && (
                    <img
                      src={resolveLogoUrl(co.logo)}
                      alt=""
                      style={{ height: 14, objectFit: 'contain' }}
                    />
                  )}
                  {co.name}
                </span>
              </div>
              <div className="bl-card__actions">
                {/* FIX: now calls async handlePrintBL instead of inline window.open */}
                <button
                  className="bl-print-btn"
                  onClick={e => handlePrintBL(e, bl)}
                >
                  🖨 {t('blPrint')}
                </button>
                <span className="bl-card__toggle">{openBL === bl.deliveryDate ? '▲' : '▼'}</span>
              </div>
            </div>

            {openBL === bl.deliveryDate && (
              <div className="bl-card__body">
                <table className="bl-table">
                  <thead>
                    <tr>
                      <th>{t('blUnitLabel')}</th>
                      <th>{t('type')}</th>
                      <th>{t('dimension')}</th>
                      <th>{t('blDate')}</th>
                      <th>{t('unitNotes')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bl.units.map((u, i) => (
                      <tr key={i} className={u.isComponent ? 'bl-row--component' : ''}>
                        <td><strong>{u.unitLabel}</strong></td>
                        <td>{u.chassisType || '—'}</td>
                        <td className="dim-cell">{u.dimension}</td>
                        <td>{fmtDate(u.deliveryDate)}</td>
                        <td>{u.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main ProjectDetail ───────────────────────────────────────────────────────
function ProjectDetail({ project, onBack }) {
  const { deleteChassis, updateChassis, updateUnit, updateComponent } = useProjects();
  const { t, currentLanguage } = useLanguage();

  const [activeTab,       setActiveTab]       = useState('chassis');
  const [showChassisForm, setShowChassisForm] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [editingChassis,  setEditingChassis]  = useState(null);
  const [printingChassis, setPrintingChassis] = useState(null);
  const [chassisLabels,   setChassisLabels]   = useState(STATIC_LABELS);
  const [selectedKeys,    setSelectedKeys]    = useState(new Set());
  const [deliveryModal,   setDeliveryModal]   = useState(null);
  const [savingKey,       setSavingKey]       = useState(null);

  const language    = currentLanguage;
  const statusColor = STATUS_COLORS[project.status] || '#9ca3af';
  const dateStr     = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  useEffect(() => {
    fetchChassisTypes().then(types => setChassisLabels(buildChassisLabels(types))).catch(() => {});
  }, [showTypeManager]);

  const rows = (project.chassis || []).flatMap(ch => {
    const qty         = ch.quantity || 1;
    const chId        = ch._id || ch.id;
    const isComposite = (ch.components || []).length > 0;
    return Array.from({ length: qty }, (_, unitIndex) => {
      const unit      = getUnit(ch, unitIndex);
      const groupKey  = `${chId}-${unitIndex}`;
      const baseLabel = qty > 1 ? `${ch.repere} #${unitIndex + 1}` : ch.repere;
      if (!isComposite) {
        return [{ kind: 'unit', ch, chId, unitIndex, unit, rowKey: groupKey, label: baseLabel, etat: unit.etat || 'non_entame' }];
      }
      const componentRows = ch.components.map((comp, ci) => ({
        kind: 'component', ch, chId, unitIndex, unit, comp, ci,
        rowKey: `${groupKey}-c${ci}`, groupKey,
        label: comp.repere || `${comp.role === 'dormant' ? 'D' : 'V'}${ci + 1}`,
        etat: getComponentEtat(unit, ci, comp),
      }));
      return [
        { kind: 'groupHead', ch, chId, unitIndex, unit, rowKey: groupKey, label: baseLabel,
          derivedEtat: deriveCompositeEtat(unit, ch.components), componentRows },
        ...componentRows,
      ];
    });
  }).flat();

  const allSelectableKeys = rows.filter(r => r.kind === 'unit' || r.kind === 'component').map(r => r.rowKey);
  const toggleKey = key => setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAll = () => setSelectedKeys(selectedKeys.size === allSelectableKeys.length ? new Set() : new Set(allSelectableKeys));

  const handleUnitEtatChange = async (ch, unitIndex, newEtat, rowKey) => {
    if (newEtat === 'livre') {
      const unit = getUnit(ch, unitIndex);
      setDeliveryModal({ kind: 'unit', chId: ch._id || ch.id, unitIndex, rowKey, currentDate: toDateInput(unit.deliveryDate) });
      return;
    }
    setSavingKey(rowKey);
    await updateUnit(project.id, ch._id || ch.id, unitIndex, { etat: newEtat });
    setSavingKey(null);
  };

  const handleComponentEtatChange = async (ch, unitIndex, ci, newEtat, rowKey) => {
    if (newEtat === 'livre') {
      setDeliveryModal({ kind: 'component', chId: ch._id || ch.id, unitIndex, ci, rowKey, currentDate: null });
      return;
    }
    setSavingKey(rowKey);
    await updateComponent(project.id, ch._id || ch.id, unitIndex, ci, { etat: newEtat });
    setSavingKey(null);
  };

  const handleDeliveryConfirm = async (deliveryDate) => {
    const m = deliveryModal;
    setDeliveryModal(null);
    setSavingKey(m.rowKey);
    if (m.kind === 'unit') {
      await updateUnit(project.id, m.chId, m.unitIndex, { etat: 'livre', deliveryDate });
    } else {
      await updateComponent(project.id, m.chId, m.unitIndex, m.ci, { etat: 'livre', deliveryDate });
    }
    setSavingKey(null);
  };

  const handleDeleteUnit = async (ch, unitIndex) => {
    const chId = ch._id || ch.id;
    const qty  = ch.quantity ?? 1;
    if (qty <= 1) {
      if (!window.confirm(t('deleteChassisConfirm'))) return;
      await deleteChassis(project.id, chId);
    } else {
      if (!window.confirm(`Supprimer l'unité #${unitIndex + 1} ? (${qty - 1} restante${qty - 1 > 1 ? 's' : ''})`)) return;
      await updateChassis(project.id, chId, { quantity: qty - 1 });
    }
  };

  const startBatchPrint = () => {
    const toPrint = [];
    for (const row of rows) {
      if (!selectedKeys.has(row.rowKey)) continue;
      if (row.kind === 'unit') {
        toPrint.push({ ...row.ch, _printRowIndex: row.unitIndex, _totalQty: row.ch.quantity || 1 });
      } else if (row.kind === 'component') {
        const roleLabel = row.comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${row.ci}`;
        toPrint.push({ ...row.ch, _printRowIndex: row.unitIndex, _totalQty: row.ch.quantity || 1,
          _component: { repere: row.comp.repere || roleLabel, roleLabel, largeur: row.comp.largeur, hauteur: row.comp.hauteur } });
      }
    }
    if (!toPrint.length) return;
    const html = buildLabelHTML(toPrint, project, chassisLabels, language);
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const totalDisplayRows = (project.chassis || []).reduce((acc, ch) => acc + (ch.quantity || 1), 0);

  return (
    <div className="project-detail">
      <button className="project-detail__back" onClick={onBack}>{t('backToProjects')}</button>

      <div className="project-detail__header">
        <div className="project-detail__info">
          <div className="project-detail__ral-swatch" style={{ backgroundColor: project.ralColor || '#eee' }} />
          <div>
            <h2 className="project-detail__name">{project.name}</h2>
            <div className="project-detail__meta">
              <span>{t('ref')} <strong>{project.reference}</strong></span>
              <span>{t('ral')} <strong>{project.ralCode}</strong></span>
              <span>{t('date')}: <strong>{dateStr}</strong></span>
              <span className="project-detail__status" style={{ backgroundColor: statusColor }}>
                {t(`status_${project.status}`) || project.status}
              </span>
            </div>
          </div>
        </div>
        <div className="project-detail__header-actions">
          <button className="excel-btn" onClick={() => exportProjectPDF(project, language, chassisLabels, t)}>📄 {t('exportPDF')} — Châssis</button>
          <button className="excel-btn" onClick={() => exportBarsPDF(project, language, t)}>📄 {t('exportPDF')} — Barres</button>
        </div>
      </div>

      <ProgressBar chassis={project.chassis} t={t} />

      <div className="project-detail__tabs">
        {[
          { key: 'chassis', label: t('tabChassis'), count: totalDisplayRows },
          { key: 'bars',    label: t('cons'),       count: project.usedBars?.length || 0 },
          { key: 'bl',      label: t('tabBL'),      count: null },
        ].map(tab => (
          <button key={tab.key}
            className={`project-detail__tab ${activeTab === tab.key ? 'project-detail__tab--active' : ''}`}
            onClick={() => setActiveTab(tab.key)}>
            {tab.label}
            {tab.count !== null && <span className="tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>

      {activeTab === 'chassis' && (
        <div className="project-detail__panel">
          <div className="panel-toolbar">
            <button className="add-item-btn" onClick={() => { setEditingChassis(null); setShowChassisForm(true); }}>+ {t('addChassis')}</button>
            <button className="ct-config-btn" onClick={() => setShowTypeManager(true)}>⚙️ {t('chassisTypeConfig')}</button>
            {rows.length > 0 && (
              <div className="selection-toolbar">
                <button className="select-btn" onClick={toggleAll}>{selectedKeys.size === allSelectableKeys.length ? t('deselectAll') : t('selectAll')}</button>
                {selectedKeys.size > 0 && (
                  <button className="print-selected-btn" onClick={startBatchPrint}>
                    🖨 {t('printSelected')} ({selectedKeys.size} {t('selectedCount')})
                  </button>
                )}
              </div>
            )}
          </div>

          {!project.chassis?.length ? (
            <div className="no-items">{t('noChassis')}</div>
          ) : (
            <div className="chassis-table-wrapper">
              <table className="chassis-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }}>
                      <input type="checkbox"
                        checked={allSelectableKeys.length > 0 && selectedKeys.size === allSelectableKeys.length}
                        onChange={toggleAll} />
                    </th>
                    <th>{t('repere')}</th>
                    <th>{t('type')}</th>
                    <th>{t('largeur')} (mm)</th>
                    <th>{t('hauteur')} (mm)</th>
                    <th>{t('dimension')}</th>
                    <th>{t('etat')}</th>
                    <th>{t('deliveryDate')}</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    if (row.kind === 'groupHead') {
                      const { ch, chId, unitIndex, label, derivedEtat } = row;
                      return (
                        <tr key={row.rowKey} className="chassis-row chassis-row--group-head">
                          <td />
                          <td>
                            <strong>{label}</strong>
                            <span className="composite-badge" title="Composite">⊞</span>
                          </td>
                          <td>{chassisLabels[ch.type]?.[language] || ch.type}</td>
                          <td>{ch.largeur}</td><td>{ch.hauteur}</td>
                          <td className="dim-cell">{ch.dimension || `${ch.largeur}×${ch.hauteur}`}</td>
                          <td>
                            <span className="etat-badge" style={{ background: ETAT_COLORS[derivedEtat], color: '#fff', padding: '2px 8px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {t(`etat_${derivedEtat}`)}
                            </span>
                          </td>
                          <td><span className="date-placeholder">—</span></td>
                          <td>
                            <div className="chassis-row__actions">
                              <button className="edit-btn" onClick={() => { setEditingChassis({ ...ch, _originalId: chId }); setShowChassisForm(true); }}>✏️ {t('edit')}</button>
                              <button className="print-btn" title={t('printLabel')} onClick={() => {
                                const toPrint = ch.components.map((comp, ci) => {
                                  const roleLabel = comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${ci}`;
                                  return { ...ch, _printRowIndex: unitIndex, _totalQty: ch.quantity || 1, _component: { repere: comp.repere || roleLabel, roleLabel, largeur: comp.largeur, hauteur: comp.hauteur } };
                                });
                                const html = buildLabelHTML(toPrint, project, chassisLabels, language);
                                const w = window.open('', '_blank');
                                if (w) { w.document.write(html); w.document.close(); }
                              }}>🖨</button>
                              <button className="delete-btn" onClick={() => handleDeleteUnit(ch, unitIndex)}>🗑</button>
                            </div>
                          </td>
                        </tr>
                      );
                    }

                    if (row.kind === 'component') {
                      const { ch, unitIndex, comp, ci, rowKey, label, etat } = row;
                      const isSaving = savingKey === rowKey;
                      const isSelected = selectedKeys.has(rowKey);
                      return (
                        <tr key={rowKey} className={`component-row${isSelected ? ' component-row--selected' : ''}${isSaving ? ' component-row--saving' : ''}`}>
                          <td className="chassis-row__check">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleKey(rowKey)} onClick={e => e.stopPropagation()} />
                          </td>
                          <td className="component-indent">↳ <strong>{label}</strong></td>
                          <td className="component-role">{comp.role === 'dormant' ? t('dormant') : t('vantail')}</td>
                          <td>{comp.largeur || '—'}</td><td>{comp.hauteur || '—'}</td>
                          <td className="dim-cell">{comp.largeur && comp.hauteur ? `${comp.largeur}×${comp.hauteur}` : '—'}</td>
                          <td>
                            <select className="etat-select etat-select--component" value={etat} disabled={isSaving}
                              onChange={e => handleComponentEtatChange(ch, unitIndex, ci, e.target.value, rowKey)}
                              style={{ borderLeftColor: ETAT_COLORS[etat] }}>
                              {ETAT_OPTIONS.map(opt => <option key={opt} value={opt}>{t(`etat_${opt}`)}</option>)}
                            </select>
                          </td>
                          <td><span className="date-placeholder">—</span></td>
                          <td>
                            <button className="print-btn" title={t('printLabel')} onClick={() => {
                              const roleLabel = comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${ci}`;
                              setPrintingChassis({ ...ch, _printRowIndex: unitIndex, _totalQty: ch.quantity || 1, _component: { repere: comp.repere || roleLabel, roleLabel, largeur: comp.largeur, hauteur: comp.hauteur } });
                            }}>🖨</button>
                          </td>
                        </tr>
                      );
                    }

                    // unit row
                    const { ch, chId, unitIndex, unit, rowKey, label, etat } = row;
                    const isSaving = savingKey === rowKey;
                    const isSelected = selectedKeys.has(rowKey);
                    return (
                      <tr key={rowKey} className={`chassis-row${isSelected ? ' chassis-row--selected' : ''}${isSaving ? ' chassis-row--saving' : ''}`}>
                        <td className="chassis-row__check">
                          <input type="checkbox" checked={isSelected} onChange={() => toggleKey(rowKey)} onClick={e => e.stopPropagation()} />
                        </td>
                        <td><strong>{label}</strong></td>
                        <td>{chassisLabels[ch.type]?.[language] || ch.type}</td>
                        <td>{ch.largeur}</td><td>{ch.hauteur}</td>
                        <td className="dim-cell">{ch.dimension || `${ch.largeur}×${ch.hauteur}`}</td>
                        <td>
                          <select className="etat-select" value={etat} disabled={isSaving}
                            onChange={e => handleUnitEtatChange(ch, unitIndex, e.target.value, rowKey)}
                            style={{ borderLeftColor: ETAT_COLORS[etat] }}>
                            {ETAT_OPTIONS.map(opt => <option key={opt} value={opt}>{t(`etat_${opt}`)}</option>)}
                          </select>
                        </td>
                        <td className="delivery-date-cell">
                          {etat === 'livre' ? (
                            <button className="date-btn" onClick={() => setDeliveryModal({ kind: 'unit', chId, unitIndex, rowKey, currentDate: toDateInput(unit.deliveryDate) })}>
                              📅 {unit.deliveryDate ? fmtDate(unit.deliveryDate) : 'Définir'}
                            </button>
                          ) : <span className="date-placeholder">—</span>}
                        </td>
                        <td>
                          <div className="chassis-row__actions">
                            <button className="edit-btn" onClick={() => { setEditingChassis({ ...ch, quantity: 1, etat, _originalId: chId, _unitIndex: unitIndex, _totalQty: ch.quantity ?? 1 }); setShowChassisForm(true); }}>✏️ {t('edit')}</button>
                            <button className="print-btn" title={t('printLabel')} onClick={() => setPrintingChassis({ ...ch, _printRowIndex: unitIndex })}>🖨</button>
                            <button className="delete-btn" onClick={() => handleDeleteUnit(ch, unitIndex)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'bars' && <UsedBarsPanel project={project} />}
      {activeTab === 'bl'   && <div className="project-detail__panel"><BLPanel project={project} t={t} language={language} /></div>}

      {showChassisForm && <ChassisForm chassis={editingChassis} projectId={project.id} onClose={() => { setShowChassisForm(false); setEditingChassis(null); }} onSave={() => { setShowChassisForm(false); setEditingChassis(null); }} />}
      {showTypeManager  && <ChassisTypeManager onClose={() => setShowTypeManager(false)} />}
      {printingChassis  && <LabelPrint chassis={printingChassis} project={project} chassisLabels={chassisLabels} onClose={() => setPrintingChassis(null)} />}
      {deliveryModal    && <DeliveryDateModal defaultDate={deliveryModal.currentDate} onConfirm={handleDeliveryConfirm} onCancel={() => setDeliveryModal(null)} t={t} />}
    </div>
  );
}

export { STATIC_LABELS as CHASSIS_LABELS };
export default ProjectDetail;