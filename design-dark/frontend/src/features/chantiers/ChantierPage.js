import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    HardHat, Users, Calendar, Package, Plus, Edit2, Trash2,
    X, Check, Layers, ArrowRight, BarChart2, Wrench,
    ClipboardList, Box, FileText, ChevronLeft, StepBack, Camera, Image, ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { dialog } from '../../components/common/dialog';
import { useCompany } from '../../context/CompanyContext';
import './ChantierPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// ─── Cloudinary config (safe to hardcode — unsigned preset) ──────────────────
const CLOUDINARY_CLOUD_NAME = 'dt3mnmu8d';
const CLOUDINARY_UPLOAD_PRESET = 'CAMICHANTIER';

async function uploadToCloudinary(file) {
    const data = new FormData();
    data.append('file', file);
    data.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
        { method: 'POST', body: data }
    );
    if (!res.ok) throw new Error(`Cloudinary ${res.status}`);
    const json = await res.json();
    return json.secure_url;
}

// ─── Static data cache (survives re-renders, loaded once per session) ─────────
const _staticCache = { chantierStates: null, chassisTypes: null };

// ─── Projects cache (lazy — only fetched when the chantier form actually needs it) ─
const _projectsCache = { data: null };

// ─── Camera Cell Component ────────────────────────────────────────────────────
function CameraCell({ chassisId, unitIndex, chantier, authFetch, onPhotoAdded, onPhotoDeleted }) {
    const { t } = useLanguage();
    const [uploading, setUploading] = useState(false);
    const [lightbox, setLightbox] = useState(null);
    const inputRef = useRef(null);

    const existing = useMemo(() =>
        (chantier.unitPhotos || []).filter(
            p => p.chassisId === chassisId && p.unitIndex === unitIndex
        ),
        [chantier.unitPhotos, chassisId, unitIndex]
    );

    const handleCapture = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const url = await uploadToCloudinary(file);
            await authFetch(`${API_URL}/chantiers/${chantier.id}/unit-photo`, {
                method: 'POST',
                body: JSON.stringify({ chassisId, unitIndex, url }),
            });
            // Optimistic: notify parent with new photo entry
            onPhotoAdded && onPhotoAdded({ chassisId, unitIndex, url });
        } catch (err) {
            dialog.alert(t('errUpload', { msg: err.message || t('chUploadFailed') }));
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    const handleDelete = async (url) => {
        await authFetch(`${API_URL}/chantiers/${chantier.id}/unit-photo`, {
            method: 'DELETE',
            body: JSON.stringify({ url }),
        });
        onPhotoDeleted && onPhotoDeleted(url);
        const remaining = existing.filter(p => p.url !== url);
        if (remaining.length === 0) setLightbox(null);
        else setLightbox(remaining);
    };

    return (
        <div className="ch-camera-cell">
            <label className={`ch-camera-btn ${uploading ? 'uploading' : ''}`} title={t('chTakePhoto')}>
                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={handleCapture}
                    disabled={uploading}
                />
                {uploading
                    ? <span className="ch-camera-spinner" />
                    : <Camera size={14} />
                }
            </label>

            {existing.length > 0 && (
                <button
                    className="ch-camera-count"
                    title={t('chPhotos', { n: existing.length })}
                    onClick={() => setLightbox(existing)}
                    type="button"
                >
                    <Image size={12} />
                    <span>{existing.length}</span>
                </button>
            )}

            {lightbox && (
                <PhotoLightbox
                    photos={lightbox}
                    onClose={() => setLightbox(null)}
                    onDelete={handleDelete}
                />
            )}
        </div>
    );
}

// ─── Photo Lightbox ───────────────────────────────────────────────────────────
function PhotoLightbox({ photos, onClose, onDelete }) {
    const { t } = useLanguage();
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleDelete = async () => {
        if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('chDeletePhotoConfirm'), danger: true, confirmLabel: t('deleteAction') }))) return;
        onDelete(photos[idx].url);
    };

    return (
        <div className="ch-lightbox-overlay" onClick={onClose}>
            <div className="ch-lightbox" onClick={e => e.stopPropagation()}>
                <div className="ch-lightbox-topbar">
                    <button className="ch-lightbox-delete" onClick={handleDelete} title={t('chDeletePhoto')}>
                        <Trash2 size={14} /> {t('delete')}
                    </button>
                    <button className="ch-lightbox-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="ch-lightbox-img-wrap">
                    <img src={photos[idx].url} alt={t('chPhotoN', { n: idx + 1 })} className="ch-lightbox-img" />
                </div>
                {photos.length > 1 && (
                    <div className="ch-lightbox-nav">
                        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>‹</button>
                        <span>{idx + 1} / {photos.length}</span>
                        <button onClick={() => setIdx(i => Math.min(photos.length - 1, i + 1))} disabled={idx === photos.length - 1}>›</button>
                    </div>
                )}
                <a href={photos[idx].url} target="_blank" rel="noopener noreferrer" className="ch-lightbox-open">
                    <ExternalLink size={13} /> {t('chOpenNewTab')}
                </a>
            </div>
        </div>
    );
}

const CHANTIER_STATUS_META = {
    planifie: { label: 'chStPlanifie', color: '#a1a1aa', bg: 'rgba(161,161,170,.12)' },
    en_cours: { label: 'chStEnCours', color: '#fbbf24', bg: 'rgba(251,191,36,.12)' },
    suspendu: { label: 'chStSuspendu', color: '#f87171', bg: 'rgba(248,113,113,.12)' },
    cloture: { label: 'chStCloture', color: '#4ade80', bg: 'rgba(74,222,128,.12)' },
};

