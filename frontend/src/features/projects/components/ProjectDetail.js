import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage } from '../../../context/LanguageContext';
import ChassisForm from './ChassisForm';
import ChassisTypeManager from './ChassisTypeManager';
import UsedBarsPanel from './UsedBarsPanel';
import LabelPrint, { buildLabelHTML } from './LabelPrint';
import { exportProjectPDF, exportBarsPDF } from '../utils/pdfExport';
import { fetchChassisTypes, buildChassisLabels, CHASSIS_LABELS as STATIC_LABELS } from './ChassisTypesConfig';
import { BarresLaquerPanel, AccessoiresLaquerPanel } from './LaquagePanel';
import { StepBack, CircleDashed } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import './ProjectDetail.css';

const ETAT_OPTIONS = ['non_entame', 'en_cours', 'non_vitre', 'fabrique', 'livre'];
const ETAT_COLORS = {
  non_entame: '#9ca3af',
  en_cours: '#f59e0b',
  non_vitre: '#a855f7',
  fabrique: '#3b82f6',
  livre: '#16a34a',
};
const STATUS_COLORS = { en_cours: '#f59e0b', fabrique: '#3b82f6', cloture: '#16a34a' };

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const BACKEND_URL = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace('/api', '')
  : 'http://localhost:3001';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getUnit(ch, idx) {
  return (ch.units || []).find(u => u.unitIndex === idx) || {
    unitIndex: idx, etat: 'non_entame', deliveryDate: null, notes: '', componentStates: [], atelierTable: ''
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
  if (states.every(e => e === 'livre')) return 'livre';
  if (states.every(e => e === 'fabrique' || e === 'livre')) return 'fabrique';
  if (states.some(e => e !== 'non_entame')) return 'en_cours';
  return 'non_entame';
}
function fmtDate(d) { if (!d) return ''; return new Date(d).toLocaleDateString('fr-FR'); }
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

async function fetchLogoBase64(logoUrl) {
  if (!logoUrl) return '';
  try {
    const resp = await fetch(logoUrl);
    if (!resp.ok) return '';
    const blob = await resp.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    console.warn('Logo fetch failed, will fall back to initials:', e);
    return '';
  }
}

async function fetchTableId(tableName) {
  try {
    const res = await axios.get(`${API_URL}/atelier-tables`);
    const tables = res.data || [];
    const found = tables.find(t => t.name === tableName);
    return found ? found.id : null;
  } catch { return null; }
}

function computeChassisAccessories(chassis) {
  return (chassis.accessories || []).map(acc => {
    const qty = acc.formula && acc.formula.trim()
      ? Math.round(evalFormula(acc.formula, chassis.largeur, chassis.hauteur) * 100) / 100
      : (acc.quantity || 0);
    return { itemId: acc.itemId || acc._id?.toString() || '', label: acc.label, unit: acc.unit || '', quantity: qty };
  }).filter(a => a.quantity > 0);
}

// ─── Role-based etat filtering ────────────────────────────────────────────────

function getAllowedEtats(userRole, currentEtat) {
  if (userRole === 'Coordinateur') {
    // Coordinateur sees: non_entame, en_cours, non_vitre, fabrique — never livre
    return ['non_entame', 'en_cours', 'non_vitre', 'fabrique'];
  }
  if (userRole === 'LOGISTIQUE') {
    // Logistique can only toggle fabrique ↔ livre
    // If current state is neither, the select is disabled (see isEtatSelectDisabled)
    if (currentEtat === 'fabrique' || currentEtat === 'livre') {
      return ['fabrique', 'livre'];
    }
    return [currentEtat]; // locked to current, select disabled below
  }
  return ETAT_OPTIONS;
}

function isEtatSelectDisabled(userRole, currentEtat, isSaving) {
  if (isSaving) return true;
  if (userRole === 'Logistique') {
    return currentEtat !== 'fabrique' && currentEtat !== 'livre';
  }
  return false;
}

// ─── BL HTML generator ───────────────────────────────────────────────────────
function generateBLHtml(bl, project, logoBase64 = '') {
  const co = resolveCompany(project);
  const companyName = co.name || '';
  const companyColor = co.color || '#1a1a1a';
  const companyAddr = co.address || '';
  const companyPhone = co.phone || '';
  const companyEmail = co.email || '';
  const companyRC = co.rc || '';
  const companyICE = co.ice || '';
  const clientName = project.clientId?.name || bl.client?.name || '';
  const clientAddr = project.clientId?.address || bl.client?.address || '';
  const clientCity = project.clientId?.city || bl.client?.city || '';
  const logoSrc = logoBase64 || resolveLogoUrl(co.logo || '');
  const logoBlock = logoSrc
    ? `<img src="${logoSrc}" alt="${companyName}" style="height:52px;max-width:180px;object-fit:contain;display:block;">`
    : `<div style="height:52px;width:52px;border-radius:10px;background:${companyColor};display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#fff;">${(companyName || '?').charAt(0)}</div>`;
  const coLines = [
    companyAddr && `<div>${companyAddr}</div>`,
    companyPhone && `<div>Tél : ${companyPhone}</div>`,
    companyEmail && `<div>${companyEmail}</div>`,
    companyRC && `<div>RC : ${companyRC}</div>`,
    companyICE && `<div>ICE : ${companyICE}</div>`,
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
  <div class="info-card"><div class="info-card__label">RAL</div><div class="info-card__val"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${project.ralColor || '#eee'};border:1px solid #ddd;flex-shrink:0"></span>${project.ralCode}</div></div>
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
  const counts = { non_entame: 0, en_cours: 0, non_vitre: 0, fabrique: 0, livre: 0 };
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

// ─── Accessories Export Modal ─────────────────────────────────────────────────
function AccessoriesExportModal({ project, chassisLabels, language, t, onClose }) {
  const [etatFilter, setEtatFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const etatLabel = { all: 'Tous', non_entame: t('etat_non_entame'), en_cours: t('etat_en_cours'), non_vitre: t('etat_non_vitre'), fabrique: t('etat_fabrique'), livre: t('etat_livre') };

  const computeAccessories = async () => {
    setLoading(true);
    setError('');
    try {
      const typeTotals = {};
      for (const ch of project.chassis || []) {
        const qty = ch.quantity || 1;
        const isComposite = (ch.components || []).length > 0;
        for (let i = 0; i < qty; i++) {
          const unit = getUnit(ch, i);
          const etat = isComposite ? deriveCompositeEtat(unit, ch.components) : (unit.etat || 'non_entame');
          if (etatFilter !== 'all' && etat !== etatFilter) continue;
          const typeId = ch.typeId || ch.type;
          typeTotals[typeId] = (typeTotals[typeId] || 0) + 1;
        }
      }
      const typeIds = Object.keys(typeTotals);
      if (typeIds.length === 0) {
        setError('Aucun châssis ne correspond au filtre sélectionné.');
        setLoading(false);
        return;
      }
      const accMap = {};
      await Promise.all(typeIds.map(async (typeId) => {
        try {
          const res = await axios.get(`${API_URL}/chassis-type-accessories/${typeId}`);
          const accs = res.data || [];
          const count = typeTotals[typeId];
          for (const acc of accs) {
            if (!accMap[acc.itemId]) {
              accMap[acc.itemId] = { label: acc.label, unit: acc.unit || '', total: 0 };
            }
            if (acc.formula && acc.formula.trim()) {
              accMap[acc.itemId].hasFormula = true;
              accMap[acc.itemId].formula = acc.formula;
            } else {
              accMap[acc.itemId].total += (acc.quantity || 0) * count;
            }
          }
        } catch { }
      }));
      const rows = Object.entries(accMap).map(([id, v]) => ({
        'Désignation accessoire': v.label,
        'Unité': v.unit,
        'Quantité totale': v.hasFormula ? `Formule: ${v.formula}` : parseFloat(v.total.toFixed(4)),
      }));
      if (rows.length === 0) {
        setError('Aucun accessoire configuré pour les types de châssis de ce projet. Configurez-les dans le gestionnaire de types.');
        setLoading(false);
        return;
      }
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 18 }];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Accessoires');
      const filterSuffix = etatFilter === 'all' ? 'tous' : etatFilter;
      XLSX.writeFile(wb, `${project.name || 'projet'}_accessoires_${filterSuffix}.xlsx`);
      onClose();
    } catch (e) {
      setError('Erreur lors du calcul des accessoires : ' + (e.message || ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 8 }}>🔧 Export des accessoires nécessaires</h3>
        <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 20 }}>
          Calcule la somme des accessoires pour tous les châssis du projet, avec possibilité de filtrer par état.
        </p>
        <div className="form-group">
          <label style={{ fontWeight: 600 }}>Filtrer par état des châssis</label>
          <div className="acc-export-filters">
            {['all', ...ETAT_OPTIONS].map(opt => (
              <button
                key={opt}
                className={`acc-filter-btn${etatFilter === opt ? ' acc-filter-btn--active' : ''}`}
                style={etatFilter === opt && opt !== 'all' ? { borderColor: ETAT_COLORS[opt], background: ETAT_COLORS[opt] + '22', color: ETAT_COLORS[opt] } : {}}
                onClick={() => setEtatFilter(opt)}
              >
                {opt !== 'all' && <span className="acc-filter-dot" style={{ background: ETAT_COLORS[opt] }} />}
                {etatLabel[opt]}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="ct-manager__error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions" style={{ marginTop: 24 }}>
          <button onClick={onClose}>{t('cancel')}</button>
          <button className="primary" onClick={computeAccessories} disabled={loading}>
            {loading ? '⏳ Calcul…' : '📥 Télécharger Excel'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── BL Panel ─────────────────────────────────────────────────────────────────
function BLPanel({ project, t, language }) {
  const { getBonsLivraison } = useProjects();
  const [bls, setBls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openBL, setOpenBL] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setBls(await getBonsLivraison(project.id)); }
    catch { setBls([]); }
    finally { setLoading(false); }
  }, [project.id, getBonsLivraison]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="bl-loading">{t('loading')}</div>;

  if (bls.length === 0) return (
    <div className="bl-empty">
      <div className="bl-empty__icon"><CircleDashed size={25} /></div>
      <p><strong>{t('noBL')}</strong></p>
    </div>
  );

  const co = resolveCompany(project);

  const handlePrintBL = async (e, bl) => {
    e.stopPropagation();
    const logoUrl = resolveLogoUrl(co.logo || '');
    const logoBase64 = await fetchLogoBase64(logoUrl);
    const html = generateBLHtml(bl, project, logoBase64);
    const w = window.open('', '_blank');
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
                <span style={{ display: 'inline-block', width: 4, height: 20, borderRadius: 2, background: co.color || '#1a1a1a', marginRight: 10, verticalAlign: 'middle', flexShrink: 0 }} />
                <span className="bl-card__id">{bl.blId}</span>
                <span className="bl-card__date">📅 {fmtDate(bl.deliveryDate + 'T00:00:00')}</span>
                <span className="bl-card__count">{bl.units.length} pièce{bl.units.length > 1 ? 's' : ''}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 5, fontSize: 11, background: (co.color || '#1a1a1a') + '18', color: co.color || '#1a1a1a', fontWeight: 600 }}>
                  {co.logo && <img src={resolveLogoUrl(co.logo)} alt="" style={{ height: 14, objectFit: 'contain' }} />}
                  {co.name}
                </span>
              </div>
              <div className="bl-card__actions">
                <button className="bl-print-btn" onClick={e => handlePrintBL(e, bl)}>🖨 {t('blPrint')}</button>
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

// ─── Chassis Line Accessory Editor ───────────────────────────────────────────
const UNIT_OPTIONS = ['UN', 'ML', 'M²', 'M³', 'KG', 'L', 'PAIRE', 'JEU', 'ROULEAU'];
const EMPTY_ACC = { label: '', unit: 'UN', quantity: 1, formula: '', itemId: '', mode: 'fixed' };

function evalFormula(formula, L, H) {
  if (!formula || !formula.trim()) return null;
  try {
    const safe = formula.replace(/[^0-9LH+\-*/().\s]/g, '');
    // eslint-disable-next-line no-new-func
    const result = new Function('L', 'H', `"use strict"; return (${safe});`)(L, H);
    return typeof result === 'number' && isFinite(result) ? parseFloat(result.toFixed(4)) : null;
  } catch {
    return null;
  }
}

function AccLabelAutocomplete({ value, onChange, onSelect, placeholder }) {
  const [suggestions, setSuggestions] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const debounceRef = React.useRef(null);
  const wrapRef = React.useRef(null);

  React.useEffect(() => {
    const handleOutside = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const search = (q) => {
    clearTimeout(debounceRef.current);
    if (!q || q.length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(q)}&superCategory=accessoires`);
        const items = res.data || [];
        setSuggestions(items.slice(0, 10));
        setOpen(items.length > 0);
      } catch { setSuggestions([]); } finally { setBusy(false); }
    }, 250);
  };

  const handleChange = (e) => { onChange(e.target.value); search(e.target.value); };

  const handleSelect = (item) => {
    const label = item.designation?.fr || item.designation || '';
    const unit = item.unit || '';
    const id = item.id || item._id;
    onSelect({ label, unit, itemId: id });
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#9ca3af', pointerEvents: 'none', lineHeight: 1 }}>🔍</span>
        <input
          className="ct-acc-search-input"
          onFocus={e => { e.target.style.borderColor = '#1a1a1a'; e.target.style.boxShadow = '0 0 0 3px rgba(26,26,26,0.08)'; if (value.length >= 2 && suggestions.length > 0) setOpen(true); }}
          onBlur={e => { e.target.style.borderColor = '#d1d5db'; e.target.style.boxShadow = 'none'; }}
          value={value}
          onChange={handleChange}
          placeholder={placeholder || 'Nom ou recherche inventaire…'}
          autoComplete="off"
        />
        {busy
          ? <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#555' }}>⏳</span>
          : value && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: '#9ca3af', cursor: 'pointer' }} onMouseDown={() => { onChange(''); setSuggestions([]); setOpen(false); }}>✕</span>
        }
      </div>
      {open && suggestions.length > 0 && (
        <div className="ct-acc-dropdown">
          <div className="ct-acc-dropdown__header">{suggestions.length} résultat{suggestions.length > 1 ? 's' : ''}</div>
          {suggestions.map(item => {
            const id = item.id || item._id;
            const label = item.designation?.fr || item.designation || id;
            const unit = item.unit || '';
            return (
              <div key={id} onMouseDown={() => handleSelect(item)} className="ct-acc-dropdown__item"
                onMouseEnter={e => { e.currentTarget.style.background = '#f5f5f5'; }}
                onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13 }}>📦</span>
                  <span>{label}</span>
                </span>
                {unit && <span className="ct-acc-dropdown__unit">{unit}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChassisLineAccessoryEditor({ chassis, project, onClose, onSaved }) {
  const chId = chassis._id || chassis.id;
  const L = chassis.largeur || 0;
  const H = chassis.hauteur || 0;

  const [accessories, setAccessories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [newAcc, setNewAcc] = useState(EMPTY_ACC);
  const [loadingDefaults, setLoadingDefaults] = useState(false);
  const [defaultsInfo, setDefaultsInfo] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/projects/${project.id}/chassis/${chId}/accessories`);
        const saved = res.data || [];
        setAccessories(saved.map(a => {
          const hasFormula = a.formula && a.formula.trim() !== '';
          return { ...a, quantity: hasFormula ? 0 : (a.quantity || 1), formula: hasFormula ? a.formula.trim() : '', mode: hasFormula ? 'formula' : 'fixed' };
        }));
        if (saved.length === 0 && chassis.type) await loadDefaults(true);
      } catch { setAccessories([]); }
      finally { setLoading(false); }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chId, project.id]);

  const loadDefaults = async (silent = false) => {
    if (!chassis.type) return;
    setLoadingDefaults(true);
    try {
      const res = await axios.get(`${API_URL}/chassis-type-defaults/${encodeURIComponent(chassis.type)}`);
      const defaults = res.data || [];
      setDefaultsInfo(defaults.length);
      if (defaults.length > 0) {
        setAccessories(defaults.map(d => {
          const hasFormula = d.formula && d.formula.trim() !== '';
          return { itemId: d.itemId || '', label: d.label, unit: d.unit || 'UN', quantity: hasFormula ? 0 : (d.quantity || 1), formula: hasFormula ? d.formula.trim() : '', mode: hasFormula ? 'formula' : 'fixed' };
        }));
      } else if (!silent) {
        setError('Aucun accessoire par défaut configuré pour ce type de châssis.');
      }
    } catch {
      if (!silent) setError('Erreur lors du chargement des défauts.');
    } finally { setLoadingDefaults(false); }
  };

  const update = (idx, key, val) => setAccessories(prev => prev.map((a, i) => i === idx ? { ...a, [key]: val } : a));
  const setMode = (idx, mode) => setAccessories(prev => prev.map((a, i) => i === idx ? { ...a, mode, formula: mode === 'fixed' ? '' : a.formula } : a));

  const addAcc = () => {
    if (!newAcc.label.trim()) return setError("Le nom de l'accessoire est requis");
    setError('');
    const acc = { itemId: newAcc.itemId || `manual_${Date.now()}`, label: newAcc.label.trim(), unit: newAcc.unit || 'UN', quantity: newAcc.mode === 'fixed' ? (parseFloat(newAcc.quantity) || 1) : 0, formula: newAcc.mode === 'formula' ? newAcc.formula.trim() : '', mode: newAcc.mode };
    setAccessories(prev => [...prev, acc]);
    setNewAcc(EMPTY_ACC);
  };

  const removeAcc = (idx) => setAccessories(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = accessories.map(({ mode, ...rest }) => rest);
      await axios.put(`${API_URL}/projects/${project.id}/chassis/${chId}/accessories`, { accessories: payload });
      const resolvedChassis = { ...chassis, accessories: payload };
      const computedAccs = computeChassisAccessories(resolvedChassis);
      if (computedAccs.length > 0) {
        const qty = chassis.quantity || 1;
        const tableGroups = {};
        for (let i = 0; i < qty; i++) {
          const unit = (chassis.units || []).find(u => u.unitIndex === i);
          const tbl = unit?.atelierTable || '';
          if (tbl) tableGroups[tbl] = (tableGroups[tbl] || 0) + 1;
        }
        await Promise.allSettled(Object.entries(tableGroups).map(async ([tableName, unitCount]) => {
          try {
            const tblRes = await axios.get(`${API_URL}/atelier-tables`);
            const found = (tblRes.data || []).find(t => t.name === tableName);
            if (!found) return;
            const scaledAccs = computedAccs.map(a => ({ ...a, quantity: a.quantity * unitCount }));
            await axios.post(`${API_URL}/table-stock/deduct-chassis`, { tableId: found.id, tableName, projectId: project.id, projectName: project.name, chassisRef: chassis.repere, accessories: scaledAccs });
          } catch { }
        }));
      }
      onSaved && onSaved();
      onClose();
    } catch (e) {
      setError(e.response?.data?.error || 'Erreur lors de la sauvegarde');
    } finally { setSaving(false); }
  };

  const preview = (acc) => {
    if (acc.mode === 'formula' && acc.formula) {
      const val = evalFormula(acc.formula, L, H);
      return val !== null
        ? <span className="proj-acc-preview-cell">{val} {acc.unit}</span>
        : <span className="proj-acc-preview-cell proj-acc-preview-cell--invalid">⚠ invalide</span>;
    }
    return <span className="proj-acc-preview-cell">{acc.quantity} {acc.unit}</span>;
  };

  const setN = (key, val) => setNewAcc(prev => ({ ...prev, [key]: val }));

  const newPreview = () => {
    if (newAcc.mode === 'formula' && newAcc.formula) {
      const val = evalFormula(newAcc.formula, L, H);
      if (val !== null) return <span className="proj-acc-formula-preview">= {val} {newAcc.unit}</span>;
      return <span className="proj-acc-formula-preview proj-acc-formula-preview--invalid">⚠ formule invalide</span>;
    }
    return null;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal proj-acc-modal" onClick={e => e.stopPropagation()}>
        <div className="ct-manager__header">
          <h2>🔧 Accessoires — {chassis.repere}<span style={{ fontWeight: 400, fontSize: 14, color: '#6b7280', marginLeft: 8 }}>({L}×{H} mm)</span></h2>
          <button className="chassis-form__close" onClick={onClose}>×</button>
        </div>
        {error && <div className="ct-manager__error">{error}</div>}
        {loading ? (
          <div className="ct-manager__loading">Chargement…</div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <p className="ct-acc-hint" style={{ margin: 0, flex: 1 }}>
                Accessoires pour ce châssis. La quantité peut être <strong>fixe</strong> ou calculée via une <strong>formule</strong> utilisant <strong>L</strong> (largeur) et <strong>H</strong> (hauteur) en mm. Ces données <strong>n'affectent pas l'inventaire</strong>.
              </p>
              <button className="proj-acc-load-defaults-btn" onClick={() => loadDefaults(false)} disabled={loadingDefaults} title="Remplacer les accessoires actuels par les défauts du type de châssis">
                {loadingDefaults ? '…' : '↩ Charger les défauts'}
              </button>
            </div>
            {accessories.length > 0 ? (
              <table className="proj-acc-table">
                <thead>
                  <tr>
                    <th>Accessoire</th>
                    <th style={{ width: 90 }}>Unité</th>
                    <th style={{ width: 80 }}>Mode</th>
                    <th style={{ width: 110 }}>Qté fixe</th>
                    <th style={{ width: 180 }}>Formule (L,H)</th>
                    <th style={{ width: 110 }}>Aperçu</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {accessories.map((acc, idx) => (
                    <tr key={idx}>
                      <td><input className="ct-acc-qty-input" style={{ width: '100%' }} value={acc.label} onChange={e => update(idx, 'label', e.target.value)} placeholder="Nom accessoire" /></td>
                      <td><select className="ct-acc-unit-select" value={acc.unit || 'UN'} onChange={e => update(idx, 'unit', e.target.value)}>{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                      <td><select className="ct-acc-unit-select" value={acc.mode || 'fixed'} onChange={e => setMode(idx, e.target.value)}><option value="fixed">Fixe</option><option value="formula">Formule</option></select></td>
                      <td><input className="ct-acc-qty-input" type="number" min="0" step="0.01" value={acc.quantity} disabled={acc.mode === 'formula'} onChange={e => update(idx, 'quantity', parseFloat(e.target.value) || 0)} /></td>
                      <td className="proj-acc-formula-cell"><input className="proj-acc-formula-input" value={acc.formula} disabled={acc.mode === 'fixed'} onChange={e => update(idx, 'formula', e.target.value)} placeholder="ex: 2*(L+H)/1000" /></td>
                      <td>{preview(acc)}</td>
                      <td><button className="delete-btn" onClick={() => removeAcc(idx)}>✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="proj-acc-empty">Aucun accessoire configuré. Ajoutez-en ci-dessous ou chargez les défauts du type.</div>
            )}
            <div className="proj-acc-add-form">
              <div className="proj-acc-add-form__title">➕ Ajouter un accessoire</div>
              <div className="proj-acc-add-form__grid">
                <div className="form-group proj-acc-add-form__search" style={{ marginBottom: 0 }}>
                  <label>Désignation *<span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: 6, fontSize: 11 }}>(tapez pour chercher dans l'inventaire)</span></label>
                  <AccLabelAutocomplete value={newAcc.label} onChange={v => setN('label', v)} onSelect={({ label, unit, itemId }) => setNewAcc(p => ({ ...p, label, unit: UNIT_OPTIONS.includes(unit) ? unit : (unit || 'UN'), itemId }))} placeholder="ex: Joint, Vis inox, Poignée…" />
                </div>
                <div className="proj-acc-mode-row">
                  <div className={`proj-acc-mode-card${newAcc.mode === 'fixed' ? ' proj-acc-mode-card--active' : ''}`} onClick={() => setN('mode', 'fixed')}>
                    <div className="proj-acc-mode-card__label"><span className="proj-acc-mode-dot" />Quantité fixe</div>
                    <div className="proj-acc-qty-unit-row">
                      <input type="number" className="ct-acc-qty-input" min="0" step="0.01" value={newAcc.quantity} disabled={newAcc.mode !== 'fixed'} style={{ flex: 1 }} onChange={e => setN('quantity', e.target.value)} onClick={e => { e.stopPropagation(); setN('mode', 'fixed'); }} />
                      <select className="proj-acc-unit-select" value={newAcc.unit} onChange={e => setN('unit', e.target.value)} onClick={e => e.stopPropagation()}>{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                    </div>
                  </div>
                  <div className={`proj-acc-mode-card${newAcc.mode === 'formula' ? ' proj-acc-mode-card--active' : ''}`} onClick={() => setN('mode', 'formula')}>
                    <div className="proj-acc-mode-card__label"><span className="proj-acc-mode-dot" />Formule (L, H)</div>
                    <input className="proj-acc-formula-input" value={newAcc.formula} disabled={newAcc.mode !== 'formula'} onChange={e => setN('formula', e.target.value)} onClick={e => { e.stopPropagation(); setN('mode', 'formula'); }} placeholder="ex: 2*(L+H)/1000" />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                      <select className="proj-acc-unit-select" value={newAcc.unit} onChange={e => setN('unit', e.target.value)} onClick={e => e.stopPropagation()}>{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                      <p className="proj-acc-formula-hint" style={{ margin: 0 }}><strong>L</strong> = {L} mm &nbsp;·&nbsp; <strong>H</strong> = {H} mm</p>
                    </div>
                    {newAcc.mode === 'formula' && newAcc.formula && newPreview()}
                  </div>
                </div>
                <div className="proj-acc-add-form__actions">
                  <button type="button" className="ct-config-btn" onClick={() => { setNewAcc(EMPTY_ACC); setError(''); }}>Réinitialiser</button>
                  <button type="button" className="ct-config-btn" onClick={addAcc}>+ Ajouter</button>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={onClose}>Annuler</button>
              <button className="primary" onClick={handleSave} disabled={saving}>{saving ? '…' : '💾 Enregistrer'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Chassis Detail Print ─────────────────────────────────────────────────────
function buildChassisDetailHTML(ch, project, chassisLabels, language, accessories, atelierTable) {
  const L = ch.largeur || 0;
  const H = ch.hauteur || 0;
  const typeLabel = chassisLabels[ch.type]?.[language] || chassisLabels[ch.type]?.fr || ch.type;
  const co = resolveCompany(project);
  const companyColor = co.color || '#1a1a1a';
  const mergedMap = {};
  for (const acc of accessories) {
    let qty;
    if (acc.formula) { const val = evalFormula(acc.formula, L, H); qty = val !== null ? val : null; }
    else { qty = typeof acc.quantity === 'number' ? acc.quantity : parseFloat(acc.quantity) || 0; }
    const key = `${acc.label}|||${acc.unit || ''}`;
    if (mergedMap[key]) {
      mergedMap[key].totalQty = (mergedMap[key].totalQty !== null && qty !== null) ? parseFloat((mergedMap[key].totalQty + qty).toFixed(4)) : null;
      if (acc.formula) mergedMap[key].formulaStr += ` + ${acc.formula}`;
    } else {
      mergedMap[key] = { label: acc.label, unit: acc.unit || '', totalQty: qty, formulaStr: acc.formula || '' };
    }
  }
  const mergedAccessories = Object.values(mergedMap);
  const accRows = mergedAccessories.map((acc, i) => {
    const qtyDisplay = acc.totalQty !== null ? `${acc.totalQty} ${acc.unit}` : `⚠ formule invalide`;
    const formulaDisplay = acc.formulaStr ? `<code style="font-size:11px;color:#6b7280">${acc.formulaStr}</code>` : '—';
    return `<tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}"><td>${i + 1}</td><td>${acc.label}</td><td>${formulaDisplay}</td><td style="font-weight:700;color:${companyColor}">${qtyDisplay}</td></tr>`;
  }).join('');
  const componentRows = (ch.components || []).map((comp, i) => `<tr><td>${comp.repere || (comp.role === 'dormant' ? 'Dormant' : `Vantail ${i}`)}</td><td>${comp.role === 'dormant' ? 'Dormant' : 'Vantail'}</td><td>${comp.largeur}×${comp.hauteur} mm</td></tr>`).join('');
  const atelierChip = atelierTable
    ? `<div class="chip" style="background:#fef9c3;border-color:#fde68a">🏭 Table atelier : <strong style="color:#92400e">${atelierTable}</strong></div>`
    : `<div class="chip" style="color:#9ca3af">🏭 Table atelier : <strong>non assignée</strong></div>`;
  const closeScript = '<' + '/script>';
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Détail — ${ch.repere}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:28px 36px}h1{font-size:18px;font-weight:800;color:${companyColor};margin-bottom:4px}h2{font-size:13px;font-weight:700;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#374151}.meta{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}.chip{padding:5px 12px;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;font-size:12px}.chip strong{color:${companyColor}}table{width:100%;border-collapse:collapse;margin-bottom:12px}thead tr{background:${companyColor};color:#fff}th{padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;text-align:left}td{padding:8px 10px;border-bottom:1px solid #f0f0f0}.row-even{background:#fff}.row-odd{background:#f9fafb}.no-acc{color:#9ca3af;font-style:italic;padding:12px 0}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{padding:12mm 16mm}@page{size:A4;margin:0}}</style></head><body><h1>🪟 ${ch.repere}</h1><div class="meta"><div class="chip">Type : <strong>${typeLabel}</strong></div><div class="chip">Dimensions : <strong>${L}×${H} mm</strong></div><div class="chip">Projet : <strong>${project.name}</strong></div><div class="chip">Réf. : <strong>${project.reference}</strong></div><div class="chip">RAL : <strong>${project.ralCode}</strong></div>${atelierChip}</div>${componentRows ? `<h2>Composants</h2><table><thead><tr><th>Repère</th><th>Rôle</th><th>Dimension</th></tr></thead><tbody>${componentRows}</tbody></table>` : ''}<h2>Accessoires nécessaires</h2>${mergedAccessories.length === 0 ? '<p class="no-acc">Aucun accessoire configuré pour ce châssis.</p>' : `<table><thead><tr><th>#</th><th>Désignation</th><th>Formule</th><th>Quantité</th></tr></thead><tbody>${accRows}</tbody></table>`}<script>window.onload = () => window.print();${closeScript}</body></html>`;
}

// ─── ProjectDetail ────────────────────────────────────────────────────────────
function ProjectDetail({ project, onBack, currentUser }) {
  const { deleteChassis, updateChassis, updateUnit, updateComponent, refreshProject } = useProjects();
  const { t, currentLanguage } = useLanguage();

  const [activeTab, setActiveTab] = useState('chassis');
  const [showChassisForm, setShowChassisForm] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [showAccExport, setShowAccExport] = useState(false);
  const [accLineEditor, setAccLineEditor] = useState(null);
  const [editingChassis, setEditingChassis] = useState(null);
  const [printingChassis, setPrintingChassis] = useState(null);
  const [chassisLabels, setChassisLabels] = useState(STATIC_LABELS);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [deliveryModal, setDeliveryModal] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [atelierTables, setAtelierTables] = useState({});
  const [savingTableKey, setSavingTableKey] = useState(null);

  const language = currentLanguage;
  const statusColor = STATUS_COLORS[project.status] || '#9ca3af';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  useEffect(() => {
    fetchChassisTypes().then(types => setChassisLabels(buildChassisLabels(types))).catch(() => { });
  }, [showTypeManager]);

  useEffect(() => {
    const init = {};
    for (const ch of project.chassis || []) {
      const qty = ch.quantity || 1;
      const chId = ch._id || ch.id;
      for (let i = 0; i < qty; i++) {
        const unit = getUnit(ch, i);
        const key = `${chId}-${i}`;
        if (unit.atelierTable) init[key] = unit.atelierTable;
      }
    }
    setAtelierTables(init);
  }, [project]);

  const handleAtelierTableChange = useCallback(async (ch, unitIndex, newTable, rowKey) => {
    setSavingTableKey(rowKey);
    const chId = ch._id || ch.id;
    const prevTable = atelierTables[rowKey] || '';
    try {
      await axios.patch(`${API_URL}/projects/${project.id}/chassis/${chId}/units/${unitIndex}`, { atelierTable: newTable });
      setAtelierTables(prev => ({ ...prev, [rowKey]: newTable }));
      if (refreshProject) refreshProject(project.id);
      if (newTable && newTable !== prevTable) {
        try {
          const tblRes = await axios.get(`${API_URL}/atelier-tables`);
          const found = (tblRes.data || []).find(t => t.name === newTable);
          if (found) {
            const accessories = computeChassisAccessories(ch);
            if (accessories.length > 0) {
              await axios.post(`${API_URL}/table-stock/deduct-chassis`, { tableId: found.id, tableName: newTable, projectId: project.id, projectName: project.name, chassisRef: ch.repere, accessories });
            }
          }
        } catch { }
      }
    } catch (e) { console.error('Atelier table save failed', e); }
    finally { setSavingTableKey(null); }
  }, [project, refreshProject, atelierTables]);

  const rows = (project.chassis || []).flatMap(ch => {
    const qty = ch.quantity || 1;
    const chId = ch._id || ch.id;
    const isComposite = (ch.components || []).length > 0;
    return Array.from({ length: qty }, (_, unitIndex) => {
      const unit = getUnit(ch, unitIndex);
      const groupKey = `${chId}-${unitIndex}`;
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
        { kind: 'groupHead', ch, chId, unitIndex, unit, rowKey: groupKey, label: baseLabel, derivedEtat: deriveCompositeEtat(unit, ch.components), componentRows },
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
    if (refreshProject) await refreshProject(project.id);
    setSavingKey(null);
  };

  const handleComponentEtatChange = async (ch, unitIndex, ci, newEtat, rowKey) => {
    if (newEtat === 'livre') {
      setDeliveryModal({ kind: 'component', chId: ch._id || ch.id, unitIndex, ci, rowKey, currentDate: null });
      return;
    }
    setSavingKey(rowKey);
    await updateComponent(project.id, ch._id || ch.id, unitIndex, ci, { etat: newEtat });
    if (refreshProject) await refreshProject(project.id);
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
    if (refreshProject) await refreshProject(project.id);
    setSavingKey(null);
  };

  const handleDeleteUnit = async (ch, unitIndex) => {
    const chId = ch._id || ch.id;
    const qty = ch.quantity ?? 1;
    if (qty <= 1) {
      if (!window.confirm(t('deleteChassisConfirm'))) return;
      await deleteChassis(project.id, chId);
    } else {
      if (!window.confirm(`Supprimer l'unité #${unitIndex + 1} ? (${qty - 1} restante${qty - 1 > 1 ? 's' : ''})`)) return;
      await updateChassis(project.id, chId, { quantity: qty - 1 });
    }
    if (refreshProject) await refreshProject(project.id);
  };

  const [ATELIER_TABLES, setAtelierTableOptions] = useState([]);
  useEffect(() => {
    const loadTableOptions = async () => {
      try {
        const res = await axios.get(`${API_URL}/atelier-tables/names`);
        const sorted = (res.data || []).slice().sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
        setAtelierTableOptions(sorted);
      } catch {
        setAtelierTableOptions(['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6', 'Table 7', 'Table 8']);
      }
    };
    loadTableOptions();
  }, []);

  const startBatchPrint = () => {
    const toPrint = [];
    for (const row of rows) {
      if (!selectedKeys.has(row.rowKey)) continue;
      if (row.kind === 'unit') {
        toPrint.push({ ...row.ch, _printRowIndex: row.unitIndex, _totalQty: row.ch.quantity || 1 });
      } else if (row.kind === 'component') {
        const roleLabel = row.comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${row.ci}`;
        toPrint.push({ ...row.ch, _printRowIndex: row.unitIndex, _totalQty: row.ch.quantity || 1, _component: { repere: row.comp.repere || roleLabel, roleLabel, largeur: row.comp.largeur, hauteur: row.comp.hauteur } });
      }
    }
    if (!toPrint.length) return;
    const html = buildLabelHTML(toPrint, project, chassisLabels, language);
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  };

  const totalDisplayRows = (project.chassis || []).reduce((acc, ch) => acc + (ch.quantity || 1), 0);

  const { user } = useAuth();
  const userRole = user?.role;
  const adminThing = userRole === 'Admin';
  const laquageThing = userRole === 'Admin' || userRole === 'Laquage';
  const barreThing = userRole === 'Admin' || userRole === 'BARREMAN';
  const coordinateurThing = userRole === 'Admin' || userRole === 'Coordinateur';
  const magThing = userRole === 'Admin' || userRole === 'Magasinier';
  const logistiqueThing = userRole === 'LOGISTIQUE';
  const stateThing = userRole === 'Admin' || ['LOGISTIQUE', 'Coordinateur'].includes(userRole);

  const detailTabs = [
    { key: 'chassis', label: t('tabChassis'), count: totalDisplayRows },
    { key: 'bars', label: t('cons'), count: project.usedBars?.length || 0 },
    { key: 'bl', label: t('tabBL'), count: null },
    { key: 'barres_laquer', label: 'Barres à Laquer', count: null },
    { key: 'accessoires_laquer', label: 'Accessoires à Laquer', count: null },
  ]
  const ROLE_TAB_ACCESS = {
    Laquage: ['barres_laquer', 'accessoires_laquer', 'bars'],
    BARREMAN: ['barres_laquer'],
    Coordinateur: ['chassis', 'barres_laquer', 'accessoires_laquer'],
    Magasinier: ['bars', 'accessoires_laquer'],
    LOGISTIQUE: ['chassis', 'bl'],
    // add other roles here as needed
  };
  const visibleTabs = adminThing
    ? detailTabs                                           // Admin sees all
    : detailTabs.filter(sc =>
      (ROLE_TAB_ACCESS[userRole] || []).includes(sc.key)
    );
  return (
    <div className="project-detail">
      <button className="btn-back" onClick={onBack}><StepBack size={15} />{t('backToProjects')}</button>

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
        {adminThing && (
          <div className="project-detail__header-actions">
            <button className="excel-btn" onClick={() => exportProjectPDF(project, language, chassisLabels, t)}>📄 {t('exportPDF')} — Châssis</button>
            <button className="excel-btn" onClick={() => exportBarsPDF(project, language, t)}>📄 {t('exportPDF')} — Barres</button>
          </div>
        )}

      </div>

      <ProgressBar chassis={project.chassis} t={t} />

      <div className="project-detail__tabs">
        {visibleTabs.map(tab => (
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
            {adminThing && (
              <button className="add-item-btn" onClick={() => { setEditingChassis(null); setShowChassisForm(true); }}>+ {t('addChassis')}</button>
            )}
            {magThing && (
              <button className="ct-config-btn" onClick={() => setShowTypeManager(true)}>⚙️ {t('chassisTypeConfig')}</button>
            )}
            {rows.length > 0 && (
              (adminThing && <div className="selection-toolbar">
                <button className="select-btn" onClick={toggleAll}>{selectedKeys.size === allSelectableKeys.length ? t('deselectAll') : t('selectAll')}</button>
                {selectedKeys.size > 0 && (
                  <button className="print-selected-btn" onClick={startBatchPrint}>
                    🖨 {t('printSelected')} ({selectedKeys.size} {t('selectedCount')})
                  </button>
                )}
              </div>)
              
            )}
          </div>

          {!project.chassis?.length ? (
            <div className="no-items">{t('noChassis')}</div>
          ) : (
            <div className="chassis-table-wrapper">
              <table className="chassis-table">
                <thead>
                  <tr>
                    {adminThing && (
                      <th style={{ width: 40 }}>
                        <input type="checkbox"
                          checked={allSelectableKeys.length > 0 && selectedKeys.size === allSelectableKeys.length}
                          onChange={toggleAll} />
                      </th>

                    )}
                    <th>{t('repere')}</th>
                    <th>{t('type')}</th>
                    <th>{t('largeur')} (mm)</th>
                    <th>{t('hauteur')} (mm)</th>
                    <th>{t('dimension')}</th>
                    <th>{t('etat')}</th>
                    <th>{t('deliveryDate')}</th>
                    <th className="atelier-table-col">Table atelier</th>
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    // ── groupHead ──
                    if (row.kind === 'groupHead') {
                      const { ch, chId, unitIndex, label, derivedEtat } = row;
                      const rowKey = row.rowKey;
                      return (
                        <tr key={rowKey} className="chassis-row chassis-row--group-head">
                          {adminThing && (
                            <td className="chassis-row__check">
                              
                            </td>
                          )}
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
                          {coordinateurThing && (
                            <td className="atelier-table-col">
                              <select
                                className={`etat-select etat-select--livre atelier-select${savingTableKey === rowKey ? ' atelier-select--saving' : ''}`}
                                value={atelierTables[rowKey] || ''}
                                disabled={savingTableKey === rowKey}
                                onChange={e => handleAtelierTableChange(ch, unitIndex, e.target.value, rowKey)}
                              >
                                <option value="">— non assigné —</option>
                                {ATELIER_TABLES.map(tbl => <option key={tbl} value={tbl}>{tbl}</option>)}
                              </select>
                            </td>

                          )}
                          {adminThing && (
                            <td>
                              <div className="chassis-row__actions">
                                <button className="edit-btn" onClick={() => { setEditingChassis({ ...ch, _originalId: chId }); setShowChassisForm(true); }}>✏️</button>
                                <button className="ct-acc-btn" title="Configurer les accessoires" onClick={() => setAccLineEditor(ch)}>🔧</button>
                                <button className="print-btn" title="Imprimer la fiche détail" onClick={async () => {
                                  let accs = [];
                                  try { const r = await axios.get(`${API_URL}/projects/${project.id}/chassis/${chId}/accessories`); accs = r.data || []; } catch { }
                                  const tbl = atelierTables[rowKey] || '';
                                  const html = buildChassisDetailHTML(ch, project, chassisLabels, language, accs, tbl);
                                  const w = window.open('', '_blank');
                                  if (w) { w.document.write(html); w.document.close(); }
                                }}>🖨</button>
                                <button className="print-btn" title={t('printLabel')} onClick={() => {
                                  const toPrint = ch.components.map((comp, ci) => {
                                    const roleLabel = comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${ci}`;
                                    return { ...ch, _printRowIndex: unitIndex, _totalQty: ch.quantity || 1, _component: { repere: comp.repere || roleLabel, roleLabel, largeur: comp.largeur, hauteur: comp.hauteur } };
                                  });
                                  const html = buildLabelHTML(toPrint, project, chassisLabels, language);
                                  const w = window.open('', '_blank');
                                  if (w) { w.document.write(html); w.document.close(); }
                                }}>🏷</button>
                                <button className="delete-btn" onClick={() => handleDeleteUnit(ch, unitIndex)}>🗑</button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    }

                    // ── component ──
                    if (row.kind === 'component') {
                      const { ch, unitIndex, comp, ci, rowKey, label, etat } = row;
                      const isSaving = savingKey === rowKey;
                      const isSelected = selectedKeys.has(rowKey);
                      return (
                        <tr key={rowKey} className={`component-row${isSelected ? ' component-row--selected' : ''}${isSaving ? ' component-row--saving' : ''}`}>
                          {adminThing && (
                            <td className="chassis-row__check">
                              <input type="checkbox" checked={isSelected} onChange={() => toggleKey(rowKey)} onClick={e => e.stopPropagation()} />
                            </td>
                          )}
                          <td className="component-indent">↳ <strong>{label}</strong></td>
                          <td className="component-role">{comp.role === 'dormant' ? t('dormant') : t('vantail')}</td>
                          <td>{comp.largeur || '—'}</td><td>{comp.hauteur || '—'}</td>
                          <td className="dim-cell">{comp.largeur && comp.hauteur ? `${comp.largeur}×${comp.hauteur}` : '—'}</td>
                          {stateThing && (
                            <td>
                              <select
                                className={`etat-select etat-select--${etat}`}
                                value={etat}
                                disabled={isEtatSelectDisabled(userRole, etat, isSaving)}
                                onChange={e => handleComponentEtatChange(ch, unitIndex, ci, e.target.value, rowKey)}
                              >
                                {getAllowedEtats(userRole, etat).map(opt => (
                                  <option key={opt} value={opt}>{t(`etat_${opt}`)}</option>
                                ))}
                              </select>
                            </td>

                          )}
                          <td><span className="date-placeholder">—</span></td>
                          <td className="atelier-table-col">
                            <span className={`etat-select etat-select--livre atelier-select${savingTableKey === rowKey ? ' atelier-select--saving' : ''}`}>
                              {atelierTables[row.groupKey] || <span style={{ color: '#9ca3af' }}>—</span>}
                            </span>
                          </td>
                          <td>
                            {adminThing && (
                              <div className="chassis-row__actions">
                                <button className="print-btn" title={t('printLabel')} onClick={() => {
                                  const roleLabel = comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${ci}`;
                                  setPrintingChassis({ ...ch, _printRowIndex: unitIndex, _totalQty: ch.quantity || 1, _component: { repere: comp.repere || roleLabel, roleLabel, largeur: comp.largeur, hauteur: comp.hauteur } });
                                }}>🏷</button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    }

                    // ── unit ──
                    const { ch, chId, unitIndex, unit, rowKey, label, etat } = row;
                    const isSaving = savingKey === rowKey;
                    const isSelected = selectedKeys.has(rowKey);
                    return (
                      <tr key={rowKey} className={`chassis-row${isSelected ? ' chassis-row--selected' : ''}${isSaving ? ' chassis-row--saving' : ''}`}>
                        {adminThing && (
                          <td className="chassis-row__check">
                            <input type="checkbox" checked={isSelected} onChange={() => toggleKey(rowKey)} onClick={e => e.stopPropagation()} />
                          </td>
                        )}
                        <td><strong>{label}</strong></td>
                        <td>{chassisLabels[ch.type]?.[language] || ch.type}</td>
                        <td>{ch.largeur}</td><td>{ch.hauteur}</td>
                        <td className="dim-cell">{ch.dimension || `${ch.largeur}×${ch.hauteur}`}</td>
                        {stateThing && (
                          <td>
                            <select
                              className={`etat-select etat-select--${etat}`}
                              value={etat}
                              disabled={isEtatSelectDisabled(userRole, etat, isSaving)}
                              onChange={e => handleUnitEtatChange(ch, unitIndex, e.target.value, rowKey)}
                              style={{ borderLeftColor: ETAT_COLORS[etat] }}
                            >
                              {getAllowedEtats(userRole, etat).map(opt => (
                                <option key={opt} value={opt}>{t(`etat_${opt}`)}</option>
                              ))}
                            </select>
                          </td>

                        )}
                        <td className="delivery-date-cell">
                          {etat === 'livre' ? (
                            <button className="date-btn" onClick={() => setDeliveryModal({ kind: 'unit', chId, unitIndex, rowKey, currentDate: toDateInput(unit.deliveryDate) })}>
                              📅 {unit.deliveryDate ? fmtDate(unit.deliveryDate) : 'Définir'}
                            </button>
                          ) : <span className="date-placeholder">—</span>}
                        </td>
                        {stateThing && (
                          <td className="atelier-table-col">
                            <select
                              className={`etat-select etat-select--livre atelier-select${savingTableKey === rowKey ? ' atelier-select--saving' : ''}`}
                              value={atelierTables[rowKey] || ''}
                              disabled={savingTableKey === rowKey}
                              onChange={e => handleAtelierTableChange(ch, unitIndex, e.target.value, rowKey)}
                            >
                              <option value="">— non assigné —</option>
                              {ATELIER_TABLES.map(tbl => <option key={tbl} value={tbl}>{tbl}</option>)}
                            </select>
                          </td>

                        )}
                        <td>
                          {adminThing && (
                            <div className="chassis-row__actions">
                              <button className="edit-btn" title={t('edit')} onClick={() => { setEditingChassis({ ...ch, quantity: 1, etat, _originalId: chId, _unitIndex: unitIndex, _totalQty: ch.quantity ?? 1 }); setShowChassisForm(true); }}>✏️</button>
                              <button className="ct-acc-btn" title="Configurer les accessoires" onClick={() => setAccLineEditor(ch)}>🔧</button>
                              <button className="print-btn" title="Imprimer la fiche détail" onClick={async () => {
                                let accs = [];
                                try { const r = await axios.get(`${API_URL}/projects/${project.id}/chassis/${chId}/accessories`); accs = r.data || []; } catch { }
                                const tbl = atelierTables[rowKey] || '';
                                const html = buildChassisDetailHTML(ch, project, chassisLabels, language, accs, tbl);
                                const w = window.open('', '_blank');
                                if (w) { w.document.write(html); w.document.close(); }
                              }}>🖨</button>
                              <button className="print-btn" title={t('printLabel')} onClick={() => setPrintingChassis({ ...ch, _printRowIndex: unitIndex })}>🏷</button>
                              <button className="delete-btn" onClick={() => handleDeleteUnit(ch, unitIndex)}>🗑</button>
                            </div>
                          )}
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
      {activeTab === 'bl' && <div className="project-detail__panel"><BLPanel project={project} t={t} language={language} /></div>}
      {activeTab === 'barres_laquer' && (
        <div className="project-detail__panel">
          <BarresLaquerPanel project={project} currentUser={currentUser} />
        </div>
      )}
      {activeTab === 'accessoires_laquer' && (
        <div className="project-detail__panel">
          <AccessoiresLaquerPanel project={project} currentUser={currentUser} />
        </div>
      )}

      {showChassisForm && <ChassisForm chassis={editingChassis} projectId={project.id} onClose={() => { setShowChassisForm(false); setEditingChassis(null); }} onSave={() => { setShowChassisForm(false); setEditingChassis(null); }} />}
      {showTypeManager && <ChassisTypeManager onClose={() => setShowTypeManager(false)} />}
      {printingChassis && <LabelPrint chassis={printingChassis} project={project} chassisLabels={chassisLabels} onClose={() => setPrintingChassis(null)} />}
      {deliveryModal && <DeliveryDateModal defaultDate={deliveryModal.currentDate} onConfirm={handleDeliveryConfirm} onCancel={() => setDeliveryModal(null)} t={t} />}
      {accLineEditor && (
        <ChassisLineAccessoryEditor
          chassis={accLineEditor}
          project={project}
          onClose={() => setAccLineEditor(null)}
          onSaved={() => { if (refreshProject) refreshProject(project.id); }}
        />
      )}
      {showAccExport && (
        <AccessoriesExportModal
          project={project}
          chassisLabels={chassisLabels}
          language={language}
          t={t}
          onClose={() => setShowAccExport(false)}
        />
      )}
    </div>
  );
}

export { STATIC_LABELS as CHASSIS_LABELS };
export default ProjectDetail;