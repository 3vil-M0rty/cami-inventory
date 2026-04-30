import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    HardHat, Users, Calendar, Package, Plus, Edit2, Trash2,
    X, Check, Layers, ArrowRight, BarChart2, Wrench,
    ClipboardList, Box, FileText, ChevronLeft, StepBack, Camera, Image, ExternalLink
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
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
    if (!res.ok) throw new Error('Upload Cloudinary échoué');
    const json = await res.json();
    return json.secure_url;
}

// ─── Camera Cell Component ────────────────────────────────────────────────────
function CameraCell({ chassisId, unitIndex, chantier, authFetch, onRefresh }) {
    const [uploading, setUploading] = useState(false);
    const [lightbox, setLightbox] = useState(null); // url to preview
    const inputRef = useRef(null);

    const existing = (chantier.unitPhotos || []).filter(
        p => p.chassisId === chassisId && p.unitIndex === unitIndex
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
            onRefresh();
        } catch (err) {
            alert('Erreur lors de l\'upload : ' + err.message);
        } finally {
            setUploading(false);
            // Reset input so same file can be re-selected
            if (inputRef.current) inputRef.current.value = '';
        }
    };
    

    return (
        <div className="ch-camera-cell">
            <label className={`ch-camera-btn ${uploading ? 'uploading' : ''}`} title="Prendre une photo">
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
                    title={`${existing.length} photo(s)`}
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
                />
            )}
        </div>
    );
}

// ─── Photo Lightbox ───────────────────────────────────────────────────────────
function PhotoLightbox({ photos, onClose, onDelete }) {
    const [idx, setIdx] = useState(0);

    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleDelete = () => {
        if (!window.confirm('Supprimer cette photo ?')) return;
        onDelete(photos[idx].url);
    };

    return (
        <div className="ch-lightbox-overlay" onClick={onClose}>
            <div className="ch-lightbox" onClick={e => e.stopPropagation()}>
                <div className="ch-lightbox-topbar">
                    <button className="ch-lightbox-delete" onClick={handleDelete} title="Supprimer cette photo">
                        <Trash2 size={14} /> Supprimer
                    </button>
                    <button className="ch-lightbox-close" onClick={onClose}><X size={18} /></button>
                </div>
                <div className="ch-lightbox-img-wrap">
                    <img src={photos[idx].url} alt={`Photo ${idx + 1}`} className="ch-lightbox-img" />
                </div>
                {photos.length > 1 && (
                    <div className="ch-lightbox-nav">
                        <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}>‹</button>
                        <span>{idx + 1} / {photos.length}</span>
                        <button onClick={() => setIdx(i => Math.min(photos.length - 1, i + 1))} disabled={idx === photos.length - 1}>›</button>
                    </div>
                )}
                <a href={photos[idx].url} target="_blank" rel="noopener noreferrer" className="ch-lightbox-open">
                    <ExternalLink size={13} /> Ouvrir dans un nouvel onglet
                </a>
            </div>
        </div>
    );
}
const CHANTIER_STATUS_META = {
    planifie: { label: 'Planifié', color: '#6b7280', bg: 'rgba(107,114,128,.12)' },
    en_cours: { label: 'En cours', color: '#d97706', bg: 'rgba(217,119,6,.12)' },
    suspendu: { label: 'Suspendu', color: '#dc2626', bg: 'rgba(220,38,38,.12)' },
    cloture: { label: 'Clôturé', color: '#16a34a', bg: 'rgba(22,163,74,.12)' },
};

