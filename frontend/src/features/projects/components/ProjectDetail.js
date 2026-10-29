import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';
import { useProjects } from '../../../context/ProjectContext';
import { useLanguage, tx, activeLanguage } from '../../../context/LanguageContext';
import { dialog } from '../../../components/common/dialog';
import ChassisForm from './ChassisForm';
import ChassisTypeManager from './ChassisTypeManager';
import UsedBarsPanel from './UsedBarsPanel';
import LabelPrint, { buildLabelHTML, LabelModelSwitch, useLabelModel } from './LabelPrint';
import { exportProjectPDF, exportBarsPDF } from '../utils/pdfExport';
import { fetchChassisTypes, buildChassisLabels, CHASSIS_LABELS as STATIC_LABELS } from './ChassisTypesConfig';
import { BarresLaquerPanel, AccessoiresLaquerPanel } from './LaquagePanel';
import { StepBack, CircleDashed, PlusCircle, ShipWheel, Package, Save, Wrench, Loader2, Download, Upload, FileSpreadsheet, Printer, CalendarDays, Search, X, AlertTriangle, Undo2, Plus, Pencil, Tag, Tags, Trash2, CircleCheck, PaintBucket, AppWindow, FileText, Banknote, Layers, Clock, CornerDownRight, ChevronDown, ChevronUp, Scissors, MessageSquareText } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import ProjectDocuments from './ProjectDocuments';
import './ProjectDetail.css';
import { getQueryParam, updateQuery } from '../../../routes';

const ETAT_OPTIONS = ['non_entame', 'en_cours', 'non_vitre', 'fabrique', 'livre', 'pret_a_livrer'];
const ETAT_COLORS = {
  non_entame: '#9ca3af', en_cours: '#f59e0b', non_vitre: '#a855f7',
  fabrique: '#3b82f6', livre: '#16a34a', pret_a_livrer: '#ef4444',
};
// Light ink tones so tinted état badges stay readable on the dark theme
const ETAT_INK = { non_entame: 'var(--ink-grey)', en_cours: 'var(--ink-amber)', non_vitre: 'var(--ink-violet)', fabrique: 'var(--ink-blue)', livre: 'var(--ink-green)', pret_a_livrer: 'var(--ink-red)' };
const etatTint = (e) => { const c = ETAT_COLORS[e] || '#9ca3af'; return { background: c + '1f', color: ETAT_INK[e] || 'var(--ink-grey)', border: `1px solid ${c}59` }; };
const STATUS_COLORS = { en_cours: '#f59e0b', fabrique: '#3b82f6', cloture: '#16a34a', pret_a_livrer: '#ef4444', non_vitre: '#a855f7' };
const REMPLISSAGE_TYPES = ['Verre', 'MDF', 'Tôle', 'Panneau sandwich', 'Autre'];
// Stored values stay in French; only the displayed label is translated
const REMP_TYPE_KEYS = { 'Verre': 'rtVerre', 'MDF': 'rtMdf', 'Tôle': 'rtTole', 'Panneau sandwich': 'rtSandwich', 'Autre': 'rtOther' };
const rempTypeLabel = (v) => (REMP_TYPE_KEYS[v] ? tx(REMP_TYPE_KEYS[v]) : v);

// ─── TAB CONFIG ───────────────────────────────────────────────────────────────
// stateRoles : who can SEE a dropdown (vs read-only badge)
// adminRoles : who can change to any état (including livre)
// limitedRoles: who can change état but NOT to livre
// logistiqueRoles: who can only toggle between pret_a_livrer and livre
// etats: full list of étates for this tab
const TAB_CONFIG = {
  aluminium: {
    stateRoles: ['Admin', 'Coordinateur', 'LOGISTIQUE'],
    tableRoles: ['Admin', 'Coordinateur'],
    etats: ['non_entame', 'en_cours', 'non_vitre', 'fabrique', 'pret_a_livrer', 'livre'],
  },
  laquage: {
    // Admin: all états | Laquage: all except livre | LOGISTIQUE: pret_a_livrer <-> livre only
    stateRoles: ['Admin', 'Laquage', 'LOGISTIQUE'],
    tableRoles: ['Admin', 'Laquage'],
    etats: ['non_entame', 'en_cours', 'fabrique', 'pret_a_livrer', 'livre'],
  },
  vitrage: {
    // Admin: all états | Coordinateur-vitrage: all except livre | LOGISTIQUE: pret_a_livrer <-> livre only
    stateRoles: ['Admin', 'Coordinateur-vitrage', 'LOGISTIQUE'],
    tableRoles: ['Admin', 'Coordinateur-vitrage'],
    etats: ['non_entame', 'en_cours', 'pret_a_livrer', 'fabrique', 'livre'],
  },
};

function getTabConfig(project) {
  return TAB_CONFIG[project?.tab || 'aluminium'] || TAB_CONFIG.aluminium;
}
// ─────────────────────────────────────────────────────────────────────────────

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';
const BACKEND_URL = process.env.REACT_APP_API_URL
  ? process.env.REACT_APP_API_URL.replace('/api', '')
  : 'http://localhost:3001';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getUnit(ch, idx) {
  return (ch.units || []).find(u => u.unitIndex === idx) || {
    unitIndex: idx, etat: 'non_entame', deliveryDate: null, notes: '', componentStates: [], atelierTable: ''
  };
}
function getComponentEtat(unit, compIdx, comp) {
  const cs = (unit.componentStates || []).find(c => c.compIndex === compIdx);
  return cs ? cs.etat : (comp.etat || 'non_entame');
}

function getGroupUnitStates(ch) {
  const qty = ch.quantity || 1;
  return Array.from({ length: qty }, (_, i) => getUnit(ch, i));
}
function getGroupEtatCounts(ch, etatList) {
  const units = getGroupUnitStates(ch);
  const counts = {};
  etatList.forEach(e => { counts[e] = 0; });
  units.forEach(u => { const e = u.etat || 'non_entame'; counts[e] = (counts[e] || 0) + 1; });
  return counts;
}

function deriveCompositeEtat(unit, components) {
  const n = components.length;
  if (!n) return unit.etat || 'non_entame';
  const states = components.map((comp, i) => getComponentEtat(unit, i, comp));
  const allowed = ['non_vitre', 'fabrique', 'livre', 'pret_a_livrer'];
  if (states.every(e => allowed.includes(e)) && states.some(e => e === 'non_vitre')) return 'non_vitre';
  if (states.every(e => e === 'livre')) return 'livre';
  if (states.every(e => e === 'pret_a_livrer')) return 'pret_a_livrer';
  if (states.every(e => e === 'fabrique' || e === 'pret_a_livrer' || e === 'livre')) return 'fabrique';
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
  } catch (e) { console.warn('Logo fetch failed:', e); return ''; }
}
function computeChassisAccessories(chassis) {
  return (chassis.accessories || []).map(acc => {
    const qty = acc.formula && acc.formula.trim()
      ? Math.round(evalFormula(acc.formula, chassis.largeur, chassis.hauteur) * 100) / 100
      : (acc.quantity || 0);
    return { itemId: acc.itemId || acc._id?.toString() || '', label: acc.label, unit: acc.unit || '', quantity: qty };
  }).filter(a => a.quantity > 0);
}

// ─── Permission helpers ───────────────────────────────────────────────────────

/**
 * Returns true if this role can see a dropdown (vs read-only badge) for this project tab.
 */
function canSeeEtatDropdown(userRole, project) {
  const cfg = getTabConfig(project);
  return cfg.stateRoles.includes(userRole);
}

/**
 * Returns the list of état options that this role may choose from,
 * given the current état and the project tab.
 *
 * Rules:
 *   Admin            → all étates for this tab
 *   Laquage          → all except 'livre'           (laquage tab)
 *   Coordinateur-vitrage → all except 'livre'       (vitrage tab)
 *   LOGISTIQUE       → only ['pret_a_livrer','livre'] when current is one of those; else [currentEtat]
 *   Coordinateur     → all except 'livre'           (aluminium tab)
 */
function getAllowedEtats(userRole, currentEtat, project) {
  const cfg = getTabConfig(project);
  const allEtats = cfg.etats;

  if (userRole === 'Admin') return allEtats;

  if (userRole === 'LOGISTIQUE') {
    if (currentEtat === 'pret_a_livrer' || currentEtat === 'livre') {
      return ['pret_a_livrer', 'livre'];
    }
    return [currentEtat]; // read-only effectively — only their current state
  }

  // Laquage, Coordinateur-vitrage, Coordinateur → all except 'livre'
  return allEtats.filter(e => e !== 'livre');
}

/**
 * Returns true when the select should be disabled entirely.
 */
function isEtatSelectDisabled(userRole, currentEtat, isSaving) {
  if (isSaving) return true;
  // LOGISTIQUE can only act when état is already pret_a_livrer or livre
  if (userRole === 'LOGISTIQUE') {
    return currentEtat !== 'pret_a_livrer' && currentEtat !== 'livre';
  }
  // Non-admin roles cannot change a delivered item
  if (userRole !== 'Admin') return currentEtat === 'livre';
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────

function evalFormula(formula, L, H) {
  if (!formula || !formula.trim()) return null;
  try {
    const safe = formula.replace(/[^0-9LH+\-*/().\s]/g, '');
    // eslint-disable-next-line no-new-func
    const result = new Function('L', 'H', `"use strict"; return (${safe});`)(L, H);
    return typeof result === 'number' && isFinite(result) ? parseFloat(result.toFixed(4)) : null;
  } catch { return null; }
}

// ─── Remplissage badge helper ─────────────────────────────────────────────────
const REMP_DONE_ETATS = new Set(['fabrique', 'pret_a_livrer', 'livre']);

function getRemplissageCounts(chassis, unitIndex, compIndex = null) {
  const all = chassis.remplissages || [];
  const filtered = compIndex !== null
    ? all.filter(r => (r.unitIndex ?? 0) === unitIndex && r.compIndex === compIndex)
    : all.filter(r => (r.unitIndex ?? 0) === unitIndex && r.compIndex == null);
  return {
    cnt: filtered.length,
    rdy: filtered.filter(r => REMP_DONE_ETATS.has(r.etat)).length,
  };
}

function RemplissageBadge({ chassis, unitIndex, compIndex = null, onClick }) {
  const { cnt, rdy } = getRemplissageCounts(chassis, unitIndex, compIndex);
  const bg = cnt === 0 ? 'var(--surface-2)' : (rdy === cnt ? 'var(--success-bg)' : 'var(--warning-bg)');
  const color = cnt === 0 ? 'var(--text-3)' : (rdy === cnt ? 'var(--success)' : 'var(--warning)');
  const bd = cnt === 0 ? 'var(--border-2)' : (rdy === cnt ? 'var(--success-bd)' : 'var(--warning-bd)');
  return (
    <button title={tx('pdManageRemp')} onClick={onClick} style={{
      fontSize: 12, background: bg, border: `1px solid ${bd}`,
      borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
      color, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4,
    }}>
      <PlusCircle size={14} />
      {cnt === 0 ? '' : `${rdy}/${cnt}`}
    </button>
  );
}

function EtatBreakdownBadge({ ch, etatList, t, onClick }) {
  const qty = ch.quantity || 1;
  const counts = getGroupEtatCounts(ch, etatList);
  const present = etatList.filter(e => counts[e] > 0);
  return (
    <button
      onClick={onClick}
      title={t('pdManageUnits')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
        border: '1px solid var(--border-2)', borderRadius: 6, padding: '3px 8px', background: 'var(--surface-2)',
      }}
    >
      <div style={{ display: 'flex', height: 6, width: 56, borderRadius: 999, overflow: 'hidden', background: 'var(--200)', flexShrink: 0 }}>
        {present.map(e => (
          <div key={e} style={{ width: `${(counts[e] / qty) * 100}%`, background: ETAT_COLORS[e] }} title={`${t('etat_' + e)}: ${counts[e]}`} />
        ))}
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
        {present.map(e => `${counts[e]} ${t('etat_' + e)}`).join(' · ')}
      </span>
    </button>
  );
}

function RemplissageAtelierCell({ chassis, unitIndex, compIndex = null, project, atelierTableOptions, onPatched }) {
  const chId = chassis._id || chassis.id;
  const relevant = (chassis.remplissages || []).filter(r =>
    (r.unitIndex ?? 0) === unitIndex &&
    (compIndex !== null ? r.compIndex === compIndex : r.compIndex == null)
  );
  const tables = [...new Set(relevant.map(r => r.atelierTable || ''))];
  const currentTable = tables.length === 1 ? tables[0] : '';
  const [saving, setSaving] = useState(false);

  if (relevant.length === 0) return <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>;

  const handleChange = async (newTable) => {
    setSaving(true);
    try {
      await Promise.all(relevant.map(r =>
        axios.patch(`${API_URL}/projects/${project.id}/chassis/${chId}/remplissages/${r._id || r.id}`, { atelierTable: newTable })
      ));
      if (onPatched) onPatched();
    } catch (e) { console.error('Remplissage atelierTable patch failed', e); }
    finally { setSaving(false); }
  };

  return (
    <select
      className={`etat-select atelier-select${saving ? ' atelier-select--saving' : ''}`}
      value={currentTable} disabled={saving}
      onChange={e => handleChange(e.target.value)}
      style={{ borderLeft: '3px solid #3b82f6', backgroundColor: currentTable ? 'rgba(59,130,246,.12)' : undefined, fontSize: 11, minWidth: 90 }}
      title={tx('pdTableVitrage', { n: relevant.length })}
    >
      <option value="">——</option>
      {atelierTableOptions.map(tbl => <option key={tbl} value={tbl}>{tbl}</option>)}
    </select>
  );
}

// ─── BL Metadata API helpers ──────────────────────────────────────────────────
async function loadBLMetadata(projectId, deliveryDate) {
  try {
    const res = await axios.get(`${API_URL}/projects/${projectId}/bl-metadata/${deliveryDate}`);
    return res.data || { blId: '', localisation: '', transport: '', unitNotes: {} };
  } catch { return { blId: '', localisation: '', transport: '', unitNotes: {} }; }
}
async function saveBLMetadata(projectId, deliveryDate, payload) {
  try {
    const res = await axios.put(`${API_URL}/projects/${projectId}/bl-metadata/${deliveryDate}`, payload);
    return res.data;
  } catch (e) { console.error('BL metadata save failed', e); return null; }
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
    companyPhone && `<div>${tx('pdTel', { v: companyPhone })}</div>`,
    companyEmail && `<div>${companyEmail}</div>`,
    companyRC && `<div>RC : ${companyRC}</div>`,
    companyICE && `<div>ICE : ${companyICE}</div>`,
  ].filter(Boolean).join('');
  const clientBlock = clientName ? `
    <div class="client-block">
      <div class="block-label">${tx('pdRecipient')}</div>
      <div class="client-name">${clientName}</div>
      ${clientAddr ? `<div class="client-detail">${clientAddr}</div>` : ''}
      ${clientCity ? `<div class="client-detail">${clientCity}</div>` : ''}
    </div>` : '';
  const unitNotes = bl.unitNotes || {};
  const rows = bl.units.map((u, i) => {
    const note = unitNotes[u.unitLabel] || u.notes || '';
    const rowClass = u.isRemplissage ? 'row-sub row-remp' : (u.isComponent ? 'row-sub' : (i % 2 === 0 ? 'row-even' : 'row-odd'));
    const m2Display = u.m2 != null ? u.m2 + ' m²' : '—';
    const qtyDisplay = u.quantity && u.quantity > 1 ? u.quantity : 1;
    return `<tr class="${rowClass}">
      <td class="td-c">${i + 1}</td>
      <td><strong>${u.unitLabel}</strong></td>
      <td>${u.chassisType || '—'}</td>
      <td class="td-c">${qtyDisplay}</td>
      <td class="td-c">${u.dimension}</td>
      <td class="td-c" style="font-size:11px;color:#6b7280">${m2Display}</td>
      <td class="td-c">${fmtDate(u.deliveryDate)}</td>
      <td>${note || '—'}</td>
    </tr>`;
  }).join('');
  const closeScript = '<' + '/script>';
  return `<!DOCTYPE html>
<html lang="${activeLanguage()}"><head><meta charset="utf-8"><title>${bl.blId}</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:16px 20px}
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
.row-even{background:#fff}.row-odd{background:#f9fafb}.row-sub{background:#f3f4f6;color:#555;font-size:12px}.row-remp{background:#eff6ff;color:#1e40af;font-size:11.5px}
.sig-row{display:flex;justify-content:space-between;margin-top:48px;gap:24px}
.sig-box{flex:1;border-top:1.5px solid #1a1a1a;padding-top:8px;font-size:11px;color:#555;text-align:center}
.footer{margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:10px;color:#aaa;text-align:center;line-height:1.7}
@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{padding:6mm 8mm}@page{size:A4;margin:6mm 8mm 14mm 8mm}}
.bl-page-footer{margin-top:10px;padding-top:8px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center}
</style></head><body>
<div class="header">
  <div class="header-left">${logoBlock}<div><div class="company-name">${companyName}</div><div class="company-info">${coLines}</div></div></div>
  <div style="text-align:right"><div class="doc-label">${tx('pdBL')}</div><div class="bl-num">${bl.blId}</div><div class="date-label">${tx('pdDeliveryDate')}</div><div class="date-val">${new Date(bl.deliveryDate + 'T00:00:00').toLocaleDateString('fr-FR')}</div></div>
</div>
<div class="info-row">
  <div class="info-card"><div class="info-card__label">${tx('pdProject')}</div><div class="info-card__val">${project.name}</div></div>
  <div class="info-card"><div class="info-card__label">${tx('pdReference')}</div><div class="info-card__val">${project.reference}</div></div>
  <div class="info-card"><div class="info-card__label">${tx('pdRal')}</div><div class="info-card__val"><span style="display:inline-block;width:14px;height:14px;border-radius:3px;background:${project.ralColor || '#eee'};border:1px solid #ddd;flex-shrink:0"></span>${project.ralCode}</div></div>
  <div class="info-card"><div class="info-card__label">${tx('pdPiecesDelivered')}</div><div class="info-card__val">${bl.units.length}</div></div>
  <div class="info-card"><div class="info-card__label">${tx('pdLocation')}</div><div class="info-card__val">${bl.localisation || '—'}</div></div>
  <div class="info-card"><div class="info-card__label">${tx('pdTransport')}</div><div class="info-card__val">${bl.transport || '—'}</div></div>
</div>
${clientBlock}
<table><thead><tr><th class="th-c" style="width:36px">#</th><th>${tx('pdRepere')}</th><th>${tx('pdDesignation')}</th><th class="th-c" style="width:50px">${tx('pdQty')}</th><th class="th-c">${tx('pdDimension')}</th><th class="th-c">m²</th><th class="th-c">${tx('pdDelivDate')}</th><th>${tx('pdNotes')}</th></tr></thead><tbody>${rows}</tbody></table>
<div class="sig-row"><div class="sig-box">${tx('pdSigDriver')}</div><div class="sig-box">${tx('pdSigReceiver')}</div></div>
<div class="bl-page-footer"><div class="footer" style="border:none;padding:0;margin:0;text-align:center;width:100%">${[companyName, companyAddr, companyPhone ? tx('pdTel', { v: companyPhone }) : '', companyRC ? 'RC : ' + companyRC : '', companyICE ? 'ICE : ' + companyICE : ''].filter(Boolean).join(' &nbsp;·&nbsp; ')}</div></div>
<script>window.onload=()=>{const images=document.querySelectorAll('img');if(images.length===0){window.print();return;}let loaded=0;const tryPrint=()=>{loaded++;if(loaded>=images.length)window.print();};images.forEach(img=>{if(img.complete){tryPrint();}else{img.onload=tryPrint;img.onerror=tryPrint;}});};${closeScript}
</body></html>`;
}

