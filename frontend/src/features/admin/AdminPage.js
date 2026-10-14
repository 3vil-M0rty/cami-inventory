import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { dialog } from '../../components/common/dialog';
import CompanyManager from './CompanyManager';
import AtelierTablesPage from '../AtelierTables';

import './AdminPage.css';

import { CornerDownRight, Search, X, Package, Lock } from 'lucide-react';
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

  const confirmDelete = (message) =>
    dialog.confirm({ title: t('deleteTitle'), message, danger: true, confirmLabel: t('deleteAction') });

  // DELETE + error shown in a dialog
  const removeAt = async (url) => {
    const r = await authFetch(url, { method: 'DELETE' });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      dialog.alert(data.error || t('errDelete'));
      return;
    }
    load();
  };

  const deleteUser = async (u) => {
    if (!(await confirmDelete(t('adDeleteUserConfirm', { name: u.displayName || u.username })))) return;
    removeAt(`${API_URL}/users/${u.id}`);
  };

  const deleteRole = async (role) => {
    if (!(await confirmDelete(t('adDeleteRoleConfirm', { name: role.name })))) return;
    removeAt(`${API_URL}/roles/${role.id}`);
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

      <div className="admin-header">
        <h1>{t('adminTitle')}</h1>
      </div>

      <div className="admin-tabs">
        <button className={`admin-tab ${activeTab === 'users' ? 'active' : ''}`} onClick={() => setActiveTab('users')}>
          {t('tabUsers')} <span className="tab-count">{users.length}</span>
        </button>
        <button className={`admin-tab ${activeTab === 'roles' ? 'active' : ''}`} onClick={() => setActiveTab('roles')}>
          {t('tabRoles')} <span className="tab-count">{roles.length}</span>
        </button>
        <button className={`admin-tab ${activeTab === 'teams' ? 'active' : ''}`} onClick={() => setActiveTab('teams')}>
          {t('adTeams')} <span className="tab-count">{teams.length}</span>
        </button>
        <button className={`admin-tab ${activeTab === 'chantier_states' ? 'active' : ''}`} onClick={() => setActiveTab('chantier_states')}>
          {t('adChantierStates')} <span className="tab-count">{chantierStates.length}</span>
        </button>
      </div>

      {loading ? <div className="admin-loading">{t('loadingShort')}</div> : (
        <>
          {/* ── USERS TAB ── */}
          {activeTab === 'users' && (
            <div className="admin-section">
              <div className="admin-section-header">
                <h2>{t('adAccounts', { n: users.length })}</h2>
                <button className="btn-primary" onClick={() => { setEditUser(null); setShowUserForm(true); }}>
                  + {t('newUser')}
                </button>
              </div>
              <div className="users-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{t('adColDisplayName')}</th>
                      <th>{t('adColUsername')}</th>
                      <th>{t('adColRole')}</th>
                      <th>{t('adColCompany')}</th>
                      <th>{t('adColStatus')}</th>
                      <th>{t('adColActions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} className={!u.active ? 'row-inactive' : ''}>
                        <td><strong>{u.displayName}</strong></td>
                        <td><code className="username-code">{u.username}</code></td>
                        <td>
                          <span className="role-badge" style={{ '--c': u.roleId?.color || '#a1a1aa' }}>
                            {u.roleId?.name || '—'}
                          </span>
                          {(u.allowedItemIds || []).length > 0 && (
                            <span className="admin-items__badge" title={(u.allowedItemIds || []).map(it => it?.designation?.fr || it?.codeInterne).join('\n')}>
                              <Lock size={10} /> {t('adAllowedItemsCount', { n: u.allowedItemIds.length })}
                            </span>
                          )}
                        </td>
                        <td>{u.companyId?.name || <span className="admin-muted">{t('adAllCompaniesShort')}</span>}</td>
                        <td>
                          <span className={`status-pill ${u.active ? 'pill-active' : 'pill-inactive'}`}>
                            {u.active ? t('adActive') : t('adInactive')}
                          </span>
                        </td>
                        <td>
                          <div className="table-actions">
                            <button className="btn-sm" onClick={() => { setEditUser(u); setShowUserForm(true); }}>{t('edit')}</button>
                            <button className={`btn-sm ${u.active ? 'btn-sm-warn' : 'btn-sm-ok'}`} onClick={() => toggleUserActive(u)}>
                              {u.active ? t('adDeactivate') : t('adActivate')}
                            </button>
                            <button className="btn-sm btn-sm-danger" onClick={() => deleteUser(u)}>{t('delete')}</button>
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
                <h2>{t('adRolesCount', { n: roles.length })}</h2>
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
                      {role.isSystem && <span className="system-badge">{t('adSystem')}</span>}
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
                      {role.permissions.length === 0 && <p className="no-perms">{t('adNoPerms')}</p>}
                    </div>
                    <div className="role-card-actions">
                      <button className="btn-sm" onClick={() => { setEditRole(role); setShowRoleForm(true); }}>{t('edit')}</button>
                      {!role.isSystem && <button className="btn-sm btn-sm-danger" onClick={() => deleteRole(role)}>{t('delete')}</button>}
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
                <h2>{t('adTeamsCount', { n: teams.length })}</h2>
                <button className="btn-primary" onClick={() => { setEditTeam(null); setShowTeamForm(true); }}>
                  {t('adNewTeam')}
                </button>
              </div>
              <div className="roles-grid">
                {teams.map(team => (
                  <div key={team.id} className="role-card">
                    <div className="role-card-header">
                      <div className="role-color-dot" style={{ background: team.color }}></div>
                      <h3>{team.name}</h3>
                    </div>
                    {team.description && <p className="team-desc">{team.description}</p>}
                    <div className="team-stock">
                      {t('adTeamStock', { n: (team.stock || []).length })}
                    </div>
                    <div className="role-card-actions">
                      <button className="btn-sm" onClick={() => { setEditTeam(team); setShowTeamForm(true); }}>{t('edit')}</button>
                      <button className="btn-sm btn-sm-danger" onClick={async () => {
                        if (!(await confirmDelete(t('adDeleteTeamConfirm', { name: team.name })))) return;
                        removeAt(`${API_URL}/teams/${team.id}`);
                      }}>{t('delete')}</button>
                    </div>
                  </div>
                ))}
                {teams.length === 0 && <div className="admin-empty">{t('adNoTeam')}</div>}
              </div>
            </div>
          )}

          {/* ── CHANTIER STATES TAB ── */}
          {activeTab === 'chantier_states' && (
            <div className="admin-section">
              <div className="admin-section-header">
                <h2>{t('adStatesCount', { n: chantierStates.length })}</h2>
                <button className="btn-primary" onClick={() => { setEditState(null); setShowStateForm(true); }}>
                  {t('adNewState')}
                </button>
              </div>
              <div className="state-list">
                {chantierStates.map(s => (
                  <div key={s.id} className="state-row">
                    <span className="state-dot" style={{ background: s.color }} />
                    <strong className="state-label">{s.label}</strong>
                    <code className="username-code">{s.key}</code>
                    {s.isDefault && <span className="state-default">{t('adDefault')}</span>}
                    <div className="table-actions">
                      <button className="btn-sm" onClick={() => { setEditState(s); setShowStateForm(true); }}>{t('edit')}</button>
                      <button className="btn-sm btn-sm-danger" onClick={async () => {
                        if (!(await confirmDelete(t('adDeleteStateConfirm', { name: s.label })))) return;
                        removeAt(`${API_URL}/chantier-states/${s.id}`);
                      }}>{t('delete')}</button>
                    </div>
                  </div>
                ))}
                {chantierStates.length === 0 && <div className="admin-empty">{t('adNoState')}</div>}
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
  const { t } = useLanguage();
  const [form, setForm] = useState({
    username:    user?.username    || '',
    displayName: user?.displayName || '',
    password:    '',
    roleId:      user?.roleId?.id  || user?.roleId?._id || roles[0]?.id || '',
    companyId:   user?.companyId?.id || user?.companyId?._id || '',
    active:      user?.active !== false,
  });
  // Articles this account is limited to (empty = all articles of its categories)
  const [allowedItems, setAllowedItems] = useState(() => (user?.allowedItemIds || []).filter(Boolean));
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const body = { ...form, allowedItemIds: allowedItems.map(it => it.id || it._id) };
    if (!body.password && user) delete body.password; // don't change pw if empty on edit
    try {
      const url = user ? `${API_URL}/users/${user.id}` : `${API_URL}/users`;
      const r = await authFetch(url, { method: user ? 'PUT' : 'POST', body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) { setError(data.error || t('errSave')); return; }
      onSave();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{user ? t('adEditAccount') : t('adNewAccount')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>{t('adDisplayName')}</label>
              <input required type="text" placeholder={t('adDisplayNamePh')} value={form.displayName}
                onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('adUsername')}</label>
              <input required type="text" placeholder={t('adUsernamePh')} value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value.toLowerCase() }))}
                disabled={!!user} style={user ? { opacity: 0.6 } : {}} />
              {user && <small className="admin-hint">{t('adUsernameLocked')}</small>}
            </div>
            <div className="form-group">
              <label>{user ? t('adNewPassword') : t('adPassword')}</label>
              <input type="password" placeholder={user ? '••••••••' : t('adPasswordPh')}
                value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required={!user} />
            </div>
            <div className="form-group">
              <label>{t('adRole')}</label>
              <select required value={form.roleId} onChange={e => setForm(f => ({ ...f, roleId: e.target.value }))}>
                <option value="">{t('adChooseRole')}</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>{t('adCompanyRestrict')}</label>
              <select value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                <option value="">{t('adAllCompanies')}</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group admin-check-row">
              <input type="checkbox" id="active-check" checked={form.active}
                onChange={e => setForm(f => ({ ...f, active: e.target.checked }))} />
              <label htmlFor="active-check">{t('adAccountActive')}</label>
            </div>
          </div>
          <ItemAccessPicker items={allowedItems} onChange={setAllowedItems} authFetch={authFetch} />
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">{user ? t('update') : t('adCreateAccount')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Allowed inventory articles for one account ──────────────────────────────
// Empty list = no restriction. Searching uses the server's indexed lookup (20 results max).
function ItemAccessPicker({ items, onChange, authFetch }) {
  const { t, currentLanguage: lang } = useLanguage();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const reqId = useRef(0);
  const name = (it) => it?.designation?.[lang] || it?.designation?.fr || it?.codeInterne || '—';
  const selectedIds = new Set(items.map(it => String(it.id || it._id)));

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); return undefined; }
    const id = ++reqId.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const r = await authFetch(`${API_URL}/inventory/lookup?limit=15&q=${encodeURIComponent(term)}`);
        const data = await r.json();
        if (id === reqId.current) setResults(data.items || []);
      } catch { if (id === reqId.current) setResults([]); }
      finally { if (id === reqId.current) setLoading(false); }
    }, 250);
    return () => clearTimeout(timer);
  }, [q, authFetch]);

  const add = (it) => { if (!selectedIds.has(String(it.id))) onChange([...items, it]); setQ(''); setResults([]); };
  const remove = (id) => onChange(items.filter(it => String(it.id || it._id) !== String(id)));

  return (
    <div className="admin-items">
      <div className="admin-items__head">
        <Lock size={14} />
        <span className="admin-items__title">{t('adAllowedItems')}</span>
        <span className="admin-items__hint">{items.length ? t('adAllowedItemsCount', { n: items.length }) : t('adAllowedItemsAll')}</span>
      </div>
      {items.length > 0 && (
        <div className="admin-items__chips">
          {items.map(it => (
            <span key={it.id || it._id} className="admin-items__chip">
              {it.codeInterne && <code>{it.codeInterne}</code>}
              <span>{name(it)}</span>
              <button type="button" onClick={() => remove(it.id || it._id)} aria-label={t('delete')}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="admin-items__search">
        <Search size={14} />
        <input type="text" value={q} placeholder={t('adAllowedItemsSearch')} onChange={e => setQ(e.target.value)} />
      </div>
      {(loading || results.length > 0) && q.trim().length >= 2 && (
        <div className="admin-items__results">
          {loading && results.length === 0 && <div className="admin-items__empty">{t('loadingShort')}</div>}
          {results.map(it => {
            const on = selectedIds.has(String(it.id));
            return (
              <button type="button" key={it.id} className={`admin-items__row${on ? ' is-on' : ''}`} onClick={() => add(it)} disabled={on}>
                <Package size={14} />
                {it.codeInterne && <code>{it.codeInterne}</code>}
                <span>{name(it)}</span>
                <em>{it.superCategory}</em>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Role Form Modal ──────────────────────────────────────────────────────────
function RoleForm({ role, permissions, grouped, authFetch, onClose, onSave }) {
  const { t } = useLanguage();
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
      if (!r.ok) { setError(data.error || t('errSave')); return; }
      onSave();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal xlarge" onClick={e => e.stopPropagation()}>
        <h2>{role ? t('adEditRole', { name: role.name }) : t('adNewRole')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2" style={{ marginBottom: 20 }}>
            <div className="form-group">
              <label>{t('adRoleName')}</label>
              <input required type="text" placeholder={t('adRoleNamePh')} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('adColor')}</label>
              <div className="admin-color-row">
                <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="admin-color-input" />
                <span className="role-badge" style={{ '--c': form.color }}>{t('adPreview', { name: form.name || t('adRoleWord') })}</span>
              </div>
            </div>
          </div>

          <div className="permissions-editor">
            <div className="perms-header">
              <h3>{t('adPermsTitle', { n: form.permissions.length })}</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn-sm" onClick={() => setForm(f => ({ ...f, permissions: permissions.map(p => p.key) }))}>{t('adCheckAll')}</button>
                <button type="button" className="btn-sm" onClick={() => setForm(f => ({ ...f, permissions: [] }))}>{t('adUncheckAll')}</button>
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
                        {isSubGroup ? <><CornerDownRight size={13} style={{ opacity: 0.5, marginRight: 4 }} />{group.split('›')[1]?.trim()}</> : group}
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
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">{role ? t('update') : t('adCreateRole')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
// ─── Team Form Modal ──────────────────────────────────────────────────────────
function TeamFormModal({ team, authFetch, onClose, onSave }) {
  const { t } = useLanguage();
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
      if (!r.ok) { setError(data.error || t('errSave')); return; }
      onSave();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{team ? t('adEditTeam', { name: team.name }) : t('adNewTeamTitle')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>{t('adTeamName')}</label>
              <input required type="text" placeholder={t('adTeamNamePh')} value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('adColor')}</label>
              <div className="admin-color-row">
                <input type="color" value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="admin-color-input" />
                <span className="role-badge" style={{ '--c': form.color }}>
                  {t('adPreview', { name: form.name || t('adTeamWord') })}
                </span>
              </div>
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label>{t('adDescription')}</label>
              <input type="text" placeholder={t('adTeamDescPh')}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">{team ? t('update') : t('adCreateTeam')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Chantier State Form Modal ────────────────────────────────────────────────
function ChantierStateFormModal({ state, authFetch, onClose, onSave }) {
  const { t } = useLanguage();
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
      if (!r.ok) { setError(data.error || t('errSave')); return; }
      onSave();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal large" onClick={e => e.stopPropagation()}>
        <h2>{state ? t('adEditState', { name: state.label }) : t('adNewStateTitle')}</h2>
        <form onSubmit={handleSubmit}>
          <div className="form-grid-2">
            <div className="form-group">
              <label>{t('adStateKey')}</label>
              <input required type="text" placeholder={t('adStateKeyPh')}
                value={form.key} disabled={!!state}
                style={state ? { opacity: 0.6 } : {}}
                onChange={e => setForm(f => ({ ...f, key: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} />
              {state && <small className="admin-hint">{t('adStateKeyLocked')}</small>}
            </div>
            <div className="form-group">
              <label>{t('adStateLabel')}</label>
              <input required type="text" placeholder={t('adStateLabelPh')}
                value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} />
            </div>
            <div className="form-group">
              <label>{t('adColorShort')}</label>
              <div className="admin-color-row">
                <input type="color" value={form.color}
                  onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
                  className="admin-color-input" />
                <span className="role-badge" style={{ '--c': form.color }}>
                  {form.label || t('adPreviewShort')}
                </span>
              </div>
            </div>
            <div className="form-group">
              <label>{t('adOrder')}</label>
              <input type="number" min={0} value={form.order}
                onChange={e => setForm(f => ({ ...f, order: Number(e.target.value) }))} />
            </div>
            <div className="form-group admin-check-row">
              <input type="checkbox" id="default-check" checked={form.isDefault}
                onChange={e => setForm(f => ({ ...f, isDefault: e.target.checked }))}
                />
              <label htmlFor="default-check">
                {t('adDefaultState')}
              </label>
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('cancel')}</button>
            <button type="submit" className="primary">{state ? t('update') : t('adCreateState')}</button>
          </div>
        </form>
      </div>
    </div>
  );
}