function fmt(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR');
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ChantierPage() {
    const { authFetch, can, user } = useAuth();
    const isAdmin = user?.role === 'Admin' || can('chantiers.edit');

    const [chantiers, setChantiers] = useState([]);
    const [projects, setProjects] = useState([]);
    const [teams, setTeams] = useState([]);
    const [chantierStates, setChantierStates] = useState([]);
    const [chassisTypes, setChassisTypes] = useState([]);
    const [loading, setLoading] = useState(true);

    const [view, setView] = useState('chantiers');
    const [detailId, setDetailId] = useState(null);
    const [teamPanel, setTeamPanel] = useState(null);
    const [showForm, setShowForm] = useState(false);
    const [editItem, setEditItem] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [cRes, pRes, tRes, sRes, ctRes] = await Promise.all([
                authFetch(`${API_URL}/chantiers`),
                authFetch(`${API_URL}/projects`),
                authFetch(`${API_URL}/teams`),
                authFetch(`${API_URL}/chantier-states`),
                authFetch(`${API_URL}/chassis-types`),
            ]);
            const [ch, pr, tm, st, cts] = await Promise.all([cRes.json(), pRes.json(), tRes.json(), sRes.json(), ctRes.json()]);
            setChantiers(Array.isArray(ch) ? ch : []);
            setProjects(Array.isArray(pr) ? pr : []);
            setTeams(Array.isArray(tm) ? tm : []);
            setChantierStates(Array.isArray(st) ? st : []);
            setChassisTypes(Array.isArray(cts) ? cts : []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, [authFetch]);

    useEffect(() => { load(); }, [load]);

    const deleteChantier = async (id) => {
        if (!window.confirm('Supprimer ce chantier ?')) return;
        await authFetch(`${API_URL}/chantiers/${id}`, { method: 'DELETE' });
        setView('chantiers'); setDetailId(null); load();
    };
    const adminThing = user?.role === 'Admin';
    const chefchThing = user?.role === 'Admin' || user?.role === "chefChantier";

    const defaultState = chantierStates.find(s => s.isDefault) || chantierStates[0];
    const detailChantier = chantiers.find(c => c.id === detailId);

    if (view === 'team_stock' && teamPanel) {
        return (
            <TeamStockPanel
                team={teamPanel}
                chantiers={chantiers}
                authFetch={authFetch}
                isAdmin={isAdmin}
                onBack={() => { setView('teams'); setTeamPanel(null); load(); }}
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
                onBack={() => { setView('chantiers'); setDetailId(null); load(); }}
                onEdit={() => { setEditItem(detailChantier); setShowForm(true); }}
                onDelete={() => deleteChantier(detailChantier.id)}
                onRefresh={load}
                showForm={showForm}
                editItem={editItem}
                onCloseForm={() => { setShowForm(false); setEditItem(null); load(); }}
            />
        );
    }

    return (
        <div className="ch-page">
            <div className="ch-page__header">
                <div className="ch-page__header-left">
                    <HardHat size={20} strokeWidth={2} className="ch-page__icon" />
                    <h2 className="ch-page__title">Chantiers</h2>
                    <span className="ch-page__count">{view === 'teams' ? teams.length : chantiers.length}</span>
                </div>
                <div className="ch-page__header-right">
                    <div className="ch-tab-toggle">
                        {adminThing && (
                            <button className="ch-new-btn" onClick={() => { setEditItem(null); setShowForm(true); }}>
                                <Plus size={14} /> Nouveau chantier
                            </button>
                        )}
                        <button className={`ch-tab-btn ${view === 'chantiers' ? 'active' : ''}`} onClick={() => setView('chantiers')}>
                            <ClipboardList size={13} /> Chantiers
                        </button>
                        <button className={`ch-tab-btn ${view === 'teams' ? 'active' : ''}`} onClick={() => setView('teams')}>
                            <Users size={13} /> Équipes
                        </button>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="ch-loading">Chargement...</div>
            ) : view === 'chantiers' ? (
                chantiers.length === 0 ? (
                    <div className="ch-empty-page">
                        <HardHat size={44} strokeWidth={1.2} />
                        <p>Aucun chantier pour l'instant.</p>
                        {adminThing && (
                            <button className="ch-new-btn" onClick={() => { setEditItem(null); setShowForm(true); }}>+ Créer un chantier</button>
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
                                onEdit={e => { e.stopPropagation(); setEditItem(ch); setShowForm(true); }}
                                onDelete={e => { e.stopPropagation(); deleteChantier(ch.id); }}
                            />
                        ))}
                    </div>
                )
            ) : (
                teams.length === 0 ? (
                    <div className="ch-empty-page">
                        <Users size={44} strokeWidth={1.2} />
                        <p>Aucune équipe. Créez-en depuis l'administration.</p>
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
                    teams={teams}
                    isAdmin={isAdmin}
                    authFetch={authFetch}
                    onClose={() => { setShowForm(false); setEditItem(null); }}
                    onSave={() => { setShowForm(false); setEditItem(null); load(); }}
                />
            )}
        </div>
    );
}