// ─── Styled Excel Export ──────────────────────────────────────────────────────
function exportBLExcel(bl, project) {
  const co = resolveCompany(project);
  const companyColor = co.color || '#1a1a1a';
  const hexToArgb = (hex) => { const h = hex.replace('#', ''); return 'FF' + (h.length === 3 ? h.split('').map(c => c + c).join('') : h).toUpperCase(); };
  const headerArgb = hexToArgb(companyColor);
  const lightBg = 'FFF9FAFB'; const borderColor = 'FFE5E7EB';
  const wb = XLSX.utils.book_new(); const ws = {}; const merges = []; let row = 1;
  const setCell = (col, r, value, s) => { const addr = XLSX.utils.encode_cell({ c: col, r: r - 1 }); ws[addr] = { v: value, t: typeof value === 'number' ? 'n' : 's' }; if (s) ws[addr].s = s; };
  const S = {
    companyName: { font: { bold: true, sz: 16, color: { rgb: headerArgb } }, alignment: { horizontal: 'left', vertical: 'center' } },
    blLabel: { font: { sz: 9, color: { rgb: 'FF9CA3AF' }, italic: true }, alignment: { horizontal: 'right', vertical: 'center' } },
    blId: { font: { bold: true, sz: 18, color: { rgb: headerArgb } }, alignment: { horizontal: 'right', vertical: 'center' } },
    subtext: { font: { sz: 10, color: { rgb: 'FF555555' } }, alignment: { horizontal: 'left' } },
    dateLabel: { font: { sz: 9, color: { rgb: 'FF9CA3AF' }, italic: true }, alignment: { horizontal: 'right' } },
    dateVal: { font: { bold: true, sz: 13, color: { rgb: headerArgb } }, alignment: { horizontal: 'right' } },
    cardLabel: { font: { bold: true, sz: 8, color: { rgb: 'FF9CA3AF' } }, fill: { fgColor: { rgb: lightBg }, patternType: 'solid' }, alignment: { horizontal: 'left' }, border: { top: { style: 'thin', color: { rgb: borderColor } }, left: { style: 'thin', color: { rgb: borderColor } } } },
    cardValue: { font: { bold: true, sz: 12, color: { rgb: 'FF1A1A1A' } }, fill: { fgColor: { rgb: lightBg }, patternType: 'solid' }, alignment: { horizontal: 'left' }, border: { bottom: { style: 'thin', color: { rgb: borderColor } }, left: { style: 'thin', color: { rgb: borderColor } } } },
    clientLabel: { font: { bold: true, sz: 8, color: { rgb: 'FF9CA3AF' } }, border: { left: { style: 'medium', color: { rgb: headerArgb } } } },
    clientName: { font: { bold: true, sz: 13, color: { rgb: 'FF1A1A1A' } }, border: { left: { style: 'medium', color: { rgb: headerArgb } } } },
    clientSub: { font: { sz: 10, color: { rgb: 'FF555555' } }, border: { left: { style: 'medium', color: { rgb: headerArgb } }, bottom: { style: 'thin', color: { rgb: borderColor } } } },
    th: { font: { bold: true, sz: 10, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: headerArgb }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center' }, border: { bottom: { style: 'medium', color: { rgb: 'FFFFFFFF' } } } },
    thLeft: { font: { bold: true, sz: 10, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: headerArgb }, patternType: 'solid' }, alignment: { horizontal: 'left', vertical: 'center' } },
    tdEven: { font: { sz: 11 }, fill: { fgColor: { rgb: 'FFFFFFFF' }, patternType: 'solid' }, alignment: { vertical: 'center', wrapText: true }, border: { bottom: { style: 'thin', color: { rgb: borderColor } } } },
    tdOdd: { font: { sz: 11 }, fill: { fgColor: { rgb: lightBg }, patternType: 'solid' }, alignment: { vertical: 'center', wrapText: true }, border: { bottom: { style: 'thin', color: { rgb: borderColor } } } },
    tdBold: (base) => ({ ...base, font: { ...base.font, bold: true } }),
    tdCenter: (base) => ({ ...base, alignment: { ...base.alignment, horizontal: 'center' } }),
    sigBox: { font: { sz: 11, color: { rgb: 'FF555555' } }, border: { top: { style: 'medium', color: { rgb: 'FF1A1A1A' } } }, alignment: { horizontal: 'center' } },
    footer: { font: { sz: 9, color: { rgb: 'FFAAAAAA' } }, alignment: { horizontal: 'center' } },
  };
  setCell(0, row, co.name || '', S.companyName); merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 3 } });
  setCell(4, row, tx('pdBL'), S.blLabel); setCell(5, row, bl.blId || '', S.blId); merges.push({ s: { r: row - 1, c: 4 }, e: { r: row - 1, c: 6 } }); row++;
  setCell(0, row, co.address || '', S.subtext); merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 3 } });
  setCell(4, row, tx('pdDeliveryDate'), S.dateLabel);
  const delivDate = bl.deliveryDate ? new Date(bl.deliveryDate + 'T00:00:00').toLocaleDateString('fr-FR') : '';
  setCell(5, row, delivDate, S.dateVal); row++;
  const phoneEmail = [co.phone ? tx('pdTel', { v: co.phone }) : '', co.email || ''].filter(Boolean).join('   ·   ');
  setCell(0, row, phoneEmail, S.subtext); merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 6 } }); row++; row++;
  const cards = [[tx('pdProject').toUpperCase(), project.name], [tx('pdReference').toUpperCase(), project.reference], [tx('pdRal'), project.ralCode], [tx('pdPiecesDelivered').toUpperCase(), bl.units.length], [tx('pdLocation').toUpperCase(), bl.localisation || '—'], [tx('pdTransport').toUpperCase(), bl.transport || '—']];
  [[0, 1, 2], [3, 4, 5]].forEach(idxs => {
    idxs.forEach((ci, pos) => { setCell(pos * 2, row, cards[ci][0], S.cardLabel); setCell(pos * 2 + 1, row, '', S.cardLabel); }); row++;
    idxs.forEach((ci, pos) => { setCell(pos * 2, row, cards[ci][1], S.cardValue); setCell(pos * 2 + 1, row, '', S.cardValue); }); row++;
  });
  const clientName = project.clientId?.name || '';
  if (clientName) {
    row++; setCell(0, row, tx('pdRecipient').toUpperCase(), S.clientLabel); merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 6 } }); row++;
    setCell(0, row, clientName, S.clientName); merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 6 } }); row++;
    const addr = [project.clientId?.address, project.clientId?.city].filter(Boolean).join(', ');
    if (addr) { setCell(0, row, addr, S.clientSub); merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 6 } }); row++; }
  }
  row++;
  ['#', tx('pdRepere'), tx('pdDesignation'), tx('pdQty'), tx('pdDimension'), 'm²', tx('pdDelivDate'), tx('pdNotes')].forEach((h, i) => { setCell(i, row, h, i === 0 || i === 3 || i === 4 || i === 5 || i === 6 ? S.th : S.thLeft); }); row++;
  const unitNotes = bl.unitNotes || {};
  bl.units.forEach((u, idx) => {
    const base = idx % 2 === 0 ? S.tdEven : S.tdOdd; const note = unitNotes[u.unitLabel] || u.notes || '';
    setCell(0, row, idx + 1, S.tdCenter(base)); setCell(1, row, u.unitLabel, S.tdBold(base)); setCell(2, row, u.chassisType || '', base);
    setCell(3, row, u.quantity && u.quantity > 1 ? u.quantity : 1, S.tdCenter(base));
    setCell(4, row, u.dimension, S.tdCenter(base)); setCell(5, row, u.m2 != null ? u.m2 : '', S.tdCenter(base));
    setCell(6, row, u.deliveryDate ? fmtDate(u.deliveryDate) : '', S.tdCenter(base)); setCell(7, row, note || '', base); row++;
  });
  row += 2;
  setCell(0, row, tx('pdSigDriver'), S.sigBox); merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 3 } });
  setCell(4, row, tx('pdSigReceiver'), S.sigBox); merges.push({ s: { r: row - 1, c: 4 }, e: { r: row - 1, c: 7 } }); row++; row++;
  const footerParts = [co.name, co.address, co.phone ? tx('pdTel', { v: co.phone }) : '', co.rc ? 'RC : ' + co.rc : '', co.ice ? 'ICE : ' + co.ice : ''].filter(Boolean);
  setCell(0, row, footerParts.join('  ·  '), S.footer); merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 7 } });
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 7 } });
  ws['!merges'] = merges; ws['!cols'] = [{ wch: 5 }, { wch: 18 }, { wch: 26 }, { wch: 8 }, { wch: 14 }, { wch: 10 }, { wch: 16 }, { wch: 30 }]; ws['!rows'] = [{ hpt: 28 }, { hpt: 18 }, { hpt: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, 'BL'); XLSX.writeFile(wb, `${bl.blId || 'BL'}.xlsx`);
}

// ─── Chassis + Remplissage Excel Export ───────────────────────────────────────
function exportChassisRemplissageExcel(project, chassisLabels, language) {
  const rows = [];
  let idx = 0;

  const etatOf = (e) => (e ? tx('etat_' + e) : '—');

  for (const ch of project.chassis || []) {
    const qty = ch.quantity || 1;
    const isComposite = (ch.components || []).length > 0;
    const typeLabel = chassisLabels[ch.type]?.[language] || chassisLabels[ch.type]?.fr || ch.type;
    const keepAsOne = ch.keepAsOne === true;
    const iterations = keepAsOne ? 1 : qty;

    for (let unitIndex = 0; unitIndex < iterations; unitIndex++) {
      const unit = getUnit(ch, unitIndex);
      const baseLabel = (!keepAsOne && qty > 1) ? `${ch.repere} #${unitIndex + 1}` : ch.repere;

      if (!isComposite) {
        idx++;
        const m2 = ch.largeur && ch.hauteur ? parseFloat(((ch.largeur * ch.hauteur) / 1e6 * (keepAsOne ? qty : 1)).toFixed(2)) : '';
        rows.push({
          '#': idx,
          'Repère': baseLabel,
          'Type': typeLabel,
          'Qté': keepAsOne ? qty : 1,
          'L (mm)': ch.largeur,
          'H (mm)': ch.hauteur,
          'Dimension': ch.dimension || `${ch.largeur}×${ch.hauteur}`,
          'm²': m2,
          'État châssis': etatOf(unit.etat),
          'Date livraison châssis': unit.deliveryDate ? fmtDate(unit.deliveryDate) : '',
          'Type remplissage': '', 'Sous-type': '', 'Dim. remplissage': '', 'm² remplissage': '', 'État remplissage': '', 'Date livraison remplissage': '',
        });
        (ch.remplissages || [])
          .filter(r => (r.unitIndex ?? 0) === unitIndex && r.compIndex == null)
          .forEach(r => {
            idx++;
            rows.push({
              '#': idx, 'Repère': `↳ ${baseLabel}`, 'Type': '', 'Qté': '',
              'L (mm)': '', 'H (mm)': '', 'Dimension': '', 'm²': '',
              'État châssis': '', 'Date livraison châssis': '',
              'Type remplissage': r.type,
              'Sous-type': r.sousType || '',
              'Dim. remplissage': `${r.largeur}×${r.hauteur}`,
              'm² remplissage': r.largeur && r.hauteur ? parseFloat(((r.largeur * r.hauteur) / 1e6).toFixed(2)) : '',
              'État remplissage': etatOf(r.etat),
              'Date livraison remplissage': r.deliveryDate ? fmtDate(r.deliveryDate) : '',
            });
          });
      } else {
        (ch.components || []).forEach((comp, ci) => {
          idx++;
          const compEtat = getComponentEtat(unit, ci, comp);
          const cs = (unit.componentStates || []).find(c => c.compIndex === ci);
          const compLabel = comp.repere || (comp.role === 'dormant' ? tx('chDormant') : tx('chVantail', { n: ci + 1 }));
          const compL = comp.largeur || ch.largeur;
          const compH = comp.hauteur || ch.hauteur;
          const compM2 = compL && compH ? parseFloat(((compL * compH) / 1e6).toFixed(2)) : '';
          rows.push({
            '#': idx,
            'Repère': `${baseLabel} — ${compLabel}`,
            'Type': `${typeLabel} (${comp.role === 'dormant' ? tx('chDormant') : tx('pdVantailWord')})`,
            'Qté': 1, 'L (mm)': compL, 'H (mm)': compH,
            'Dimension': compL && compH ? `${compL}×${compH}` : '',
            'm²': compM2,
            'État châssis': etatOf(compEtat),
            'Date livraison châssis': cs?.deliveryDate ? fmtDate(cs.deliveryDate) : '',
            'Type remplissage': '', 'Sous-type': '', 'Dim. remplissage': '', 'm² remplissage': '', 'État remplissage': '', 'Date livraison remplissage': '',
          });
          (ch.remplissages || [])
            .filter(r => (r.unitIndex ?? 0) === unitIndex && r.compIndex === ci)
            .forEach(r => {
              idx++;
              rows.push({
                '#': idx, 'Repère': `↳ ${baseLabel} — ${compLabel}`, 'Type': '', 'Qté': '',
                'L (mm)': '', 'H (mm)': '', 'Dimension': '', 'm²': '',
                'État châssis': '', 'Date livraison châssis': '',
                'Type remplissage': r.type,
                'Sous-type': r.sousType || '',
                'Dim. remplissage': `${r.largeur}×${r.hauteur}`,
                'm² remplissage': r.largeur && r.hauteur ? parseFloat(((r.largeur * r.hauteur) / 1e6).toFixed(2)) : '',
                'État remplissage': etatOf(r.etat),
                'Date livraison remplissage': r.deliveryDate ? fmtDate(r.deliveryDate) : '',
              });
            });
        });
      }
    }
  }

  if (rows.length === 0) { dialog.alert({ variant: 'info', message: tx('pdNoChassis') }); return; }

  // Column titles in the active language (rows are built with internal French keys)
  const H = {
    'Repère': tx('pdRepere'), 'Type': tx('pdColType'), 'Qté': tx('pdQty'), 'L (mm)': tx('pdColL'), 'H (mm)': tx('pdColH'),
    'Dimension': tx('pdDimension'), 'État châssis': tx('pdColChassisState'), 'Date livraison châssis': tx('pdColChassisDeliv'),
    'Type remplissage': tx('pdColRempType'), 'Sous-type': tx('pdColSubType'), 'Dim. remplissage': tx('pdColRempDim'),
    'm² remplissage': tx('pdColRempM2'), 'État remplissage': tx('pdColRempState'), 'Date livraison remplissage': tx('pdColRempDeliv'),
  };
  const ws = XLSX.utils.json_to_sheet(rows.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [H[k] || k, v]))));
  ws['!cols'] = [
    { wch: 5 }, { wch: 26 }, { wch: 22 }, { wch: 6 }, { wch: 9 }, { wch: 9 },
    { wch: 14 }, { wch: 9 }, { wch: 14 }, { wch: 16 },
    { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 14 }, { wch: 18 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tx('pdSheetChassisRemp').slice(0, 31));
  XLSX.writeFile(wb, `${project.name || tx('pdFileProject')}_chassis_remplissages.xlsx`);
}

// ─── Devis-style Excel Export (Repère / Désignation / Qté / PU HT / Total HT) ──
/* function exportDevisExcel(project, chassisLabels, language) {
  const rows = [];
  let idx = 0;

  const pushRow = (repere, designation, qty, largeur, hauteur) => {
    idx++;
    rows.push({
      '#': idx,
      'Repère': repere,
      'Désignation': designation,
      'Quantité': qty,
      'L (mm)': largeur ?? '',
      'H (mm)': hauteur ?? '',
      'Prix unitaire HT': null,
      'Prix total HT': null
    });
  };

  for (const ch of project.chassis || []) {
    const qty = ch.quantity || 1;
    const isComposite = (ch.components || []).length > 0;
    const typeLabel = chassisLabels[ch.type]?.[language] || chassisLabels[ch.type]?.fr || ch.type;
    const keepAsOne = ch.keepAsOne === true;
    const iterations = keepAsOne ? 1 : qty;

    for (let unitIndex = 0; unitIndex < iterations; unitIndex++) {
      const baseLabel = (!keepAsOne && qty > 1) ? `${ch.repere} #${unitIndex + 1}` : ch.repere;

      if (!isComposite) {
        const dim = ch.dimension || `${ch.largeur}×${ch.hauteur}`;
        let cL = ch.largeur, cH = ch.hauteur;
        if ((cL == null || cH == null) && ch.dimension) {
          const parts = String(ch.dimension).split(/[×x]/i).map(s => parseFloat(s));
          cL = cL ?? parts[0];
          cH = cH ?? parts[1];
        }
        pushRow(baseLabel, `${typeLabel} — ${dim} mm`, keepAsOne ? qty : 1, cL, cH);

        (ch.remplissages || [])
          .filter(r => (r.unitIndex ?? 0) === unitIndex && r.compIndex == null)
          .forEach(r => {
            const rLabel = r.sousType ? `${rempTypeLabel(r.type)} — ${r.sousType}` : rempTypeLabel(r.type);
            pushRow(`↳ ${baseLabel}`, `${rLabel} — ${r.largeur}×${r.hauteur} mm`, 1, r.largeur, r.hauteur);
          });
      } else {
        (ch.components || []).forEach((comp, ci) => {
          const compLabel = comp.repere || (comp.role === 'dormant' ? 'Dormant' : `Vantail ${ci + 1}`);
          const compL = comp.largeur || ch.largeur;
          const compH = comp.hauteur || ch.hauteur;
          pushRow(`${baseLabel} — ${compLabel}`, `${typeLabel} (${comp.role === 'dormant' ? 'Dormant' : 'Vantail'}) — ${compL}×${compH} mm`, 1, compL, compH);

          (ch.remplissages || [])
            .filter(r => (r.unitIndex ?? 0) === unitIndex && r.compIndex === ci)
            .forEach(r => {
              const rLabel = r.sousType ? `${rempTypeLabel(r.type)} — ${r.sousType}` : rempTypeLabel(r.type);
              pushRow(`↳ ${baseLabel} — ${compLabel}`, `${rLabel} — ${r.largeur}×${r.hauteur} mm`, 1, r.largeur, r.hauteur);
            });
        });
      }
    }
  }

  if (rows.length === 0) { dialog.alert({ variant: 'info', message: tx('pdNoChassis') }); return; }

  // total linear meters (périmètre) of rectilinear remplissage panels
  let totalMLRemplissage = 0;
  rows.forEach(r => {
    const isRemplissage = String(r['Repère']).startsWith('↳');
    if (isRemplissage && typeof r['L (mm)'] === 'number' && typeof r['H (mm)'] === 'number') {
      const qty = typeof r['Quantité'] === 'number' ? r['Quantité'] : 1;
      totalMLRemplissage += (2 * (r['L (mm)'] + r['H (mm)']) / 1000) * qty;
    }
  });

  const co = resolveCompany(project);
  const companyColor = co.color || '#1a1a1a';
  const hexToArgb = (hex) => { const h = hex.replace('#', ''); return 'FF' + (h.length === 3 ? h.split('').map(c => c + c).join('') : h).toUpperCase(); };
  const headerArgb = hexToArgb(companyColor);
  const lightBg = 'FFF9FAFB'; const borderColor = 'FFE5E7EB';

  const ws = {}; const merges = []; let row = 1;
  const setCell = (col, r, value, s, formula) => {
    const addr = XLSX.utils.encode_cell({ c: col, r: r - 1 });
    ws[addr] = formula ? { f: formula, t: 'n' } : { v: value, t: typeof value === 'number' ? 'n' : 's' };
    if (s) ws[addr].s = s;
  };

  const S = {
    title: { font: { bold: true, sz: 16, color: { rgb: headerArgb } } },
    subtitle: { font: { sz: 10, color: { rgb: 'FF666666' } } },
    th: { font: { bold: true, sz: 10, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: headerArgb }, patternType: 'solid' }, alignment: { horizontal: 'center', vertical: 'center' } },
    thLeft: { font: { bold: true, sz: 10, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: headerArgb }, patternType: 'solid' }, alignment: { horizontal: 'left', vertical: 'center' } },
    tdEven: { font: { sz: 11 }, fill: { fgColor: { rgb: 'FFFFFFFF' }, patternType: 'solid' }, border: { bottom: { style: 'thin', color: { rgb: borderColor } } } },
    tdOdd: { font: { sz: 11 }, fill: { fgColor: { rgb: lightBg }, patternType: 'solid' }, border: { bottom: { style: 'thin', color: { rgb: borderColor } } } },
    tdSub: { font: { sz: 10.5, color: { rgb: 'FF6B7280' } }, fill: { fgColor: { rgb: lightBg }, patternType: 'solid' }, border: { bottom: { style: 'thin', color: { rgb: borderColor } } } },
    tdInput: { font: { sz: 11, color: { rgb: 'FF1D4ED8' } }, fill: { fgColor: { rgb: 'FFEFF6FF' }, patternType: 'solid' }, border: { bottom: { style: 'thin', color: { rgb: borderColor } }, top: { style: 'thin', color: { rgb: 'FFBFDBFE' } }, left: { style: 'thin', color: { rgb: 'FFBFDBFE' } }, right: { style: 'thin', color: { rgb: 'FFBFDBFE' } } }, alignment: { horizontal: 'center' } },
    tdTotal: { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: lightBg }, patternType: 'solid' }, border: { bottom: { style: 'thin', color: { rgb: borderColor } } }, alignment: { horizontal: 'center' } },
    tdNum: { font: { sz: 11 }, fill: { fgColor: { rgb: 'FFFFFFFF' }, patternType: 'solid' }, border: { bottom: { style: 'thin', color: { rgb: borderColor } } }, alignment: { horizontal: 'center' } },
    grandLabel: { font: { bold: true, sz: 12, color: { rgb: 'FF1A1A1A' } }, alignment: { horizontal: 'right' } },
    grandTotal: { font: { bold: true, sz: 13, color: { rgb: headerArgb } }, fill: { fgColor: { rgb: lightBg }, patternType: 'solid' }, alignment: { horizontal: 'center' }, border: { top: { style: 'medium', color: { rgb: headerArgb } } } },
  };

  // columns: A # | B Repère | C Désignation | D L(mm) | E H(mm) | F Quantité | G M² | H Prix unitaire HT | I Prix total HT
  setCell(0, row, `DEVIS — ${project.name}`, S.title); merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 8 } }); row++;
  setCell(0, row, `Réf. ${project.reference}  ·  RAL ${project.ralCode}  ·  ${co.name || ''}`, S.subtitle); merges.push({ s: { r: row - 1, c: 0 }, e: { r: row - 1, c: 8 } }); row += 2;

  const headerRow = row;
  ['#', 'Repère', 'Désignation', 'L (mm)', 'H (mm)', 'Quantité', 'M²', 'Prix unitaire HT', 'Prix total HT'].forEach((h, i) =>
    setCell(i, headerRow, h, i === 1 || i === 2 ? S.thLeft : S.th)
  );
  row++;

  const firstDataRow = row;
  rows.forEach((r, i) => {
    const isSub = r['Repère'].startsWith('↳');
    const base = isSub ? S.tdSub : (i % 2 === 0 ? S.tdEven : S.tdOdd);
    const numBase = isSub ? S.tdSub : S.tdNum;
    setCell(0, row, r['#'], { ...base, alignment: { horizontal: 'center' } });
    setCell(1, row, r['Repère'], { ...base, font: { ...base.font, bold: !isSub } });
    setCell(2, row, r['Désignation'], base);
    setCell(3, row, r['L (mm)'], { ...numBase, alignment: { horizontal: 'center' } });
    setCell(4, row, r['H (mm)'], { ...numBase, alignment: { horizontal: 'center' } });
    setCell(5, row, r['Quantité'], { ...base, alignment: { horizontal: 'center' } });
    setCell(6, row, 0, { ...numBase, alignment: { horizontal: 'center' }, z: '0.00' }, `D${row}*E${row}/1000000`); // M²
    setCell(7, row, '', S.tdInput); // Prix unitaire HT — left blank for manual entry
    setCell(8, row, 0, S.tdTotal, `F${row}*H${row}`); // Prix total HT — auto-calculated
    row++;
  });
  const lastDataRow = row - 1;

  row++;
  setCell(7, row, 'TOTAL HT', S.grandLabel);
  setCell(8, row, 0, S.grandTotal, `SUM(I${firstDataRow}:I${lastDataRow})`);

  row++;
  setCell(7, row, 'Total ML remplissage', S.grandLabel);
  setCell(8, row, Math.round(totalMLRemplissage * 100) / 100, { ...S.grandTotal, z: '0.00' });

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 8 } });
  ws['!merges'] = merges;
  ws['!cols'] = [{ wch: 5 }, { wch: 26 }, { wch: 38 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 9 }, { wch: 16 }, { wch: 16 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Devis');
  XLSX.writeFile(wb, `${project.name || 'projet'}_devis.xlsx`);
} */