function fmt(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChantierPage() {
    const { authFetch, can, user } = useAuth();
    const { t } = useLanguage();
    const isAdmin = user?.role === 'Admin' || can('chantiers.edit');

    const [chantiers, setChantiers] = useState([]);
    // Projects: lazily loaded only when the chantier form modal needs them (assign-projects picker)
    const [projects, setProjects] = useState(_projectsCache.data || []);
    const [projectsLoading, setProjectsLoading] = useState(false);
    const [teams, setTeams] = useState([]);
    // Static data: fetched once and cached
    const [chantierStates, setChantierStates] = useState(_staticCache.chantierStates || []);
    const [chassisTypes, setChassisTypes] = useState(_staticCache.chassisTypes || []);
    const [loading, setLoading] = useState(true);

    const [view, setView] = useState('chantiers');
    const [detailId, setDetailId] = useState(null);
    const [teamPanel, setTeamPanel] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editItem, setEditItem] = useState(null);

    // ── Load dynamic data only (chantiers/teams) — NOT projects, those are lazy ──
    const loadDynamic = useCallback(async () => {
        try {
            const [cRes, tRes] = await Promise.all([
                authFetch(`${API_URL}/chantiers`),
                authFetch(`${API_URL}/teams`),
            ]);
            const [ch, tm] = await Promise.all([cRes.json(), tRes.json()]);
            setChantiers(Array.isArray(ch) ? ch : []);
            setTeams(Array.isArray(tm) ? tm : []);
        } catch (e) { console.error(e); }
    }, [authFetch]);

    // ── Load static data once, use cache on subsequent mounts ─────────────────
    const loadStatic = useCallback(async () => {
        if (_staticCache.chantierStates && _staticCache.chassisTypes) return; // already cached
        try {
            const [sRes, ctRes] = await Promise.all([
                authFetch(`${API_URL}/chantier-states`),
                authFetch(`${API_URL}/chassis-types`),
            ]);
            const [st, cts] = await Promise.all([sRes.json(), ctRes.json()]);
            _staticCache.chantierStates = Array.isArray(st) ? st : [];
            _staticCache.chassisTypes = Array.isArray(cts) ? cts : [];
            setChantierStates(_staticCache.chantierStates);
            setChassisTypes(_staticCache.chassisTypes);
        } catch (e) { console.error(e); }
    }, [authFetch]);

    // ── Lazy projects load — only called right before the form modal opens ────
    // Uses the lean /api/projects/lite route (no chassis payload) and caches
    // the result for the rest of the session so re-opening the form is instant.
    const ensureProjectsLoaded = useCallback(async () => {
        if (_projectsCache.data) { setProjects(_projectsCache.data); return; }
        setProjectsLoading(true);
        try {
            const res = await authFetch(`${API_URL}/projects/lite`);
            const data = await res.json();
            _projectsCache.data = Array.isArray(data) ? data : [];
            setProjects(_projectsCache.data);
        } catch (e) { console.error(e); }
        finally { setProjectsLoading(false); }
    }, [authFetch]);

    // ── Full initial load (no projects here — kept fast) ──────────────────────
    const load = useCallback(async () => {
        setLoading(true);
        await Promise.all([loadDynamic(), loadStatic()]);
        setLoading(false);
    }, [loadDynamic, loadStatic]);

    useEffect(() => { load(); }, [load]);

    const deleteChantier = async (id) => {
        const ch = chantiers.find(c => c.id === id);
        if (!(await dialog.confirm({ title: t('deleteTitle'), message: t('chDeleteConfirm', { name: ch?.name || '' }), danger: true, confirmLabel: t('deleteAction') }))) return;
        const r = await authFetch(`${API_URL}/chantiers/${id}`, { method: 'DELETE' });
        if (!r.ok) { const d = await r.json().catch(() => ({})); dialog.alert(d.error || t('errDelete')); return; }
        setView('chantiers'); setDetailId(null);
        setChantiers(prev => prev.filter(c => c.id !== id));
    };

    // ── Open form helpers: trigger the lazy projects fetch right as the modal opens ──
    const openNewChantier = useCallback(() => {
        setEditItem(null);
        setShowForm(true);
        ensureProjectsLoaded();
    }, [ensureProjectsLoaded]);

    const openEditChantier = useCallback((chantier) => {
        setEditItem(chantier);
        setShowForm(true);
        ensureProjectsLoaded();
    }, [ensureProjectsLoaded]);

    const adminThing = user?.role === 'Admin';
    const defaultState = useMemo(
        () => chantierStates.find(s => s.isDefault) || chantierStates[0],
        [chantierStates]
    );
    const detailChantier = chantiers.find(c => c.id === detailId);

    // ── Optimistic chantier patch: update a single chantier in state ───────────
    const patchChantier = useCallback((id, patchFn) => {
        setChantiers(prev => prev.map(c => c.id === id ? patchFn(c) : c));
    }, []);

    if (view === 'team_stock' && teamPanel) {
        return (
            <TeamStockPanel
                team={teamPanel}
                chantiers={chantiers}
                authFetch={authFetch}
                isAdmin={isAdmin}
                onBack={() => { setView('teams'); setTeamPanel(null); loadDynamic(); }}
            />
        );
    }

    if (view === 'detail' && detailChantier) {
        return (
            <ChantierDetail
                chantier={detailChantier}
                teams={teams}
                projects={projects}
                chantierStates={chantierStates}
                chassisTypes={chassisTypes}
                defaultState={defaultState}
                isAdmin={isAdmin}
                authFetch={authFetch}
                onBack={() => { setView('chantiers'); setDetailId(null); loadDynamic(); }}
                onEdit={() => openEditChantier(detailChantier)}
                onDelete={() => deleteChantier(detailChantier.id)}
                onRefreshFull={loadDynamic}
                patchChantier={patchChantier}
                showForm={showForm}
                editItem={editItem}
                onCloseForm={() => { setShowForm(false); setEditItem(null); loadDynamic(); }}
            />
        );
    }

    return (
        <div className="ch-page">
            <div className="ch-page__header">
                <div className="ch-page__header-left">
                    <span className="ch-page__icon"><HardHat size={20} strokeWidth={2} /></span>
                    <h2 className="ch-page__title">{t('chTitle')}</h2>
                    <span className="ch-page__count">{view === 'teams' ? teams.length : chantiers.length}</span>
                </div>
                <div className="ch-page__header-right">
                    {adminThing && (
                        <button className="ch-new-btn" onClick={openNewChantier}>
                            <Plus size={15} /> {t('chNew')}
                        </button>
                    )}
                    <div className="ch-tab-toggle">
                        <button className={`ch-tab-btn ${view === 'chantiers' ? 'active' : ''}`} onClick={() => setView('chantiers')}>
                            <ClipboardList size={13} /> {t('chTabChantiers')}
                        </button>
                        <button className={`ch-tab-btn ${view === 'teams' ? 'active' : ''}`} onClick={() => setView('teams')}>
                            <Users size={13} /> {t('chTabTeams')}
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="ch-loading">{t('loadingShort')}</div>
            ) : view === 'chantiers' ? (
                chantiers.length === 0 ? (
                    <div className="ch-empty-page">
                        <span className="ch-empty-icon"><HardHat size={20} strokeWidth={1.8} /></span>
                        <p>{t('chNone')}</p>
                        {adminThing && (
                            <button className="ch-new-btn" onClick={openNewChantier}>{t('chCreate')}</button>
                        )}
                    </div>
                ) : (
                    <div className="ch-cards-grid">
                        {chantiers.map(ch => (
                            <ChantierGridCard
                                key={ch.id}
                                chantier={ch}
                                teams={teams}
                                chantierStates={chantierStates}
                                isAdmin={isAdmin}
                                onClick={() => { setDetailId(ch.id); setView('detail'); }}
                                onEdit={e => { e.stopPropagation(); openEditChantier(ch); }}
                                onDelete={e => { e.stopPropagation(); deleteChantier(ch.id); }}
                            />
                        ))}
                    </div>
                )
            ) : (
                teams.length === 0 ? (
                    <div className="ch-empty-page">
                        <span className="ch-empty-icon"><Users size={20} strokeWidth={1.8} /></span>
                        <p>{t('chNoTeam')}</p>
                    </div>
                ) : (
                    <div className="ch-cards-grid">
                        {teams.map(team => (
                            <TeamCard
                                key={team.id}
                                team={team}
                                chantiers={chantiers.filter(c => (c.teamId?.id || c.teamId) === team.id)}
                                onViewStock={() => { setTeamPanel(team); setView('team_stock'); }}
                            />
                        ))}
                    </div>
                )
            )}

            {showForm && view !== 'detail' && (
                <ChantierFormModal
                    chantier={editItem}
                    projects={projects}
                    projectsLoading={projectsLoading}
                    teams={teams}
                    isAdmin={isAdmin}
                    authFetch={authFetch}
                    onClose={() => { setShowForm(false); setEditItem(null); }}
                    onSave={() => { setShowForm(false); setEditItem(null); loadDynamic(); }}
                />
            )}
        </div>
    );
}