// ─── Chantier Grid Card ───────────────────────────────────────────────────────
function ChantierGridCard({ chantier, teams, chantierStates, isAdmin, onClick, onEdit, onDelete }) {
    const meta = CHANTIER_STATUS_META[chantier.status] || CHANTIER_STATUS_META.planifie;
    const team = teams.find(t => t.id === (chantier.teamId?.id || chantier.teamId));
    const assignedProjects = chantier.projectIds || [];
    const { user } = useAuth();
    const adminThing = user?.role === 'Admin';

    const stateCounts = {};
    let totalUnits = 0;
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
                stateCounts[key] = (stateCounts[key] || 0) + 1;
                totalUnits++;
            }
        });
    });

    return (
        <div className="ch-card" onClick={onClick}>
            <div className="ch-card__accent" style={{ background: meta.color }} />
            <div className="ch-card__inner">
                <div className="ch-card__head">
                    <div>
                        <h3 className="ch-card__name">{chantier.name}</h3>
                        <span className="ch-card__ref">{chantier.reference}</span>
                    </div>
                    <span className="ch-card__status-pill" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                </div>

                <div className="ch-card__rows">
                    {team && (
                        <div className="ch-card__row">
                            <Users size={12} />
                            <span style={{ color: team.color, fontWeight: 600 }}>{team.name}</span>
                        </div>
                    )}
                    <div className="ch-card__row">
                        <Calendar size={12} />
                        <span>{fmt(chantier.dateDebut)}</span>
                        <ArrowRight size={9} style={{ opacity: 0.35 }} />
                        <span>{fmt(chantier.dateCloture)}</span>
                    </div>
                    <div className="ch-card__row">
                        <Layers size={12} />
                        <span>{assignedProjects.length} projet(s) · {totalUnits} unité(s) livrée(s)</span>
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
                <button className="ch-card__act" onClick={onEdit} title="Modifier"><Edit2 size={13} /></button>
                {adminThing && (
                    <button className="ch-card__act danger" onClick={onDelete} title="Supprimer"><Trash2 size={13} /></button>
                )}
            </div>
        </div>
    );
}

