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

const ETAT_OPTIONS = ['non_entame', 'en_cours', 'fabrique', 'livre'];
const ETAT_COLORS  = { non_entame: '#9ca3af', en_cours: '#f59e0b', fabrique: '#3b82f6', livre: '#16a34a' };
const STATUS_COLORS = { en_cours: '#f59e0b', fabrique: '#3b82f6', cloture: '#16a34a' };

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

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ chassis, t }) {
  if (!chassis || chassis.length === 0) return null;
  const counts = { non_entame: 0, en_cours: 0, fabrique: 0, livre: 0 };
  let total = 0;
  for (const ch of chassis) {
    const qty    = ch.quantity || 1;
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
function generateBLHtml(bl, project) {
  const companyName = project.companyId?.name || bl.company?.name || 'CAMI ALUMINIUM';
  const clientName  = project.clientId?.name  || bl.client?.name  || '';
  const clientAddr  = project.clientId?.address || bl.client?.address || '';
  const clientCity  = project.clientId?.city   || bl.client?.city   || '';
  const rows = bl.units.map(u => {
    const bg = u.isComponent ? 'background:#f8f8f8' : '';
    return `<tr style="${bg}"><td>${u.unitLabel}</td><td>${u.chassisType || '—'}</td><td>${u.dimension}</td><td>${fmtDate(u.deliveryDate)}</td><td>${u.notes || '—'}</td></tr>`;
  }).join('');
  const closeScript = '<' + '/script>';
  const clientBlock = clientName ? `<div class="client-box"><div style="font-size:10px;text-transform:uppercase;color:#888;margin-bottom:6px">Destinataire</div><div style="font-weight:700">${clientName}</div>${clientAddr ? `<div>${clientAddr}</div>` : ''}${clientCity ? `<div>${clientCity}</div>` : ''}</div>` : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${bl.blId}</title>
  <style>body{font-family:Arial,sans-serif;margin:40px;color:#1a1a1a}
  .header{border-bottom:3px solid #1a1a1a;padding-bottom:20px;margin-bottom:24px;display:flex;justify-content:space-between;align-items:flex-start}
  .logo{font-size:24px;font-weight:900;letter-spacing:-0.5px}
  .logo-sub{font-size:12px;color:#888;margin-top:2px}
  .bl-id{font-size:18px;font-weight:700;color:#555;margin-top:4px}
  .meta{display:flex;gap:24px;margin-bottom:20px;flex-wrap:wrap}
  .meta-item label{font-size:10px;text-transform:uppercase;color:#888;display:block;margin-bottom:2px}
  .meta-item span{font-size:14px;font-weight:700}
  .client-box{background:#f8f8f8;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px}
  table{width:100%;border-collapse:collapse;font-size:13px}
  th{background:#1a1a1a;color:#fff;padding:10px 12px;text-align:left;font-size:10px;text-transform:uppercase}
  td{padding:10px 12px;border-bottom:1px solid #eee}
  .sig{display:flex;justify-content:space-between;margin-top:60px}
  .sig-box{border-top:1px solid #333;width:220px;padding-top:8px;font-size:12px;text-align:center;color:#555}
  .footer{margin-top:30px;border-top:1px solid #eee;padding-top:12px;font-size:11px;color:#888;text-align:center}
  @media print{@page{margin:20mm}}</style>
  </head><body>
  <div class="header">
    <div>
      <div class="logo">${companyName}</div>
      <div class="logo-sub">Bon de Livraison</div>
      <div class="bl-id">${bl.blId}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:12px;color:#888;margin-bottom:4px">Date de livraison</div>
      <div style="font-size:20px;font-weight:700">${new Date(bl.deliveryDate + 'T00:00:00').toLocaleDateString('fr-FR')}</div>
    </div>
  </div>
  ${clientBlock}
  <div class="meta">
    <div class="meta-item"><label>Projet</label><span>${project.name}</span></div>
    <div class="meta-item"><label>Référence</label><span>${project.reference}</span></div>
    <div class="meta-item"><label>RAL</label><span>${project.ralCode}</span></div>
    <div class="meta-item"><label>Pièces livrées</label><span>${bl.units.length}</span></div>
  </div>
  <table><thead><tr><th>Repère</th><th>Désignation</th><th>Dimension</th><th>Date livraison</th><th>Notes</th></tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="sig"><div class="sig-box">Signature livreur</div><div class="sig-box">Signature réceptionnaire</div></div>
  <div class="footer">Généré automatiquement — ${companyName} — ${new Date().toLocaleDateString('fr-FR')}</div>
  <script>window.onload=()=>{window.print();}${closeScript}</body></html>`;
}

function BLPanel({ project, t }) {
  const { getBonsLivraison } = useProjects();
  const [bls, setBls]        = useState([]);
  const [loading, setLoading] = useState(true);
  const [openBL, setOpenBL]  = useState(null);
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
                <span className="bl-card__id">{bl.blId}</span>
                <span className="bl-card__date">📅 {fmtDate(bl.deliveryDate + 'T00:00:00')}</span>
                <span className="bl-card__count">{bl.units.length} pièce{bl.units.length > 1 ? 's' : ''}</span>
              </div>
              <div className="bl-card__actions">
                <button className="bl-print-btn" onClick={e => {
                  e.stopPropagation();
                  const w = window.open('', '_blank');
                  if (w) { w.document.write(generateBLHtml(bl, project)); w.document.close(); }
                }}>🖨 {t('blPrint')}</button>
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
//
// ROW KINDS:
//   'unit'      — standalone non-composite unit → own checkbox, own etat select, own actions
//   'groupHead' — composite chassis header (1 per unit-instance) → NO checkbox, derived etat badge, edit/print/delete actions
//   'component' — one component inside a composite group → own checkbox, own etat select
//
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

  // Build flat display rows
  const rows = (project.chassis || []).flatMap(ch => {
    const qty         = ch.quantity || 1;
    const chId        = ch._id || ch.id;
    const isComposite = (ch.components || []).length > 0;

    return Array.from({ length: qty }, (_, unitIndex) => {
      const unit      = getUnit(ch, unitIndex);
      const groupKey  = `${chId}-${unitIndex}`;
      const baseLabel = qty > 1 ? `${ch.repere} #${unitIndex + 1}` : ch.repere;

      if (!isComposite) {
        return [{
          kind: 'unit', ch, chId, unitIndex, unit,
          rowKey: groupKey, label: baseLabel,
          etat: unit.etat || 'non_entame',
        }];
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

  // Etat handlers
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
        toPrint.push({
          ...row.ch,
          _printRowIndex: row.unitIndex,
          _totalQty: row.ch.quantity || 1,
          _component: {
            repere:    row.comp.repere || roleLabel,
            roleLabel,
            largeur:   row.comp.largeur,
            hauteur:   row.comp.hauteur,
          }
        });
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
          { key: 'bars',    label: t('tabBars'),    count: project.usedBars?.length || 0 },
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

                    // ── GROUP HEADER (composite chassis, per unit-instance) ─────────────────────
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
                          <td>{ch.largeur}</td>
                          <td>{ch.hauteur}</td>
                          <td className="dim-cell">{ch.dimension || `${ch.largeur}×${ch.hauteur}`}</td>
                          <td>
                            <span className="etat-badge"
                              style={{ background: ETAT_COLORS[derivedEtat], color: '#fff',
                                       padding: '2px 8px', borderRadius: 4, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {t(`etat_${derivedEtat}`)}
                            </span>
                          </td>
                          <td><span className="date-placeholder">—</span></td>
                          <td>
                            <div className="chassis-row__actions">
                              <button className="edit-btn" onClick={() => {
                                setEditingChassis({ ...ch, _originalId: chId });
                                setShowChassisForm(true);
                              }}>✏️ {t('edit')}</button>
                              <button className="print-btn" title={t('printLabel')}
                                onClick={() => {
                                  // Print one label per component for this unit instance
                                  const toPrint = ch.components.map((comp, ci) => {
                                    const roleLabel = comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${ci}`;
                                    return {
                                      ...ch, _printRowIndex: unitIndex, _totalQty: ch.quantity || 1,
                                      _component: { repere: comp.repere || roleLabel, roleLabel, largeur: comp.largeur, hauteur: comp.hauteur }
                                    };
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

                    // ── COMPONENT ROW (inside composite group) ─────────────────────────────────
                    if (row.kind === 'component') {
                      const { ch, unitIndex, comp, ci, rowKey, label, etat } = row;
                      const isSaving   = savingKey === rowKey;
                      const isSelected = selectedKeys.has(rowKey);
                      return (
                        <tr key={rowKey}
                          className={`component-row${isSelected ? ' component-row--selected' : ''}${isSaving ? ' component-row--saving' : ''}`}>
                          <td className="chassis-row__check">
                            <input type="checkbox" checked={isSelected}
                              onChange={() => toggleKey(rowKey)} onClick={e => e.stopPropagation()} />
                          </td>
                          <td className="component-indent">
                            ↳ <strong>{label}</strong>
                          </td>
                          <td className="component-role">
                            {comp.role === 'dormant' ? t('dormant') : t('vantail')}
                          </td>
                          <td>{comp.largeur || '—'}</td>
                          <td>{comp.hauteur || '—'}</td>
                          <td className="dim-cell">
                            {comp.largeur && comp.hauteur ? `${comp.largeur}×${comp.hauteur}` : '—'}
                          </td>
                          <td>
                            <select className="etat-select etat-select--component"
                              value={etat} disabled={isSaving}
                              onChange={e => handleComponentEtatChange(ch, unitIndex, ci, e.target.value, rowKey)}
                              style={{ borderLeftColor: ETAT_COLORS[etat] }}>
                              {ETAT_OPTIONS.map(opt => <option key={opt} value={opt}>{t(`etat_${opt}`)}</option>)}
                            </select>
                          </td>
                          <td><span className="date-placeholder">—</span></td>
                          <td>
                            <button className="print-btn" title={t('printLabel')}
                              onClick={() => {
                                const roleLabel = comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${ci}`;
                                setPrintingChassis({
                                  ...ch,
                                  _printRowIndex: unitIndex,
                                  _totalQty: ch.quantity || 1,
                                  _component: { repere: comp.repere || roleLabel, roleLabel, largeur: comp.largeur, hauteur: comp.hauteur }
                                });
                              }}>🖨</button>
                          </td>
                        </tr>
                      );
                    }

                    // ── UNIT ROW (non-composite) ───────────────────────────────────────────────
                    const { ch, chId, unitIndex, unit, rowKey, label, etat } = row;
                    const isSaving   = savingKey === rowKey;
                    const isSelected = selectedKeys.has(rowKey);
                    return (
                      <tr key={rowKey}
                        className={`chassis-row${isSelected ? ' chassis-row--selected' : ''}${isSaving ? ' chassis-row--saving' : ''}`}>
                        <td className="chassis-row__check">
                          <input type="checkbox" checked={isSelected}
                            onChange={() => toggleKey(rowKey)} onClick={e => e.stopPropagation()} />
                        </td>
                        <td><strong>{label}</strong></td>
                        <td>{chassisLabels[ch.type]?.[language] || ch.type}</td>
                        <td>{ch.largeur}</td>
                        <td>{ch.hauteur}</td>
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
                            <button className="date-btn" onClick={() => setDeliveryModal({
                              kind: 'unit', chId, unitIndex, rowKey, currentDate: toDateInput(unit.deliveryDate)
                            })}>
                              📅 {unit.deliveryDate ? fmtDate(unit.deliveryDate) : 'Définir'}
                            </button>
                          ) : (
                            <span className="date-placeholder">—</span>
                          )}
                        </td>
                        <td>
                          <div className="chassis-row__actions">
                            <button className="edit-btn" onClick={() => {
                              setEditingChassis({ ...ch, quantity: 1, etat, _originalId: chId, _unitIndex: unitIndex, _totalQty: ch.quantity ?? 1 });
                              setShowChassisForm(true);
                            }}>✏️ {t('edit')}</button>
                            <button className="print-btn" title={t('printLabel')}
                              onClick={() => setPrintingChassis({ ...ch, _printRowIndex: unitIndex })}>🖨</button>
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
      {activeTab === 'bl' && <div className="project-detail__panel"><BLPanel project={project} t={t} language={language} /></div>}

      {showChassisForm && (
        <ChassisForm chassis={editingChassis} projectId={project.id}
          onClose={() => { setShowChassisForm(false); setEditingChassis(null); }}
          onSave={()  => { setShowChassisForm(false); setEditingChassis(null); }} />
      )}
      {showTypeManager  && <ChassisTypeManager onClose={() => setShowTypeManager(false)} />}
      {printingChassis  && <LabelPrint chassis={printingChassis} project={project} chassisLabels={chassisLabels} onClose={() => setPrintingChassis(null)} />}
      {deliveryModal    && <DeliveryDateModal defaultDate={deliveryModal.currentDate} onConfirm={handleDeliveryConfirm} onCancel={() => setDeliveryModal(null)} t={t} />}
    </div>
  );
}

export { STATIC_LABELS as CHASSIS_LABELS };
export default ProjectDetail;