// ─── Chantier Grid Card ───────────────────────────────────────────────────────
function ChantierGridCard({ chantier, teams, chantierStates, isAdmin, onClick, onEdit, onDelete }) {
    const { t } = useLanguage();
    const meta = CHANTIER_STATUS_META[chantier.status] || CHANTIER_STATUS_META.planifie;
    const team = teams.find(t => t.id === (chantier.teamId?.id || chantier.teamId));
    const assignedProjects = chantier.projectIds || [];
    const { user } = useAuth();
    const adminThing = user?.role === 'Admin';

    const { stateCounts, totalUnits } = useMemo(() => {
        const counts = {};
        let total = 0;
        assignedProjects.forEach(proj => {
            (proj.chassis || []).forEach(ch => {
                const chId = ch._id || ch.id;
                const qty = ch.quantity || 1;
                const isComposite = (ch.components || []).length > 0;
                for (let i = 0; i < qty; i++) {
                    const unit = (ch.units || []).find(u => u.unitIndex === i);
                    if (!unit) continue;
                    const isLivre = isComposite
                        ? (ch.components || []).every((_, ci) => {
                            const cs = (unit.componentStates || []).find(c => c.compIndex === ci);
                            return cs?.etat === 'livre';
                        })
                        : unit.etat === 'livre';
                    if (!isLivre) continue;
                    const us = (chantier.unitStates || []).find(u => u.chassisId === chId && u.unitIndex === i);
                    const key = us?.stateKey || (chantierStates.find(s => s.isDefault)?.key || 'non_pose');
                    counts[key] = (counts[key] || 0) + 1;
                    total++;
                }
            });
        });
        return { stateCounts: counts, totalUnits: total };
    }, [assignedProjects, chantier.unitStates, chantierStates]);

    return (
        <div className="ch-card" onClick={onClick}>
            <div className="ch-card__accent" style={{ background: meta.color }} />
            <div className="ch-card__inner">
                <div className="ch-card__head">
                    <div>
                        <h3 className="ch-card__name">{chantier.name}</h3>
                        <span className="ch-card__ref">{chantier.reference}</span>
                    </div>
                    <span className="ch-card__status-pill" style={{ color: meta.color, background: meta.bg }}>{t(meta.label)}</span>
                </div>
                <div className="ch-card__rows">
                    {team && (
                        <div className="ch-card__row">
                            <Users size={12} />
                            <span className="ch-team-chip"><span className="ch-team-dot" style={{ background: team.color }} />{team.name}</span>
                        </div>
                    )}
                    <div className="ch-card__row">
                        <Calendar size={12} />
                        <span>{fmt(chantier.dateDebut)}</span>
                        <ArrowRight size={10} className="ch-card__arrow" />
                        <span>{fmt(chantier.dateCloture)}</span>
                    </div>
                    <div className="ch-card__row">
                        <Layers size={12} />
                        <span>{t('chCardSummary', { p: assignedProjects.length, u: totalUnits })}</span>
                    </div>
                </div>
                {totalUnits > 0 && (
                    <div className="ch-card__progress">
                        {chantierStates.filter(s => stateCounts[s.key]).map(s => (
                            <div key={s.key} className="ch-card__progress-seg"
                                style={{ background: s.color, flex: stateCounts[s.key] }}
                                title={`${s.label}: ${stateCounts[s.key]}`}
                            />
                        ))}
                    </div>
                )}
                {chantier.notes && <p className="ch-card__notes">{chantier.notes}</p>}
            </div>
            <div className="ch-card__actions" onClick={e => e.stopPropagation()}>
                <button className="ch-card__act" onClick={onEdit} title={t('edit')}><Edit2 size={13} /></button>
                {adminThing && (
                    <button className="ch-card__act danger" onClick={onDelete} title={t('delete')}><Trash2 size={13} /></button>
                )}
            </div>
        </div>
    );
}

// ─── Chantier Detail View ─────────────────────────────────────────────────────
function ChantierDetail({
    chantier, teams, projects, chantierStates, chassisTypes, defaultState,
    isAdmin, authFetch, onBack, onEdit, onDelete, onRefreshFull, patchChantier,
    showForm, editItem, onCloseForm
}) {
    const { t } = useLanguage();
    const meta = CHANTIER_STATUS_META[chantier.status] || CHANTIER_STATUS_META.planifie;
    const team = teams.find(t => t.id === (chantier.teamId?.id || chantier.teamId));
    const assignedProjects = chantier.projectIds || [];
    const { user } = useAuth();
    const adminThing = user?.role === "Admin";

    return (
        <div className="ch-detail">
            <div className="ch-detail__topbar">
                <button className="ch-back-btn" onClick={onBack}>
                    <StepBack size={15} /> {t('chBack')}
                </button>
                {isAdmin && (
                    <div className="ch-detail__actions">
                        <button className="ch-icon-btn" onClick={onEdit}><Edit2 size={15} /> {t('edit')}</button>
                        {adminThing &&
                            <button className="ch-icon-btn danger" onClick={onDelete}><Trash2 size={15} /> {t('delete')}</button>
                        }
                    </div>
                )}
            </div>

            <div className="ch-detail__hero" style={{ borderLeftColor: meta.color }}>
                <div className="ch-detail__hero-top">
                    <div>
                        <h1 className="ch-detail__name">{chantier.name}</h1>
                        <span className="ch-detail__ref">{chantier.reference}</span>
                    </div>
                    <span className="ch-detail__status-pill" style={{ color: meta.color, background: meta.bg }}>{t(meta.label)}</span>
                </div>
                <div className="ch-detail__meta-row">
                    {team && <span className="ch-detail__meta-item ch-detail__meta-item--team"><span className="ch-team-dot" style={{ background: team.color }} /> {team.name}</span>}
                    <span className="ch-detail__meta-item"><Calendar size={13} /> {fmt(chantier.dateDebut)} → {fmt(chantier.dateCloture)}</span>
                    <span className="ch-detail__meta-item"><Layers size={13} /> {t('chProjects', { n: assignedProjects.length })}</span>
                </div>
                {chantier.notes && <p className="ch-detail__notes">{chantier.notes}</p>}
            </div>

            <div className="ch-detail__content">
                {assignedProjects.length === 0 ? (
                    <div className="ch-empty-page ch-empty-page--sm">
                        <span className="ch-empty-icon"><Layers size={20} strokeWidth={1.8} /></span>
                        <p>{t('chNoProject')}</p>
                    </div>
                ) : assignedProjects.map(proj => (
                    <ChantierProjectBlock
                        key={proj.id || proj}
                        project={proj}
                        chantier={chantier}
                        chantierStates={chantierStates}
                        chassisTypes={chassisTypes}
                        defaultState={defaultState}
                        isAdmin={isAdmin}
                        authFetch={authFetch}
                        patchChantier={patchChantier}
                    />
                ))}
            </div>

            {showForm && (
                <ChantierFormModal
                    chantier={editItem}
                    projects={projects}
                    teams={teams}
                    isAdmin={isAdmin}
                    authFetch={authFetch}
                    onClose={onCloseForm}
                    onSave={onCloseForm}
                />
            )}
        </div>
    );
}