// ─── Chantier Detail View ─────────────────────────────────────────────────────
function ChantierDetail({ chantier, teams, projects, chantierStates, chassisTypes, defaultState, isAdmin, authFetch, onBack, onEdit, onDelete, onRefresh, showForm, editItem, onCloseForm }) {
    const meta = CHANTIER_STATUS_META[chantier.status] || CHANTIER_STATUS_META.planifie;
    const team = teams.find(t => t.id === (chantier.teamId?.id || chantier.teamId));
    const assignedProjects = chantier.projectIds || [];
    const { user } = useAuth();
    const adminThing = user?.role === "Admin";

    return (
        <div className="ch-detail">
            <div className="ch-detail__topbar">
                <button className="ch-back-btn" onClick={onBack}>
                    <StepBack size={15} /> Retour aux chantiers
                </button>
                {isAdmin && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="ch-icon-btn" onClick={onEdit}><Edit2 size={15} /> Modifier</button>
                        {adminThing &&
                            <button className="ch-icon-btn danger" onClick={onDelete}><Trash2 size={15} /> Supprimer</button>
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
                    <span className="ch-detail__status-pill" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
                </div>
                <div className="ch-detail__meta-row">
                    {team && <span className="ch-detail__meta-item" style={{ color: team.color, fontWeight: 700 }}><Users size={13} /> {team.name}</span>}
                    <span className="ch-detail__meta-item"><Calendar size={13} /> {fmt(chantier.dateDebut)} → {fmt(chantier.dateCloture)}</span>
                    <span className="ch-detail__meta-item"><Layers size={13} /> {assignedProjects.length} projet(s)</span>
                </div>
                {chantier.notes && <p className="ch-detail__notes">{chantier.notes}</p>}
            </div>

            <div className="ch-detail__content">
                {assignedProjects.length === 0 ? (
                    <div className="ch-empty-page" style={{ minHeight: 200 }}>
                        <Layers size={36} strokeWidth={1.2} />
                        <p>Aucun projet assigné à ce chantier.</p>
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
                        onRefresh={onRefresh}
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

function deriveCompositeChantierState(chantier, chassisId, unitIndex, numComponents, chantierStates, defaultState) {
    if (!numComponents) return defaultState;

    const compStates = [];
    for (let ci = 0; ci < numComponents; ci++) {
        const compKey = `${chassisId}__comp__${ci}__${unitIndex}`;
        const us = (chantier.unitStates || []).find(u => u.chassisId === compKey);
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
function ChantierProjectBlock({ project, chantier, chantierStates, defaultState, isAdmin, authFetch, onRefresh, chassisTypes }) {
    const chassis = project.chassis || [];
    const unitStates = chantier.unitStates || [];

    const getUnitState = (chassisId, unitIndex) => {
        const u = unitStates.find(s => s.chassisId === chassisId && s.unitIndex === unitIndex);
        return u ? (chantierStates.find(s => s.key === u.stateKey) || defaultState) : (defaultState || chantierStates[0]);
    };

    const getComponentState = (chassisId, unitIndex, compIndex) => {
        const compKey = `${chassisId}__comp__${compIndex}__${unitIndex}`;
        const u = unitStates.find(s => s.chassisId === compKey);
        return u ? (chantierStates.find(s => s.key === u.stateKey) || defaultState) : (defaultState || chantierStates[0]);
    };

    const setUnitState = async (chassisId, unitIndex, stateKey) => {
        await authFetch(`${API_URL}/chantiers/${chantier.id}/unit-state`, {
            method: 'PATCH',
            body: JSON.stringify({ chassisId, unitIndex, stateKey }),
        });
        onRefresh();
    };

    const setComponentState = async (chassisId, unitIndex, compIndex, stateKey) => {
        const compKey = `${chassisId}__comp__${compIndex}__${unitIndex}`;
        await authFetch(`${API_URL}/chantiers/${chantier.id}/unit-state`, {
            method: 'PATCH',
            body: JSON.stringify({ chassisId: compKey, unitIndex, stateKey }),
        });
        onRefresh();
    };

    const rows = chassis.flatMap(ch => {
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
                return [{
                    kind: 'unit', ch, chId, unitIndex, typeLabel,
                    label: unitLabel, isComposite: false,
                }];
            }

            const deliveredComps = (ch.components || []).filter((_, ci) => {
                const cs = (unit.componentStates || []).find(c => c.compIndex === ci);
                return cs?.etat === 'livre';
            });
            if (deliveredComps.length === 0) return [];

            const deliveredCount = deliveredComps.length;
            const head = {
                kind: 'groupHead', ch, chId, unitIndex, typeLabel,
                label: unitLabel, isComposite: true,
                components: ch.components,
                numComps,
                deliveredCount,
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
                    label: comp.repere || (comp.role === 'dormant' ? 'Dormant' : `Vantail ${ci + 1}`),
                }));
            return [head, ...compRows];
        });
    }).flat();

    const stateCounts = {};
    let totalUnits = 0;
    rows.filter(r => r.kind === 'unit' || r.kind === 'groupHead').forEach(r => {
        let st;
        if (r.kind === 'groupHead') {
            st = deriveCompositeChantierState(chantier, r.chId, r.unitIndex, r.numComps, chantierStates, defaultState);
        } else {
            st = getUnitState(r.chId, r.unitIndex);
        }
        const key = st?.key || (defaultState?.key || 'non_pose');
        stateCounts[key] = (stateCounts[key] || 0) + 1;
        totalUnits++;
    });

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
                <div className="ch-empty-inline" style={{ padding: '20px' }}>
                    Aucun chassis livré dans ce projet.
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
                            <th>Repère</th>
                            <th>Désignation</th>
                            <th>L (mm)</th>
                            <th>H (mm)</th>
                            <th>Dimension</th>
                            <th>m²</th>
                            <th>État chantier</th>
                            <th className="ch-ct-photo-th"><Camera size={13} /></th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => {
                            if (row.kind === 'groupHead') {
                                const derivedState = deriveCompositeChantierState(
                                    chantier, row.chId, row.unitIndex, row.numComps, chantierStates, defaultState
                                );
                                const chM2 = m2(row.ch.largeur, row.ch.hauteur);
                                const isPartial = row.deliveredCount < row.totalComps;
                                return (
                                    <tr key={`${row.chId}-${row.unitIndex}-head`} className="ch-ct-row ch-ct-row--head">
                                        <td>
                                            <strong>{row.label}</strong>
                                            <span className="ch-ct-composite-badge" title="Composite">⊞</span>
                                            {isPartial && (
                                                <span className="ch-ct-partial-badge" title={`${row.deliveredCount}/${row.totalComps} composants livrés`}>
                                                    {row.deliveredCount}/{row.totalComps} livrés
                                                </span>
                                            )}
                                        </td>
                                        <td className="ch-ct-type">{row.typeLabel}</td>
                                        <td className="ch-ct-num">{row.ch.largeur}</td>
                                        <td className="ch-ct-num">{row.ch.hauteur}</td>
                                        <td className="ch-ct-dim">{row.ch.dimension || `${row.ch.largeur}×${row.ch.hauteur}`}</td>
                                        <td className="ch-ct-num">{chM2} m²</td>
                                        <td>
                                            <span className="ch-state-badge--derived" title="État dérivé des composants">
                                                <span className="ch-state-badge-dot" style={{ background: derivedState?.color || '#6b7280' }} />
                                                {derivedState?.label || '—'}
                                                <span className="ch-state-badge-hint">↓ hérité</span>
                                            </span>
                                        </td>
                                        <td className="ch-ct-photo-td">
                                            <CameraCell
                                                chassisId={row.chId}
                                                unitIndex={row.unitIndex}
                                                chantier={chantier}
                                                authFetch={authFetch}
                                                onRefresh={onRefresh}
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
                                                chantier={chantier}
                                                authFetch={authFetch}
                                                onRefresh={onRefresh}
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
                                            chantier={chantier}
                                            authFetch={authFetch}
                                            onRefresh={onRefresh}
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
            ) {
                setOpen(false);
            }
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
            <span className="ch-state-badge" style={{ background: state?.color || '#6b7280' }}>
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
                    style={{
                        position: 'fixed',
                        top: dropPos.top,
                        left: dropPos.left,
                        minWidth: dropPos.width,
                        zIndex: 99999,
                    }}
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
                            <span style={{
                                width: 10, height: 10, borderRadius: '50%',
                                background: s.color, display: 'inline-block', flexShrink: 0,
                            }} />
                            {s.label}
                            {state?.key === s.key && <Check size={11} style={{ marginLeft: 'auto', color: '#22c55e' }} />}
                        </button>
                    ))}
                </div>
            )}
        </>
    );
}