function exportDevisExcel(project, chassisLabels, language, company) {
  const co = company || resolveCompany(project);
  const accentHex = co.color || '#1a1a1a';

  const hexToArgb = (hex) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    return 'FF' + full.toUpperCase();
  };
  const lightenHex = (hex, amt = 0.82) => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(full.slice(0, 2), 16), g = parseInt(full.slice(2, 4), 16), b = parseInt(full.slice(4, 6), 16);
    const mix = (c) => Math.round(c + (255 - c) * amt);
    return 'FF' + [mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase();
  };

  const accentArgb = hexToArgb(accentHex);
  const lightArgb = lightenHex(accentHex);

  const thin = { style: 'thin', color: { rgb: 'FFB0B0B0' } };
  const allBorders = { top: thin, bottom: thin, left: thin, right: thin };

  // Every style shares the same alignment: centered both ways, and wrapped.
  const CENTER = { horizontal: 'center', vertical: 'center', wrapText: true };

  const S = {
    companyName: { font: { bold: true, sz: 12, color: { rgb: accentArgb } }, alignment: CENTER, border: allBorders },
    companyLine: { font: { bold: true, sz: 11 }, alignment: CENTER, border: allBorders },
    companyValue: { font: { bold: true, sz: 11, color: { rgb: accentArgb } }, alignment: CENTER, border: allBorders },
    refLabel: { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: lightArgb }, patternType: 'solid' }, alignment: CENTER, border: allBorders },
    refValue: { font: { sz: 11 }, alignment: CENTER, border: allBorders },
    refInput: { font: { sz: 11, color: { rgb: 'FF1D4ED8' } }, fill: { fgColor: { rgb: 'FFEFF6FF' }, patternType: 'solid' }, alignment: CENTER, border: allBorders },
    sectionBand: { font: { bold: true, sz: 13, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: accentArgb }, patternType: 'solid' }, alignment: CENTER, border: allBorders },
    th: { font: { bold: true, sz: 10 }, fill: { fgColor: { rgb: lightArgb }, patternType: 'solid' }, alignment: CENTER, border: allBorders },
    typeCell: { font: { bold: true, sz: 11 }, alignment: CENTER, border: allBorders },
    descCell: { font: { sz: 10.5 }, alignment: CENTER, border: allBorders },
    compCell: { font: { bold: true, sz: 10.5 }, alignment: CENTER, border: allBorders },
    detailCell: { font: { sz: 10.5 }, alignment: CENTER, border: allBorders },
    valueCell: { font: { sz: 10.5 }, alignment: CENTER, border: allBorders },
    valueInput: { font: { sz: 10.5, color: { rgb: 'FF1D4ED8' } }, fill: { fgColor: { rgb: 'FFEFF6FF' }, patternType: 'solid' }, alignment: CENTER, border: allBorders },
    priceInput: { font: { sz: 10.5, color: { rgb: 'FF1D4ED8' } }, fill: { fgColor: { rgb: 'FFEFF6FF' }, patternType: 'solid' }, alignment: CENTER, border: allBorders, numFmt: '#,##0.00 "DH"' },
    priceCell: { font: { bold: true, sz: 10.5 }, alignment: CENTER, border: allBorders, numFmt: '#,##0.00 "DH"' },
    totalLabel: { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: lightArgb }, patternType: 'solid' }, alignment: CENTER, border: allBorders },
    totalValue: { font: { bold: true, sz: 11 }, fill: { fgColor: { rgb: lightArgb }, patternType: 'solid' }, alignment: CENTER, border: allBorders, numFmt: '#,##0.00 "DH"' },
    footerBand: { font: { bold: true, sz: 11, color: { rgb: 'FFFFFFFF' } }, fill: { fgColor: { rgb: accentArgb }, patternType: 'solid' }, alignment: CENTER, border: allBorders },
    footerLegal: { font: { sz: 8.5 }, alignment: CENTER, border: allBorders },
  };

  const ws = {};
  const merges = [];

  // setCell: col is 0-based (A=0), row is 1-based
  const setCell = (col, r, value, s, formula) => {
    const addr = XLSX.utils.encode_cell({ c: col, r: r - 1 });
    const cell = formula ? { f: formula, t: 'n' } : { v: value, t: typeof value === 'number' ? 'n' : 's' };
    if (s) {
      const { numFmt, ...rest } = s;
      cell.s = rest;
      if (numFmt) cell.z = numFmt;
    }
    ws[addr] = cell;
  };
  // merge: rows 1-based inclusive, cols 0-based inclusive
  const merge = (r1, r2, c1, c2) => {
    if (r1 === r2 && c1 === c2) return;
    merges.push({ s: { r: r1 - 1, c: c1 }, e: { r: r2 - 1, c: c2 } });
  };
  const colLetter = (col) => XLSX.utils.encode_col(col);
  const addr = (col, r) => `${colLetter(col)}${r}`;

  // ---------- Company header block (cols E:G) ----------
  let compRow = 1;
  setCell(4, compRow, co.name || '', S.companyName); merge(compRow, compRow, 4, 6); compRow++;
  const infoLines = [];
  if (co.address) infoLines.push([null, co.address]);
  if (co.phone) infoLines.push([tx('qtTel'), co.phone]);
  if (co.email) infoLines.push([tx('qtEmail'), co.email]);
  if (co.ice) infoLines.push([tx('qtIce'), co.ice]);
  if (co.rc) infoLines.push([tx('qtRc'), co.rc]);
  infoLines.forEach(([label, value]) => {
    if (label) {
      setCell(4, compRow, label, S.companyLine); merge(compRow, compRow, 4, 5);
      setCell(6, compRow, value, S.companyValue);
    } else {
      setCell(4, compRow, value, S.companyLine); merge(compRow, compRow, 4, 6);
    }
    compRow++;
  });
  const companyBlockEnd = compRow - 1;

  // ---------- Reference / Date / Devis N° block (cols A:D) ----------
  let refRow = 2;
  setCell(0, refRow, tx('qtReference'), S.refLabel);
  setCell(1, refRow, project.reference || '', S.refValue); merge(refRow, refRow, 1, 3); refRow++;
  setCell(0, refRow, tx('qtDate'), S.refLabel);
  setCell(1, refRow, new Date().toLocaleDateString('fr-FR'), S.refValue); merge(refRow, refRow, 1, 3); refRow++;
  setCell(0, refRow, tx('qtNumber'), S.refLabel);
  setCell(1, refRow, '', S.refInput); merge(refRow, refRow, 1, 3); refRow++;
  const refBlockEnd = refRow - 1;

  // ---------- Section band ----------
  let row = Math.max(companyBlockEnd, refBlockEnd) + 2;
  setCell(0, row, tx('qtTitle', { name: project.name || '' }), S.sectionBand); merge(row, row, 0, 6);
  row += 2;

  // Table header — written once, not repeated per item.
  [tx('qtColType'), tx('qtColDescription'), tx('qtColComponents'), tx('qtColDetails'), tx('qtColValues'), tx('qtColUnitPrice'), tx('qtColPrice')].forEach((h, i) =>
    setCell(i, row, h, S.th)
  );
  row++;

  const tableFirstRow = row;
  let typeIndex = 0;
  const remplissageRefs = []; // { lAddr, hAddr, qAddr } for every Vitrage sub-block, used for ML total

  // Writes one 4-row sub-block (Aluminium frame OR a remplissage/Vitrage panel)
  // and merges the Composants / Prix Unitaire / Prix HT columns across it.
  const writeSubBlock = (startRow, compLabel, detailPrefix, L, H, qty, isRemplissage) => {
    let r = startRow;
    setCell(3, r, `${detailPrefix} L(mm)`, S.detailCell);
    setCell(4, r, L || 0, S.valueInput);
    const lAddr = addr(4, r); r++;

    setCell(3, r, `${detailPrefix} H(mm)`, S.detailCell);
    setCell(4, r, H || 0, S.valueInput);
    const hAddr = addr(4, r); r++;

    setCell(3, r, `${detailPrefix} ${tx('qtQuantity')}`, S.detailCell);
    setCell(4, r, qty || 1, S.valueInput);
    const qAddr = addr(4, r); r++;

    setCell(3, r, `${detailPrefix} M²`, S.detailCell);
    setCell(4, r, 0, S.valueCell, `${lAddr}*${hAddr}*${qAddr}/1000000`);
    const m2Addr = addr(4, r);
    const endRow = r;

    setCell(2, startRow, compLabel, S.compCell);
    merge(startRow, endRow, 2, 2);

    setCell(5, startRow, '', S.priceInput);
    merge(startRow, endRow, 5, 5);

    setCell(6, startRow, 0, S.priceCell, `${addr(5, startRow)}*${m2Addr}`);
    merge(startRow, endRow, 6, 6);

    if (isRemplissage) remplissageRefs.push({ lAddr, hAddr, qAddr });

    return endRow + 1;
  };

  // Composite châssis: one Aluminium sub-block for the WHOLE châssis (overall M²),
  // instead of a separate M² per component. Each component's L/H is still listed
  // (for reference), but they're summed into a single total M² / single price.
  const writeAluminiumOverallBlock = (startRow, componentsInfo, qty) => {
    let r = startRow;
    const lhAddrs = [];
    componentsInfo.forEach(({ label, L, H }) => {
      setCell(3, r, `${label} L(mm)`, S.detailCell);
      setCell(4, r, L || 0, S.valueInput);
      const lAddr = addr(4, r); r++;

      setCell(3, r, `${label} H(mm)`, S.detailCell);
      setCell(4, r, H || 0, S.valueInput);
      const hAddr = addr(4, r); r++;

      lhAddrs.push({ lAddr, hAddr });
    });

    setCell(3, r, tx('qtAluQty'), S.detailCell);
    setCell(4, r, qty || 1, S.valueInput);
    const qAddr = addr(4, r); r++;

    setCell(3, r, tx('qtAluM2Total'), S.detailCell);
    const sumTerms = lhAddrs.map(({ lAddr, hAddr }) => `${lAddr}*${hAddr}`).join('+');
    setCell(4, r, 0, S.valueCell, `(${sumTerms})*${qAddr}/1000000`);
    const m2Addr = addr(4, r);
    const endRow = r;

    setCell(2, startRow, tx('qtAluminium'), S.compCell);
    merge(startRow, endRow, 2, 2);

    setCell(5, startRow, '', S.priceInput);
    merge(startRow, endRow, 5, 5);

    setCell(6, startRow, 0, S.priceCell, `${addr(5, startRow)}*${m2Addr}`);
    merge(startRow, endRow, 6, 6);

    return endRow + 1;
  };
  // Groups remplissages that were diffused across N units back into one line per
  // distinct (type, sousType, dimensions) combo, with quantity = how many units have it.
  const groupRemplissages = (remplissages, compIndex) => {
    const relevant = (remplissages || []).filter(r => compIndex === null ? r.compIndex == null : r.compIndex === compIndex);
    const groups = new Map();
    relevant.forEach(r => {
      const key = `${r.type}|${r.sousType || ''}|${r.largeur}|${r.hauteur}`;
      if (!groups.has(key)) {
        groups.set(key, {
          label: r.sousType ? `${rempTypeLabel(r.type)} — ${r.sousType}` : rempTypeLabel(r.type),
          type: r.type, largeur: r.largeur, hauteur: r.hauteur, count: 0,
        });
      }
      groups.get(key).count++;
    });
    return [...groups.values()];
  };

  for (const ch of project.chassis || []) {
    const qty = ch.quantity || 1;
    const isComposite = (ch.components || []).length > 0;
    const typeLabel = chassisLabels[ch.type]?.[language] || chassisLabels[ch.type]?.fr || ch.type;

    typeIndex++;
    const itemStart = row;

    if (!isComposite) {
      const dim = ch.dimension || `${ch.largeur}×${ch.hauteur}`;
      let cL = ch.largeur, cH = ch.hauteur;
      if ((cL == null || cH == null) && ch.dimension) {
        const parts = String(ch.dimension).split(/[×x]/i).map(s => parseFloat(s));
        cL = cL ?? parts[0];
        cH = cH ?? parts[1];
      }
      row = writeSubBlock(row, tx('qtAluminium'), tx('qtAluminium'), cL, cH, qty, false);

      groupRemplissages(ch.remplissages, null).forEach(g => {
        row = writeSubBlock(row, g.label, g.type, g.largeur, g.hauteur, g.count, true);
      });
    } else {
      let cL = ch.largeur, cH = ch.hauteur;
      if ((cL == null || cH == null) && ch.dimension) {
        const parts = String(ch.dimension).split(/[×x]/i).map(s => parseFloat(s));
        cL = cL ?? parts[0];
        cH = cH ?? parts[1];
      }
      row = writeSubBlock(row, tx('qtAluminium'), tx('qtAluminium'), cL, cH, qty, false);

      groupRemplissages(ch.remplissages, 'any').forEach(g => {
        row = writeSubBlock(row, g.label, g.type, g.largeur, g.hauteur, g.count, true);
      });
    }

    const itemEnd = row - 1;
    setCell(0, itemStart, typeIndex, S.typeCell); merge(itemStart, itemEnd, 0, 0);
    setCell(1, itemStart, `${ch.repere} — ${typeLabel}`, S.descCell); merge(itemStart, itemEnd, 1, 1);
  }
  const tableLastRow = row - 1; // last written data row

  // ---------- Totals ----------
  row += 1;
  setCell(5, row, tx('qtTotalHT'), S.totalLabel);
  setCell(6, row, 0, S.totalValue, `SUM(G${tableFirstRow}:G${tableLastRow})`);
  const totalHtRow = row; row++;

  setCell(5, row, tx('qtTva20'), S.totalLabel);
  setCell(6, row, 0, S.totalValue, `0.2*G${totalHtRow}`);
  const tvaRow = row; row++;

  setCell(5, row, tx('qtTotalTTC'), S.totalLabel);
  setCell(6, row, 0, S.totalValue, `G${totalHtRow}+G${tvaRow}`);
  row++;

  if (remplissageRefs.length > 0) {
    row++;
    const mlFormula = remplissageRefs
      .map(({ lAddr, hAddr, qAddr }) => `2*(${lAddr}+${hAddr})/1000*${qAddr}`)
      .join('+');
    setCell(5, row, tx('qtTotalML'), S.totalLabel);
    setCell(6, row, 0, { ...S.totalValue, numFmt: '#,##0.00 "ML"' }, mlFormula);
    row++;
  }

  // ---------- Footer ----------
  row += 2;
  setCell(0, row, co.name || '', S.footerBand); merge(row, row, 0, 6);
  row++;
  const legalParts = [];
  if (co.ice) legalParts.push(`ICE : ${co.ice}`);
  if (co.rc) legalParts.push(`R.C : ${co.rc}`);
  if (legalParts.length > 0) {
    setCell(0, row, legalParts.join('  -  '), S.footerLegal); merge(row, row, 0, 6);
    row++;
  }

  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: row, c: 6 } });
  ws['!merges'] = merges;
  ws['!cols'] = [
    { wch: 6 }, { wch: 24 }, { wch: 20 }, { wch: 24 }, { wch: 12 }, { wch: 16 }, { wch: 16 }
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tx('qtSheet'));
  XLSX.writeFile(wb, `${project.name || tx('pdFileProject')}_${tx('qtFile')}.xlsx`);
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────
function ProgressBar({ chassis, t }) {
  if (!chassis || chassis.length === 0) return null;
  const counts = { non_entame: 0, en_cours: 0, non_vitre: 0, fabrique: 0, livre: 0, pret_a_livrer: 0 };
  let total = 0;
  for (const ch of chassis) {
    const qty = ch.quantity || 1; const isComp = (ch.components || []).length > 0;
    for (let i = 0; i < qty; i++) {
      const unit = getUnit(ch, i);
      const etat = isComp ? deriveCompositeEtat(unit, ch.components) : (unit.etat || 'non_entame');
      counts[etat] = (counts[etat] || 0) + 1; total++;
    }
  }
  const pct = k => total === 0 ? 0 : Math.round(counts[k] / total * 100);
  return (
    <div className="progress-section">
      <div className="progress-bar">
        {ETAT_OPTIONS.filter(e => counts[e] > 0).map(e => (
          <div key={e} className="progress-bar__segment" style={{ width: `${pct(e)}%`, backgroundColor: ETAT_COLORS[e] }} title={`${t('etat_' + e)}: ${counts[e]}`} />
        ))}
      </div>
      <div className="progress-legend">
        {ETAT_OPTIONS.map(e => (
          <span key={e} className="progress-legend__item">
            <span className="progress-legend__dot" style={{ backgroundColor: ETAT_COLORS[e] }} />
            {t('etat_' + e)}: <strong>{counts[e]}</strong>
          </span>
        ))}
        <span className="progress-legend__total">{t('pdTotal')}: <strong>{total}</strong></span>
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
        <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><Package size={17} /> {t('blTitle')}</h3>
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

function GroupUnitStatesModal({ chassis, project, onClose, onSaved }) {
  const { updateUnit, refreshProject } = useProjects();
  const { t } = useLanguage();
  const { user } = useAuth();
  const userRole = user?.role;
  const chId = chassis._id || chassis.id;
  const qty = chassis.quantity || 1;
  const cfg = getTabConfig(project);
  const etatList = cfg.etats;

  const [units, setUnits] = useState(() =>
    Array.from({ length: qty }, (_, i) => {
      const u = getUnit(chassis, i);
      return { unitIndex: i, etat: u.etat || 'non_entame', deliveryDate: toDateInput(u.deliveryDate) };
    })
  );
  const [saving, setSaving] = useState(false);
  const [bulkCount, setBulkCount] = useState(1);
  const [bulkTarget, setBulkTarget] = useState('livre');
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);

  const counts = etatList.reduce((acc, e) => { acc[e] = units.filter(u => u.etat === e).length; return acc; }, {});
  const updateOne = (idx, patch) => setUnits(prev => prev.map(u => u.unitIndex === idx ? { ...u, ...patch } : u));

  // Moves `bulkCount` units to `bulkTarget`, taking the ones "closest" in the workflow first
  // (e.g. prefer units already at pret_a_livrer when marking as livré)
  const applyBulk = () => {
    const priority = ['pret_a_livrer', 'fabrique', 'en_cours', 'non_vitre', 'non_entame'];
    const candidates = units
      .filter(u => u.etat !== bulkTarget)
      .sort((a, b) => priority.indexOf(a.etat) - priority.indexOf(b.etat));
    const toChange = new Set(candidates.slice(0, bulkCount).map(c => c.unitIndex));
    setUnits(prev => prev.map(u => !toChange.has(u.unitIndex) ? u : {
      ...u, etat: bulkTarget, deliveryDate: bulkTarget === 'livre' ? bulkDate : u.deliveryDate,
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(units.map(u =>
        updateUnit(project.id, chId, u.unitIndex, {
          etat: u.etat, ...(u.etat === 'livre' ? { deliveryDate: u.deliveryDate } : {}),
        })
      ));
      if (refreshProject) await refreshProject(project.id);
      if (onSaved) onSaved();
      onClose();
    } catch (e) { console.error('Group unit states save failed', e); }
    finally { setSaving(false); }
  };

  const allowedFor = (currentEtat) => getAllowedEtats(userRole, currentEtat, project);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="ct-manager__header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Package size={18} /> {chassis.repere} — {t('pdUnitsCount', { n: qty })}</h2>
          <button className="chassis-form__close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16, padding: '10px 12px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }}>
          {etatList.map(e => (
            <span key={e} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: 3, background: ETAT_COLORS[e] }} />
              {t('etat_' + e)}: <strong>{counts[e] || 0}</strong>
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-3)' }}>{t('pdTotal')}: <strong>{qty}</strong></span>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 16, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--info-bg)', border: '1px solid var(--info-bd)', borderRadius: 8 }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>{t('pdUnitCountLabel')}</label>
            <input type="number" min="1" max={qty} value={bulkCount}
              onChange={e => setBulkCount(Math.max(1, Math.min(qty, parseInt(e.target.value) || 1)))}
              className="ct-acc-qty-input" style={{ width: 70 }} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label style={{ fontSize: 11 }}>{t('pdNewState')}</label>
            <select value={bulkTarget} onChange={e => setBulkTarget(e.target.value)}>
              {etatList.map(e => <option key={e} value={e}>{t('etat_' + e)}</option>)}
            </select>
          </div>
          {bulkTarget === 'livre' && (
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>{t('pdDeliveryDate')}</label>
              <input type="date" value={bulkDate} onChange={e => setBulkDate(e.target.value)} />
            </div>
          )}
          <button type="button" className="ct-config-btn" onClick={applyBulk}>{t('pdApplyTo', { n: bulkCount })}</button>
        </div>

        <table className="proj-acc-table" style={{ marginBottom: 16 }}>
          <thead><tr><th style={{ width: 60 }}>#</th><th>{t('pdState')}</th><th style={{ width: 150 }}>{t('pdDeliveryDate')}</th></tr></thead>
          <tbody>
            {units.map(u => (
              <tr key={u.unitIndex}>
                <td>#{u.unitIndex + 1}</td>
                <td>
                  <select value={u.etat} style={{ borderLeft: `3px solid ${ETAT_COLORS[u.etat]}`, borderRadius: 4, padding: '3px 6px', fontSize: 12 }}
                    onChange={e => updateOne(u.unitIndex, {
                      etat: e.target.value,
                      deliveryDate: e.target.value === 'livre' ? (u.deliveryDate || new Date().toISOString().split('T')[0]) : u.deliveryDate,
                    })}>
                    {allowedFor(u.etat).map(opt => <option key={opt} value={opt}>{t('etat_' + opt)}</option>)}
                  </select>
                </td>
                <td>
                  {u.etat === 'livre'
                    ? <input type="date" value={u.deliveryDate || ''} onChange={e => updateOne(u.unitIndex, { deliveryDate: e.target.value })} />
                    : <span style={{ color: 'var(--text-4)', fontSize: 12 }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="modal-actions">
          <button onClick={onClose}>{t('cancel')}</button>
          <button className="primary" onClick={handleSave} disabled={saving}>{saving ? '…' : <><Save size={14} /> {t('save')}</>}</button>
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
  const etatLabel = { all: t('pdAll'), non_entame: t('etat_non_entame'), en_cours: t('etat_en_cours'), non_vitre: t('etat_non_vitre'), fabrique: t('etat_fabrique'), livre: t('etat_livre'), pret_a_livrer: t('etat_pret_a_livrer') };
  const computeAccessories = async () => {
    setLoading(true); setError('');
    try {
      const typeTotals = {};
      for (const ch of project.chassis || []) {
        const qty = ch.quantity || 1; const isComposite = (ch.components || []).length > 0;
        for (let i = 0; i < qty; i++) {
          const unit = getUnit(ch, i);
          const etat = isComposite ? deriveCompositeEtat(unit, ch.components) : (unit.etat || 'non_entame');
          if (etatFilter !== 'all' && etat !== etatFilter) continue;
          const typeId = ch.typeId || ch.type;
          typeTotals[typeId] = (typeTotals[typeId] || 0) + 1;
        }
      }
      const typeIds = Object.keys(typeTotals);
      if (typeIds.length === 0) { setError(t('pdNoChassisForFilter')); setLoading(false); return; }
      const accMap = {};
      await Promise.all(typeIds.map(async (typeId) => {
        try {
          const res = await axios.get(`${API_URL}/chassis-type-accessories/${typeId}`);
          const accs = res.data || []; const count = typeTotals[typeId];
          for (const acc of accs) {
            if (!accMap[acc.itemId]) accMap[acc.itemId] = { label: acc.label, unit: acc.unit || '', total: 0 };
            if (acc.formula && acc.formula.trim()) { accMap[acc.itemId].hasFormula = true; accMap[acc.itemId].formula = acc.formula; }
            else { accMap[acc.itemId].total += (acc.quantity || 0) * count; }
          }
        } catch { }
      }));
      const rows = Object.entries(accMap).map(([, v]) => ({ [t('pdAccDesignation')]: v.label, [t('pdUnit')]: v.unit, [t('pdTotalQty')]: v.hasFormula ? `${t('pdFormula')}: ${v.formula}` : parseFloat(v.total.toFixed(4)) }));
      if (rows.length === 0) { setError(t('pdNoAccForTypes')); setLoading(false); return; }
      const ws = XLSX.utils.json_to_sheet(rows); ws['!cols'] = [{ wch: 40 }, { wch: 14 }, { wch: 18 }];
      const wb2 = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb2, ws, t('pdAccessories'));
      XLSX.writeFile(wb2, `${project.name || t('pdFileProject')}_${t('pdAccessories').toLowerCase()}_${etatFilter === 'all' ? t('pdAll').toLowerCase() : etatFilter}.xlsx`);
      onClose();
    } catch (e) { setError(t('pdCalcError', { msg: e.message || '' })); }
    finally { setLoading(false); }
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}><Wrench size={17} /> {t('pdAccExportTitle')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 20 }}>{t('pdAccExportHint')}</p>
        <div className="form-group">
          <label style={{ fontWeight: 600 }}>{t('pdFilterByState')}</label>
          <div className="acc-export-filters">
            {['all', ...ETAT_OPTIONS].map(opt => (
              <button key={opt} className={`acc-filter-btn${etatFilter === opt ? ' acc-filter-btn--active' : ''}`}
                style={etatFilter === opt && opt !== 'all' ? { borderColor: ETAT_COLORS[opt], background: ETAT_COLORS[opt] + '22', color: ETAT_COLORS[opt] } : {}}
                onClick={() => setEtatFilter(opt)}>
                {opt !== 'all' && <span className="acc-filter-dot" style={{ background: ETAT_COLORS[opt] }} />}
                {etatLabel[opt]}
              </button>
            ))}
          </div>
        </div>
        {error && <div className="ct-manager__error" style={{ marginTop: 12 }}>{error}</div>}
        <div className="modal-actions" style={{ marginTop: 24 }}>
          <button onClick={onClose}>{t('cancel')}</button>
          <button className="primary" onClick={computeAccessories} disabled={loading}>{loading ? <><Loader2 size={14} className="spin" /> {t('pdComputing')}</> : <><Download size={14} /> {t('pdDownloadExcel')}</>}</button>
        </div>
      </div>
    </div>
  );
}

// ─── BL Export Modal ──────────────────────────────────────────────────────────
function BLExportModal({ bl, project, t, onClose }) {
  const [blId, setBlId] = useState('');
  const [localisation, setLocalisation] = useState('');
  const [transport, setTransport] = useState('');
  const [unitNotes, setUnitNotes] = useState({});
  const [loadingMeta, setLoadingMeta] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const co = resolveCompany(project);
  const deliveryDate = bl.deliveryDate;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      const meta = await loadBLMetadata(project.id, deliveryDate);
      if (!cancelled) {
        setBlId(meta.blId || ''); setLocalisation(meta.localisation || ''); setTransport(meta.transport || '');
        const merged = {};
        bl.units.forEach(u => { merged[u.unitLabel] = (meta.unitNotes || {})[u.unitLabel] || ''; });
        setUnitNotes(merged);
      }
      setLoadingMeta(false);
    })();
    return () => { cancelled = true; };
  }, [bl, deliveryDate, project.id]);

  const buildEnrichedBL = () => ({ ...bl, blId: blId.trim() || bl.blId, localisation, transport, unitNotes });
  const handleSaveMeta = async () => { setSavingMeta(true); await saveBLMetadata(project.id, deliveryDate, { blId: blId.trim(), localisation, transport, unitNotes }); setSavingMeta(false); };
  const handlePdf = async () => {
    await handleSaveMeta(); setLoadingPdf(true);
    try {
      const logoUrl = resolveLogoUrl(co.logo || ''); const logoBase64 = await fetchLogoBase64(logoUrl);
      const html = generateBLHtml(buildEnrichedBL(), project, logoBase64);
      const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); }
    } finally { setLoadingPdf(false); }
    onClose();
  };
  const handleExcel = async () => { await handleSaveMeta(); exportBLExcel(buildEnrichedBL(), project); onClose(); };
  const updateUnitNote = (label, val) => setUnitNotes(prev => ({ ...prev, [label]: val }));

  if (loadingMeta) return (
    <div className="modal-overlay"><div className="modal" style={{ maxWidth: 420, textAlign: 'center', padding: 32 }}>
      <div style={{ marginBottom: 12, color: 'var(--text-3)' }}><Loader2 size={26} className="spin" /></div><p style={{ color: 'var(--text-3)' }}>{t('pdLoadingSaved')}</p>
    </div></div>
  );

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 540, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}><Upload size={17} /> {t('pdExportBL')}</h3>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-4)', marginBottom: 10 }}>{t('pdBLHeader')}</p>
          <div className="form-group" style={{ marginBottom: 12 }}>
            <label style={{ fontWeight: 600 }}>{t('pdBLNumber')} <span style={{ fontWeight: 400, color: 'var(--text-4)', marginLeft: 6, fontSize: 11 }}>({t('pdCurrent')} : {bl.blId})</span></label>
            <input type="text" value={blId} onChange={e => setBlId(e.target.value)} placeholder={t('pdBLNumberPh')} style={{ fontWeight: 700, letterSpacing: '0.03em' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontWeight: 600 }}>{t('pdLocation')}</label>
              <input type="text" value={localisation} onChange={e => setLocalisation(e.target.value)} placeholder={t('pdLocationPh')} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontWeight: 600 }}>{t('pdTransport')}</label>
              <input type="text" value={transport} onChange={e => setTransport(e.target.value)} placeholder={t('pdTransportPh')} />
            </div>
          </div>
        </div>
        {bl.units.length > 0 && (
          <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
            <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-4)', marginBottom: 10 }}>
              {t('pdNotesPerPiece')} <span style={{ fontWeight: 400, color: 'var(--text-4)', textTransform: 'none', letterSpacing: 0 }}>— {t('pdNotesPerPieceHint')}</span>
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {bl.units.map(u => (
                <div key={u.unitLabel} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-2)', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 6, padding: '5px 9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.unitLabel}</span>
                  <input type="text" value={unitNotes[u.unitLabel] || ''} onChange={e => updateUnitNote(u.unitLabel, e.target.value)} placeholder={t('pdNotePh')} style={{ fontSize: 12, padding: '5px 10px' }} />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="modal-actions" style={{ marginTop: 8, gap: 8 }}>
          <button onClick={onClose}>{t('cancel')}</button>
          <button onClick={handleSaveMeta} disabled={savingMeta} title={t('pdSaveNoExport')} className="btn btn--secondary">{savingMeta ? <Loader2 size={14} className="spin" /> : <Save size={14} />}</button>
          <button onClick={handleExcel} title={t('pdExportExcel')} className="pd-btn-success"><FileSpreadsheet size={14} /> Excel</button>
          <button className="primary" onClick={handlePdf} disabled={loadingPdf} title={t('pdPrintPdf')} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{loadingPdf ? <Loader2 size={14} className="spin" /> : <Printer size={14} />} PDF</button>
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
  const [blExportModal, setBlExportModal] = useState(null);

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
  return (
    <div className="bl-panel">
      <div className="bl-panel__header"><h3>{t('blHistory')} <span className="tab-count">{bls.length}</span></h3></div>
      <div className="bl-list">
        {bls.map(bl => (
          <div key={bl.deliveryDate} className="bl-card">
            <div className="bl-card__header" onClick={() => setOpenBL(openBL === bl.deliveryDate ? null : bl.deliveryDate)}>
              <div className="bl-card__info">
                <span style={{ display: 'inline-block', width: 4, height: 20, borderRadius: 2, background: co.color || 'var(--700)', marginRight: 10, verticalAlign: 'middle', flexShrink: 0 }} />
                <span className="bl-card__id">{bl.blId}</span>
                <span className="bl-card__date"><CalendarDays size={13} /> {fmtDate(bl.deliveryDate + 'T00:00:00')}</span>
                <span className="bl-card__count">{t(bl.units.length > 1 ? 'pdPieces' : 'pdPiece', { n: bl.units.length })}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 5, fontSize: 11, background: co.color ? co.color + '26' : 'var(--surface-2)', color: 'var(--text)', border: `1px solid ${co.color ? co.color + '55' : 'var(--border-2)'}`, fontWeight: 600 }}>
                  {co.logo && <img src={resolveLogoUrl(co.logo)} alt="" style={{ height: 14, objectFit: 'contain' }} />}
                  {co.name}
                </span>
              </div>
              <div className="bl-card__actions">
                <button className="bl-print-btn" title={t('pdExport')} style={{ fontSize: 17, padding: '4px 9px', lineHeight: 1 }} onClick={e => { e.stopPropagation(); setBlExportModal({ bl }); }}><FileSpreadsheet size={16} /></button>
                <button className="bl-print-btn" title={t('pdPrintPdf')} style={{ fontSize: 17, padding: '4px 9px', lineHeight: 1 }} onClick={e => { e.stopPropagation(); setBlExportModal({ bl }); }}><Printer size={16} /></button>
                <span className="bl-card__toggle">{openBL === bl.deliveryDate ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
              </div>
            </div>
            {openBL === bl.deliveryDate && (
              <div className="bl-card__body">
                <table className="bl-table">
                  <thead><tr><th>{t('repere')}</th><th>{t('type')}</th><th style={{ textAlign: 'center' }}>{t('pdQty')}</th><th>{t('dimension')}</th><th style={{ textAlign: 'center' }}>m²</th><th>{t('blDate')}</th><th>{t('unitNotes')}</th></tr></thead>
                  <tbody>
                    {bl.units.map((u, i) => (
                      <tr key={i} className={u.isComponent ? 'bl-row--component' : (u.isRemplissage ? 'bl-row--remplissage' : '')}>
                        <td data-label={t('pdRepere')}><strong>{u.unitLabel}</strong></td>
                        <td data-label={t('type')}>{u.chassisType || '—'}</td>
                        <td data-label={t('pdQty')} style={{ textAlign: 'center' }}>{u.quantity && u.quantity > 1 ? u.quantity : 1}</td>
                        <td data-label={t('pdDimension')} className="dim-cell">{u.dimension}</td>
                        <td data-label="m²" style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)' }}>{u.m2 ? u.m2 + ' m²' : '—'}</td>
                        <td data-label={t('date')}>{fmtDate(u.deliveryDate)}</td>
                        <td data-label={t('unitNotes')}>{u.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
      {blExportModal && <BLExportModal bl={blExportModal.bl} project={project} t={t} onClose={() => setBlExportModal(null)} />}
    </div>
  );
}

// ─── Chassis Line Accessory Editor ────────────────────────────────────────────
const UNIT_OPTIONS = ['UN', 'ML', 'M²', 'M³', 'KG', 'L', 'PAIRE', 'JEU', 'ROULEAU'];
const EMPTY_ACC = { label: '', unit: 'UN', quantity: 1, formula: '', itemId: '', mode: 'fixed' };

function AccLabelAutocomplete({ value, onChange, onSelect, placeholder }) {
  const { t } = useLanguage();
  const [suggestions, setSuggestions] = React.useState([]);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const debounceRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  React.useEffect(() => {
    const h = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);
  const search = (q) => {
    clearTimeout(debounceRef.current);
    if (!q || q.length < 2) { setSuggestions([]); setOpen(false); return; }
    debounceRef.current = setTimeout(async () => {
      setBusy(true);
      try {
        const res = await axios.get(`${API_URL}/inventory/search?q=${encodeURIComponent(q)}&superCategory=accessoires`);
        const items = res.data || []; setSuggestions(items.slice(0, 10)); setOpen(items.length > 0);
      } catch { setSuggestions([]); } finally { setBusy(false); }
    }, 250);
  };
  const handleChange = (e) => { onChange(e.target.value); search(e.target.value); };
  const handleSelect = (item) => { const label = item.designation?.fr || item.designation || ''; onSelect({ label, unit: item.unit || '', itemId: item.id || item._id }); setSuggestions([]); setOpen(false); };
  return (
    <div ref={wrapRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--text-4)', pointerEvents: 'none' }}><Search size={14} /></span>
        <input className="ct-acc-search-input"
          onFocus={e => { e.target.style.borderColor = 'var(--600)'; e.target.style.boxShadow = '0 0 0 3px var(--focus)'; if (value.length >= 2 && suggestions.length > 0) setOpen(true); }}
          onBlur={e => { e.target.style.borderColor = ''; e.target.style.boxShadow = 'none'; }}
          value={value} onChange={handleChange} placeholder={placeholder || t('pdAccSearchPh')} autoComplete="off" />
        {busy ? <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', display: 'flex', color: 'var(--text-3)' }}><Loader2 size={14} className="spin" /></span>
          : value && <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-4)', cursor: 'pointer' }} onMouseDown={() => { onChange(''); setSuggestions([]); setOpen(false); }}><X size={14} /></span>}
      </div>
      {open && suggestions.length > 0 && (
        <div className="ct-acc-dropdown">
          <div className="ct-acc-dropdown__header">{t(suggestions.length > 1 ? 'pdResults' : 'pdResult', { n: suggestions.length })}</div>
          {suggestions.map(item => {
            const id = item.id || item._id; const label = item.designation?.fr || item.designation || id;
            return (
              <div key={id} onMouseDown={() => handleSelect(item)} className="ct-acc-dropdown__item"
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; }} onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Package size={14} style={{ color: 'var(--text-3)' }} /><span>{label}</span></span>
                {item.unit && <span className="ct-acc-dropdown__unit">{item.unit}</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ChassisLineAccessoryEditor({ chassis, project, onClose, onSaved }) {
  const { t } = useLanguage();
  const chId = chassis._id || chassis.id; const L = chassis.largeur || 0; const H = chassis.hauteur || 0;
  const [accessories, setAccessories] = useState([]); const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const [newAcc, setNewAcc] = useState(EMPTY_ACC); const [loadingDefaults, setLoadingDefaults] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await axios.get(`${API_URL}/projects/${project.id}/chassis/${chId}/accessories`);
        const saved = res.data || [];
        setAccessories(saved.map(a => { const hf = a.formula && a.formula.trim() !== ''; return { ...a, quantity: hf ? 0 : (a.quantity || 1), formula: hf ? a.formula.trim() : '', mode: hf ? 'formula' : 'fixed' }; }));
        if (saved.length === 0 && chassis.type) await loadDefaults(true);
      } catch { setAccessories([]); } finally { setLoading(false); }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chId, project.id]);

  const loadDefaults = async (silent = false) => {
    if (!chassis.type) return; setLoadingDefaults(true);
    try {
      const res = await axios.get(`${API_URL}/chassis-type-defaults/${encodeURIComponent(chassis.type)}`);
      const defaults = res.data || [];
      if (defaults.length > 0) setAccessories(defaults.map(d => { const hf = d.formula && d.formula.trim() !== ''; return { itemId: d.itemId || '', label: d.label, unit: d.unit || 'UN', quantity: hf ? 0 : (d.quantity || 1), formula: hf ? d.formula.trim() : '', mode: hf ? 'formula' : 'fixed' }; }));
      else if (!silent) setError(t('pdNoDefaultAcc'));
    } catch { if (!silent) setError(t('pdDefaultsLoadError')); } finally { setLoadingDefaults(false); }
  };

  const update = (idx, key, val) => setAccessories(prev => prev.map((a, i) => i === idx ? { ...a, [key]: val } : a));
  const setMode = (idx, mode) => setAccessories(prev => prev.map((a, i) => i === idx ? { ...a, mode, formula: mode === 'fixed' ? '' : a.formula } : a));
  const addAcc = () => {
    if (!newAcc.label.trim()) return setError(t('pdAccNameRequired')); setError('');
    setAccessories(prev => [...prev, { itemId: newAcc.itemId || `manual_${Date.now()}`, label: newAcc.label.trim(), unit: newAcc.unit || 'UN', quantity: newAcc.mode === 'fixed' ? (parseFloat(newAcc.quantity) || 1) : 0, formula: newAcc.mode === 'formula' ? newAcc.formula.trim() : '', mode: newAcc.mode }]);
    setNewAcc(EMPTY_ACC);
  };
  const removeAcc = (idx) => setAccessories(prev => prev.filter((_, i) => i !== idx));
  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const payload = accessories.map(({ mode, ...rest }) => rest);
      await axios.put(`${API_URL}/projects/${project.id}/chassis/${chId}/accessories`, { accessories: payload });
      const computedAccs = computeChassisAccessories({ ...chassis, accessories: payload });
      if (computedAccs.length > 0) {
        const qty = chassis.quantity || 1; const tableGroups = {};
        for (let i = 0; i < qty; i++) { const unit = (chassis.units || []).find(u => u.unitIndex === i); const tbl = unit?.atelierTable || ''; if (tbl) tableGroups[tbl] = (tableGroups[tbl] || 0) + 1; }
        await Promise.allSettled(Object.entries(tableGroups).map(async ([tableName, unitCount]) => {
          try {
            const tblRes = await axios.get(`${API_URL}/atelier-tables`); const found = (tblRes.data || []).find(tb => tb.name === tableName);
            if (!found) return;
            await axios.post(`${API_URL}/table-stock/deduct-chassis`, { tableId: found.id, tableName, projectId: project.id, projectName: project.name, chassisRef: chassis.repere, accessories: computedAccs.map(a => ({ ...a, quantity: a.quantity * unitCount })) });
          } catch { }
        }));
      }
      onSaved && onSaved(); onClose();
    } catch (e) { setError(e.response?.data?.error || t('pdSaveError')); } finally { setSaving(false); }
  };
  const preview = (acc) => {
    if (acc.mode === 'formula' && acc.formula) { const val = evalFormula(acc.formula, L, H); return val !== null ? <span className="proj-acc-preview-cell">{val} {acc.unit}</span> : <span className="proj-acc-preview-cell proj-acc-preview-cell--invalid"><AlertTriangle size={12} /> {t('pdInvalid')}</span>; }
    return <span className="proj-acc-preview-cell">{acc.quantity} {acc.unit}</span>;
  };
  const setN = (key, val) => setNewAcc(prev => ({ ...prev, [key]: val }));
  const newPreview = () => {
    if (newAcc.mode === 'formula' && newAcc.formula) { const val = evalFormula(newAcc.formula, L, H); if (val !== null) return <span className="proj-acc-formula-preview">= {val} {newAcc.unit}</span>; return <span className="proj-acc-formula-preview proj-acc-formula-preview--invalid"><AlertTriangle size={12} /> {t('pdInvalidFormula')}</span>; }
    return null;
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal proj-acc-modal" onClick={e => e.stopPropagation()}>
        <div className="ct-manager__header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><Wrench size={18} /> {t('pdAccessories')} — {chassis.repere}<span style={{ fontWeight: 400, fontSize: 14, color: 'var(--text-3)', marginLeft: 8 }}>({L}×{H} mm)</span></h2>
          <button className="chassis-form__close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="ct-manager__error">{error}</div>}
        {loading ? <div className="ct-manager__loading">{t('loading')}</div> : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
              <p className="ct-acc-hint" style={{ margin: 0, flex: 1 }}>{t('pdAccHint')}</p>
              <button className="proj-acc-load-defaults-btn" onClick={() => loadDefaults(false)} disabled={loadingDefaults}>{loadingDefaults ? '…' : <><Undo2 size={14} /> {t('pdLoadDefaults')}</>}</button>
            </div>
            {accessories.length > 0 ? (
              <table className="proj-acc-table">
                <thead><tr><th>{t('pdAccessory')}</th><th style={{ width: 90 }}>{t('pdUnit')}</th><th style={{ width: 80 }}>{t('pdMode')}</th><th style={{ width: 110 }}>{t('pdFixedQty')}</th><th style={{ width: 180 }}>{t('pdFormulaLH')}</th><th style={{ width: 110 }}>{t('pdPreview')}</th><th style={{ width: 40 }}></th></tr></thead>
                <tbody>
                  {accessories.map((acc, idx) => (
                    <tr key={idx}>
                      <td><input className="ct-acc-qty-input" style={{ width: '100%' }} value={acc.label} onChange={e => update(idx, 'label', e.target.value)} /></td>
                      <td><select className="ct-acc-unit-select" value={acc.unit || 'UN'} onChange={e => update(idx, 'unit', e.target.value)}>{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select></td>
                      <td><select className="ct-acc-unit-select" value={acc.mode || 'fixed'} onChange={e => setMode(idx, e.target.value)}><option value="fixed">{t('pdFixed')}</option><option value="formula">{t('pdFormula')}</option></select></td>
                      <td><input className="ct-acc-qty-input" type="number" min="0" step="0.01" value={acc.quantity} disabled={acc.mode === 'formula'} onChange={e => update(idx, 'quantity', parseFloat(e.target.value) || 0)} /></td>
                      <td className="proj-acc-formula-cell"><input className="proj-acc-formula-input" value={acc.formula} disabled={acc.mode === 'fixed'} onChange={e => update(idx, 'formula', e.target.value)} placeholder={t('pdFormulaPh')} /></td>
                      <td>{preview(acc)}</td>
                      <td><button className="delete-btn" onClick={() => removeAcc(idx)}><X size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <div className="proj-acc-empty">{t('pdNoAcc')}</div>}
            <div className="proj-acc-add-form">
              <div className="proj-acc-add-form__title"><Plus size={15} /> {t('pdAddAccessory')}</div>
              <div className="proj-acc-add-form__grid">
                <div className="form-group proj-acc-add-form__search" style={{ marginBottom: 0 }}>
                  <label>{t('designation')} *</label>
                  <AccLabelAutocomplete value={newAcc.label} onChange={v => setN('label', v)} onSelect={({ label, unit, itemId }) => setNewAcc(p => ({ ...p, label, unit: UNIT_OPTIONS.includes(unit) ? unit : (unit || 'UN'), itemId }))} />
                </div>
                <div className="proj-acc-mode-row">
                  <div className={`proj-acc-mode-card${newAcc.mode === 'fixed' ? ' proj-acc-mode-card--active' : ''}`} onClick={() => setN('mode', 'fixed')}>
                    <div className="proj-acc-mode-card__label"><span className="proj-acc-mode-dot" />{t('pdFixedQuantity')}</div>
                    <div className="proj-acc-qty-unit-row">
                      <input type="number" className="ct-acc-qty-input" min="0" step="0.01" value={newAcc.quantity} disabled={newAcc.mode !== 'fixed'} style={{ flex: 1 }} onChange={e => setN('quantity', e.target.value)} onClick={e => { e.stopPropagation(); setN('mode', 'fixed'); }} />
                      <select className="proj-acc-unit-select" value={newAcc.unit} onChange={e => setN('unit', e.target.value)} onClick={e => e.stopPropagation()}>{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                    </div>
                  </div>
                  <div className={`proj-acc-mode-card${newAcc.mode === 'formula' ? ' proj-acc-mode-card--active' : ''}`} onClick={() => setN('mode', 'formula')}>
                    <div className="proj-acc-mode-card__label"><span className="proj-acc-mode-dot" />{t('pdFormulaLH')}</div>
                    <input className="proj-acc-formula-input" value={newAcc.formula} disabled={newAcc.mode !== 'formula'} onChange={e => setN('formula', e.target.value)} onClick={e => { e.stopPropagation(); setN('mode', 'formula'); }} placeholder={t('pdFormulaPh')} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                      <select className="proj-acc-unit-select" value={newAcc.unit} onChange={e => setN('unit', e.target.value)} onClick={e => e.stopPropagation()}>{UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}</select>
                      <p className="proj-acc-formula-hint" style={{ margin: 0 }}><strong>L</strong>={L} · <strong>H</strong>={H} mm</p>
                    </div>
                    {newAcc.mode === 'formula' && newAcc.formula && newPreview()}
                  </div>
                </div>
                <div className="proj-acc-add-form__actions">
                  <button type="button" className="ct-config-btn" onClick={() => { setNewAcc(EMPTY_ACC); setError(''); }}>{t('pdReset')}</button>
                  <button type="button" className="ct-config-btn" onClick={addAcc}>{t('add')}</button>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={onClose}>{t('cancel')}</button>
              <button className="primary" onClick={handleSave} disabled={saving}>{saving ? '…' : <><Save size={14} /> {t('save')}</>}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Chassis Detail Print ─────────────────────────────────────────────────────
function buildChassisDetailHTML(ch, project, chassisLabels, language, accessories, atelierTable) {
  const L = ch.largeur || 0; const H = ch.hauteur || 0;
  const typeLabel = chassisLabels[ch.type]?.[language] || chassisLabels[ch.type]?.fr || ch.type;
  const co = resolveCompany(project); const companyColor = co.color || '#1a1a1a';
  const mergedMap = {};
  for (const acc of accessories) {
    let qty; if (acc.formula) { const val = evalFormula(acc.formula, L, H); qty = val !== null ? val : null; } else { qty = typeof acc.quantity === 'number' ? acc.quantity : parseFloat(acc.quantity) || 0; }
    const key = `${acc.label}|||${acc.unit || ''}`;
    if (mergedMap[key]) { mergedMap[key].totalQty = (mergedMap[key].totalQty !== null && qty !== null) ? parseFloat((mergedMap[key].totalQty + qty).toFixed(2)) : null; if (acc.formula) mergedMap[key].formulaStr += ` + ${acc.formula}`; }
    else { mergedMap[key] = { label: acc.label, unit: acc.unit || '', totalQty: qty, formulaStr: acc.formula || '' }; }
  }
  const mergedAccessories = Object.values(mergedMap);
  const accRows = mergedAccessories.map((acc, i) => { const qtyDisplay = acc.totalQty !== null ? `${acc.totalQty} ${acc.unit}` : tx('pdInvalidFormula'); const formulaDisplay = acc.formulaStr ? `<code style="font-size:11px;color:#6b7280">${acc.formulaStr}</code>` : '—'; return `<tr class="${i % 2 === 0 ? 'row-even' : 'row-odd'}"><td>${i + 1}</td><td>${acc.label}</td><td>${formulaDisplay}</td><td style="font-weight:700;color:${companyColor}">${qtyDisplay}</td></tr>`; }).join('');
  const componentRows = (ch.components || []).map((comp, i) => `<tr><td>${comp.repere || (comp.role === 'dormant' ? tx('pdDormant') : `${tx('pdVantailWord')} ${i}`)}</td><td>${comp.role === 'dormant' ? tx('pdDormant') : tx('pdVantailWord')}</td><td>${comp.largeur}×${comp.hauteur} mm</td></tr>`).join('');
  const atelierChip = atelierTable ? `<div class="chip" style="background:#fef9c3;border-color:#fde68a">${tx('pdAtelierTable')} : <strong style="color:#92400e">${atelierTable}</strong></div>` : `<div class="chip" style="color:#9ca3af">${tx('pdAtelierTable')} : <strong>${tx('pdUnassigned')}</strong></div>`;
  const closeScript = '<' + '/script>';
  return `<!DOCTYPE html><html lang="${activeLanguage()}"><head><meta charset="utf-8"><title>${tx('pdDetail')} — ${ch.repere}</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:13px;color:#1a1a1a;background:#fff;padding:28px 36px}h1{font-size:18px;font-weight:800;color:${companyColor};margin-bottom:4px}h2{font-size:13px;font-weight:700;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.06em;color:#374151}.meta{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:20px}.chip{padding:5px 12px;border-radius:6px;border:1px solid #e5e7eb;background:#f9fafb;font-size:12px}.chip strong{color:${companyColor}}table{width:100%;border-collapse:collapse;margin-bottom:12px}thead tr{background:${companyColor};color:#fff}th{padding:8px 10px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;text-align:left}td{padding:8px 10px;border-bottom:1px solid #f0f0f0}.row-even{background:#fff}.row-odd{background:#f9fafb}.no-acc{color:#9ca3af;font-style:italic;padding:12px 0}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}body{padding:12mm 16mm}@page{size:A4;margin:0}}</style></head><body><h1>${ch.repere}</h1><div class="meta"><div class="chip">${tx('labelType')} : <strong>${typeLabel}</strong></div><div class="chip">${tx('labelDim')} : <strong>${L}×${H} mm</strong></div><div class="chip">${tx('labelProject')} : <strong>${project.name}</strong></div><div class="chip">${tx('labelRef')} : <strong>${project.reference}</strong></div><div class="chip">RAL : <strong>${project.ralCode}</strong></div>${atelierChip}</div>${componentRows ? `<h2>${tx('pdComponents')}</h2><table><thead><tr><th>${tx('labelRepere')}</th><th>${tx('role')}</th><th>${tx('pdDimension')}</th></tr></thead><tbody>${componentRows}</tbody></table>` : ''}<h2>${tx('pdRequiredAcc')}</h2>${mergedAccessories.length === 0 ? `<p class="no-acc">${tx('pdNoAccForChassis')}</p>` : `<table><thead><tr><th>#</th><th>${tx('designation')}</th><th>${tx('pdFormula')}</th><th>${tx('quantity')}</th></tr></thead><tbody>${accRows}</tbody></table>`}<script>window.onload = () => window.print();${closeScript}</body></html>`;
}

// ─── Remplissage Label Print ──────────────────────────────────────────────────
function buildRemplissageLabelHTML(remplissages, chassis, project, compLabel, typeLabel) {
  const ralHex = project.ralColor || '#cccccc';
  const dateStr = project.date ? new Date(project.date).toLocaleDateString({ fr: 'fr-FR', it: 'it-IT', en: 'en-GB' }[activeLanguage()] || 'fr-FR') : '';
  const unitSuffix = (idx) => chassis.quantity > 1 ? ` #${Number(idx) + 1}` : '';
  const pages = remplissages.map(r => {
    const rLabel = r.sousType ? `${rempTypeLabel(r.type)} — ${r.sousType}` : rempTypeLabel(r.type);
    const repere = compLabel ? `${chassis.repere}${unitSuffix(r.unitIndex ?? 0)} — ${compLabel}` : `${chassis.repere}${unitSuffix(r.unitIndex ?? 0)}`;
    const parentLine = `<div class="parent-ref">${typeLabel}</div>`;
    return `<div class="page"><div class="label">
    <div class="lh"><span class="brand">CAMI ALUMINIUM</span><span class="swatch"></span></div>
    <div class="row"><span class="f"><span class="k">${tx('labelProject')}</span><span class="v">${project.name}</span></span><span class="f"><span class="k">${tx('labelRef')}</span><span class="v">${project.reference}</span></span></div>
    <div class="row"><span class="f"><span class="k">RAL</span><span class="v">${project.ralCode}</span></span><span class="f"><span class="k">${tx('labelDate')}</span><span class="v">${dateStr}</span></span></div>
    <div class="div"></div>
    <div class="grid">
      <div class="cell"><span class="k">${tx('labelRepere')}</span><span class="repere">${repere}${parentLine}</span></div>
      <div class="cell"><span class="k">${tx('pdRemplissage')}</span><span class="v remp-type">${rLabel}</span></div>
      <div class="cell full"><span class="k">${tx('labelDim')}</span><span class="dim">${r.largeur} × ${r.hauteur} mm</span></div>
    </div>
  </div></div>`;
  }).join('\n');
  const closeScript = '<' + '/script>';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title> </title><style>@page{size:9.5cm 5.5cm;margin:0mm}*{margin:0;padding:0;box-sizing:border-box}html,body{width:9.5cm;height:5.5cm;margin:0!important;padding:0!important;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{html,body{margin:0!important;padding:0!important}.page{page-break-after:always;page-break-inside:avoid}.page:last-child{page-break-after:avoid}}.page{width:9.5cm;height:5.5cm;overflow:hidden;display:block}.label{width:9.5cm;height:5.5cm;padding:3mm 4mm;display:flex;flex-direction:column;gap:1.2mm;overflow:hidden}.lh{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #1a1a1a;padding-bottom:1.2mm}.brand{font-size:8.5pt;font-weight:900;color:#1a1a1a;letter-spacing:0.05em;text-transform:uppercase}.swatch{width:10mm;height:5mm;border-radius:2px;border:1px solid #ccc;background-color:${ralHex};flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.row{display:flex;gap:6mm}.f{display:flex;gap:2px;align-items:baseline}.k{font-size:5.5pt;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:0.04em;white-space:nowrap;margin-right:2px}.v{font-size:6.5pt;font-weight:500;color:#1a1a1a}.remp-type{font-size:7pt!important;font-weight:700!important}.div{border-top:1px dashed #ccc;margin:0;flex-shrink:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:0.5mm 2mm;flex:1;min-height:0}.cell{display:flex;flex-direction:column;gap:0mm}.full{grid-column:1/-1}.repere{font-size:12pt;font-weight:900;color:#1a1a1a;letter-spacing:-0.02em;line-height:1}.dim{font-size:9.5pt;font-weight:700;color:#1a1a1a;line-height:1.1}.parent-ref{font-size:6pt;font-weight:600;color:#555;margin-top:1mm;line-height:1.2}</style></head><body>${pages}<script>document.title=' ';window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},1000);};${closeScript}</body></html>`;
}

const EMPTY_REMP = { type: 'Verre', sousType: '', largeur: '', hauteur: '', etat: 'non_entame', quantity: 1 };

// ─── Remplissage Modal ────────────────────────────────────────────────────────
function RemplissageModal({ chassis, unitIndex = 0, compIndex = null, project, onClose, onSaved, chassisLabels = {}, language = 'fr' }) {
  const chId = chassis._id || chassis.id;
  const [remplissages, setRemplissages] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(null);
  const [newRemp, setNewRemp] = React.useState(EMPTY_REMP);
  const [error, setError] = React.useState('');
  const [delivDateModal, setDelivDateModal] = React.useState(null);
  const [editingRemp, setEditingRemp] = React.useState(null);

  const { t } = useLanguage();
  const { user } = useAuth();
  const userRole = user?.role;
  const adminThing =
    userRole === 'Admin' ||
    (userRole === 'Laquage' && project?.tab === 'laquage') ||
    (userRole === 'Coordinateur-vitrage' && project?.tab === 'vitrage');
  const adminVerre = userRole === 'Admin' || userRole === 'Coordinateur-vitrage';
  const stateThingVitrage = userRole === 'Admin' || ['LOGISTIQUE', 'Coordinateur-vitrage'].includes(userRole);
  const stateThingCor = userRole === 'Admin' || ['LOGISTIQUE', 'Coordinateur'].includes(userRole);

  const REMP_ETAT_OPTIONS = ['non_entame', 'en_cours', 'fabrique', 'pret_a_livrer', 'livre'];
  function getRemplissageAllowedEtats(role, currentEtat) {
    if (role === 'Coordinateur-vitrage') return ['non_entame', 'en_cours', 'fabrique', 'pret_a_livrer'];
    if (role === 'LOGISTIQUE') {
      if (currentEtat === 'pret_a_livrer' || currentEtat === 'livre') return ['pret_a_livrer', 'livre'];
      return [currentEtat];
    }
    return REMP_ETAT_OPTIONS;
  }

  const comp = compIndex !== null ? (chassis.components || [])[compIndex] : null;
  const compLabel = comp ? (comp.repere || (comp.role === 'dormant' ? t('pdDormant') : `${t('pdVantailWord')} ${compIndex}`)) : null;
  const compDimL = comp?.largeur || chassis.largeur;
  const compDimH = comp?.hauteur || chassis.hauteur;

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let url = `${API_URL}/projects/${project.id}/chassis/${chId}/remplissages?unitIndex=${unitIndex}`;
        if (compIndex !== null) url += `&compIndex=${compIndex}`;
        const res = await axios.get(url);
        setRemplissages(res.data || []);
      } catch { setRemplissages([]); } finally { setLoading(false); }
    })();
  }, [chId, project.id, unitIndex, compIndex]);

  const addRemp = async () => {
    if (!newRemp.largeur || !newRemp.hauteur) return setError(t('pdWHRequired'));
    const qty = Math.max(1, parseInt(newRemp.quantity) || 1);
    setError('');
    try {
      const created = [];
      for (let i = 0; i < qty; i++) {
        const body = { type: newRemp.type, sousType: newRemp.sousType, largeur: newRemp.largeur, hauteur: newRemp.hauteur, etat: newRemp.etat, unitIndex, ...(compIndex !== null ? { compIndex } : {}) };
        const res = await axios.post(`${API_URL}/projects/${project.id}/chassis/${chId}/remplissages`, body);
        created.push(res.data);
      }
      setRemplissages(prev => [...prev, ...created]);
      setNewRemp(EMPTY_REMP);
      if (onSaved) onSaved();
    } catch (e) { setError(e.response?.data?.error || t('pdAddError')); }
  };

  const deleteRemp = async (id) => {
    if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('pdDeleteRempConfirm'), danger: true, confirmLabel: t('deleteAction') }))) return;
    try {
      await axios.delete(`${API_URL}/projects/${project.id}/chassis/${chId}/remplissages/${id}`);
      setRemplissages(prev => prev.filter(r => (r._id || r.id) !== id));
      if (onSaved) onSaved();
    } catch (e) { setError(e.response?.data?.error || t('pdDeleteError')); }
  };

  const patchRemp = async (id, patch) => {
    setSaving(id);
    try {
      const res = await axios.patch(`${API_URL}/projects/${project.id}/chassis/${chId}/remplissages/${id}`, patch);
      setRemplissages(prev => prev.map(r => (r._id || r.id) === id ? res.data : r));
      if (onSaved) onSaved();
    } catch (e) { setError(e.response?.data?.error || t('pdUpdateError')); } finally { setSaving(null); }
  };

  const saveEdit = async () => {
    if (!editingRemp) return;
    const { id, type, sousType, largeur, hauteur } = editingRemp;
    if (!largeur || !hauteur) return setError(t('pdWHRequired'));
    setError('');
    await patchRemp(id, { type, sousType, largeur: Number(largeur), hauteur: Number(hauteur) });
    setEditingRemp(null);
  };

  /* const handleEtatChange = (r, newEtat) => {
    const id = r._id || r.id;
    if (newEtat === 'livre' && !r.deliveryDate) { setDelivDateModal({ id, etat: newEtat }); return; }
    patchRemp(id, { etat: newEtat });
  }; */

  const handleEtatChange = async (ch, unitIndex, newEtat) => {
    const chId = ch._id || ch.id;
    const qty = ch.quantity || 1;

    try {

      // If quantity is grouped (not diffused)
      if (ch.keepAsOne === true) {

        await Promise.all(
          Array.from({ length: qty }, (_, i) =>
            axios.patch(
              `${API_URL}/projects/${project.id}/chassis/${chId}/units/${i}`,
              { etat: newEtat }
            )
          )
        );

      } else {

        // Normal behavior for diffused lines
        await axios.patch(
          `${API_URL}/projects/${project.id}/chassis/${chId}/units/${unitIndex}`,
          { etat: newEtat }
        );

      }

      /* if (refreshProject) {
        refreshProject(project.id);
      } */

    } catch (err) {
      console.error(err);
    }
  };



  const handleDeliveryConfirm = (date) => {
    const { id, etat } = delivDateModal; setDelivDateModal(null);
    patchRemp(id, { etat, deliveryDate: date });
  };

  const calcM2 = (l, h) => { const lv = parseFloat(l), hv = parseFloat(h); if (!lv || !hv) return '—'; return ((lv * hv) / 1e6).toFixed(2) + ' m²'; };
  const unitSuffix = chassis.quantity > 1 ? ` #${unitIndex + 1}` : '';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="ct-manager__header">
          <h2>
            {t('remplissage')} — {t('repere')} : {chassis.repere}{unitSuffix}
            {compLabel && <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-3)', marginLeft: 4 }}>— {compLabel}</span>}
            <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-3)', marginLeft: 8 }}>({compDimL}×{compDimH} mm)</span>
          </h2>
          <button className="chassis-form__close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="ct-manager__error">{error}</div>}
        {loading ? <div className="ct-manager__loading">{t('loading')}</div> : (
          <>
            {remplissages.length > 0 ? (
              <table className="proj-acc-table" style={{ marginBottom: 20 }}>
                <thead>
                  <tr>
                    <th>{t('type')}</th><th>{t('subtype')}</th>
                    <th style={{ width: 80 }}>{t('pdColL')}</th><th style={{ width: 80 }}>{t('pdColH')}</th>
                    <th style={{ width: 80 }}>m²</th><th style={{ width: 150 }}>{t('status')}</th>
                    <th style={{ width: 120 }}>{t('blDate')}</th>
                    {adminVerre && <th style={{ width: 40 }}></th>}
                    {adminVerre && <th style={{ width: 40 }}></th>}
                    {adminVerre && <th style={{ width: 40 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {remplissages.map(r => {
                    const id = r._id || r.id; const isSaving = saving === id; const isEditing = editingRemp?.id === id;
                    return (
                      <tr key={id} style={{ opacity: isSaving ? 0.6 : 1, background: isEditing ? 'rgba(59,130,246,.08)' : undefined }}>
                        <td>{isEditing ? <select value={editingRemp.type} onChange={e => setEditingRemp(p => ({ ...p, type: e.target.value }))} style={{ width: '100%' }}>{REMPLISSAGE_TYPES.map(tVal => <option key={tVal} value={tVal}>{rempTypeLabel(tVal)}</option>)}</select> : <strong>{rempTypeLabel(r.type)}</strong>}</td>
                        <td>{isEditing ? <input type="text" value={editingRemp.sousType} onChange={e => setEditingRemp(p => ({ ...p, sousType: e.target.value }))} placeholder={t('pdSubTypePh')} style={{ width: '100%' }} /> : (r.sousType || <span style={{ color: 'var(--text-4)' }}>—</span>)}</td>
                        <td style={{ textAlign: 'center' }}>{isEditing ? <input type="number" min="1" value={editingRemp.largeur} onChange={e => setEditingRemp(p => ({ ...p, largeur: e.target.value }))} className="ct-acc-qty-input" style={{ width: 70 }} /> : r.largeur}</td>
                        <td style={{ textAlign: 'center' }}>{isEditing ? <input type="number" min="1" value={editingRemp.hauteur} onChange={e => setEditingRemp(p => ({ ...p, hauteur: e.target.value }))} className="ct-acc-qty-input" style={{ width: 70 }} /> : r.hauteur}</td>
                        <td style={{ textAlign: 'center', fontSize: 11, color: 'var(--text-3)' }}>{calcM2(isEditing ? editingRemp.largeur : r.largeur, isEditing ? editingRemp.hauteur : r.hauteur)}</td>
                        <td>
                          {stateThingVitrage ? (
                            <select value={r.etat} disabled={isSaving || isEditing || isEtatSelectDisabled(userRole, r.etat, isSaving)} onChange={e => handleEtatChange(r, e.target.value)} style={{ borderLeft: `3px solid ${ETAT_COLORS[r.etat]}`, borderRadius: 4, padding: '3px 6px', fontSize: 12, width: '100%' }}>
                              {getRemplissageAllowedEtats(userRole, r.etat).map(opt => <option key={opt} value={opt}>{t('etat_' + opt)}</option>)}
                            </select>
                          ) : (
                            <span className="etat-badge pd-etat-badge" style={etatTint(r.etat)}>{t(`etat_${r.etat}`)}</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: 12 }}>
                          {r.etat === 'livre' && r.deliveryDate
                            ? <button className="date-btn" style={{ fontSize: 11 }} onClick={() => setDelivDateModal({ id, etat: 'livre', current: toDateInput(r.deliveryDate) })}><CalendarDays size={12} /> {fmtDate(r.deliveryDate)}</button>
                            : <span style={{ color: 'var(--text-4)' }}>—</span>}
                        </td>
                        {adminVerre && <td>{isEditing ? <div style={{ display: 'flex', gap: 4 }}><button className="ct-config-btn" style={{ fontSize: 11, padding: '2px 7px' }} onClick={saveEdit} disabled={isSaving}><Save size={13} /></button><button className="delete-btn" style={{ fontSize: 11, padding: '2px 7px' }} onClick={() => setEditingRemp(null)}><X size={13} /></button></div> : <button className="edit-btn" disabled={isSaving} onClick={() => setEditingRemp({ id, type: r.type, sousType: r.sousType || '', largeur: r.largeur, hauteur: r.hauteur })}><Pencil size={13} /></button>}</td>}
                        {adminVerre && <td><button className="print-btn" disabled={isEditing} onClick={() => { const tl = chassisLabels[chassis.type]?.[language] || chassisLabels[chassis.type]?.fr || chassis.type; const html = buildRemplissageLabelHTML([r], chassis, project, compLabel, tl); const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } }}><Tag size={14} /></button></td>}
                        {adminVerre && <td><button className="delete-btn" onClick={() => deleteRemp(id)} disabled={isSaving || isEditing}><Trash2 size={14} /></button></td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : <div className="proj-acc-empty" style={{ marginBottom: 20 }}>{t('noData')}</div>}

            {adminVerre && (
              <div className="proj-acc-add-form">
                <div className="proj-acc-add-form__title"><Plus size={15} /> {t('add_infill')}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 80px 70px auto', gap: 10, alignItems: 'flex-end' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>{t('type')}</label><select value={newRemp.type} onChange={e => setNewRemp(p => ({ ...p, type: e.target.value }))} style={{ width: '100%' }}>{REMPLISSAGE_TYPES.map(tVal => <option key={tVal} value={tVal}>{rempTypeLabel(tVal)}</option>)}</select></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>{t('subtype')}</label><input type="text" value={newRemp.sousType} onChange={e => setNewRemp(p => ({ ...p, sousType: e.target.value }))} placeholder={t('subtype_placeholder')} style={{ width: '100%' }} /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>{t('width_mm')}</label><input type="number" min="1" value={newRemp.largeur} onChange={e => setNewRemp(p => ({ ...p, largeur: e.target.value }))} className="ct-acc-qty-input" /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>{t('height_mm')}</label><input type="number" min="1" value={newRemp.hauteur} onChange={e => setNewRemp(p => ({ ...p, hauteur: e.target.value }))} className="ct-acc-qty-input" /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>{t('pdQty')}</label><input type="number" min="1" max="50" value={newRemp.quantity} onChange={e => setNewRemp(p => ({ ...p, quantity: e.target.value }))} className="ct-acc-qty-input" /></div>
                  <div><button type="button" className="ct-config-btn" style={{ marginTop: 22 }} onClick={addRemp}>{t('add')}</button></div>
                </div>
                {newRemp.largeur && newRemp.hauteur && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>{t('surface')} <strong>{calcM2(newRemp.largeur, newRemp.hauteur)}</strong></div>}
              </div>
            )}
          </>
        )}
        {delivDateModal && (
          <div className="modal-overlay" onClick={() => setDelivDateModal(null)}>
            <div className="modal" style={{ maxWidth: 320 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}><CalendarDays size={17} /> {t('pdDeliveryDate')}</h3>
              <div className="form-group"><label>{t('date')}</label><input type="date" defaultValue={delivDateModal.current || new Date().toISOString().split('T')[0]} id="remp-date-input" /></div>
              <div className="modal-actions">
                <button onClick={() => setDelivDateModal(null)}>{t('cancel')}</button>
                <button className="primary" onClick={() => handleDeliveryConfirm(document.getElementById('remp-date-input').value)}>{t('dlgConfirm')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BulkRemplissageModal({ project, onClose, onSaved }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const userRole = user?.role;
  const isLogistique = userRole === 'LOGISTIQUE';
  const isVitrage = userRole === 'Admin' || userRole === 'Coordinateur-vitrage';

  // Collect all remplissages across all chassis
  const allRemplissages = (project.chassis || []).flatMap(ch =>
    (ch.remplissages || []).map(r => ({ r, ch, chId: ch._id || ch.id }))
  );

  // LOGISTIQUE: only pret_a_livrer selectable; Vitrage/Admin: all
  const selectableRemplissages = isLogistique
    ? allRemplissages.filter(({ r }) => r.etat === 'pret_a_livrer')
    : allRemplissages;

  const [selected, setSelected] = useState(new Set(selectableRemplissages.map((_, i) => i)));
  const [targetEtat, setTargetEtat] = useState(isLogistique ? 'livre' : 'fabrique');
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const etatOptions = isLogistique
    ? ['pret_a_livrer', 'livre']
    : ['non_entame', 'en_cours', 'fabrique', 'pret_a_livrer'];

  const toggleAll = () =>
    setSelected(selected.size === selectableRemplissages.length
      ? new Set()
      : new Set(selectableRemplissages.map((_, i) => i)));

  const toggleOne = (i) => {
    const n = new Set(selected);
    n.has(i) ? n.delete(i) : n.add(i);
    setSelected(n);
  };

  const handleApply = async () => {
    if (!selected.size) return;
    setSaving(true); setError('');
    try {
      const toUpdate = [...selected].map(i => selectableRemplissages[i]);
      await Promise.all(toUpdate.map(({ r, ch, chId }) => {
        const id = r._id || r.id;
        const patch = { etat: targetEtat };
        if (targetEtat === 'livre') patch.deliveryDate = deliveryDate;
        return axios.patch(`${API_URL}/projects/${project.id}/chassis/${chId}/remplissages/${id}`, patch);
      }));
      if (onSaved) onSaved();
      onClose();
    } catch (e) { setError(e.response?.data?.error || t('pdUpdateError')); }
    finally { setSaving(false); }
  };

  const REMP_ETAT_COLORS = {
    non_entame: '#9ca3af', en_cours: '#f59e0b', fabrique: '#3b82f6',
    pret_a_livrer: '#ef4444', livre: '#16a34a',
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 600, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
        <div className="ct-manager__header">
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Tags size={18} /> {t('pdBulkRempTitle')}</h2>
          <button className="chassis-form__close" onClick={onClose}><X size={18} /></button>
        </div>
        {error && <div className="ct-manager__error">{error}</div>}

        {selectableRemplissages.length === 0 ? (
          <div className="proj-acc-empty">
            {isLogistique
              ? t('pdNoRempReady')
              : t('pdNoRemp')}
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
              <label style={{ fontWeight: 600, fontSize: 13 }}>{t('pdNewState')} :</label>
              <select
                value={targetEtat}
                onChange={e => setTargetEtat(e.target.value)}
                style={{ borderLeft: `3px solid ${REMP_ETAT_COLORS[targetEtat]}`, borderRadius: 4, padding: '4px 8px', fontSize: 13 }}
              >
                {etatOptions.map(opt => (
                  <option key={opt} value={opt}>{t('etat_' + opt)}</option>
                ))}
              </select>
              {targetEtat === 'livre' && (
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  style={{ padding: '4px 8px', fontSize: 13 }}
                />
              )}
            </div>

            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 12, color: 'var(--text-3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input type="checkbox"
                  checked={selected.size === selectableRemplissages.length}
                  onChange={toggleAll}
                />
                {t('selectAll')} ({selectableRemplissages.length})
              </label>
            </div>

            <table className="proj-acc-table" style={{ marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>{t('pdRepere')}</th>
                  <th>{t('type')}</th>
                  <th>{t('labelDim')}</th>
                  <th>{t('pdCurrentState')}</th>
                </tr>
              </thead>
              <tbody>
                {selectableRemplissages.map(({ r, ch }, i) => {
                  const unitSuffix = (ch.quantity || 1) > 1 ? ` #${(r.unitIndex ?? 0) + 1}` : '';
                  const comp = r.compIndex != null ? (ch.components || [])[r.compIndex] : null;
                  const compLabel = comp ? (comp.repere || (comp.role === 'dormant' ? t('pdDormant') : `${t('pdVantailWord')} ${r.compIndex}`)) : null;
                  const repere = compLabel
                    ? `${ch.repere}${unitSuffix} — ${compLabel}`
                    : `${ch.repere}${unitSuffix}`;
                  const rLabel = r.sousType ? `${rempTypeLabel(r.type)} — ${r.sousType}` : rempTypeLabel(r.type);
                  return (
                    <tr key={r._id || r.id} style={{ opacity: selected.has(i) ? 1 : 0.45 }}>
                      <td><input type="checkbox" checked={selected.has(i)} onChange={() => toggleOne(i)} /></td>
                      <td><strong>{repere}</strong></td>
                      <td>{rLabel}</td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>{r.largeur}×{r.hauteur} mm</td>
                      <td>
                        <span className="pd-etat-badge" style={etatTint(r.etat)}>
                          {t('etat_' + r.etat)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        <div className="modal-actions">
          <button onClick={onClose}>{t('cancel')}</button>
          {selectableRemplissages.length > 0 && (
            <button
              className="primary"
              onClick={handleApply}
              disabled={saving || !selected.size}
            >
              {saving ? <><Loader2 size={14} className="spin" /> {t('pdInProgress')}</> : <><CircleCheck size={14} /> {t(selected.size > 1 ? 'pdApplyRemps' : 'pdApplyRemp', { n: selected.size })}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
// ─── ProjectDetail ────────────────────────────────────────────────────────────
// ─── Remarks ──────────────────────────────────────────────────────────────────
// Remarks of a chassis row (unit.remarks): several authors, everyone reads them all, each author edits /
// deletes only his own. The cell shows the latest one, cut to one line, and the count.
const fmtRemarkDate = (d) => (d ? new Date(d).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '');

function RemarkCell({ remarks, canAdd, onOpen }) {
  const { t } = useLanguage();
  const list = remarks || [];
  const last = list[list.length - 1];
  if (!list.length && !canAdd) return <td data-label={t('pdRemark')} className="remark-cell"><span className="date-placeholder">—</span></td>;
  return (
    <td data-label={t('pdRemark')} className="remark-cell">
      <button type="button" className={`remark-cell__btn${list.length ? ' has-note' : ''}`} onClick={onOpen}
        title={list.length ? list.map(r => `${r.by || '—'} : ${r.text}`).join('\n') : t('pdRemarkAdd')}>
        {list.length ? (
          <>
            <span className="remark-cell__txt"><em>{last.by || '—'} :</em> {last.text}</span>
            {list.length > 1 && <span className="remark-cell__count">{list.length}</span>}
          </>
        ) : <><MessageSquareText size={13} /> <span className="remark-cell__add">{t('pdRemarkAdd')}</span></>}
      </button>
    </td>
  );
}

// Window with every remark of one chassis row: add (non read-only accounts), edit / delete one's own
function ChassisRemarksModal({ project, chId, unitIndex, label, canAdd, onClose }) {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { getProjectById, replaceProject } = useProjects();
  const live = getProjectById(project.id) || project;
  const ch = (live.chassis || []).find(c => (c._id || c.id) === chId);
  const remarks = (ch?.units || []).find(u => u.unitIndex === unitIndex)?.remarks || [];
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(null); // { id, text }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const base = `${API_URL}/projects/${project.id}/chassis/${chId}/units/${unitIndex}/remarks`;
  const myId = String(user?.id || user?._id || '');
  const run = async (fn) => {
    setBusy(true); setError('');
    try { const r = await fn(); replaceProject(r.data); return true; }
    catch (e) { setError(e.response?.data?.error || t('errSave')); return false; }
    finally { setBusy(false); }
  };
  const add = async () => { if (text.trim() && await run(() => axios.post(base, { text: text.trim() }))) setText(''); };
  const save = async () => { if (editing?.text.trim() && await run(() => axios.put(`${base}/${editing.id}`, { text: editing.text.trim() }))) setEditing(null); };
  const remove = async (r) => {
    if (!(await dialog.confirm({ message: t('pdRemarkDeleteQ'), danger: true }))) return;
    run(() => axios.delete(`${base}/${r._id || r.id}`));
  };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal remarks-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-head__icon"><MessageSquareText size={14} /></span>
          <h2>{t('pdRemarksOf', { label })}</h2>
        </div>
        <div className="remarks-list">
          {!remarks.length && <div className="project-remarks__empty">{t('pdRemarksEmpty')}</div>}
          {remarks.map(r => {
            const id = r._id || r.id;
            const mine = !!r.byId && String(r.byId) === myId;
            const isEditing = editing?.id === id;
            return (
              <div key={id} className={`remark-item${mine ? ' is-mine' : ''}`}>
                <div className="remark-item__head">
                  <strong>{r.by || '—'}</strong>
                  {r.role && <span className="remark-item__role">{r.role}</span>}
                  <span className="remark-item__date">{fmtRemarkDate(r.at)}{r.editedAt ? ` · ${t('pdRemarkEdited')}` : ''}</span>
                  {mine && !isEditing && (
                    <span className="remark-item__actions">
                      <button type="button" className="edit-btn" title={t('edit')} disabled={busy} onClick={() => setEditing({ id, text: r.text })}><Pencil size={13} /></button>
                      <button type="button" className="delete-btn" title={t('delete')} disabled={busy} onClick={() => remove(r)}><Trash2 size={13} /></button>
                    </span>
                  )}
                </div>
                {isEditing ? (
                  <>
                    <textarea className="project-remarks__input" rows={3} value={editing.text} autoFocus maxLength={2000}
                      onChange={e => setEditing(ed => ({ ...ed, text: e.target.value }))} />
                    <div className="project-remarks__actions">
                      <button type="button" onClick={() => setEditing(null)}>{t('cancel')}</button>
                      <button type="button" className="primary" disabled={busy || !editing.text.trim()} onClick={save}><Save size={13} /> {t('save')}</button>
                    </div>
                  </>
                ) : <p className="remark-item__txt">{r.text}</p>}
              </div>
            );
          })}
        </div>
        {canAdd && (
          <div className="remarks-add">
            <textarea className="project-remarks__input" rows={3} value={text} maxLength={2000}
              placeholder={t('pdRemarkPh')} onChange={e => setText(e.target.value)} />
          </div>
        )}
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>{t('close')}</button>
          {canAdd && <button type="button" className="primary" disabled={busy || !text.trim()} onClick={add}><Plus size={13} /> {t('pdRemarkAdd')}</button>}
        </div>
      </div>
    </div>
  );
}

// « Remarques » of the project, under the header of the project detail
function ProjectRemarks({ project, canEdit, onSaved }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(project.remarques || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (!editing) setText(project.remarques || ''); }, [project.remarques, editing]);
  if (!canEdit && !project.remarques) return null;
  const save = async () => {
    setSaving(true); setError('');
    try {
      await axios.patch(`${API_URL}/projects/${project.id}/remarques`, { remarques: text.trim() });
      setEditing(false); onSaved && onSaved();
    } catch (e) { setError(e.response?.data?.error || t('errSave')); }
    finally { setSaving(false); }
  };
  return (
    <div className="project-remarks">
      <div className="project-remarks__head">
        <MessageSquareText size={15} /><strong>{t('pdRemarks')}</strong>
        {project.remarquesBy && project.remarques && !editing && (
          <span className="project-remarks__meta">{t('pdRemarksBy', { by: project.remarquesBy, at: project.remarquesAt ? new Date(project.remarquesAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '' })}</span>
        )}
        {canEdit && !editing && (
          <button type="button" className="project-remarks__edit" onClick={() => setEditing(true)}>
            <Pencil size={13} /> {project.remarques ? t('edit') : t('pdRemarksAdd')}
          </button>
        )}
      </div>
      {editing ? (
        <>
          <textarea className="project-remarks__input" rows={4} value={text} autoFocus maxLength={5000}
            placeholder={t('pdRemarksPh')} onChange={e => setText(e.target.value)} />
          {error && <div className="form-error">{error}</div>}
          <div className="project-remarks__actions">
            <button type="button" onClick={() => { setEditing(false); setText(project.remarques || ''); setError(''); }}>{t('cancel')}</button>
            <button type="button" className="primary" onClick={save} disabled={saving}><Save size={13} /> {t('save')}</button>
          </div>
        </>
      ) : (
        project.remarques
          ? <p className="project-remarks__txt">{project.remarques}</p>
          : <p className="project-remarks__empty">{t('pdRemarksEmpty')}</p>
      )}
    </div>
  );
}

function ProjectDetail({ projectId, onBack, currentUser }) {
  const { deleteChassis, updateChassis, updateUnit, updateComponent, getProjectById, refreshProject } = useProjects();


  const { t, currentLanguage } = useLanguage();
  // Detail tab kept in the URL (?vue=bl): a refresh reopens the same tab
  const [activeTab, setActiveTabState] = useState(() => getQueryParam('vue') || 'chassis');
  const setActiveTab = (key) => { setActiveTabState(key); updateQuery({ vue: key === 'chassis' ? null : key }); };
  const [showChassisForm, setShowChassisForm] = useState(false);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [showAccExport, setShowAccExport] = useState(false);
  const [accLineEditor, setAccLineEditor] = useState(null);
  const [remplissageEditor, setRemplissageEditor] = useState(null);
  const [editingChassis, setEditingChassis] = useState(null);
  const [printingChassis, setPrintingChassis] = useState(null);
  const [chassisLabels, setChassisLabels] = useState(STATIC_LABELS);
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [deliveryModal, setDeliveryModal] = useState(null);
  const [savingKey, setSavingKey] = useState(null);
  const [atelierTables, setAtelierTables] = useState({});
  const [savingTableKey, setSavingTableKey] = useState(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [showBulkRemplissageModal, setShowBulkRemplissageModal] = useState(false);
  const [groupStatesModal, setGroupStatesModal] = useState(null);

  const language = currentLanguage;
  const project = getProjectById(projectId);

  useEffect(() => {
    refreshProject(projectId);
  }, [projectId, refreshProject]);



  const statusColor = STATUS_COLORS[project?.status] || '#9ca3af';
  const dateStr = project?.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';

  const { user, can } = useAuth();
  const userRole = user?.role;
  // remarks (project + chassis rows): every account that can change things, not the read-only ones
  const canRemark = !can('readonly') || can('admin.view');
  const [remarksFor, setRemarksFor] = useState(null); // { chId, unitIndex, label } — remarks window of a row


  // ── Derived permission flags ────────────────────────────────────────────────
  const tabCfg = getTabConfig(project);
  const projectTab = project?.tab || 'aluminium';

  // Can add/edit/delete chassis, manage types, print labels
  const adminThing =
    userRole === 'Admin' ||
    (userRole === 'Laquage' && projectTab === 'laquage') ||
    (userRole === 'Coordinateur-vitrage' && projectTab === 'vitrage');

  // Admin-only actions (accessories editor, chassis print sheet)
  const adminOnly = userRole === 'Admin';

  // Can see the état dropdown (vs read-only badge) — per TAB_CONFIG.stateRoles
  const stateThing = canSeeEtatDropdown(userRole, project);

  // Chassis labels (tickets): the editors + the Chef atelier (read-only account: prints only, changes nothing).
  // Not the remplissage labels.
  const canPrintLabels = adminThing || userRole === 'Chef atelier';
  const canPrintOneLabel = adminOnly || userRole === 'Chef atelier'; // the ticket button of a row
  // rows can be ticked: to change their état, or to print their labels
  const canSelectRows = adminThing || stateThing || canPrintLabels;

  // Can assign atelier table (aluminium tab only)
  const canEditAtelierTable = tabCfg.tableRoles.includes(userRole);

  // Can assign vitrage/remplissage table
  const canEditRemplissageTable = tabCfg.tableRoles.includes(userRole);

  // Can see/manage remplissages
  const adminVerre = userRole === 'Admin' || userRole === 'Coordinateur-vitrage';

  // Atelier table column: only show for aluminium tab
  const showAtelierCols = projectTab === 'aluminium';

  // ─────────────────────────────────────────────────────────────────────────────


  useEffect(() => { fetchChassisTypes().then(types => setChassisLabels(buildChassisLabels(types))).catch(() => { }); }, [showTypeManager]);
  useEffect(() => {
    const init = {};
    for (const ch of project?.chassis || []) {
      const qty = ch.quantity || 1; const chId = ch._id || ch.id; const isComposite = (ch.components || []).length > 0;
      for (let i = 0; i < qty; i++) {
        const unit = getUnit(ch, i); const key = `${chId}-${i}`;
        if (!isComposite) { if (unit.atelierTable) init[key] = unit.atelierTable; }
        else { (ch.components || []).forEach((_, ci) => { const cs = (unit.componentStates || []).find(c => c.compIndex === ci); if (cs?.atelierTable) init[`${key}-c${ci}`] = cs.atelierTable; }); }
      }
    }
    setAtelierTables(init);
  }, [project]);

  const handleAtelierTableChange = useCallback(async (ch, unitIndex, newTable, rowKey, compIndex = null) => {
    setSavingTableKey(rowKey);
    const chId = ch._id || ch.id; const prevTable = atelierTables[rowKey] || '';
    try {
      if (compIndex !== null) {
        await axios.patch(`${API_URL}/projects/${project.id}/chassis/${chId}/units/${unitIndex}/components/${compIndex}`, { atelierTable: newTable });
      } else {
        await axios.patch(`${API_URL}/projects/${project.id}/chassis/${chId}/units/${unitIndex}`, { atelierTable: newTable });
      }
      setAtelierTables(prev => ({ ...prev, [rowKey]: newTable }));
      if (refreshProject) refreshProject(project.id);
      if (newTable && newTable !== prevTable) {
        try {
          const tblRes = await axios.get(`${API_URL}/atelier-tables`);
          const found = (tblRes.data || []).find(t => t.name === newTable);
          if (found) { const accessories = computeChassisAccessories(ch); if (accessories.length > 0) await axios.post(`${API_URL}/table-stock/deduct-chassis`, { tableId: found.id, tableName: newTable, projectId: project.id, projectName: project.name, chassisRef: ch.repere, accessories }); }
        } catch { }
      }
    } catch (e) { console.error('Atelier table save failed', e); } finally { setSavingTableKey(null); }
  }, [project, refreshProject, atelierTables]);

  const rows = (project?.chassis || []).flatMap(ch => {
    const qty = ch.quantity || 1;
    const chId = ch._id || ch.id;
    const isComposite = (ch.components || []).length > 0;

    // keepAsOne: laquage default, or explicitly set on chassis
    const keepAsOne = ch.keepAsOne === true || (ch.keepAsOne == null && projectTab === 'laquage');

    const iterations = keepAsOne ? 1 : qty;

    return Array.from({ length: iterations }, (_, unitIndex) => {
      const unit = getUnit(ch, unitIndex); const groupKey = `${chId}-${unitIndex}`; const baseLabel = (!keepAsOne && qty > 1) ? `${ch.repere} #${unitIndex + 1}` : ch.repere;
      if (!isComposite) return [{ kind: 'unit', ch, chId, unitIndex, unit, rowKey: groupKey, label: baseLabel, etat: unit.etat || 'non_entame' }];
      const componentRows = ch.components.map((comp, ci) => ({ kind: 'component', ch, chId, unitIndex, unit, comp, ci, rowKey: `${groupKey}-c${ci}`, groupKey, label: comp.repere || `${comp.role === 'dormant' ? 'D' : 'V'}${ci + 1}`, etat: getComponentEtat(unit, ci, comp) }));
      return [{ kind: 'groupHead', ch, chId, unitIndex, unit, rowKey: groupKey, label: baseLabel, derivedEtat: deriveCompositeEtat(unit, ch.components), componentRows }, ...componentRows];
    });
  }).flat();

  const allSelectableKeys = rows.filter(r => r.kind === 'unit' || r.kind === 'component').map(r => r.rowKey);

  const logistiqueSelectableKeys = userRole === 'LOGISTIQUE'
    ? rows.filter(r => (r.kind === 'unit' || r.kind === 'component') && r.etat === 'pret_a_livrer').map(r => r.rowKey)
    : allSelectableKeys;

  const toggleKey = key => setSelectedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const toggleAll = () => setSelectedKeys(
    selectedKeys.size === logistiqueSelectableKeys.length && logistiqueSelectableKeys.every(k => selectedKeys.has(k))
      ? new Set()
      : new Set(logistiqueSelectableKeys)
  );

  const handleUnitEtatChange = async (ch, unitIndex, newEtat, rowKey) => {
    const chId = ch._id || ch.id;
    const qty = ch.quantity || 1;
    const keepAsOne = ch.keepAsOne === true || (ch.keepAsOne == null && projectTab === 'laquage');

    if (newEtat === 'livre') {
      setDeliveryModal({
        kind: 'unit',
        chId,
        unitIndex,
        rowKey,
        currentDate: toDateInput(getUnit(ch, unitIndex).deliveryDate),
        keepAsOne,
        qty,
      });
      return;
    }

    setSavingKey(rowKey);
    try {
      if (keepAsOne && qty > 1) {
        // Grouped line: propagate the état to every underlying unit
        await Promise.all(
          Array.from({ length: qty }, (_, i) => updateUnit(project.id, chId, i, { etat: newEtat }))
        );
      } else {
        await updateUnit(project.id, chId, unitIndex, { etat: newEtat });
      }
    } finally {
      if (refreshProject) await refreshProject(project.id);
      setSavingKey(null);
    }
  };
  const handleComponentEtatChange = async (ch, unitIndex, ci, newEtat, rowKey) => {
    if (newEtat === 'livre') { setDeliveryModal({ kind: 'component', chId: ch._id || ch.id, unitIndex, ci, rowKey, currentDate: null }); return; }
    setSavingKey(rowKey); await updateComponent(project.id, ch._id || ch.id, unitIndex, ci, { etat: newEtat }); if (refreshProject) await refreshProject(project.id); setSavingKey(null);
  };

  const handleDeliveryConfirm = async (deliveryDate) => {
    const m = deliveryModal; setDeliveryModal(null);
    if (m.kind === 'bulk') {
      setBulkSaving(true);
      for (const row of rows) {
        if (!selectedKeys.has(row.rowKey)) continue;
        try {
          if (row.kind === 'unit') {
            const qty = row.ch.quantity || 1;
            const keepAsOne = row.ch.keepAsOne === true || (row.ch.keepAsOne == null && projectTab === 'laquage');
            if (keepAsOne && qty > 1) {
              await Promise.all(
                Array.from({ length: qty }, (_, i) =>
                  updateUnit(project.id, row.ch._id || row.ch.id, i, { etat: 'livre', deliveryDate })
                )
              );
            } else {
              await updateUnit(project.id, row.ch._id || row.ch.id, row.unitIndex, { etat: 'livre', deliveryDate });
            }
          } else if (row.kind === 'component') {
            await updateComponent(project.id, row.ch._id || row.ch.id, row.unitIndex, row.ci, { etat: 'livre', deliveryDate });
          }
        } catch (e) { console.error('Bulk livre failed for', row.rowKey, e); }
      }
      if (refreshProject) await refreshProject(project.id);
      setBulkSaving(false);
      setSelectedKeys(new Set());
      return;
    }

    setSavingKey(m.rowKey);
    if (m.kind === 'unit') {
      if (m.keepAsOne && m.qty > 1) {
        await Promise.all(
          Array.from({ length: m.qty }, (_, i) =>
            updateUnit(project.id, m.chId, i, { etat: 'livre', deliveryDate })
          )
        );
      } else {
        await updateUnit(project.id, m.chId, m.unitIndex, { etat: 'livre', deliveryDate });
      }
    } else if (m.kind === 'component') {
      await updateComponent(project.id, m.chId, m.unitIndex, m.ci, { etat: 'livre', deliveryDate });
    }
    if (refreshProject) await refreshProject(project.id);
    setSavingKey(null);
  };

  const handleDeleteUnit = async (ch, unitIndex) => {
    const chId = ch._id || ch.id; const qty = ch.quantity ?? 1;
    const keepAsOne = ch.keepAsOne === true || (ch.keepAsOne == null && projectTab === 'laquage');
    if (qty <= 1 || keepAsOne) {
      if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('deleteChassisConfirm'), danger: true, confirmLabel: t('deleteAction') }))) return;
      await deleteChassis(project.id, chId);
    } else {
      if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('pdDeleteUnitConfirm', { n: unitIndex + 1 }), danger: true, confirmLabel: t('deleteAction') }))) return;
      await updateChassis(project.id, chId, { quantity: qty - 1 });
    }
    if (refreshProject) await refreshProject(project.id);
  };

  const handleBulkEtatChange = async (newEtat) => {
    if (!selectedKeys.size) return;
    // If changing to 'livre', open delivery date modal for first item then apply to all
    if (newEtat === 'livre') {
      // We'll handle via a single date prompt reusing DeliveryDateModal
      setDeliveryModal({ kind: 'bulk', rowKey: '__bulk__', currentDate: new Date().toISOString().split('T')[0] });
      return;
    }
    setBulkSaving(true);
    for (const row of rows) {
      if (!selectedKeys.has(row.rowKey)) continue;
      try {
        if (row.kind === 'unit') {
          const qty = row.ch.quantity || 1;
          const keepAsOne = row.ch.keepAsOne === true || (row.ch.keepAsOne == null && projectTab === 'laquage');
          if (keepAsOne && qty > 1) {
            await Promise.all(
              Array.from({ length: qty }, (_, i) =>
                updateUnit(project.id, row.ch._id || row.ch.id, i, { etat: newEtat })
              )
            );
          } else {
            await updateUnit(project.id, row.ch._id || row.ch.id, row.unitIndex, { etat: newEtat });
          }
        } else if (row.kind === 'component') {
          await updateComponent(project.id, row.ch._id || row.ch.id, row.unitIndex, row.ci, { etat: newEtat });
        }
      } catch (e) { console.error('Bulk état change failed for', row.rowKey, e); }
    }
    if (refreshProject) await refreshProject(project.id);
    setBulkSaving(false);
    setSelectedKeys(new Set());
  };

  const [ATELIER_TABLES, setAtelierTableOptions] = useState([]);
  useEffect(() => {
    axios.get(`${API_URL}/atelier-tables/names`)
      .then(res => setAtelierTableOptions((res.data || []).slice().sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))))
      .catch(() => setAtelierTableOptions(['Table 1', 'Table 2', 'Table 3', 'Table 4', 'Table 5', 'Table 6', 'Table 7', 'Table 8']));
  }, []);

  // ticket model for the print buttons of the list (Standard / Grand repère), remembered on this computer
  const [labelModel, setLabelModelState] = useLabelModel();
  const startBatchPrint = () => {
    const toPrint = [];
    for (const row of rows) {
      if (!selectedKeys.has(row.rowKey)) continue;
      if (row.kind === 'unit') toPrint.push({ ...row.ch, _printRowIndex: row.unitIndex, _totalQty: row.ch.quantity || 1 });
      else if (row.kind === 'component') { const rl = row.comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${row.ci}`; toPrint.push({ ...row.ch, _printRowIndex: row.unitIndex, _totalQty: row.ch.quantity || 1, _component: { repere: row.comp.repere || rl, roleLabel: rl, largeur: row.comp.largeur, hauteur: row.comp.hauteur } }); }
    }
    if (!toPrint.length) return;
    const html = buildLabelHTML(toPrint, project, chassisLabels, language, labelModel);
    const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); }
  };

  const totalDisplayRows = (project?.chassis || []).reduce((acc, ch) => {
    const keepAsOne = ch.keepAsOne === true || (ch.keepAsOne == null && projectTab === 'laquage');
    return acc + (keepAsOne ? 1 : (ch.quantity || 1));
  }, 0);

  const detailTabs = [
    { key: 'chassis', label: t('tabChassis'), count: totalDisplayRows },
    { key: 'bars', label: t('cons'), count: project?.usedBars?.length || 0 },
    { key: 'bl', label: t('tabBL'), count: null },
    { key: 'barres_laquer', label: t('BarresaLaquer'), count: null },
    { key: 'accessoires_laquer', label: t('AccessoiresaLaquer'), count: null },
    { key: 'documents', label: t('pdocTab'), count: null }, // files fetched only when opened
  ];
  const ROLE_TAB_ACCESS = {
    // Laquage: chassis of every project; état editable only on laquage projects (TAB_CONFIG.stateRoles),
    // read-only badges on aluminium / vitrage projects
    Laquage: ['chassis', 'barres_laquer', 'accessoires_laquer', 'bars', 'documents'],
    BARREMAN: ['barres_laquer', 'documents'],
    Coordinateur: ['chassis', 'barres_laquer', 'accessoires_laquer', 'documents'],
    Magasinier: ['chassis', 'bars', 'accessoires_laquer', 'documents'], // chassis: consultation only
    LOGISTIQUE: ['chassis', 'bl', 'documents'],
    'Coordinateur-vitrage': ['chassis', 'bl', 'documents'],
    // consultation only (read-only accounts): the chassis and the documents (OF, plans…)
    'Chef de chantier': ['chassis', 'documents'],
    'Chef atelier': ['chassis', 'documents'],
  };
  const visibleTabs = adminThing ? detailTabs : detailTabs.filter(sc => (ROLE_TAB_ACCESS[userRole] || []).includes(sc.key));
  // Tab from the URL not allowed for this role (or unknown) → first tab the role can see
  const shownTab = visibleTabs.some(tb => tb.key === activeTab) ? activeTab : (visibleTabs[0]?.key || activeTab);

  const vitrgAdmin = user?.role === 'admin' || user?.role === 'Coordinateur-vitrage';

  // ─── État cell renderer — used for both unit and component rows ──────────────
  /**
   * Renders the état cell:
   * - If the role CAN see a dropdown → show select (possibly disabled)
   * - Otherwise → show a read-only colored badge
   */
  const renderEtatCell = (etat, isSaving, onChangeHandler) => {
    if (stateThing) {
      const allowedEtats = getAllowedEtats(userRole, etat, project);
      // If current etat is not in allowed list (edge case), show it anyway so the value isn't lost
      const displayEtat = allowedEtats.includes(etat) ? etat : etat;
      const disabled = isEtatSelectDisabled(userRole, etat, isSaving);
      return (
        <td data-label={t('pdState')}>
          <select
            className={`etat-select etat-select--${displayEtat}`}
            value={displayEtat}
            disabled={disabled}
            onChange={e => onChangeHandler(e.target.value)}
            style={{ borderLeftColor: ETAT_COLORS[displayEtat] }}
          >
            {/* Always include current etat in options so value is shown */}
            {allowedEtats.includes(etat)
              ? allowedEtats.map(opt => <option key={opt} value={opt}>{t(`etat_${opt}`)}</option>)
              : [<option key={etat} value={etat}>{t(`etat_${etat}`)}</option>, ...allowedEtats.map(opt => <option key={opt} value={opt}>{t(`etat_${opt}`)}</option>)]
            }
          </select>
        </td>
      );
    }
    // Read-only badge for everyone else
    return (
      <td data-label={t('pdState')}>
        <span
          className="etat-badge pd-etat-badge" style={etatTint(etat)}
        >
          {t(`etat_${etat}`)}
        </span>
      </td>
    );
  };
  // ─────────────────────────────────────────────────────────────────────────────
  const stateThingCor = userRole === 'Admin' || ['LOGISTIQUE', 'Coordinateur'].includes(userRole);

  if (!project) {
    return <div className="loading">{t('loading')}</div>;
  }
  return (
    <div className="project-detail">
      <button className="btn-back" onClick={onBack}><StepBack size={15} />{t('backToProjects')}</button>
      <div className="project-detail__header">
        <div className="project-detail__info">
          <div className="project-detail__ral-swatch" style={{ backgroundColor: project.ralColor || 'var(--surface-3)' }} />
          <div>
            <h2 className="project-detail__name">{project.name}</h2>
            <div className="project-detail__meta">
              <span>{t('ref')} <strong>{project.reference}</strong></span>
              <span>{t('ral')} <strong>{project.ralCode}</strong></span>
              <span>{t('date')}: <strong>{dateStr}</strong></span>
              {(project.coupeurIds || []).length > 0 && (
                <span className="project-detail__coupeurs"><Scissors size={13} /> {t('cpCutBy')} : <strong>{project.coupeurIds.map(c => c?.name).filter(Boolean).join(', ')}</strong></span>
              )}
              <span className="project-detail__status" style={{ backgroundColor: statusColor + '1f', color: statusColor, border: `1px solid ${statusColor}59` }}>{t(`status_${project.status}`) || project.status}</span>
              {project.tab && project.tab !== 'aluminium' && (
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 99, fontWeight: 700,
                  background: project.tab === 'laquage' ? 'rgba(251,191,36,.12)' : 'rgba(167,139,250,.12)',
                  color: project.tab === 'laquage' ? 'var(--ink-amber)' : 'var(--ink-violet)',
                  border: `1px solid ${project.tab === 'laquage' ? 'rgba(251,191,36,.3)' : 'rgba(167,139,250,.3)'}`,
                }}>
                  {project.tab === 'laquage' ? <><PaintBucket size={12} /> {t('pdLaquage')}</> : <><AppWindow size={12} /> {t('pdVitrage')}</>}
                </span>
              )}
            </div>
          </div>
        </div>
        {adminThing && (
          <div className="project-detail__header-actions">
            <button className="excel-btn" onClick={() => exportProjectPDF(project, language, chassisLabels, t)}><FileText size={14} /> {t('exportPDF')} — {t('pdChassisWord')}</button>
            <button className="excel-btn" onClick={() => exportBarsPDF(project, language, t)}><FileText size={14} /> {t('exportPDF')} — {t('pdBars')}</button>
            <button className="excel-btn" onClick={() => exportChassisRemplissageExcel(project, chassisLabels, language)}><FileSpreadsheet size={14} /> Excel — {t('pdSheetChassisRemp')}</button>
            <button className="excel-btn" onClick={() => exportDevisExcel(project, chassisLabels, language)}><Banknote size={14} /> Excel — {t('qtSheet')}</button>
          </div>
        )}
      </div>

      <ProjectRemarks project={project} canEdit={canRemark} onSaved={() => refreshProject && refreshProject(project.id)} />

      <ProgressBar chassis={project.chassis} t={t} />

      <div className="project-detail__tabs">
        {visibleTabs.map(tab => (
          <button key={tab.key} className={`project-detail__tab ${shownTab === tab.key ? 'project-detail__tab--active' : ''}`} onClick={() => setActiveTab(tab.key)}>
            {tab.label}{tab.count !== null && <span className="tab-count">{tab.count}</span>}
          </button>
        ))}
      </div>

      {shownTab === 'chassis' && (
        <div className="project-detail__panel">
          <div className="panel-toolbar">
            {adminThing && <button className="add-item-btn" onClick={() => { setEditingChassis(null); setShowChassisForm(true); }}>+ {t('addChassis')}</button>}
            {adminThing && <button className="ct-config-btn" onClick={() => setShowTypeManager(true)}><ShipWheel size={15} /></button>}
            {rows.length > 0 && (canSelectRows || adminVerre) && (
              <div className="selection-toolbar">
                {canSelectRows && (
                  <button className="select-btn" onClick={toggleAll}>
                    {logistiqueSelectableKeys.length > 0 && logistiqueSelectableKeys.every(k => selectedKeys.has(k)) ? t('deselectAll') : t('selectAll')}
                  </button>
                )}

                {selectedKeys.size > 0 && canPrintLabels && (
                  <>
                    <LabelModelSwitch compact value={labelModel} onChange={setLabelModelState} />
                    <button className="print-selected-btn" onClick={startBatchPrint}><Printer size={14} /> {t('printSelected')} ({selectedKeys.size} {t('selectedCount')})</button>
                  </>
                )}
                {selectedKeys.size > 0 && stateThing && (() => {
                  // Determine which états the current user can bulk-set
                  // Use a sample etat to compute allowed (LOGISTIQUE is restricted to pret_a_livrer rows)
                  // For LOGISTIQUE: only show if at least one selected row is pret_a_livrer
                  const selectedRows = rows.filter(r => selectedKeys.has(r.rowKey) && (r.kind === 'unit' || r.kind === 'component'));
                  const canActLogistique = userRole === 'LOGISTIQUE' && selectedRows.some(r => r.etat === 'pret_a_livrer');
                  const canActOther = userRole !== 'LOGISTIQUE';
                  if (!canActLogistique && !canActOther) return null;
                  // Compute allowed états: intersection across all selected rows for this role
                  const sampleEtat = selectedRows[0]?.etat || 'non_entame';
                  const allowed = getAllowedEtats(userRole, sampleEtat, project);
                  const bulkEtats = userRole === 'LOGISTIQUE' ? ['livre'] : allowed.filter(e => e !== 'livre' || userRole === 'Admin');
                  return (
                    <div className="pd-bulk-etat">
                      <span className="pd-bulk-etat__label">
                        Changer état ({selectedKeys.size}) :
                      </span>
                      {bulkEtats.map(opt => (
                        <button
                          key={opt}
                          disabled={bulkSaving}
                          onClick={() => handleBulkEtatChange(opt)}
                          className="pd-etat-badge pd-etat-badge--btn"
                          style={{ ...etatTint(opt), opacity: bulkSaving ? 0.6 : 1 }}
                        >
                          {t('etat_' + opt)}
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {(() => {
                  const allRemp = (project.chassis || []).flatMap(ch => { const numComps = (ch.components || []).length; return (ch.remplissages || []).map(r => ({ r, ch, numComps })); });
                  // remplissage labels: same people as before (not the Chef atelier, who prints the chassis labels only)
                  if (allRemp.length === 0 || !(adminThing || stateThing || adminVerre)) return null;
                  return (
                    <button className="print-selected-btn pd-tone-btn pd-tone-btn--violet" onClick={() => {
                      const byChassisId = {};
                      allRemp.forEach(({ r, ch, numComps }) => { const cid = (ch._id || ch.id).toString(); if (!byChassisId[cid]) byChassisId[cid] = { ch, numComps, remps: [] }; byChassisId[cid].remps.push(r); });
                      const ralHex = project.ralColor || '#cccccc';
                      const dateStr2 = project.date ? new Date(project.date).toLocaleDateString('fr-FR') : '';
                      const unitSuffix2 = (ch, idx) => (ch.quantity || 1) > 1 ? ` #${Number(idx) + 1}` : '';
                      const allPages = Object.values(byChassisId).flatMap(({ ch, remps }) => {
                        const tl = chassisLabels[ch.type]?.[language] || chassisLabels[ch.type]?.fr || ch.type;
                        return remps.map(r => {
                          const compLabel2 = r.compIndex != null ? (() => { const comp = (ch.components || [])[r.compIndex]; return comp ? (comp.repere || (comp.role === 'dormant' ? t('pdDormant') : `${t('pdVantailWord')} ${r.compIndex}`)) : null; })() : null;
                          const rLabel = r.sousType ? `${rempTypeLabel(r.type)} — ${r.sousType}` : rempTypeLabel(r.type);
                          const repere = compLabel2 ? `${ch.repere}${unitSuffix2(ch, r.unitIndex ?? 0)} — ${compLabel2}` : `${ch.repere}${unitSuffix2(ch, r.unitIndex ?? 0)}`;
                          return `<div class="page"><div class="label"><div class="lh"><span class="brand">CAMI ALUMINIUM</span><span class="swatch"></span></div><div class="row"><span class="f"><span class="k">${t('labelProject')}</span><span class="v">${project.name}</span></span><span class="f"><span class="k">${t('labelRef')}</span><span class="v">${project.reference}</span></span></div><div class="row"><span class="f"><span class="k">RAL</span><span class="v">${project.ralCode}</span></span><span class="f"><span class="k">${t('labelDate')}</span><span class="v">${dateStr2}</span></span></div><div class="div"></div><div class="grid"><div class="cell"><span class="k">${t('labelRepere')}</span><span class="repere">${repere}<div class="parent-ref">${tl}</div></span></div><div class="cell"><span class="k">${t('pdRemplissage')}</span><span class="v remp-type">${rLabel}</span></div><div class="cell full"><span class="k">${t('labelDim')}</span><span class="dim">${r.largeur} × ${r.hauteur} mm</span></div></div></div></div>`;
                        });
                      }).join('\n');
                      const closeScript = '<' + '/script>';
                      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title> </title><style>@page{size:9.5cm 5.5cm;margin:0mm}*{margin:0;padding:0;box-sizing:border-box}html,body{width:9.5cm;height:5.5cm;margin:0!important;padding:0!important;background:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{html,body{margin:0!important;padding:0!important}.page{page-break-after:always;page-break-inside:avoid}.page:last-child{page-break-after:avoid}}.page{width:9.5cm;height:5.5cm;overflow:hidden;display:block}.label{width:9.5cm;height:5.5cm;padding:3mm 4mm;display:flex;flex-direction:column;gap:1.2mm;overflow:hidden}.lh{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #1a1a1a;padding-bottom:1.2mm}.brand{font-size:8.5pt;font-weight:900;color:#1a1a1a;letter-spacing:.05em;text-transform:uppercase}.swatch{width:10mm;height:5mm;border-radius:2px;border:1px solid #ccc;background-color:${ralHex};flex-shrink:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}.row{display:flex;gap:6mm}.f{display:flex;gap:2px;align-items:baseline}.k{font-size:5.5pt;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;margin-right:2px}.v{font-size:6.5pt;font-weight:500;color:#1a1a1a}.remp-type{font-size:7pt!important;font-weight:700!important}.div{border-top:1px dashed #ccc;margin:0;flex-shrink:0}.grid{display:grid;grid-template-columns:1fr 1fr;gap:.5mm 2mm;flex:1;min-height:0}.cell{display:flex;flex-direction:column;gap:0mm}.full{grid-column:1/-1}.repere{font-size:12pt;font-weight:900;color:#1a1a1a;letter-spacing:-.02em;line-height:1}.dim{font-size:9.5pt;font-weight:700;color:#1a1a1a;line-height:1.1}.parent-ref{font-size:6pt;font-weight:600;color:#555;margin-top:1mm;line-height:1.2}</style></head><body>${allPages}<script>document.title=' ';window.onload=function(){window.focus();window.print();setTimeout(function(){window.close();},1000)};${closeScript}</body></html>`;
                      const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); }
                    }}>
                      <Tag size={14} /> {t('pdRempLabels', { n: allRemp.length })}
                    </button>
                  );

                })()}
                {/* Bulk remplissage état button — only for Coordinateur-vitrage, Admin, LOGISTIQUE */}
                {
                  (userRole === 'Admin' || userRole === 'Coordinateur-vitrage' ||
                    (userRole === 'LOGISTIQUE' && (project.chassis || []).some(ch => (ch.remplissages || []).some(r => r.etat === 'pret_a_livrer')))
                  ) && (project.chassis || []).some(ch => (ch.remplissages || []).length > 0) && (
                    <button
                      className="print-selected-btn pd-tone-btn pd-tone-btn--cyan"
                      onClick={() => setShowBulkRemplissageModal(true)}
                    >
                      <Layers size={14} /> {t('pdBulkRempBtn')}
                    </button>
                  )
                }
              </div>
            )}
          </div>

          {!project.chassis?.length ? <div className="no-items">{t('noChassis')}</div> : (
            <div className="chassis-table-wrapper">
              <table className="chassis-table">
                <thead>
                  <tr>
                    {canSelectRows && <th style={{ width: 40 }}><input type="checkbox" checked={logistiqueSelectableKeys.length > 0 && logistiqueSelectableKeys.every(k => selectedKeys.has(k))} onChange={toggleAll} /></th>}
                    <th>{t('repere')}</th>
                    <th>{t('type')}</th>
                    <th>{t('largeur')} (mm)</th>
                    <th>{t('hauteur')} (mm)</th>
                    <th>{t('dimension')}</th>
                    <th>m²</th>
                    {/* Remplissage col: aluminium tab only */}
                    {showAtelierCols && <th>{t('remplissage')}</th>}
                    <th>{t('etat')}</th>
                    <th>{t('deliveryDate')}</th>
                    <th>{t('pdRemark')}</th>
                    {/* Atelier / Vitrage cols: aluminium tab only */}
                    {showAtelierCols && <th className="atelier-table-col">{t('pdAtelierTable')}</th>}
                    {showAtelierCols && <th className="atelier-table-col" style={{ color: 'var(--ink-blue)' }}>{t('pdVitrageTable')}</th>}
                    <th>{t('actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {

                    // ── GROUP HEAD ──────────────────────────────────────────
                    if (row.kind === 'groupHead') {
                      const { ch, chId, unitIndex, label, derivedEtat } = row; const rowKey = row.rowKey;
                      const chM2 = ch.largeur && ch.hauteur ? ((ch.largeur * ch.hauteur) / 1e6).toFixed(2) : '—';
                      const allCompsRemp = (ch.remplissages || []).filter(r => (r.unitIndex ?? 0) === unitIndex && r.compIndex !== null);
                      const allCompsCnt = allCompsRemp.length; const allCompsRdy = allCompsRemp.filter(r => REMP_DONE_ETATS.has(r.etat)).length;
                      return (
                        <tr key={rowKey} className="chassis-row chassis-row--group-head">
                          {canSelectRows && <td className="chassis-row__check" />}
                          <td data-label={t('pdRepere')}><strong>{label}</strong><span className="composite-badge" title="Composite">⊞</span></td>
                          <td data-label={t('type')}>{chassisLabels[ch.type]?.[language] || ch.type}</td>
                          <td data-label={t('pdColL')}>{ch.largeur}</td><td data-label={t('pdColH')}>{ch.hauteur}</td>
                          <td data-label={t('pdDimension')} className="dim-cell">{ch.dimension || `${ch.largeur}×${ch.hauteur}`}</td>
                          <td data-label="m²" style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>{chM2} m²</td>
                          {showAtelierCols && (
                            <td data-label={t('pdRemplissage')}>
                              {allCompsCnt > 0
                                ? <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: allCompsRdy === allCompsCnt ? 'var(--success-bg)' : 'var(--warning-bg)', color: allCompsRdy === allCompsCnt ? 'var(--success)' : 'var(--warning)', border: `1px solid ${allCompsRdy === allCompsCnt ? 'var(--success-bd)' : 'var(--warning-bd)'}`, fontWeight: 600 }}>{t(allCompsCnt > 1 ? 'pdReadyMany' : 'pdReadyOne', { a: allCompsRdy, b: allCompsCnt })}</span>
                                : <span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span>}
                            </td>
                          )}
                          {/* Group head: always show read-only derived état badge */}
                          <td data-label={t('pdState')}>
                            <span className="etat-badge pd-etat-badge" style={etatTint(derivedEtat)}>{t(`etat_${derivedEtat}`)}</span>
                          </td>
                          <td data-label={t('date')} className="delivery-date-cell">
                            {(() => {
                              const unit = row.unit;
                              const compDates = (ch.components || []).map((_, ci) => {
                                const cs = (row.unit.componentStates || []).find(c => c.compIndex === ci);
                                return cs?.deliveryDate ? new Date(cs.deliveryDate) : null;
                              }).filter(Boolean);
                              if (compDates.length === 0) return <span className="date-placeholder">—</span>;
                              const lastDate = new Date(Math.max(...compDates.map(d => d.getTime())));
                              const allLivres = ch.components.every((_, ci) => {
                                const cs = (row.unit.componentStates || []).find(c => c.compIndex === ci);
                                return cs?.etat === 'livre';
                              });
                              return (
                                <span className="date-placeholder" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                  {allLivres ? <CalendarDays size={13} /> : <Clock size={13} />}
                                  <span style={{ color: allLivres ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                                    {fmtDate(lastDate)}
                                  </span>
                                  {!allLivres && (
                                    <span style={{ fontSize: 10, color: 'var(--text-4)', marginLeft: 2 }}>({t('pdPartial')})</span>
                                  )}
                                </span>
                              );
                            })()}
                          </td>
                          <RemarkCell remarks={row.unit?.remarks} canAdd={canRemark} onOpen={() => setRemarksFor({ chId, unitIndex, label })} />
                          {showAtelierCols && <td data-label={t('pdAtelierTable')} className="atelier-table-col"><span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span></td>}
                          {showAtelierCols && <td data-label={t('pdVitrageTable')} className="atelier-table-col"><span style={{ color: 'var(--text-4)', fontSize: 11 }}>—</span></td>}
                          <td data-label="">{(adminThing || canPrintOneLabel) && <div className="chassis-row__actions">
                            {adminThing && <button className="edit-btn" onClick={() => { setEditingChassis({ ...ch, _originalId: chId }); setShowChassisForm(true); }}><Pencil size={14} /></button>}
                            {adminOnly && <button className="ct-acc-btn" onClick={() => setAccLineEditor(ch)}><Wrench size={14} /></button>}
                            {adminOnly && (<button className="print-btn" onClick={async () => { let accs = []; try { const r = await axios.get(`${API_URL}/projects/${project.id}/chassis/${chId}/accessories`); accs = r.data || []; } catch { } const html = buildChassisDetailHTML(ch, project, chassisLabels, language, accs, atelierTables[rowKey] || ''); const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } }}><Printer size={14} /></button>)}
                            {canPrintOneLabel && (<button className="print-btn" onClick={() => { const toPrint = ch.components.map((comp, ci) => { const rl = comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${ci}`; return { ...ch, _printRowIndex: unitIndex, _totalQty: ch.quantity || 1, _component: { repere: comp.repere || rl, roleLabel: rl, largeur: comp.largeur, hauteur: comp.hauteur } }; }); const html = buildLabelHTML(toPrint, project, chassisLabels, language, labelModel); const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } }}><Tag size={14} /></button>)}
                            {adminThing && <button className="delete-btn" onClick={() => handleDeleteUnit(ch, unitIndex)}><Trash2 size={14} /></button>}
                          </div>}</td>
                        </tr>
                      );
                    }

                    // ── COMPONENT ROW ───────────────────────────────────────
                    if (row.kind === 'component') {
                      const { ch, chId, unitIndex, comp, ci, rowKey, label, etat } = row;
                      const isSaving = savingKey === rowKey; const isSelected = selectedKeys.has(rowKey); const isSavingTable = savingTableKey === rowKey;
                      const compM2 = comp.largeur && comp.hauteur ? ((comp.largeur * comp.hauteur) / 1e6).toFixed(2) : '—';
                      return (
                        <tr key={rowKey} className={`component-row${isSelected ? ' component-row--selected' : ''}${isSaving ? ' component-row--saving' : ''}`}>
                          {canSelectRows && <td className="chassis-row__check"><input type="checkbox" checked={isSelected} onChange={() => toggleKey(rowKey)} onClick={e => e.stopPropagation()} /></td>}                          <td data-label={t('pdRepere')} className="component-indent"><CornerDownRight size={13} style={{ marginRight: 4, color: 'var(--text-4)' }} /><strong>{label}</strong></td>
                          <td data-label={t('type')} className="component-role">{comp.role === 'dormant' ? t('dormant') : t('vantail')}</td>
                          <td data-label={t('pdColL')}>{comp.largeur || '—'}</td><td data-label={t('pdColH')}>{comp.hauteur || '—'}</td>
                          <td data-label={t('pdDimension')} className="dim-cell">{comp.largeur && comp.hauteur ? `${comp.largeur}×${comp.hauteur}` : '—'}</td>
                          <td data-label="m²" style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>{compM2 !== '—' ? compM2 + ' m²' : '—'}</td>
                          {showAtelierCols && (
                            <td data-label={t('pdRemplissage')}>
                              <RemplissageBadge chassis={ch} unitIndex={unitIndex} compIndex={ci} onClick={() => setRemplissageEditor({ ch, unitIndex, compIndex: ci })} />
                            </td>
                          )}
                          {/* État cell */}
                          {renderEtatCell(etat, isSaving, (newEtat) => handleComponentEtatChange(ch, unitIndex, ci, newEtat, rowKey))}
                          <td data-label={t('date')} className="delivery-date-cell">
                            {(() => {
                              const cs = (row.unit.componentStates || []).find(c => c.compIndex === ci);
                              const compEtat = cs?.etat || 'non_entame';
                              const compDate = cs?.deliveryDate;
                              if (compEtat === 'livre') {
                                return (userRole === 'Admin' || userRole === 'LOGISTIQUE')
                                  ? <button className="date-btn" onClick={() => setDeliveryModal({ kind: 'component', chId, unitIndex, ci, rowKey, currentDate: toDateInput(compDate) })}>
                                    <CalendarDays size={13} /> {compDate ? fmtDate(compDate) : t('pdSet')}
                                  </button>
                                  : <span className="date-placeholder"><CalendarDays size={13} /> {compDate ? fmtDate(compDate) : '—'}</span>;
                              }
                              return <span className="date-placeholder">—</span>;
                            })()}
                          </td>
                          <td data-label={t('pdRemark')} className="remark-cell" />
                          {showAtelierCols && (
                            <td data-label={t('pdAtelierTable')} className="atelier-table-col">
                              {canEditAtelierTable ? (
                                <select className={`etat-select etat-select--livre atelier-select${isSavingTable ? ' atelier-select--saving' : ''}`} value={atelierTables[rowKey] || ''} disabled={isSavingTable} onChange={e => handleAtelierTableChange(ch, unitIndex, e.target.value, rowKey, ci)}>
                                  <option value="">——</option>
                                  {ATELIER_TABLES.map(tbl => <option key={tbl} value={tbl}>{tbl}</option>)}
                                </select>
                              ) : (
                                <span className="etat-select etat-select--livre atelier-select">{atelierTables[rowKey] || <span style={{ color: 'var(--text-4)' }}>—</span>}</span>
                              )}
                            </td>
                          )}
                          {showAtelierCols && (
                            <td data-label={t('pdVitrageTable')} className="atelier-table-col">
                              {canEditRemplissageTable ? (
                                <RemplissageAtelierCell chassis={ch} unitIndex={unitIndex} compIndex={ci} project={project} atelierTableOptions={ATELIER_TABLES} onPatched={() => { if (refreshProject) refreshProject(project.id); }} />
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                  {(() => { const relevant = (ch.remplissages || []).filter(r => (r.unitIndex ?? 0) === unitIndex && r.compIndex === ci && r.atelierTable); const tables = [...new Set(relevant.map(r => r.atelierTable))]; return tables.length ? tables.join(', ') : <span style={{ color: 'var(--text-4)' }}>—</span>; })()}
                                </span>
                              )}
                            </td>
                          )}
                          <td data-label="">{canPrintLabels && <div className="chassis-row__actions">
                            <button className="print-btn" onClick={() => { const rl = comp.role === 'dormant' ? t('dormant') : `${t('vantail')} ${ci}`; setPrintingChassis({ ...ch, _printRowIndex: unitIndex, _totalQty: ch.quantity || 1, _component: { repere: comp.repere || rl, roleLabel: rl, largeur: comp.largeur, hauteur: comp.hauteur } }); }}><Tag size={14} /></button>
                          </div>}</td>
                        </tr>
                      );
                    }

                    // ── SIMPLE UNIT ROW ─────────────────────────────────────
                    const { ch, chId, unitIndex, unit, rowKey, label, etat } = row;
                    const isSaving = savingKey === rowKey; const isSelected = selectedKeys.has(rowKey);
                    const unitM2 = ch.largeur && ch.hauteur ? ((ch.largeur * ch.hauteur) / 1e6).toFixed(2) : '—';
                    return (
                      <tr key={rowKey} className={`chassis-row${isSelected ? ' chassis-row--selected' : ''}${isSaving ? ' chassis-row--saving' : ''}`}>
                        {canSelectRows && <td className="chassis-row__check"><input type="checkbox" checked={isSelected} onChange={() => toggleKey(rowKey)} onClick={e => e.stopPropagation()} /></td>}
                        <td data-label={t('pdRepere')}>
                          <strong>{label}</strong>
                          {ch.keepAsOne && (ch.quantity || 1) > 1 && (
                            <span style={{
                              marginLeft: 6, fontSize: 11, fontWeight: 700,
                              background: 'var(--surface-3)', color: 'var(--text)',
                              border: '1px solid var(--border-2)', borderRadius: 999,
                              padding: '1px 6px', whiteSpace: 'nowrap',
                            }}>
                              ×{ch.quantity}
                            </span>
                          )}
                        </td>
                        <td data-label={t('type')}>{chassisLabels[ch.type]?.[language] || ch.type}</td>
                        <td data-label={t('pdColL')}>{ch.largeur}</td><td data-label={t('pdColH')}>{ch.hauteur}</td>
                        <td data-label={t('pdDimension')} className="dim-cell">{ch.dimension || `${ch.largeur}×${ch.hauteur}`}</td>
                        <td data-label="m²" style={{ fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>{unitM2} m²</td>
                        {showAtelierCols && (
                          <td data-label={t('pdRemplissage')}>
                            <RemplissageBadge chassis={ch} unitIndex={unitIndex} compIndex={null} onClick={() => setRemplissageEditor({ ch, unitIndex, compIndex: null })} />
                          </td>
                        )}
                        {/* État cell */}
                        {(() => {
                          const keepAsOne = ch.keepAsOne === true || (ch.keepAsOne == null && projectTab === 'laquage');
                          const qtyN = ch.quantity || 1;
                          if (keepAsOne && qtyN > 1 && (adminThing || stateThing)) {
                            return (
                              <td data-label={t('pdState')}>
                                <EtatBreakdownBadge ch={ch} etatList={tabCfg.etats} t={t} onClick={() => setGroupStatesModal(ch)} />
                              </td>
                            );
                          }
                          return renderEtatCell(etat, isSaving, (newEtat) => handleUnitEtatChange(ch, unitIndex, newEtat, rowKey));
                        })()}
                        <td data-label={t('date')} className="delivery-date-cell">
                          {etat === 'livre'
                            ? (userRole === 'Admin' || userRole === 'LOGISTIQUE')
                              ? <button className="date-btn" onClick={() => setDeliveryModal({ kind: 'unit', chId, unitIndex, rowKey, currentDate: toDateInput(unit.deliveryDate) })}><CalendarDays size={13} /> {unit.deliveryDate ? fmtDate(unit.deliveryDate) : t('pdSet')}</button>
                              : <span className="date-placeholder"><CalendarDays size={13} /> {unit.deliveryDate ? fmtDate(unit.deliveryDate) : '—'}</span>
                            : <span className="date-placeholder">—</span>}
                        </td>
                        <RemarkCell remarks={unit?.remarks} canAdd={canRemark} onOpen={() => setRemarksFor({ chId, unitIndex, label })} />
                        {showAtelierCols && (
                          <td data-label={t('pdAtelierTable')} className="atelier-table-col">
                            {canEditAtelierTable ? (
                              <select className={`etat-select etat-select--livre atelier-select${savingTableKey === rowKey ? ' atelier-select--saving' : ''}`} value={atelierTables[rowKey] || ''} disabled={savingTableKey === rowKey} onChange={e => handleAtelierTableChange(ch, unitIndex, e.target.value, rowKey)}>
                                <option value="">——</option>
                                {ATELIER_TABLES.map(tbl => <option key={tbl} value={tbl}>{tbl}</option>)}
                              </select>
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                {atelierTables[rowKey] || <span style={{ color: 'var(--text-4)' }}>—</span>}
                              </span>
                            )}
                          </td>
                        )}
                        {showAtelierCols && (
                          <td data-label={t('pdVitrageTable')} className="atelier-table-col">
                            {canEditRemplissageTable ? (
                              <RemplissageAtelierCell chassis={ch} unitIndex={unitIndex} compIndex={null} project={project} atelierTableOptions={ATELIER_TABLES} onPatched={() => { if (refreshProject) refreshProject(project.id); }} />
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>
                                {(() => { const relevant = (ch.remplissages || []).filter(r => (r.unitIndex ?? 0) === unitIndex && r.compIndex == null && r.atelierTable); const tables = [...new Set(relevant.map(r => r.atelierTable))]; return tables.length ? tables.join(', ') : <span style={{ color: 'var(--text-4)' }}>—</span>; })()}
                              </span>
                            )}
                          </td>
                        )}
                        <td data-label="">{(adminThing || canPrintOneLabel) && <div className="chassis-row__actions">
                          {adminThing && <button className="edit-btn" onClick={() => {
                            const keepAsOne = ch.keepAsOne === true || (ch.keepAsOne == null && projectTab === 'laquage');
                            setEditingChassis({
                              ...ch,
                              quantity: keepAsOne ? (ch.quantity ?? 1) : 1,
                              etat,
                              _originalId: chId,
                              _unitIndex: unitIndex,
                              _totalQty: ch.quantity ?? 1,
                            }); setShowChassisForm(true);
                          }}><Pencil size={14} /></button>}
                          {adminOnly && <button className="ct-acc-btn" onClick={() => setAccLineEditor(ch)}><Wrench size={14} /></button>}
                          {adminOnly && (<button className="print-btn" onClick={async () => { let accs = []; try { const r = await axios.get(`${API_URL}/projects/${project.id}/chassis/${chId}/accessories`); accs = r.data || []; } catch { } const html = buildChassisDetailHTML(ch, project, chassisLabels, language, accs, atelierTables[rowKey] || ''); const w = window.open('', '_blank'); if (w) { w.document.write(html); w.document.close(); } }}><Printer size={14} /></button>)}
                          {canPrintOneLabel && (<button className="print-btn" onClick={() => setPrintingChassis({ ...ch, _printRowIndex: unitIndex })}><Tag size={14} /></button>)}
                          {adminThing && <button className="delete-btn" onClick={() => handleDeleteUnit(ch, unitIndex)}><Trash2 size={14} /></button>}
                        </div>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {shownTab === 'bars' && <UsedBarsPanel project={project} />}
      {shownTab === 'bl' && <div className="project-detail__panel"><BLPanel project={project} t={t} language={language} /></div>}
      {shownTab === 'barres_laquer' && <div className="project-detail__panel"><BarresLaquerPanel project={project} currentUser={currentUser} /></div>}
      {shownTab === 'accessoires_laquer' && <div className="project-detail__panel"><AccessoiresLaquerPanel project={project} currentUser={currentUser} /></div>}
      {shownTab === 'documents' && <div className="project-detail__panel"><ProjectDocuments project={project} /></div>}

      {showChassisForm && <ChassisForm chassis={editingChassis} projectId={project.id} projectTab={projectTab} onClose={() => { setShowChassisForm(false); setEditingChassis(null); }} onSave={() => { setShowChassisForm(false); setEditingChassis(null); }} />}
      {showTypeManager && <ChassisTypeManager onClose={() => setShowTypeManager(false)} />}
      {remarksFor && <ChassisRemarksModal project={project} {...remarksFor} canAdd={canRemark} onClose={() => setRemarksFor(null)} />}
      {printingChassis && <LabelPrint chassis={printingChassis} project={project} chassisLabels={chassisLabels} onClose={() => setPrintingChassis(null)} />}
      {deliveryModal && <DeliveryDateModal defaultDate={deliveryModal.currentDate} onConfirm={handleDeliveryConfirm} onCancel={() => setDeliveryModal(null)} t={t} />}
      {accLineEditor && <ChassisLineAccessoryEditor chassis={accLineEditor} project={project} onClose={() => setAccLineEditor(null)} onSaved={() => { if (refreshProject) refreshProject(project.id); }} />}
      {remplissageEditor && (
        <RemplissageModal
          chassis={remplissageEditor.ch}
          unitIndex={remplissageEditor.unitIndex}
          compIndex={remplissageEditor.compIndex ?? null}
          project={project}
          chassisLabels={chassisLabels}
          language={language}
          onClose={() => setRemplissageEditor(null)}
          onSaved={() => { if (refreshProject) refreshProject(project.id); }}
        />
      )}
      {groupStatesModal && (
        <GroupUnitStatesModal
          chassis={groupStatesModal}
          project={project}
          onClose={() => setGroupStatesModal(null)}
          onSaved={() => { if (refreshProject) refreshProject(project.id); }}
        />
      )}
      {showAccExport && <AccessoriesExportModal project={project} chassisLabels={chassisLabels} language={language} t={t} onClose={() => setShowAccExport(false)} />}
      {showBulkRemplissageModal && (
        <BulkRemplissageModal
          project={project}
          onClose={() => setShowBulkRemplissageModal(false)}
          onSaved={() => { if (refreshProject) refreshProject(project.id); }}
        />
      )}
    </div>
  );
}

export { STATIC_LABELS as CHASSIS_LABELS };
export default ProjectDetail;