// ─── helpers ─────────────────────────────────────────────────────────────────
function getChassisTypeLabel(chassisTypes, typeValue) {
    const ct = chassisTypes.find(t => t.value === typeValue || t.fr === typeValue || t.id === typeValue);
    return ct ? (ct.fr || ct.value || typeValue) : typeValue;
}

function deriveCompositeChantierState(unitStates, chassisId, unitIndex, numComponents, chantierStates, defaultState) {
    if (!numComponents) return defaultState;
    const compStates = [];
    for (let ci = 0; ci < numComponents; ci++) {
        const compKey = `${chassisId}__comp__${ci}__${unitIndex}`;
        const us = unitStates.find(u => u.chassisId === compKey);
        compStates.push(us?.stateKey || defaultState?.key);
    }
    if (compStates.every(k => k === compStates[0])) {
        return chantierStates.find(s => s.key === compStates[0]) || defaultState;
    }
    const inProgress = chantierStates.find(s => s.key === 'en_cours_de_pose');
    if (inProgress) return inProgress;
    const nonDefault = compStates.filter(k => k !== defaultState?.key);
    if (nonDefault.length > 0) {
        const sorted = chantierStates.filter(s => nonDefault.includes(s.key)).sort((a, b) => (a.order || 0) - (b.order || 0));
        return sorted[0] || defaultState;
    }
    return defaultState;
}