// ─── Team Card ────────────────────────────────────────────────────────────────
function TeamCard({ team, chantiers, onViewStock }) {
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
                    <div className="ch-card__row"><ClipboardList size={12} /><span>{chantiers.length} chantier(s)</span></div>
                    <div className="ch-card__row"><Package size={12} /><span>{(team.stock || []).length} articles · {totalQty} unités</span></div>
                </div>
                {adminThing && (
                    <div className="ch-card__cta">
                        <BarChart2 size={13} /> Voir le stock
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Team Stock Panel ─────────────────────────────────────────────────────────
function TeamStockPanel({ team, chantiers, authFetch, isAdmin, onBack }) {
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

    const MOV_LABELS = { entree: 'Entrée', sortie: 'Sortie', chantier_use: 'Utilisation chantier', chantier_return: 'Retour chantier' };
    const MOV_COLORS = { entree: '#16a34a', sortie: '#dc2626', chantier_use: '#d97706', chantier_return: '#2563eb' };

    return (
        <div className="ch-detail">
            <div className="ch-detail__topbar">
                <button className="ch-back-btn" onClick={onBack}><ChevronLeft size={16} /> Retour aux équipes</button>
                {isAdmin && (
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button className="ch-icon-btn green" onClick={() => setShowAllocate(true)}><Plus size={13} /> Allouer</button>
                        <button className="ch-icon-btn orange" onClick={() => setShowConsume(true)}><Wrench size={13} /> Consommer</button>
                        <button className="ch-icon-btn blue" onClick={() => setShowReturn(true)}><ArrowRight size={13} /> Retourner</button>
                    </div>
                )}
            </div>

            <div className="ch-detail__hero" style={{ borderLeftColor: teamData.color || team.color }}>
                <div className="ch-detail__hero-top">
                    <h1 className="ch-detail__name">{teamData.name || team.name}</h1>
                    {team.description && <span className="ch-detail__ref">{team.description}</span>}
                </div>
                <div className="ch-detail__meta-row">
                    <span className="ch-detail__meta-item"><Package size={13} /> {(teamData.stock || []).length} article(s)</span>
                    <span className="ch-detail__meta-item"><ClipboardList size={13} /> {chantiers.length} chantier(s)</span>
                </div>
            </div>

            <div className="ch-detail__content">
                <div className="ch-section">
                    <h3 className="ch-section__title">Stock actuel</h3>
                    {(!teamData.stock || teamData.stock.length === 0)
                        ? <div className="ch-empty-inline">Aucun stock alloué à cette équipe.</div>
                        : <table className="ch-table"><thead><tr><th>Article</th><th>Quantité</th></tr></thead><tbody>
                            {(teamData.stock || []).map((s, i) => {
                                const item = s.itemId || {};
                                return <tr key={i}><td>{item.designation?.fr || item.designation?.en || '—'}</td><td><strong>{s.quantity}</strong></td></tr>;
                            })}
                        </tbody></table>
                    }
                </div>

                <div className="ch-section">
                    <h3 className="ch-section__title">Historique des mouvements</h3>
                    {movements.length === 0
                        ? <div className="ch-empty-inline">Aucun mouvement enregistré.</div>
                        : <table className="ch-table"><thead><tr><th>Date</th><th>Type</th><th>Article</th><th>Qté</th><th>Chantier</th><th>Note</th></tr></thead><tbody>
                            {movements.map((m, i) => (
                                <tr key={i}>
                                    <td style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{fmt(m.createdAt)}</td>
                                    <td><span style={{ background: MOV_COLORS[m.type] || '#888', color: '#fff', padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{MOV_LABELS[m.type] || m.type}</span></td>
                                    <td>{m.itemId?.designation?.fr || '—'}</td>
                                    <td>{m.quantity}</td>
                                    <td style={{ fontSize: 12 }}>{m.chantierName || '—'}</td>
                                    <td style={{ fontSize: 12, color: '#888' }}>{m.note || '—'}</td>
                                </tr>
                            ))}
                        </tbody></table>
                    }
                </div>
            </div>

            {showAllocate && <TeamStockActionModal title="Allouer depuis l'inventaire principal" inventory={inventory} chantiers={chantiers} showChantier={false} onClose={() => setShowAllocate(false)} onConfirm={async (itemId, qty) => { await authFetch(`${API_URL}/teams/${team.id}/stock/allocate`, { method: 'POST', body: JSON.stringify({ itemId, quantity: qty }) }); setShowAllocate(false); refresh(); }} />}
            {showConsume && <TeamStockActionModal title="Enregistrer une consommation" inventory={(teamData.stock || []).map(s => s.itemId).filter(Boolean)} chantiers={chantiers} showChantier={true} onClose={() => setShowConsume(false)} onConfirm={async (itemId, qty, chantierId, note) => { await authFetch(`${API_URL}/teams/${team.id}/stock/consume`, { method: 'POST', body: JSON.stringify({ itemId, quantity: qty, chantierId, note }) }); setShowConsume(false); refresh(); }} />}
            {showReturn && <TeamStockActionModal title="Retourner vers l'inventaire" inventory={(teamData.stock || []).map(s => s.itemId).filter(Boolean)} chantiers={chantiers} showChantier={false} onClose={() => setShowReturn(false)} onConfirm={async (itemId, qty) => { await authFetch(`${API_URL}/teams/${team.id}/stock/return`, { method: 'POST', body: JSON.stringify({ itemId, quantity: qty }) }); setShowReturn(false); refresh(); }} />}
        </div>
    );
}

// ─── Team Stock Action Modal ──────────────────────────────────────────────────
function TeamStockActionModal({ title, inventory, chantiers, showChantier, onClose, onConfirm }) {
    const [itemId, setItemId] = useState('');
    const [quantity, setQuantity] = useState(1);
    const [chantierId, setChantierId] = useState('');
    const [note, setNote] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault(); setError('');
        if (!itemId) { setError('Sélectionnez un article'); return; }
        if (quantity <= 0) { setError('Quantité invalide'); return; }
        try { await onConfirm(itemId, quantity, chantierId || null, note); }
        catch (err) { setError(err.message || 'Erreur'); }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal large" onClick={e => e.stopPropagation()}>
                <h2>{title}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group"><label>Article *</label>
                        <select required value={itemId} onChange={e => setItemId(e.target.value)}>
                            <option value="">— Choisir —</option>
                            {inventory.map(item => <option key={item.id || item._id} value={item.id || item._id}>{item.designation?.fr || '—'}</option>)}
                        </select>
                    </div>
                    <div className="form-group"><label>Quantité *</label><input type="number" min={1} required value={quantity} onChange={e => setQuantity(Number(e.target.value))} /></div>
                    {showChantier && <div className="form-group"><label>Chantier (optionnel)</label><select value={chantierId} onChange={e => setChantierId(e.target.value)}><option value="">— Aucun —</option>{chantiers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
                    <div className="form-group"><label>Note</label><input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Optionnel..." /></div>
                    {error && <div className="form-error">{error}</div>}
                    <div className="modal-actions"><button type="button" onClick={onClose}>Annuler</button><button type="submit" className="primary">Confirmer</button></div>
                </form>
            </div>
        </div>
    );
}

// ─── Project Search Picker ────────────────────────────────────────────────────
function ProjectSearchPicker({ projects, selectedIds, onChange }) {
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
                    placeholder={selected.length ? 'Ajouter un projet...' : 'Rechercher par nom, référence, RAL, société...'}
                    value={query}
                    onChange={e => { setQuery(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                />
                {query && <button type="button" className="ch-proj-picker__clear" onClick={() => setQuery('')}>×</button>}
            </div>
            {open && (
                <div className="ch-proj-picker__dropdown">
                    {filtered.length === 0
                        ? <div className="ch-proj-picker__empty">Aucun résultat</div>
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
                                    {isSel && <Check size={12} style={{ marginLeft: 'auto', color: '#22c55e', flexShrink: 0 }} />}
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
function ChantierFormModal({ chantier, projects, teams, isAdmin, authFetch, onClose, onSave }) {
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
            if (!res.ok) { setError(data.error || 'Erreur'); return; }
            onSave();
        } catch (e) { setError(e.message); }
    };

    const { user } = useAuth();
    const adminThing = user?.role === 'Admin';

    const ReadOnly = ({ value }) => (
        <div style={{ padding: '8px 12px', background: 'var(--50)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: 13.5, color: 'var(--text-2)', opacity: 0.8, minHeight: 38 }}>
            {value || '—'}
        </div>
    );

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal xlarge" onClick={e => e.stopPropagation()}>
                <h2>{chantier ? 'Modifier le chantier' : 'Nouveau chantier'}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-grid-2">
                        <div className="form-group">
                            <label>Nom *</label>
                            {adminThing ? <input required type="text" value={form.name} onChange={e => set('name', e.target.value)} placeholder="ex: Résidence Al Nour" /> : <ReadOnly value={form.name} />}
                        </div>
                        <div className="form-group">
                            <label>Référence *</label>
                            {adminThing ? <input required type="text" value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="ex: CH-2025-001" /> : <ReadOnly value={form.reference} />}
                        </div>
                        <div className="form-group"><label>Équipe</label>
                            <select value={form.teamId} onChange={e => set('teamId', e.target.value)}>
                                <option value="">— Aucune équipe —</option>
                                {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                            </select>
                        </div>
                        <div className="form-group"><label>Statut</label>
                            <select value={form.status} onChange={e => set('status', e.target.value)}>
                                {Object.entries(CHANTIER_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                            </select>
                        </div>
                        <div className="form-group"><label>Date de commencement</label><input type="date" value={form.dateDebut} onChange={e => set('dateDebut', e.target.value)} /></div>
                        <div className="form-group"><label>Date de clôture</label><input type="date" value={form.dateCloture} onChange={e => set('dateCloture', e.target.value)} /></div>
                    </div>
                    <div className="form-group"><label>Notes</label><textarea rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Remarques..." /></div>
                    {adminThing && (
                        <div className="form-group">
                            <label>
                                Projets assignés à ce chantier
                                {form.projectIds.length > 0 && (
                                    <span className="ch-form-count">{form.projectIds.length} sélectionné(s)</span>
                                )}
                            </label>
                            <ProjectSearchPicker projects={projects} selectedIds={form.projectIds} onChange={ids => set('projectIds', ids)} />
                        </div>
                    )}
                    {error && <div className="form-error">{error}</div>}
                    <div className="modal-actions">
                        <button type="button" onClick={onClose}>Annuler</button>
                        <button type="submit" className="primary">{chantier ? 'Mettre à jour' : 'Créer'}</button>
                    </div>
                </form>
            </div>
        </div>
    );
}