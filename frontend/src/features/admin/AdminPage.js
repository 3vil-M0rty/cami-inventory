import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import CompanyManager from './CompanyManager';
import AtelierTablesPage from '../AtelierTables';

import './AdminPage.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

export default function AdminPage() {
  const { authFetch } = useAuth();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers]         = useState([]);
  const [roles, setRoles]         = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [showUserForm, setShowUserForm]   = useState(false);
  const [showRoleForm, setShowRoleForm]   = useState(false);
  const [editUser, setEditUser]   = useState(null);
  const [editRole, setEditRole]   = useState(null);

  // Teams + Chantier States
  const [teams, setTeams]                   = useState([]);
  const [chantierStates, setChantierStates] = useState([]);
  const [showTeamForm, setShowTeamForm]     = useState(false);
  const [editTeam, setEditTeam]             = useState(null);
  const [showStateForm, setShowStateForm]   = useState(false);
  const [editState, setEditState]           = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes, pRes, cRes, tRes, sRes] = await Promise.all([
        authFetch(`${API_URL}/users`),
        authFetch(`${API_URL}/roles`),
        authFetch(`${API_URL}/permissions`),
        authFetch(`${API_URL}/companies`),
        authFetch(`${API_URL}/teams`),
        authFetch(`${API_URL}/chantier-states`),
      ]);
      setUsers(await uRes.json());
      setRoles(await rRes.json());
      setPermissions(await pRes.json());
      setCompanies(await cRes.json());
      const tm = await tRes.json(); setTeams(Array.isArray(tm) ? tm : []);
      const st = await sRes.json(); setChantierStates(Array.isArray(st) ? st : []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  const deleteUser = async (id) => {
    if (!window.confirm('Supprimer cet utilisateur ?')) return;
    await authFetch(`${API_URL}/users/${id}`, { method: 'DELETE' });
    load();
  };

  const deleteRole = async (id) => {
    if (!window.confirm('Supprimer ce rôle ?')) return;
    const r = await authFetch(`${API_URL}/roles/${id}`, { method: 'DELETE' });
    const data = await r.json();
    if (!r.ok) { alert(data.error); return; }
    load();
  };

  const toggleUserActive = async (user) => {
    await authFetch(`${API_URL}/users/${user.id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: !user.active })
    });
    load();
  };

  // Group permissions by section
  const grouped = permissions.reduce((acc, p) => {
    if (!acc[p.group]) acc[p.group] = [];
    acc[p.group].push(p);
    return acc;
  }, {});

  return (
    <div className="admin-page">
      <AtelierTablesPage/>

      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          👤 {t('tabUsers')} <span className="tab-count">{users.length}</span>
        </button>
        <button className={`admin-tab ${activeTab === 'roles' ? 'active' : ''}`} onClick={() => setActiveTab('roles')}>
          🔑 {t('tabRoles')} <span className="tab-count">{roles.length}</span>
        </button>
        <button className={`admin-tab ${activeTab === 'teams' ? 'active' : ''}`} onClick={() => setActiveTab('teams')}>
          👷 Équipes <span className="tab-count">{teams.length}</span>
        </button>
        <button className={`admin-tab ${activeTab === 'chantier_states' ? 'active' : ''}`} onClick={() => setActiveTab('chantier_states')}>
          🏷️ États chantier <span className="tab-count">{chantierStates.length}</span>
        </button>
      </div>

      {loading ? <div className="admin-loading">Chargement...</div> : (
        <>
          {/* ── USERS TAB ── */}
          {activeTab === 'users' && (
            <div className="admin-section">
              <div className="admin-section-header">
                <h2>{users.length} compte(s)</h2>
                <button className="btn-primary" onClick={() => { setEditUser(null); setShowUserForm(true); }}>
                  + {t('newUser')}
                </button>
              </div>
              <div className="users-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Nom d'affichage</th>
                      <th>Username</th>
                      <th>Rôle</th>
                      <th>Société</th>
                      <th>Statut</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className={!u.active ? 'row-inactive' : ''}>
                        <td><strong>{u.displayName}</strong></td>
                        <td><code className="username-code">{u.username}</code></td>
                        <td>
                          <span className="role-badge" style={{ background: u.roleId?.color || '#6b7280' }}>
                            {u.roleId?.name || '—'}
                          </span>
                        </td>
                        <td>{u.companyId?.name || <span style={{ color: '#aaa' }}>Toutes</span>}</td>
                        <td>
                          <span className={`status-pill ${u.active ? 'pill-active' : 'pill-inactive'}`}>
                            {u.active ? '● Actif' : '● Inactif'}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="btn-sm" onClick={() => { setEditUser(u); setShowUserForm(true); }}>Modifier</button>
                            <button className={`btn-sm ${u.active ? 'btn-sm-warn' : 'btn-sm-ok'}`} onClick={() => toggleUserActive(u)}>
                              {u.active ? 'Désactiver' : 'Activer'}
                            </button>
                            <button className="btn-sm btn-sm-danger" onClick={() => deleteUser(u.id)}>Supprimer</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── ROLES TAB ── */}
          {activeTab === 'roles' && (
            <div className="admin-section">
              <div className="admin-section-header">
                <h2>{roles.length} rôle(s)</h2>
                <button className="btn-primary" onClick={() => { setEditRole(null); setShowRoleForm(true); }}>
                  + {t('newRole')}
                </button>
              </div>
              <div className="roles-grid">
                {roles.map(role => (
                  <div key={role.id} className="role-card">
                    <div className="role-card-header">
                      <div className="role-color-dot" style={{ background: role.color }}></div>
                      <h3>{role.name}</h3>
                      {role.isSystem && <span className="system-badge">Système</span>}
                    </div>
                    <div className="role-perms">
                      {Object.entries(grouped).map(([group, perms]) => {
                        const active = perms.filter(p => role.permissions.includes(p.key));
                        if (active.length === 0) return null;
                        return (
                          <div key={group} className="role-perm-group">
                            <span className="perm-group-label">{group}</span>
                            <div className="perm-tags">
                              {active.map(p => (
                                <span key={p.key} className="perm-tag">{p.label.split('—')[1]?.trim() || p.label}</span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {role.permissions.length === 0 && <p className="no-perms">Aucune permission</p>}
                    </div>
                    <div className="role-card-actions">
                      <button className="btn-sm" onClick={() => { setEditRole(role); setShowRoleForm(true); }}>Modifier</button>
                      {!role.isSystem && <button className="btn-sm btn-sm-danger" onClick={() => deleteRole(role.id)}>Supprimer</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── TEAMS TAB ── */}
          {activeTab === 'teams' && (
            <div className="admin-section">
              <div className="admin-section-header">
                <h2 style={{color: 'white'}}>{teams.length} équipe(s)</h2>
                <button className="btn-primary" onClick={() => { setEditTeam(null); setShowTeamForm(true); }}>
                  + Nouvelle équipe
                </button>
              </div>
              <div className="roles-grid">
                {teams.map(team => (
                  <div key={team.id} className="role-card">
                    <div className="role-card-header">
                      <div className="role-color-dot" style={{ background: team.color }}></div>
                      <h3>{team.name}</h3>
                    </div>
                    {team.description && <p style={{ fontSize: 12, color: '#888', margin: '6px 0 0' }}>{team.description}</p>}
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>
                      📦 {(team.stock || []).length} article(s) en stock
                    </div>
                    <div className="role-card-actions">
                      <button className="btn-sm" onClick={() => { setEditTeam(team); setShowTeamForm(true); }}>Modifier</button>
                      <button className="btn-sm btn-sm-danger" onClick={async () => {
                        if (!window.confirm('Supprimer cette équipe ?')) return;
                        const r = await authFetch(`${API_URL}/teams/${team.id}`, { method: 'DELETE' });
                        const d = await r.json();
                        if (!r.ok) { alert(d.error); return; }
                        load();
                      }}>Supprimer</button>
                    </div>
                  </div>
                ))}
                {teams.length === 0 && <div style={{ color: '#aaa', padding: 20 }}>Aucune équipe.</div>}
              </div>
            </div>
          )}

          {/* ── CHANTIER STATES TAB ── */}
          {activeTab === 'chantier_states' && (
            <div className="admin-section">
              <div className="admin-section-header">
                <h2>{chantierStates.length} état(s) de chantier</h2>
                <button className="btn-primary" onClick={() => { setEditState(null); setShowStateForm(true); }}>
                  + Nouvel état
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chantierStates.map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
                    <span style={{ width: 14, height: 14, borderRadius: '50%', background: s.color, flexShrink: 0, display: 'inline-block' }} />
                    <strong style={{ flex: 1, fontSize: 13 }}>{s.label}</strong>
                    <code style={{ fontSize: 11, color: '#888', background: 'var(--100)', padding: '2px 7px', borderRadius: 5 }}>{s.key}</code>
                    {s.isDefault && <span style={{ background: '#16a34a', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999 }}>DÉFAUT</span>}
                    <div className="table-actions">
                      <button className="btn-sm" onClick={() => { setEditState(s); setShowStateForm(true); }}>Modifier</button>
                      <button className="btn-sm btn-sm-danger" onClick={async () => {
                        if (!window.confirm('Supprimer cet état ?')) return;
                        await authFetch(`${API_URL}/chantier-states/${s.id}`, { method: 'DELETE' });
                        load();
                      }}>Supprimer</button>
                    </div>
                  </div>
                ))}
                {chantierStates.length === 0 && <div style={{ color: '#aaa', padding: 20 }}>Aucun état.</div>}
              </div>
            </div>
          )}
        </>
      )}

      {showTeamForm && (
        <TeamFormModal
          team={editTeam}
          authFetch={authFetch}
          onClose={() => { setShowTeamForm(false); setEditTeam(null); }}
          onSave={() => { setShowTeamForm(false); setEditTeam(null); load(); }}
        />
      )}

      {showStateForm && (
        <ChantierStateFormModal
          state={editState}
          authFetch={authFetch}
          onClose={() => { setShowStateForm(false); setEditState(null); }}
          onSave={() => { setShowStateForm(false); setEditState(null); load(); }}
        />
      )}
      <CompanyManager />

      {showUserForm && (
        <UserForm
          user={editUser}
          roles={roles}
          companies={companies}
          authFetch={authFetch}
          onClose={() => { setShowUserForm(false); setEditUser(null); }}
          onSave={() => { setShowUserForm(false); setEditUser(null); load(); }}
        />
      )}

      {showRoleForm && (
        <RoleForm
          role={editRole}
          permissions={permissions}
          grouped={grouped}
          authFetch={authFetch}
          onClose={() => { setShowRoleForm(false); setEditRole(null); }}
          onSave={() => { setShowRoleForm(false); setEditRole(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── User Form Modal ──────────────────────────────────────────────────────────
function UserForm({ user, roles, companies, authFetch, onClose, onSave }) {
  const [form, setForm] = useState({
    username:    user?.username    || '',
    displayName: user?.displayName || '',
    password:    '',
    roleId:      user?.roleId?.id  || user?.roleId?._id || roles[0]?.id || '',
    companyId:   user?.companyId?.id || user?.companyId?._id || '',
    active:      user?.active !== false,
  });
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const body = { ...form };
    if (!body.password && user) delete body.password; // don't change pw if empty on edit
    try {
      const url = user ? `${API_URL}/users/${user.id}` : `${API_URL}/users`;
      const r = await authFetch(url, { method: user ? 'PUT' : 'POST', body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Erreur'); return; }
      onSave();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{user ? 'Modifier le compte' : 'Nouveau compte'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Nom d'affichage *</label>
              <input required type="text" placeholder="ex: Jean Dupont" value={form.displayName}
                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Nom d'utilisateur *</label>
              <input required type="text" placeholder="ex: jean.dupont" value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))}
                disabled={!!user} style={user ? { opacity: 0.6 } : {}} />
              {user && <small style={{ color: '#888' }}>Le username ne peut pas être modifié</small>}
            </div>
            <div className="form-group">
              <label>{user ? 'Nouveau mot de passe (laisser vide = inchangé)' : 'Mot de passe *'}</label>
              <input type="password" placeholder={user ? '••••••••' : 'min 4 caractères'}
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required={!user} />
            </div>
            <div className="form-group">
              <label>Rôle *</label>
              <select required value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))}>
                <option value="">Choisir un rôle...</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Société (optionnel — restreint l'accès à une société)</label>
              <select value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                <option value="">Toutes les sociétés</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
              <input type="checkbox" id="active-check" checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} style={{ width: 18, height: 18 }} />
              <label htmlFor="active-check" style={{ fontWeight: 600 }}>Compte actif</label>
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary">{user ? 'Mettre à jour' : 'Créer le compte'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Role Form Modal ──────────────────────────────────────────────────────────
function RoleForm({ role, permissions, grouped, authFetch, onClose, onSave }) {
  const [form, setForm] = useState({
    name:        role?.name        || '',
    color:       role?.color       || '#3b82f6',
    permissions: role?.permissions || [],
  });
  const [error, setError] = useState('');

  const togglePerm = (key) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key]
    }));
  };

  const toggleGroup = (groupPerms) => {
    const keys = groupPerms.map(p => p.key);
    const allOn = keys.every(k => form.permissions.includes(k));
    if (allOn) {
      setForm(f => ({ ...f, permissions: f.permissions.filter(p => !keys.includes(p)) }));
    } else {
      setForm(f => ({ ...f, permissions: [...new Set([...f.permissions, ...keys])] }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const url = role ? `${API_URL}/roles/${role.id}` : `${API_URL}/roles`;
      const r = await authFetch(url, { method: role ? 'PUT' : 'POST', body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Erreur'); return; }
      onSave();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal xlarge" onClick={e => e.stopPropagation()}>
        <h2>{role ? `Modifier le rôle "${role.name}"` : 'Nouveau rôle'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2" style={{ marginBottom: 20 }}>
            <div className="form-group">
              <label>Nom du rôle *</label>
              <input required type="text" placeholder="ex: Magasinier, Vendeur..." value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Couleur d'identification</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ width: 48, height: 38, border: 'none', cursor: 'pointer', borderRadius: 6 }} />
                <span className="role-badge" style={{ background: form.color }}>Aperçu: {form.name || 'Rôle'}</span>
              </div>
            </div>
          </div>

          <div className="permissions-editor">
            <div className="perms-header">
              <h3>Permissions ({form.permissions.length} activées)</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-sm" onClick={() => setForm(f => ({ ...f, permissions: permissions.map(p => p.key) }))}>Tout cocher</button>
                <button type="button" className="btn-sm" onClick={() => setForm(f => ({ ...f, permissions: [] }))}>Tout décocher</button>
              </div>
            </div>

            <div className="perms-groups">
              {Object.entries(grouped).map(([group, groupPerms]) => {
                const allOn = groupPerms.every(p => form.permissions.includes(p.key));
                const someOn = groupPerms.some(p => form.permissions.includes(p.key));
                const isSubGroup = group.includes('›');
                return (
                  <div key={group} className={`perm-group-block ${isSubGroup ? 'perm-group-block--sub' : ''}`}>
                    <div className="perm-group-title">
                      <input
                        type="checkbox"
                        checked={allOn}
                        ref={el => { if (el) el.indeterminate = someOn && !allOn; }}
                        onChange={() => toggleGroup(groupPerms)}
                        id={`group-${group}`}
                      />
                      <label htmlFor={`group-${group}`} style={{ fontWeight: isSubGroup ? 600 : 700, cursor: 'pointer', fontSize: isSubGroup ? '0.82rem' : '0.9rem' }}>
                        {isSubGroup ? <><span style={{opacity:0.4,marginRight:4}}>└</span>{group.split('›')[1]?.trim()}</> : group}
                      </label>
                    </div>
                    <div className="perm-items">
                      {groupPerms.map(p => (
                        <label key={p.key} className={`perm-item ${form.permissions.includes(p.key) ? 'perm-on' : ''}`}>
                          <input
                            type="checkbox"
                            checked={form.permissions.includes(p.key)}
                            onChange={() => togglePerm(p.key)}
                          />
                          <span>{p.label.split('—')[1]?.trim() || p.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary">{role ? 'Mettre à jour' : 'Créer le rôle'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
// ─── Team Form Modal ──────────────────────────────────────────────────────────
function TeamFormModal({ team, authFetch, onClose, onSave }) {
  const [form, setForm] = React.useState({
    name:        team?.name        || '',
    color:       team?.color       || '#3b82f6',
    description: team?.description || '',
  });
  const [error, setError] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      const url = team ? `${API_URL}/teams/${team.id}` : `${API_URL}/teams`;
      const r = await authFetch(url, { method: team ? 'PUT' : 'POST', body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Erreur'); return; }
      onSave();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{team ? `Modifier l'équipe "${team.name}"` : 'Nouvelle équipe'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Nom de l'équipe *</label>
              <input required type="text" placeholder="ex: Équipe Nord" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Couleur d'identification</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: 48, height: 38, border: 'none', cursor: 'pointer', borderRadius: 6 }} />
                <span className="role-badge" style={{ background: form.color }}>
                  Aperçu: {form.name || 'Équipe'}
                </span>
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>Description</label>
              <input type="text" placeholder="ex: Équipe spécialisée en menuiserie aluminium"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary">{team ? 'Mettre à jour' : "Créer l'équipe"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Chantier State Form Modal ────────────────────────────────────────────────
function ChantierStateFormModal({ state, authFetch, onClose, onSave }) {
  const [form, setForm] = React.useState({
    key:       state?.key       || '',
    label:     state?.label     || '',
    color:     state?.color     || '#6b7280',
    order:     state?.order     ?? 0,
    isDefault: state?.isDefault || false,
  });
  const [error, setError] = React.useState('');

  const handleSubmit = async (e) => {
    e.preventDefault(); setError('');
    try {
      const url = state ? `${API_URL}/chantier-states/${state.id}` : `${API_URL}/chantier-states`;
      const r = await authFetch(url, { method: state ? 'PUT' : 'POST', body: JSON.stringify(form) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || 'Erreur'); return; }
      onSave();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{state ? `Modifier l'état "${state.label}"` : 'Nouvel état de chantier'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>Clé (identifiant technique) *</label>
              <input required type="text" placeholder="ex: pose_partielle"
                value={form.key} disabled={!!state}
                style={state ? { opacity: 0.6 } : {}}
                onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} />
              {state && <small style={{ color: '#888' }}>La clé ne peut pas être modifiée</small>}
            </div>
            <div className="form-group">
              <label>Libellé *</label>
              <input required type="text" placeholder="ex: Posé partiellement"
                value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>Couleur</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input type="color" value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: 48, height: 38, border: 'none', cursor: 'pointer', borderRadius: 6 }} />
                <span style={{ background: form.color, color: '#fff', fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 999 }}>
                  {form.label || 'Aperçu'}
                </span>
              </div>
            </div>
            <div className="form-group">
              <label>Ordre d'affichage</label>
              <input type="number" min={0} value={form.order}
                onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))} />
            </div>
            <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 24 }}>
              <input type="checkbox" id="default-check" checked={form.isDefault}
                onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                style={{ width: 18, height: 18 }} />
              <label htmlFor="default-check" style={{ fontWeight: 600 }}>
                État par défaut (pour les nouvelles unités)
              </label>
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Annuler</button>
            <button type="submit" className="primary">{state ? 'Mettre à jour' : "Créer l'état"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}