// ─── Project block ────────────────────────────────────────────────────────────
function ChantierProjectBlock({ project, chantier, chantierStates, defaultState, isAdmin, authFetch, patchChantier, chassisTypes }) {
    const { t } = useLanguage();
    const chassis = project.chassis || [];
    // Local copy of unitStates for optimistic updates within this block
    const [localUnitStates, setLocalUnitStates] = useState(chantier.unitStates || []);

    // Sync if parent chantier changes (e.g. after full refresh)
    useEffect(() => {
        setLocalUnitStates(chantier.unitStates || []);
    }, [chantier.unitStates]);

    // Local copy of photos for optimistic updates
    const [localPhotos, setLocalPhotos] = useState(chantier.unitPhotos || []);
    useEffect(() => {
        setLocalPhotos(chantier.unitPhotos || []);
    }, [chantier.unitPhotos]);

    const getUnitState = useCallback((chassisId, unitIndex) => {
        const u = localUnitStates.find(s => s.chassisId === chassisId && s.unitIndex === unitIndex);
        return u ? (chantierStates.find(s => s.key === u.stateKey) || defaultState) : (defaultState || chantierStates[0]);
    }, [localUnitStates, chantierStates, defaultState]);

    const getComponentState = useCallback((chassisId, unitIndex, compIndex) => {
        const compKey = `${chassisId}__comp__${compIndex}__${unitIndex}`;
        const u = localUnitStates.find(s => s.chassisId === compKey);
        return u ? (chantierStates.find(s => s.key === u.stateKey) || defaultState) : (defaultState || chantierStates[0]);
    }, [localUnitStates, chantierStates, defaultState]);

    // ── Optimistic unit state update ──────────────────────────────────────────
    const setUnitState = useCallback(async (chassisId, unitIndex, stateKey) => {
        // 1. Update local state immediately (optimistic)
        setLocalUnitStates(prev => {
            const next = prev.filter(u => !(u.chassisId === chassisId && u.unitIndex === unitIndex));
            return [...next, { chassisId, unitIndex, stateKey }];
        });
        // 2. Also patch parent so the card grid reflects it
        patchChantier(chantier.id, c => ({
            ...c,
            unitStates: [
                ...(c.unitStates || []).filter(u => !(u.chassisId === chassisId && u.unitIndex === unitIndex)),
                { chassisId, unitIndex, stateKey }
            ]
        }));
        // 3. Fire and forget API call (no await on UI)
        try {
            await authFetch(`${API_URL}/chantiers/${chantier.id}/unit-state`, {
                method: 'PATCH',
                body: JSON.stringify({ chassisId, unitIndex, stateKey }),
            });
        } catch (e) {
            console.error('Failed to save unit state', e);
            // On failure, rollback by re-syncing from chantier prop
            setLocalUnitStates(chantier.unitStates || []);
        }
    }, [authFetch, chantier.id, chantier.unitStates, patchChantier]);

    // ── Optimistic component state update ────────────────────────────────────
    const setComponentState = useCallback(async (chassisId, unitIndex, compIndex, stateKey) => {
        const compKey = `${chassisId}__comp__${compIndex}__${unitIndex}`;
        setLocalUnitStates(prev => {
            const next = prev.filter(u => u.chassisId !== compKey);
            return [...next, { chassisId: compKey, unitIndex, stateKey }];
        });
        patchChantier(chantier.id, c => ({
            ...c,
            unitStates: [
                ...(c.unitStates || []).filter(u => u.chassisId !== compKey),
                { chassisId: compKey, unitIndex, stateKey }
            ]
        }));
        try {
            await authFetch(`${API_URL}/chantiers/${chantier.id}/unit-state`, {
                method: 'PATCH',
                body: JSON.stringify({ chassisId: compKey, unitIndex, stateKey }),
            });
        } catch (e) {
            console.error('Failed to save component state', e);
            setLocalUnitStates(chantier.unitStates || []);
        }
    }, [authFetch, chantier.id, chantier.unitStates, patchChantier]);

    // ── Optimistic photo updates ──────────────────────────────────────────────
    const handlePhotoAdded = useCallback((photoEntry) => {
        setLocalPhotos(prev => [...prev, photoEntry]);
        patchChantier(chantier.id, c => ({
            ...c,
            unitPhotos: [...(c.unitPhotos || []), photoEntry]
        }));
    }, [chantier.id, patchChantier]);

    const handlePhotoDeleted = useCallback((url) => {
        setLocalPhotos(prev => prev.filter(p => p.url !== url));
        patchChantier(chantier.id, c => ({
            ...c,
            unitPhotos: (c.unitPhotos || []).filter(p => p.url !== url)
        }));
    }, [chantier.id, patchChantier]);

    // Build a local chantier proxy for CameraCell (only needs unitPhotos)
    const chantierWithLocalPhotos = useMemo(() => ({
        ...chantier,
        unitPhotos: localPhotos,
    }), [chantier, localPhotos]);

    const rows = useMemo(() => chassis.flatMap(ch => {
        const qty = ch.quantity || 1;
        const chId = ch._id || ch.id;
        const isComposite = (ch.components || []).length > 0;
        const typeLabel = getChassisTypeLabel(chassisTypes, ch.type);
        const numComps = (ch.components || []).length;

        return Array.from({ length: qty }, (_, unitIndex) => {
            const unit = (ch.units || []).find(u => u.unitIndex === unitIndex);
            if (!unit) return [];
            const unitLabel = qty > 1 ? `${ch.repere} #${unitIndex + 1}` : ch.repere;

            if (!isComposite) {
                if (unit.etat !== 'livre') return [];
                return [{ kind: 'unit', ch, chId, unitIndex, typeLabel, label: unitLabel, isComposite: false }];
            }

            const deliveredComps = (ch.components || []).filter((_, ci) => {
                const cs = (unit.componentStates || []).find(c => c.compIndex === ci);
                return cs?.etat === 'livre';
            });
            if (deliveredComps.length === 0) return [];

            const head = {
                kind: 'groupHead', ch, chId, unitIndex, typeLabel,
                label: unitLabel, isComposite: true,
                components: ch.components, numComps,
                deliveredCount: deliveredComps.length,
                totalComps: numComps,
            };
            const compRows = ch.components
                .map((comp, ci) => ({ comp, ci }))
                .filter(({ ci }) => {
                    const cs = (unit.componentStates || []).find(c => c.compIndex === ci);
                    return cs?.etat === 'livre';
                })
                .map(({ comp, ci }) => ({
                    kind: 'component', ch, chId, unitIndex, typeLabel, comp, ci,
                    label: comp.repere || (comp.role === 'dormant' ? t('chDormant') : t('chVantail', { n: ci + 1 })),
                }));
            return [head, ...compRows];
        });
    }).flat(), [chassis, chassisTypes, t]);

    const { stateCounts, totalUnits } = useMemo(() => {
        const counts = {};
        let total = 0;
        rows.filter(r => r.kind === 'unit' || r.kind === 'groupHead').forEach(r => {
            let st;
            if (r.kind === 'groupHead') {
                st = deriveCompositeChantierState(localUnitStates, r.chId, r.unitIndex, r.numComps, chantierStates, defaultState);
            } else {
                st = getUnitState(r.chId, r.unitIndex);
            }
            const key = st?.key || (defaultState?.key || 'non_pose');
            counts[key] = (counts[key] || 0) + 1;
            total++;
        });
        return { stateCounts: counts, totalUnits: total };
    }, [rows, localUnitStates, chantierStates, defaultState, getUnitState]);

    const m2 = (l, h) => (l && h) ? ((l * h) / 1e6).toFixed(2) : '—';

    if (rows.length === 0) {
        return (
            <div className="ch-proj-block">
                <div className="ch-proj-block__header">
                    <div className="ch-proj-block__title">
                        <span className="ch-proj-block__dot" style={{ background: project.ralColor || '#ccc' }} />
                        <strong>{project.name}</strong>
                        <span className="ch-proj-block__ref">{project.reference}</span>
                        {project.ralCode && <span className="ch-proj-block__ral">{project.ralCode}</span>}
                        {project.companyId && <span className="ch-proj-block__co">{project.companyId.name}</span>}
                    </div>
                </div>
                <div className="ch-empty-inline">
                    {t('chNoDelivered')}
                </div>
            </div>
        );
    }

    return (
        <div className="ch-proj-block">
            <div className="ch-proj-block__header">
                <div className="ch-proj-block__title">
                    <span className="ch-proj-block__dot" style={{ background: project.ralColor || '#ccc' }} />
                    <strong>{project.name}</strong>
                    <span className="ch-proj-block__ref">{project.reference}</span>
                    {project.ralCode && <span className="ch-proj-block__ral">{project.ralCode}</span>}
                    {project.companyId && <span className="ch-proj-block__co">{project.companyId.name}</span>}
                </div>
                {totalUnits > 0 && (
                    <div className="ch-state-bar">
                        {chantierStates.filter(s => stateCounts[s.key]).map(s => (
                            <div key={s.key} className="ch-state-bar__seg"
                                style={{ background: s.color, flex: stateCounts[s.key] }}
                                title={`${s.label}: ${stateCounts[s.key]}`}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="ch-chassis-table-wrap">
                <table className="ch-chassis-table">
                    <thead>
                        <tr>
                            <th>{t('chColRepere')}</th>
                            <th>{t('chColDesignation')}</th>
                            <th>{t('chColL')}</th>
                            <th>{t('chColH')}</th>
                            <th>{t('chColDimension')}</th>
                            <th>m²</th>
                            <th>{t('chColState')}</th>
                            <th className="ch-ct-photo-th"><Camera size={13} /></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            if (row.kind === 'groupHead') {
                                const derivedState = deriveCompositeChantierState(
                                    localUnitStates, row.chId, row.unitIndex, row.numComps, chantierStates, defaultState
                                );
                                const chM2 = m2(row.ch.largeur, row.ch.hauteur);
                                const isPartial = row.deliveredCount < row.totalComps;
                                return (
                                    <tr key={`${row.chId}-${row.unitIndex}-head`} className="ch-ct-row ch-ct-row--head">
                                        <td>
                                            <strong>{row.label}</strong>
                                            <span className="ch-ct-composite-badge" title={t('chComposite')}>⊞</span>
                                            {isPartial && (
                                                <span className="ch-ct-partial-badge" title={t('chDeliveredOf', { a: row.deliveredCount, b: row.totalComps })}>
                                                    {t('chDeliveredShort', { a: row.deliveredCount, b: row.totalComps })}
                                                </span>
                                            )}
                                        </td>
                                        <td className="ch-ct-type">{row.typeLabel}</td>
                                        <td className="ch-ct-num">{row.ch.largeur}</td>
                                        <td className="ch-ct-num">{row.ch.hauteur}</td>
                                        <td className="ch-ct-dim">{row.ch.dimension || `${row.ch.largeur}×${row.ch.hauteur}`}</td>
                                        <td className="ch-ct-num">{chM2} m²</td>
                                        <td>
                                            <span className="ch-state-badge--derived" title={t('chDerived')}>
                                                <span className="ch-state-badge-dot" style={{ background: derivedState?.color || '#6b7280' }} />
                                                {derivedState?.label || '—'}
                                                <span className="ch-state-badge-hint">{t('chInherited')}</span>
                                            </span>
                                        </td>
                                        <td className="ch-ct-photo-td">
                                            <CameraCell
                                                chassisId={row.chId}
                                                unitIndex={row.unitIndex}
                                                chantier={chantierWithLocalPhotos}
                                                authFetch={authFetch}
                                                onPhotoAdded={handlePhotoAdded}
                                                onPhotoDeleted={handlePhotoDeleted}
                                            />
                                        </td>
                                    </tr>
                                );
                            }

                            if (row.kind === 'component') {
                                const comp = row.comp;
                                const compL = comp.largeur || row.ch.largeur;
                                const compH = comp.hauteur || row.ch.hauteur;
                                const compM2 = m2(compL, compH);
                                const roleLabel = comp.role === 'dormant' ? 'Dormant' : 'Vantail';
                                const compState = getComponentState(row.chId, row.unitIndex, row.ci);
                                const compCameraId = `${row.chId}__comp__${row.ci}__${row.unitIndex}`;
                                return (
                                    <tr key={`${row.chId}-${row.unitIndex}-c${row.ci}`} className="ch-ct-row ch-ct-row--comp">
                                        <td className="ch-ct-comp-indent">↳ <strong>{row.label}</strong></td>
                                        <td className="ch-ct-comp-role">{roleLabel}</td>
                                        <td className="ch-ct-num">{compL || '—'}</td>
                                        <td className="ch-ct-num">{compH || '—'}</td>
                                        <td className="ch-ct-dim">{compL && compH ? `${compL}×${compH}` : '—'}</td>
                                        <td className="ch-ct-num">{compM2 !== '—' ? `${compM2} m²` : '—'}</td>
                                        <td>
                                            <ChantierStateSelect
                                                state={compState}
                                                allStates={chantierStates}
                                                editable={isAdmin}
                                                onChange={key => setComponentState(row.chId, row.unitIndex, row.ci, key)}
                                            />
                                        </td>
                                        <td className="ch-ct-photo-td">
                                            <CameraCell
                                                chassisId={compCameraId}
                                                unitIndex={row.unitIndex}
                                                chantier={chantierWithLocalPhotos}
                                                authFetch={authFetch}
                                                onPhotoAdded={handlePhotoAdded}
                                                onPhotoDeleted={handlePhotoDeleted}
                                            />
                                        </td>
                                    </tr>
                                );
                            }

                            // Simple unit row
                            const chantierSt = getUnitState(row.chId, row.unitIndex);
                            const unitM2 = m2(row.ch.largeur, row.ch.hauteur);
                            return (
                                <tr key={`${row.chId}-${row.unitIndex}`} className="ch-ct-row">
                                    <td><strong>{row.label}</strong></td>
                                    <td className="ch-ct-type">{row.typeLabel}</td>
                                    <td className="ch-ct-num">{row.ch.largeur}</td>
                                    <td className="ch-ct-num">{row.ch.hauteur}</td>
                                    <td className="ch-ct-dim">{row.ch.dimension || `${row.ch.largeur}×${row.ch.hauteur}`}</td>
                                    <td className="ch-ct-num">{unitM2} m²</td>
                                    <td>
                                        <ChantierStateSelect
                                            state={chantierSt}
                                            allStates={chantierStates}
                                            editable={isAdmin}
                                            onChange={key => setUnitState(row.chId, row.unitIndex, key)}
                                        />
                                    </td>
                                    <td className="ch-ct-photo-td">
                                        <CameraCell
                                            chassisId={row.chId}
                                            unitIndex={row.unitIndex}
                                            chantier={chantierWithLocalPhotos}
                                            authFetch={authFetch}
                                            onPhotoAdded={handlePhotoAdded}
                                            onPhotoDeleted={handlePhotoDeleted}
                                        />
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Chantier State Select ────────────────────────────────────────────────────
function ChantierStateSelect({ state, allStates, editable, onChange }) {
    const [open, setOpen] = useState(false);
    const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, openUpward: false });
    const btnRef = useRef(null);
    const dropRef = useRef(null);

    const openDropdown = () => {
        if (!btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        const dropHeight = Math.min(allStates.length * 44 + 8, 280);
        const openUpward = spaceBelow < dropHeight && rect.top > dropHeight;
        setDropPos({
            top: openUpward ? rect.top - dropHeight - 4 : rect.bottom + 4,
            left: rect.left,
            width: Math.max(rect.width, 200),
            openUpward,
        });
        setOpen(true);
    };

    useEffect(() => {
        if (!open) return;
        const handleClose = (e) => {
            if (
                btnRef.current && !btnRef.current.contains(e.target) &&
                dropRef.current && !dropRef.current.contains(e.target)
            ) setOpen(false);
        };
        const handleScroll = () => setOpen(false);
        document.addEventListener('mousedown', handleClose);
        document.addEventListener('scroll', handleScroll, true);
        return () => {
            document.removeEventListener('mousedown', handleClose);
            document.removeEventListener('scroll', handleScroll, true);
        };
    }, [open]);

    if (!editable) {
        return (
            <span className="ch-state-badge" style={{ '--c': state?.color || '#a1a1aa' }}>
                <span className="ch-state-badge-dot" style={{ background: state?.color || '#a1a1aa' }} />
                {state?.label || '—'}
            </span>
        );
    }

    return (
        <>
            <button
                ref={btnRef}
                className="ch-state-select-btn"
                style={{ borderLeftColor: state?.color || '#6b7280' }}
                onClick={open ? () => setOpen(false) : openDropdown}
            >
                <span className="ch-state-select-dot" style={{ background: state?.color || '#6b7280' }} />
                {state?.label || '—'}
                <span className="ch-state-select-arrow">▾</span>
            </button>

            {open && typeof document !== 'undefined' && (
                <div
                    ref={dropRef}
                    className="ch-state-select-dropdown ch-state-select-dropdown--fixed"
                    style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, minWidth: dropPos.width, zIndex: 99999 }}
                >
                    {allStates.map(s => (
                        <button
                            key={s.key}
                            type="button"
                            className={`ch-state-select-option ${state?.key === s.key ? 'active' : ''}`}
                            onMouseDown={e => {
                                e.preventDefault();
                                onChange(s.key);
                                setOpen(false);
                            }}
                        >
                            <span className="ch-state-select-dot" style={{ background: s.color }} />
                            {s.label}
                            {state?.key === s.key && <Check size={12} className="ch-check" />}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}

// ─── Team Card ────────────────────────────────────────────────────────────────
function TeamCard({ team, chantiers, onViewStock }) {
    const { t } = useLanguage();
    const { user } = useAuth();
    const adminThing = user?.role === 'Admin';
    const totalQty = (team.stock || []).reduce((a, s) => a + s.quantity, 0);

    return (
        <div className="ch-card" onClick={adminThing ? onViewStock : undefined}
            style={{ cursor: adminThing ? 'pointer' : 'default' }}>
            <div className="ch-card__accent" style={{ background: team.color }} />
            <div className="ch-card__inner">
                <div className="ch-card__head">
                    <div>
                        <h3 className="ch-card__name">{team.name}</h3>
                        {team.description && <span className="ch-card__ref">{team.description}</span>}
                    </div>
                </div>
                <div className="ch-card__rows">
                    <div className="ch-card__row"><ClipboardList size={12} /><span>{t('chTeamChantiers', { n: chantiers.length })}</span></div>
                    <div className="ch-card__row"><Package size={12} /><span>{t('chTeamStockSummary', { a: (team.stock || []).length, q: totalQty })}</span></div>
                </div>
                {adminThing && <div className="ch-card__cta"><BarChart2 size={13} /> {t('chSeeStock')}</div>}
            </div>
        </div>
    );
}

// ─── Team Stock Panel ─────────────────────────────────────────────────────────
function TeamStockPanel({ team, chantiers, authFetch, isAdmin, onBack }) {
    const { t } = useLanguage();
    const [teamData, setTeamData] = useState(team);
    const [inventory, setInventory] = useState([]);
    const [movements, setMovements] = useState([]);
    const [showAllocate, setShowAllocate] = useState(false);
    const [showConsume, setShowConsume] = useState(false);
    const [showReturn, setShowReturn] = useState(false);

    const refresh = useCallback(async () => {
        const [tRes, mRes, iRes] = await Promise.all([
            authFetch(`${API_URL}/teams/${team.id}`),
            authFetch(`${API_URL}/teams/${team.id}/stock/movements`),
            authFetch(`${API_URL}/inventory`),
        ]);
        const [td, mv, iv] = await Promise.all([tRes.json(), mRes.json(), iRes.json()]);
        setTeamData(td); setMovements(Array.isArray(mv) ? mv : []); setInventory(Array.isArray(iv) ? iv : []);
    }, [authFetch, team.id]);

    useEffect(() => { refresh(); }, [refresh]);

    const MOV_LABELS = { entree: t('chMovIn'), sortie: t('chMovOut'), chantier_use: t('chMovUse'), chantier_return: t('chMovReturn') };
    const MOV_COLORS = { entree: '#4ade80', sortie: '#f87171', chantier_use: '#fbbf24', chantier_return: '#60a5fa' };

    return (
        <div className="ch-detail">
            <div className="ch-detail__topbar">
                <button className="ch-back-btn" onClick={onBack}><ChevronLeft size={16} /> {t('chBackTeams')}</button>
                {isAdmin && (
                    <div className="ch-detail__actions">
                        <button className="ch-icon-btn green" onClick={() => setShowAllocate(true)}><Plus size={13} /> {t('chAllocate')}</button>
                        <button className="ch-icon-btn orange" onClick={() => setShowConsume(true)}><Wrench size={13} /> {t('chConsume')}</button>
                        <button className="ch-icon-btn blue" onClick={() => setShowReturn(true)}><ArrowRight size={13} /> {t('chReturn')}</button>
                    </div>
                )}
            </div>
            <div className="ch-detail__hero" style={{ borderLeftColor: teamData.color || team.color }}>
                <div className="ch-detail__hero-top">
                    <h1 className="ch-detail__name">{teamData.name || team.name}</h1>
                    {team.description && <span className="ch-detail__ref">{team.description}</span>}
                </div>
                <div className="ch-detail__meta-row">
                    <span className="ch-detail__meta-item"><Package size={13} /> {t('chArticles', { n: (teamData.stock || []).length })}</span>
                    <span className="ch-detail__meta-item"><ClipboardList size={13} /> {t('chTeamChantiers', { n: chantiers.length })}</span>
                </div>
            </div>
            <div className="ch-detail__content">
                <div className="ch-section">
                    <h3 className="ch-section__title">{t('chCurrentStock')}</h3>
                    {(!teamData.stock || teamData.stock.length === 0)
                        ? <div className="ch-empty-inline">{t('chNoTeamStock')}</div>
                        : <div className="ch-table-wrap"><table className="ch-table"><thead><tr><th>{t('chColArticle')}</th><th>{t('chColQuantity')}</th></tr></thead><tbody>
                            {(teamData.stock || []).map((s, i) => {
                                const item = s.itemId || {};
                                return <tr key={i}><td>{item.designation?.fr || item.designation?.en || '—'}</td><td className="ch-td-num"><strong>{s.quantity}</strong></td></tr>;
                            })}
                        </tbody></table></div>
                    }
                </div>
                <div className="ch-section">
                    <h3 className="ch-section__title">{t('chHistory')}</h3>
                    {movements.length === 0
                        ? <div className="ch-empty-inline">{t('chNoMovement')}</div>
                        : <div className="ch-table-wrap"><table className="ch-table"><thead><tr><th>{t('chColDate')}</th><th>{t('chColType')}</th><th>{t('chColArticle')}</th><th>{t('chColQty')}</th><th>{t('chColChantier')}</th><th>{t('chColNote')}</th></tr></thead><tbody>
                            {movements.map((m, i) => (
                                <tr key={i}>
                                    <td className="ch-td-date">{fmt(m.createdAt)}</td>
                                    <td><span className="ch-mov-badge" style={{ '--c': MOV_COLORS[m.type] || '#a1a1aa' }}>{MOV_LABELS[m.type] || m.type}</span></td>
                                    <td>{m.itemId?.designation?.fr || '—'}</td>
                                    <td className="ch-td-num">{m.quantity}</td>
                                    <td className="ch-td-sm">{m.chantierName || '—'}</td>
                                    <td className="ch-td-sm ch-td-muted">{m.note || '—'}</td>
                                </tr>
                            ))}
                        </tbody></table></div>
                    }
                </div>
            </div>
            {showAllocate && <TeamStockActionModal title={t('chAllocateTitle')} inventory={inventory} chantiers={chantiers} showChantier={false} onClose={() => setShowAllocate(false)} onConfirm={async (itemId, qty) => { await authFetch(`${API_URL}/teams/${team.id}/stock/allocate`, { method: 'POST', body: JSON.stringify({ itemId, quantity: qty }) }); setShowAllocate(false); refresh(); }} />}
            {showConsume && <TeamStockActionModal title={t('chConsumeTitle')} inventory={(teamData.stock || []).map(s => s.itemId).filter(Boolean)} chantiers={chantiers} showChantier={true} onClose={() => setShowConsume(false)} onConfirm={async (itemId, qty, chantierId, note) => { await authFetch(`${API_URL}/teams/${team.id}/stock/consume`, { method: 'POST', body: JSON.stringify({ itemId, quantity: qty, chantierId, note }) }); setShowConsume(false); refresh(); }} />}
            {showReturn && <TeamStockActionModal title={t('chReturnTitle')} inventory={(teamData.stock || []).map(s => s.itemId).filter(Boolean)} chantiers={chantiers} showChantier={false} onClose={() => setShowReturn(false)} onConfirm={async (itemId, qty) => { await authFetch(`${API_URL}/teams/${team.id}/stock/return`, { method: 'POST', body: JSON.stringify({ itemId, quantity: qty }) }); setShowReturn(false); refresh(); }} />}
        </div>
    );
}

// ─── Team Stock Action Modal ──────────────────────────────────────────────────
function TeamStockActionModal({ title, inventory, chantiers, showChantier, onClose, onConfirm }) {
    const { t } = useLanguage();
    const [itemId, setItemId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [chantierId, setChantierId] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault(); setError('');
        if (!itemId) { setError(t('chSelectItem')); return; }
        if (quantity <= 0) { setError(t('chInvalidQty')); return; }
        try { await onConfirm(itemId, quantity, chantierId || null, note); }
        catch (err) { setError(err.message || t('errGeneric')); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal large" onClick={e => e.stopPropagation()}>
                <h2>{title}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group"><label>{t('chArticleReq')}</label>
                        <select required value={itemId} onChange={e => setItemId(e.target.value)}>
                            <option value="">{t('chChoose')}</option>
                            {inventory.map(item => <option key={item.id || item._id} value={item.id || item._id}>{item.designation?.fr || '—'}</option>)}
                        </select>
                    </div>
                    <div className="form-group"><label>{t('chQuantityReq')}</label><input type="number" min={1} required value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></div>
                    {showChantier && <div className="form-group"><label>{t('chChantierOpt')}</label><select value={chantierId} onChange={e => setChantierId(e.target.value)}><option value="">{t('chNoneOpt')}</option>{chantiers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
                    <div className="form-group"><label>{t('chNote')}</label><input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder={t('chOptional')} /></div>
                    {error && <div className="form-error">{error}</div>}
                    <div className="modal-actions"><button type="button" onClick={onClose}>{t('cancel')}</button><button type="submit" className="primary">{t('confirm')}</button></div>
                </form>
            </div>
        </div>
    );
}

// ─── Project Search Picker ────────────────────────────────────────────────────
function ProjectSearchPicker({ projects, selectedIds, onChange, loading }) {
    const { t } = useLanguage();
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const wrapRef = useRef(null);

    const selected = projects.filter(p => selectedIds.includes(p.id));
    const filtered = query.trim()
        ? projects.filter(p => {
            const q = query.toLowerCase();
            return p.name?.toLowerCase().includes(q) || p.reference?.toLowerCase().includes(q) || p.ralCode?.toLowerCase().includes(q) || p.companyId?.name?.toLowerCase().includes(q);
        })
        : projects;

    const toggle = id => onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
    const remove = (id, e) => { e.stopPropagation(); onChange(selectedIds.filter(x => x !== id)); };

    useEffect(() => {
        if (!open) return;
        const h = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, [open]);

    return (
        <div className="ch-proj-picker" ref={wrapRef}>
            {selected.length > 0 && (
                <div className="ch-proj-picker__tags">
                    {selected.map(p => (
                        <span key={p.id} className="ch-proj-tag">
                            <span className="ch-proj-tag__dot" style={{ background: p.ralColor || '#ccc' }} />
                            <span className="ch-proj-tag__name">{p.name}</span>
                            <span className="ch-proj-tag__ref">{p.reference}</span>
                            <button type="button" className="ch-proj-tag__rm" onClick={e => remove(p.id, e)}>×</button>
                        </span>
                    ))}
                </div>
            )}
            <div className="ch-proj-picker__input-wrap">
                <input type="text" className="ch-proj-picker__input"
                    placeholder={loading ? t('chLoadingProjects') : (selected.length ? t('chAddProject') : t('chSearchProjects'))}
                    value={query}
                    disabled={loading}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                />
                {query && <button type="button" className="ch-proj-picker__clear" onClick={() => setQuery('')}>×</button>}
            </div>
            {open && !loading && (
                <div className="ch-proj-picker__dropdown">
                    {filtered.length === 0
                        ? <div className="ch-proj-picker__empty">{t('chNoResult')}</div>
                        : filtered.map(p => {
                            const isSel = selectedIds.includes(p.id);
                            return (
                                <button key={p.id} type="button"
                                    className={`ch-proj-picker__option ${isSel ? 'selected' : ''}`}
                                    onMouseDown={e => { e.preventDefault(); toggle(p.id); setQuery(''); }}>
                                    <span className="ch-proj-picker__dot" style={{ background: p.ralColor || '#ccc' }} />
                                    <span className="ch-proj-picker__opt-name">{p.name}</span>
                                    <span className="ch-proj-picker__opt-ref">{p.reference}</span>
                                    {p.companyId && <span className="ch-proj-picker__opt-co">{p.companyId.name}</span>}
                                    {isSel && <Check size={12} className="ch-check" />}
                                </button>
                            );
                        })
                    }
                </div>
            )}
        </div>
    );
}

// ─── Chantier Form Modal ──────────────────────────────────────────────────────
function ChantierFormModal({ chantier, projects, projectsLoading, teams, isAdmin, authFetch, onClose, onSave }) {
    const { t } = useLanguage();
    const [form, setForm] = useState({
        name: chantier?.name || '',
        reference: chantier?.reference || '',
        teamId: chantier?.teamId?.id || chantier?.teamId || '',
        projectIds: (chantier?.projectIds || []).map(p => p.id || p),
        dateDebut: chantier?.dateDebut ? chantier.dateDebut.split('T')[0] : '',
        dateCloture: chantier?.dateCloture ? chantier.dateCloture.split('T')[0] : '',
        status: chantier?.status || 'planifie',
        notes: chantier?.notes || '',
    });
    const [error, setError] = useState('');
    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault(); setError('');
        try {
            const url = chantier ? `${API_URL}/chantiers/${chantier.id}` : `${API_URL}/chantiers`;
            const res = await authFetch(url, { method: chantier ? 'PUT' : 'POST', body: JSON.stringify(form) });
            const data = await res.json();
            if (!res.ok) { setError(data.error || t('errSave')); return; }
            onSave();
        } catch (e) { setError(e.message); }
    };

    const { user } = useAuth();
    const adminThing = user?.role === 'Admin';

    const ReadOnly = ({ value }) => (
        <div className="ch-readonly">
            {value || '—'}
        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal xlarge" onClick={e => e.stopPropagation()}>
                <h2>{chantier ? t('chEditTitle') : t('chNewTitle')}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid-2">
                        <div className="form-group">
                            <label>{t('chName')}</label>
                            {adminThing ? <input required type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder={t('chNamePh')} /> : <ReadOnly value={form.name} />}
                        </div>
                        <div className="form-group">
                            <label>{t('chReference')}</label>
                            {adminThing ? <input required type="text" value={form.reference} onChange={e => set('reference', e.target.value)} placeholder={t('chReferencePh')} /> : <ReadOnly value={form.reference} />}
                        </div>
                        <div className="form-group"><label>{t('chTeam')}</label>
                            <select value={form.teamId} onChange={e => set('teamId', e.target.value)}>
                                <option value="">{t('chNoTeamOpt')}</option>
                                {teams.map(tm => <option key={tm.id} value={tm.id}>{tm.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group"><label>{t('chStatus')}</label>
                            <select value={form.status} onChange={e => set('status', e.target.value)}>
                                {Object.entries(CHANTIER_STATUS_META).map(([k, v]) => <option key={k} value={k}>{t(v.label)}</option>)}
                            </select>
                        </div>
                        <div className="form-group"><label>{t('chStartDate')}</label><input type="date" value={form.dateDebut} onChange={e => set('dateDebut', e.target.value)} /></div>
                        <div className="form-group"><label>{t('chEndDate')}</label><input type="date" value={form.dateCloture} onChange={e => set('dateCloture', e.target.value)} /></div>
                    </div>
                    <div className="form-group"><label>{t('chNotes')}</label><textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder={t('chNotesPh')} /></div>
                    {adminThing && (
                        <div className="form-group">
                            <label>
                                {t('chAssignedProjects')}
                                {form.projectIds.length > 0 && (
                                    <span className="ch-form-count">{t('chSelected', { n: form.projectIds.length })}</span>
                                )}
                            </label>
                            <ProjectSearchPicker projects={projects || []} selectedIds={form.projectIds} onChange={ids => set('projectIds', ids)} loading={!!projectsLoading} />
                        </div>
                    )}
                    {error && <div className="form-error">{error}</div>}
                    <div className="modal-actions">
                        <button type="button" onClick={onClose}>{t('cancel')}</button>
                        <button type="submit" className="primary">{chantier ? t('update') : t('create')}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}