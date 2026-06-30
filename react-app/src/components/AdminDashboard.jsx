import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { toastError, toastSuccess } from '../lib/toast';
import { useAuth } from '../context/AuthContext';
import { VEHICLES, DRIVER_CARS_KEY } from '../lib/vehicles';
import { pruneUserSessions, revokeUserSession, upsertAppSetting } from '../lib/adminRpc';
import { getLogsPage } from '../lib/logsRpc';
import {
  getAdminEmployeesData,
  getAdminGroupEmployeeCount,
  getAdminGroups,
  getAdminRouteOptions,
  getAdminSessionDetails,
  getAdminSessionOverview,
  getAdminUsersData,
} from '../lib/readRpc';
import { currentLocale, monthNames } from '../lib/dateUtils';
import { withRetry } from '../lib/fetchRetry';
import { getLaundryWorkflow } from '../lib/laundryRpc';
import DataError from './DataError';

const LABEL_STYLE = { fontSize: '11px', fontWeight: 600, color: 'rgba(60,60,67,0.5)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px' };

const roleLabel = (t, role) => ({
  viewer: t('admin.roleViewer'),
  admin_viewer: t('admin.roleAdminViewer'),
  admin_viewer_driver: t('admin.roleAdminViewerDriver'),
  driver: t('admin.roleDriver'),
  admin: t('admin.roleAdmin'),
}[role] || role);

const canAssignDriverSettings = (role) => role === 'driver' || role === 'admin_viewer_driver';
const SESSION_KEEP_ACTIVE = 10;
const LAUNDRY_TROLLEY_COUNT_KEY = 'laundry_trolley_count';

// Picker tras — pokazuje wszystkie trasy jako chip-toggley
function RoutesPicker({ value, onChange }) {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const [allRoutes, setAllRoutes] = useState([]);

  useEffect(() => {
    if (!sessionToken) return;
    getAdminRouteOptions(sessionToken)
      .then(data => setAllRoutes(data?.routes || []))
      .catch(err => toastError(t('common.error') + ': ' + err.message));
  }, [sessionToken, t]);

  // value = string "1,3,5"
  const selected = new Set(
    (value || '').split(',').map(s => s.trim()).filter(Boolean).map(Number)
  );

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange([...next].sort((a, b) => a - b).join(','));
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
      {allRoutes.map(r => {
        const on = selected.has(r.id);
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => toggle(r.id)}
            style={{
              padding: '6px 12px', borderRadius: '20px', border: 'none',
              fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: on ? 'var(--accent)' : 'rgba(0,0,0,0.06)',
              color: on ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.12s',
            }}
          >
            {r.name}
          </button>
        );
      })}
      {allRoutes.length === 0 && (
        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{t('admin.loadingRoutes')}</span>
      )}
    </div>
  );
}

function AddUserModal({ onClose, onSave }) {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('driver');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!username.trim() || !name.trim()) return;
    setSaving(true);
    setError('');
    const result = await onSave(username.trim(), name.trim(), role);
    setSaving(false);
    if (result?.error) setError(result.error);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#34C759,#25A244)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(52,199,89,0.3)' }}>👤</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{t('admin.newUser')}</div>
          </div>

          {error && <div className="ap-error" style={{ marginBottom: '12px' }}>{error}</div>}

          <div style={LABEL_STYLE}>{t('auth.login')}</div>
          <input
            className="ap-input"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder={t('auth.loginPlaceholder')}
            style={{ marginBottom: '12px' }}
            autoFocus
            autoComplete="off"
          />

          <div style={LABEL_STYLE}>{t('auth.fullName')}</div>
          <input
            className="ap-input"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder={t('auth.fullNamePlaceholder')}
            style={{ marginBottom: '12px' }}
          />

          <div style={LABEL_STYLE}>{t('admin.role')}</div>
          <select className="ap-input" value={role} onChange={e => setRole(e.target.value)} style={{ marginBottom: '12px' }}>
            <option value="viewer">{t('admin.roleViewer')}</option>
            <option value="admin_viewer">{t('admin.roleAdminViewer')}</option>
            <option value="admin_viewer_driver">{t('admin.roleAdminViewerDriver')}</option>
            <option value="driver">{t('admin.roleDriver')}</option>
            <option value="admin">{t('admin.roleAdmin')}</option>
          </select>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !username.trim() || !name.trim()}>
              {saving ? t('admin.creating') : t('admin.createUser')}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({ user, defaultCar, onClose, onSave, onResetPassword, onDelete, onImpersonate }) {
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [routes, setRoutes] = useState(user.routes || '');
  const [car, setCar] = useState(defaultCar || '');
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onSave(user.id, name.trim(), role, routes.trim(), car);
    setSaving(false);
  };

  const handleReset = async () => {
    if (!user.has_password) return;
    setResetting(true);
    await onResetPassword(user.id);
    setResetting(false);
    setResetDone(true);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    await onDelete(user.id);
    setSaving(false);
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'linear-gradient(145deg,#FF9500,#CC6600)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0, boxShadow: '0 3px 10px rgba(255,149,0,0.3)' }}>✏️</div>
            <div>
              <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px', marginBottom: '1px' }}>{t('admin.editUser')}</div>
              <div style={{ fontSize: '12px', color: 'rgba(60,60,67,0.5)' }}>@{user.username}</div>
            </div>
          </div>

          <div style={LABEL_STYLE}>{t('auth.fullName')}</div>
          <input className="ap-input" value={name} onChange={e => setName(e.target.value)} style={{ marginBottom: '12px' }} autoFocus />

          <div style={LABEL_STYLE}>{t('admin.role')}</div>
          <select className="ap-input" value={role} onChange={e => setRole(e.target.value)} style={{ marginBottom: '12px' }}>
            <option value="viewer">{t('admin.roleViewer')}</option>
            <option value="admin_viewer">{t('admin.roleAdminViewer')}</option>
            <option value="admin_viewer_driver">{t('admin.roleAdminViewerDriver')}</option>
            <option value="driver">{t('admin.roleDriver')}</option>
            <option value="admin">{t('admin.roleAdmin')}</option>
          </select>

          {canAssignDriverSettings(role) && (
            <>
              <div style={LABEL_STYLE}>{t('admin.assignedRoutes')}</div>
              <RoutesPicker value={routes} onChange={setRoutes} />

              <div style={LABEL_STYLE}>{t('admin.defaultCar')}</div>
              <select className="ap-input" value={car} onChange={e => setCar(e.target.value)} style={{ marginBottom: '12px' }}>
                <option value="">{t('admin.noneDash')}</option>
                {VEHICLES.map(v => <option key={v.key} value={v.key}>{v.label}</option>)}
              </select>
            </>
          )}

          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', background: '#fff', borderRadius: '13px',
            marginBottom: '16px', boxShadow: '0 0 0 0.5px rgba(0,0,0,0.08)',
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>{t('admin.passwordStatus')}</div>
              <div style={{ fontSize: '12px', fontWeight: 500, marginTop: '2px', color: resetDone ? '#CC6600' : user.has_password ? '#25A244' : '#CC6600' }}>
                {resetDone
                  ? t('admin.passwordResetPending')
                  : user.has_password ? t('admin.passwordSet') : t('admin.passwordNotSet')}
              </div>
            </div>
            {user.has_password && !resetDone && (
              <button
                onClick={handleReset}
                disabled={resetting}
                style={{
                  background: 'rgba(255,59,48,0.1)', color: '#FF3B30',
                  border: 'none', borderRadius: '8px', padding: '6px 12px',
                  fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                {resetting ? '…' : t('admin.resetPassword')}
              </button>
            )}
          </div>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? t('common.saving') : t('admin.saveChanges')}
            </button>
            <button
              className="ap-btn"
              style={{ background: 'rgba(88,86,214,0.1)', color: '#5856D6', fontWeight: 600 }}
              onClick={onImpersonate}
              disabled={saving}
            >
              {t('admin.impersonateUser')}
            </button>
            <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>
              {confirmDelete ? t('admin.confirmDeleteUser') : t('admin.deleteUser')}
            </button>
            <button className="ap-btn ap-btn-secondary" onClick={onClose}>{t('common.close')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupModal({ group, onClose, onSave, onDelete }) {
  const { t } = useTranslation();
  const isNew = !group;
  const [name, setName] = useState(group?.name || '');
  const [color, setColor] = useState(group?.color || '#455a64');
  const [sortOrder, setSortOrder] = useState(group?.sort_order || 9999);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ id: group?.id, name: name.trim(), color, sort_order: parseInt(sortOrder, 10) || 9999 });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    const res = await onDelete(group.id, group.name);
    setSaving(false);
    if (res?.error) {
      toastError(res.error);
    }
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `linear-gradient(145deg, ${color}, ${color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🏷️</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{isNew ? t('admin.newGroup') : t('admin.editGroup')}</div>
          </div>

          <div style={LABEL_STYLE}>{t('admin.groupName')}</div>
          <input className="ap-input" value={name} onChange={e => setName(e.target.value)} placeholder={t('admin.groupNamePlaceholder')} style={{ marginBottom: '12px' }} autoFocus />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={LABEL_STYLE}>{t('admin.hexColor')}</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: '44px', height: '44px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }} />
                <input className="ap-input" value={color} onChange={e => setColor(e.target.value)} placeholder="#000000" />
              </div>
            </div>
            <div>
              <div style={LABEL_STYLE}>{t('admin.sortOrder')}</div>
              <input type="number" className="ap-input" value={sortOrder} onChange={e => setSortOrder(e.target.value)} placeholder="10" />
            </div>
          </div>

          <div className="ap-btn-group" style={{ marginTop: '24px' }}>
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? t('common.saving') : t('common.save')}</button>
            {!isNew && <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>{confirmDelete ? t('admin.confirmDelete') : t('common.delete')}</button>}
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupsSection() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAdminGroups(sessionToken);
      setGroups(data?.groups || []);
    } catch (err) {
      toastError(t('common.error') + ': ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [sessionToken, t]);

  useEffect(() => { fetch(); }, [fetch]);

  const handleSave = async ({ id, name, color, sort_order }) => {
    const args = {
      p_session_token: sessionToken,
      p_name: name,
      p_color: color,
      p_sort_order: sort_order,
    };
    const { data, error } = id
      ? await supabase.rpc('admin_update_group', { ...args, p_group_id: id })
      : await supabase.rpc('admin_create_group', args);
    if (error) {
      toastError(t('admin.errSaveGroup') + ' ' + error.message);
      return;
    }
    if (data?.error) {
      toastError(data.error);
      return;
    }
    setModal(null);
    fetch();
  };

  const handleDelete = async (id, groupName) => {
    const countData = await getAdminGroupEmployeeCount(sessionToken, groupName);
    const count = countData?.count || 0;
    if (count > 0) return { error: t('admin.groupHasEmployees', { count }) };
    
    const { data, error: deleteErr } = await supabase.rpc('admin_delete_group', {
      p_session_token: sessionToken,
      p_group_id: id,
    });
    if (deleteErr) return { error: deleteErr.message };
    if (data?.error) return { error: data.error };
    setModal(null);
    fetch();
    return { ok: true };
  };

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>{t('admin.loadingGroups')}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700 }}>{t('admin.employeeGroups')}</div>
        <button onClick={() => setModal('new')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{t('admin.addGroup')}</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {groups.map(g => (
          <div key={g.id} onClick={() => setModal(g)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: g.color }} />
            <div style={{ flex: 1, fontWeight: 600, fontSize: '15px' }}>{g.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>{t('admin.sort')}: {g.sort_order}</div>
          </div>
        ))}
      </div>

      {(modal === 'new' || (modal && typeof modal === 'object')) && (
        <GroupModal
          group={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

const CONTRACT_TYPES = ['UoP', 'UZ', 'UoD', 'B2B'];

function EmployeeModal({ employee, groups, monthLabel, onClose, onSave, onRemoveFromMonth }) {
  const { t } = useTranslation();
  const isNew = !employee;
  const [name, setName] = useState(employee?.name || '');
  const [groupName, setGroupName] = useState(employee?.group_name || (groups[0]?.name || ''));
  const [contractType, setContractType] = useState(employee?.contract_type || 'UoP');
  const [defaultStart, setDefaultStart] = useState(employee?.default_start || '7');
  const [defaultEnd, setDefaultEnd] = useState(employee?.default_end || '15');
  const [active, setActive] = useState(employee?.active !== false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    await onSave({ id: employee?.id, name: name.trim(), group_name: groupName, contract_type: contractType, default_start: defaultStart, default_end: defaultEnd, active });
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setSaving(true);
    await onRemoveFromMonth(employee.id);
    setSaving(false);
  };

  const grpColor = groups.find(g => g.name === groupName)?.color || '#455a64';

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: `linear-gradient(145deg, ${grpColor}, ${grpColor}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>👤</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{isNew ? t('admin.newEmployee') : t('admin.editEmployee')}</div>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '18px' }}>{t('admin.employeeMonthHint', { month: monthLabel })}</div>

          <div style={LABEL_STYLE}>{t('admin.employeeName')}</div>
          <input className="ap-input" value={name} onChange={e => setName(e.target.value)} placeholder={t('admin.employeeNamePlaceholder')} style={{ marginBottom: '12px' }} autoFocus />

          <div style={LABEL_STYLE}>{t('admin.groupThisMonth')}</div>
          <select className="ap-input" value={groupName} onChange={e => setGroupName(e.target.value)} style={{ marginBottom: '12px' }}>
            {groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}
          </select>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={LABEL_STYLE}>{t('admin.contract')}</div>
              <select className="ap-input" value={contractType} onChange={e => setContractType(e.target.value)}>
                {CONTRACT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <div style={LABEL_STYLE}>{t('admin.start')}</div>
              <input className="ap-input" value={defaultStart} onChange={e => setDefaultStart(e.target.value)} placeholder="7" />
            </div>
            <div>
              <div style={LABEL_STYLE}>{t('admin.end')}</div>
              <input className="ap-input" value={defaultEnd} onChange={e => setDefaultEnd(e.target.value)} placeholder="15" />
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', fontWeight: 600, marginBottom: '18px', cursor: 'pointer' }}>
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} style={{ width: '18px', height: '18px' }} />
            {t('admin.activeThisMonth')}
          </label>

          <div className="ap-btn-group">
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? t('common.saving') : t('common.save')}</button>
            {!isNew && <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>{confirmDelete ? t('admin.confirmRemoveFromMonth') : t('admin.removeFromMonth')}</button>}
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmployeesSection() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const [allEmployees, setAllEmployees] = useState([]); // globalna lista (do dodawania istniejących)
  const [roster, setRoster] = useState([]);             // skład wybranego miesiąca (z nieaktywnymi)
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null);             // null | 'new' | employee obj
  const [showAdd, setShowAdd] = useState(false);
  const now = new Date();
  const [cur, setCur] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });

  const monthLabel = `${monthNames()[cur.month - 1]} ${cur.year}`;
  const atMinMonth = cur.year === 2026 && cur.month === 1; // start: styczeń 2026
  const shiftMonth = (delta) => setCur(c => {
    const m0 = c.month - 1 + delta;
    const ny = c.year + Math.floor(m0 / 12);
    const nm = ((m0 % 12) + 12) % 12 + 1;
    if (ny < 2026) return c; // nie cofamy przed styczeń 2026
    return { year: ny, month: nm };
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const data = await withRetry(
        () => getAdminEmployeesData(sessionToken, cur.year, cur.month),
        { label: 'pracownicy' }
      );
      setAllEmployees(data?.employees || []);
      setGroups(data?.groups || []);
      setRoster(data?.roster || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [cur.year, cur.month, sessionToken]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSave = async ({ id, name, group_name, contract_type, default_start, default_end, active }) => {
    const maxOrder = allEmployees.length > 0 ? Math.max(...allEmployees.map(e => e.sort_order || 0)) : 0;
    const sort = id ? (roster.find(r => r.id === id)?.sort_order ?? 0) : maxOrder + 1;
    const { data, error } = await supabase.rpc('admin_save_employee', {
      p_session_token: sessionToken,
      p_employee_id: id || null,
      p_year: cur.year,
      p_month: cur.month,
      p_name: name,
      p_group_name: group_name,
      p_contract_type: contract_type,
      p_default_start: default_start,
      p_default_end: default_end,
      p_active: active,
      p_sort_order: sort,
    });
    if (error || data?.error) {
      toastError(t('admin.errSaveEmployee') + ' ' + (error?.message || data.error));
      return;
    }
    setModal(null);
    fetchAll();
  };

  // Usuń pracownika TYLKO z tego miesiąca (historia innych miesięcy zostaje)
  const handleRemoveFromMonth = async (id) => {
    const { data, error } = await supabase.rpc('admin_remove_employee_from_month', {
      p_session_token: sessionToken,
      p_employee_id: id,
      p_year: cur.year,
      p_month: cur.month,
    });
    if (error || data?.error) {
      toastError(t('admin.errRemoveFromMonth') + ' ' + (error?.message || data.error));
      return;
    }
    setModal(null);
    fetchAll();
  };

  // Dodaj istniejącego pracownika do tego miesiąca
  const handleAddExisting = async (emp) => {
    const maxOrder = roster.length > 0 ? Math.max(...roster.map(r => r.sort_order || 0)) : 0;
    const { data, error } = await supabase.rpc('admin_add_employee_to_month', {
      p_session_token: sessionToken,
      p_employee_id: emp.id,
      p_year: cur.year,
      p_month: cur.month,
      p_group_name: emp.group_name,
      p_sort_order: emp.sort_order ?? maxOrder + 1,
    });
    if (error || data?.error) {
      toastError(t('admin.errAddToMonth') + ' ' + (error?.message || data.error));
      return;
    }
    setShowAdd(false);
    fetchAll();
  };

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>{t('common.loading')}</div>;
  if (error) return <DataError onRetry={fetchAll} error={error} />;

  const rosterIds = new Set(roster.map(r => r.id));
  const notInMonth = allEmployees.filter(e => !rosterIds.has(e.id));

  const groupedEmps = groups.map(g => ({ g: g.name, color: g.color, members: roster.filter(e => e.group_name === g.name) }))
    .filter(({ members }) => members.length > 0);
  const extraGroups = [...new Set(roster.map(e => e.group_name))].filter(name => !groups.find(g => g.name === name));
  extraGroups.forEach(name => groupedEmps.push({ g: name, color: '#455a64', members: roster.filter(e => e.group_name === name) }));

  return (
    <div>
      {/* Wybór miesiąca */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '8px 10px' }}>
        <button onClick={() => shiftMonth(-1)} disabled={atMinMonth} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', cursor: atMinMonth ? 'not-allowed' : 'pointer', opacity: atMinMonth ? 0.4 : 1, fontWeight: 700 }}>‹</button>
        <div style={{ flex: 1, textAlign: 'center', fontWeight: 700, fontSize: '15px' }}>{monthLabel}</div>
        <button onClick={() => shiftMonth(1)} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 12px', cursor: 'pointer', fontWeight: 700 }}>›</button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700 }}>{t('admin.employeesInMonth', { count: roster.filter(e => e.active).length })}</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {notInMonth.length > 0 && (
            <button onClick={() => setShowAdd(s => !s)} style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{t('admin.addExisting')}</button>
          )}
          <button onClick={() => setModal('new')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>{t('admin.addNew')}</button>
        </div>
      </div>

      {/* Dodaj istniejącego do miesiąca */}
      {showAdd && (
        <div style={{ marginBottom: '14px', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', fontSize: '12px', fontWeight: 700, color: 'var(--text-tertiary)', background: 'var(--bg-secondary)' }}>{t('admin.addToMonth', { month: monthLabel })}</div>
          {notInMonth.map((e, i) => (
            <div key={e.id} onClick={() => handleAddExisting(e)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)', cursor: 'pointer' }}>
              <span style={{ flex: 1, fontSize: '14px', fontWeight: 600 }}>{e.name}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{e.group_name}</span>
              <span style={{ fontSize: '13px', color: 'var(--accent)', fontWeight: 700 }}>{t('admin.addSmall')}</span>
            </div>
          ))}
        </div>
      )}

      {groupedEmps.map(({ g, color, members }) => {
        return (
          <div key={g} style={{ marginBottom: '12px' }}>
            <div style={{ background: color, color: '#fff', fontWeight: 700, fontSize: '12px', padding: '6px 12px', borderRadius: '8px 8px 0 0' }}>{g}</div>
            <div style={{ border: `1px solid ${color}40`, borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
              {members.map((emp, i) => (
                <div key={emp.id} onClick={() => setModal(emp)} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: i % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-secondary)', cursor: 'pointer', opacity: emp.active ? 1 : 0.45 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, fontSize: '14px' }}>{emp.name}</span>
                    {!emp.active && <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '6px' }}>{t('admin.inactive')}</span>}
                  </div>
                  <span style={{ fontSize: '12px', fontWeight: 600, padding: '2px 7px', borderRadius: '5px', background: emp.contract_type === 'UoP' ? 'rgba(0,122,255,0.1)' : 'rgba(255,149,0,0.12)', color: emp.contract_type === 'UoP' ? '#007AFF' : '#CC6600' }}>{emp.contract_type}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>{emp.default_start}–{emp.default_end}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {(modal === 'new' || (modal && typeof modal === 'object')) && (
        <EmployeeModal
          employee={modal === 'new' ? null : modal}
          groups={groups}
          monthLabel={monthLabel}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onRemoveFromMonth={handleRemoveFromMonth}
        />
      )}
    </div>
  );
}

const ACTION_COLORS = {
  added: '#34C759',
  edited: '#FF9500',
  done: '#007AFF',
  undone: '#FF3B30',
  deleted: '#FF3B30',
  delivered: '#34C759',
  trip_start: '#5856D6',
  trip_end: '#5856D6',
};

const LOGS_PAGE_SIZE = 50;

function LogsSection() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    const from = page * LOGS_PAGE_SIZE;
    getLogsPage(sessionToken, { limit: LOGS_PAGE_SIZE, offset: from })
      .then(data => {
        setError(null);
        setLogs(data.logs || []);
        if (typeof data.total === 'number') setTotal(data.total);
      })
      .catch(error => {
        setError(error.message);
        setLogs([]);
      })
      .finally(() => setLoading(false));
  }, [page, sessionToken]);

  const totalPages = Math.max(1, Math.ceil(total / LOGS_PAGE_SIZE));

  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleDateString(currentLocale(), { day: '2-digit', month: '2-digit' })
      + ' ' + d.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>{t('admin.loadingLogs')}</div>;
  if (error) return <div style={{ color: 'var(--accent-red)', fontSize: '13px', padding: '12px 0' }}>{t('admin.errLoadingLogs')} {error}</div>;
  if (logs.length === 0) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>{t('admin.noLogs')}</div>;

  return (
    <div>
      <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
        {t('admin.logsCount', { count: total })}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {logs.map(log => {
          const color = ACTION_COLORS[log.action] || '#636366';
          const label = t(`logActions.${log.action}`, { defaultValue: log.action });
          return (
            <div key={log.id} style={{ background: 'var(--bg-card)', borderRadius: '10px', padding: '10px 14px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color, background: color + '18', padding: '2px 7px', borderRadius: '6px', flexShrink: 0 }}>{label}</span>
                <span style={{ fontWeight: 600, fontSize: '13px', flex: 1 }}>{log.client_name || '—'}</span>
                <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', flexShrink: 0 }}>{log.user_name}</span>
                <span style={{ fontSize: '11px', color: 'var(--text-quaternary)', flexShrink: 0 }}>{fmt(log.created_at)}</span>
              </div>
              {log.details && (
                <div style={{ marginTop: '5px', fontSize: '11px', color: 'var(--text-secondary)' }}>{log.details}</div>
              )}
            </div>
          );
        })}
      </div>
      {totalPages > 1 && (
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '16px', alignItems: 'center' }}>
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            style={{ padding: '6px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: page === 0 ? 'default' : 'pointer', fontWeight: 600, opacity: page === 0 ? 0.4 : 1 }}
          >‹</button>
          <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{page + 1} / {totalPages}</span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            style={{ padding: '6px 14px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', cursor: page >= totalPages - 1 ? 'default' : 'pointer', fontWeight: 600, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
          >›</button>
        </div>
      )}
    </div>
  );
}

function SessionsSection() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pruning, setPruning] = useState(false);
  const [revokingId, setRevokingId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [summary, details] = await Promise.all([
        getAdminSessionOverview(sessionToken),
        getAdminSessionDetails(sessionToken),
      ]);
      setOverview({ ...summary, sessions: details?.sessions || [] });
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => { load(); }, [load]);

  const handlePrune = async () => {
    setPruning(true);
    try {
      const data = await pruneUserSessions(sessionToken, SESSION_KEEP_ACTIVE);
      const pruned = data?.pruned || {};
      const count = Number(pruned.expired_revoked || 0) + Number(pruned.old_active_revoked || 0);
      toastSuccess(t('admin.sessionsPruned', { count }));
      await load();
    } catch (err) {
      toastError(t('admin.errPruneSessions') + ' ' + err.message);
    } finally {
      setPruning(false);
    }
  };

  const handleRevoke = async (session) => {
    if (session.is_current_session) return;
    const label = session.name ? `${session.name} (@${session.username})` : `@${session.username}`;
    if (!window.confirm(t('admin.confirmRevokeSession', { name: label }))) return;

    setRevokingId(session.id);
    try {
      await revokeUserSession(sessionToken, session.id);
      toastSuccess(t('admin.sessionRevoked'));
      await load();
    } catch (err) {
      toastError(t('admin.errRevokeSession') + ' ' + err.message);
    } finally {
      setRevokingId(null);
    }
  };

  const fmt = (iso) => {
    if (!iso) return t('admin.neverSeen');
    const d = new Date(iso);
    return d.toLocaleDateString(currentLocale(), { day: '2-digit', month: '2-digit' })
      + ' ' + d.toLocaleTimeString(currentLocale(), { hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>{t('admin.loadingSessions')}</div>;
  if (error) return <DataError onRetry={load} error={error} />;

  const users = overview?.users || [];
  const sessions = overview?.sessions || [];
  const sessionsByUser = sessions.reduce((acc, session) => {
    const rows = acc.get(session.user_id) || [];
    rows.push(session);
    acc.set(session.user_id, rows);
    return acc;
  }, new Map());

  const summaryItems = [
    { label: t('admin.activeSessions'), value: overview?.active_total ?? 0 },
    { label: t('admin.impersonationSessions'), value: overview?.impersonation_active_total ?? 0 },
    { label: t('admin.revokedSessions'), value: overview?.revoked_total ?? 0 },
    { label: t('admin.noPasswordUsers'), value: overview?.no_password_total ?? 0 },
    { label: t('admin.sessionLimit'), value: overview?.keep_active_per_user ?? SESSION_KEEP_ACTIVE },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '14px' }}>
        <div>
          <div style={{ fontSize: '17px', fontWeight: 700 }}>{t('admin.sessionOverview')}</div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
            {t('admin.sessionOverviewHint')}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
          <button
            type="button"
            onClick={load}
            title={t('common.refresh')}
            style={{ width: '38px', height: '38px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          >
            <RefreshCw size={16} />
          </button>
          <button
            type="button"
            onClick={handlePrune}
            disabled={pruning}
            style={{ height: '38px', borderRadius: '10px', border: 'none', background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', gap: '7px', padding: '0 13px', fontSize: '13px', fontWeight: 700, cursor: pruning ? 'default' : 'pointer', opacity: pruning ? 0.7 : 1 }}
          >
            <ShieldCheck size={16} />
            {pruning ? t('admin.pruningSessions') : t('admin.pruneSessions')}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '8px', marginBottom: '14px' }}>
        {summaryItems.map(item => (
          <div key={item.label} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '12px', padding: '12px 14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px' }}>{item.label}</div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginTop: '4px', fontVariantNumeric: 'tabular-nums' }}>{item.value}</div>
          </div>
        ))}
      </div>

      {users.length === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>{t('admin.noActiveSessions')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {users.map(u => {
            const active = Number(u.active_sessions || 0);
            const overLimit = active > Number(overview?.keep_active_per_user || SESSION_KEEP_ACTIVE);
            const userSessions = sessionsByUser.get(u.id) || [];
            const impersonationCount = userSessions.filter(s => s.is_impersonation).length;
            const badgeBg = overLimit ? 'rgba(255,59,48,0.12)' : userSessions.length > 0 ? 'rgba(52,199,89,0.12)' : 'var(--bg-secondary)';
            const badgeColor = overLimit ? '#FF3B30' : userSessions.length > 0 ? '#25A244' : 'var(--text-tertiary)';
            return (
              <div key={u.id} style={{ background: 'var(--bg-card)', border: `1px solid ${overLimit ? 'rgba(255,59,48,0.35)' : 'var(--border)'}`, borderRadius: '14px', padding: '13px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '15px', fontWeight: 700 }}>{u.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                      @{u.username} · {roleLabel(t, u.role)}
                      {!u.has_password && ` · ${t('admin.noPassword')}`}
                    </div>
                  </div>
                  <div style={{ fontSize: '12px', fontWeight: 800, padding: '4px 9px', borderRadius: '999px', background: badgeBg, color: badgeColor, flexShrink: 0 }}>
                    {active > 0 ? t('admin.sessionsCount', { count: active }) : t('admin.noSessionsShort')}
                    {impersonationCount > 0 && ` · ${t('admin.adminSessionsShort', { count: impersonationCount })}`}
                  </div>
                </div>

                {userSessions.length === 0 ? (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '10px' }}>{t('admin.noUserActiveSessions')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', marginTop: '11px' }}>
                    {userSessions.map(session => {
                      const isRevoking = revokingId === session.id;
                      const typeLabel = session.is_current_session
                        ? t('admin.currentSession')
                        : session.is_impersonation ? t('admin.impersonationSession') : t('admin.regularSession');
                      const typeColor = session.is_current_session
                        ? '#007AFF'
                        : session.is_impersonation ? '#5856D6' : '#25A244';
                      return (
                        <div key={session.id} style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 11px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', minWidth: 0 }}>
                              <span style={{ fontSize: '11px', fontWeight: 800, padding: '3px 7px', borderRadius: '999px', background: `${typeColor}18`, color: typeColor }}>
                                {typeLabel}
                              </span>
                              {session.is_impersonation && (
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                  {t('admin.impersonatedBy')}: {session.impersonated_by_name || session.impersonated_by_username || '—'}
                                </span>
                              )}
                              {session.is_current_session && (
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 600 }}>
                                  {t('admin.currentSessionCannotRevoke')}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRevoke(session)}
                              disabled={session.is_current_session || isRevoking}
                              title={session.is_current_session ? t('admin.currentSessionCannotRevoke') : t('admin.revokeSession')}
                              style={{ width: '32px', height: '32px', borderRadius: '9px', border: 'none', background: session.is_current_session ? 'rgba(0,0,0,0.05)' : 'rgba(255,59,48,0.1)', color: session.is_current_session ? 'var(--text-tertiary)' : '#FF3B30', display: 'grid', placeItems: 'center', cursor: session.is_current_session || isRevoking ? 'default' : 'pointer', opacity: isRevoking ? 0.7 : 1, flexShrink: 0 }}
                            >
                              {isRevoking ? '…' : <Trash2 size={15} />}
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px 12px', marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                            <span><span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>{t('admin.device')}:</span> {session.device_label || t('admin.unknownDevice')}</span>
                            <span><span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>{t('admin.createdAt')}:</span> {fmt(session.created_at)}</span>
                            <span><span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>{t('admin.lastSeen')}:</span> {fmt(session.last_seen_at || session.created_at)}</span>
                            <span><span style={{ color: 'var(--text-tertiary)', fontWeight: 600 }}>{t('admin.expiresAt')}:</span> {fmt(session.expires_at)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsSection() {
  const { t } = useTranslation();
  const { sessionToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [trolleyCount, setTrolleyCount] = useState(25);
  const [draftCount, setDraftCount] = useState('25');
  const [activeTrolleyCount, setActiveTrolleyCount] = useState(0);
  const [error, setError] = useState('');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getLaundryWorkflow(sessionToken);
      const count = Math.max(1, Math.min(99, Number(data?.trolley_count) || 25));
      const active = (data?.trolleys || []).filter(cycle => !cycle.returned_at && cycle.status !== 'returned').length;
      setTrolleyCount(count);
      setDraftCount(String(count));
      setActiveTrolleyCount(active);
    } catch (err) {
      setError(err.message || t('admin.errLoadSettings'));
    } finally {
      setLoading(false);
    }
  }, [sessionToken, t]);

  useEffect(() => {
    if (sessionToken) loadSettings();
  }, [loadSettings, sessionToken]);

  const handleSaveTrolleyCount = async () => {
    const nextCount = Math.round(Number(draftCount));
    if (!Number.isFinite(nextCount) || nextCount < 1 || nextCount > 99) {
      toastError(t('admin.trolleyCountRange'));
      return;
    }
    if (nextCount < activeTrolleyCount) {
      toastError(t('admin.trolleyCountBelowActive', { count: activeTrolleyCount }));
      return;
    }

    setSaving(true);
    try {
      await upsertAppSetting(sessionToken, LAUNDRY_TROLLEY_COUNT_KEY, nextCount);
      setTrolleyCount(nextCount);
      setDraftCount(String(nextCount));
      toastSuccess(t('admin.trolleyCountSaved', { count: nextCount }));
      await loadSettings();
    } catch (err) {
      toastError(err.message || t('admin.errSaveSettings'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="loader">{t('admin.loadingSettings')}</div>;
  if (error) return <DataError onRetry={loadSettings} error={error} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        padding: '16px',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
          <div style={{
            width: '38px',
            height: '38px',
            borderRadius: '11px',
            background: 'rgba(88,86,214,.11)',
            color: 'var(--accent-indigo)',
            display: 'grid',
            placeItems: 'center',
            flexShrink: 0,
          }}>
            <Archive size={18} />
          </div>
          <div>
            <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>{t('admin.laundrySettings')}</div>
            <div style={{ marginTop: '3px', fontSize: '12px', fontWeight: 650, color: 'var(--text-tertiary)' }}>
              {t('admin.trolleyCountHint', { active: activeTrolleyCount })}
            </div>
          </div>
        </div>

        <div className="laundry-trolley-count-control" style={{ width: '100%', justifyContent: 'space-between' }}>
          <label>
            <span>{t('admin.trolleyCount')}</span>
            <input
              type="number"
              min={Math.max(activeTrolleyCount, 1)}
              max="99"
              value={draftCount}
              onChange={e => setDraftCount(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={handleSaveTrolleyCount}
            disabled={saving || Number(draftCount) === trolleyCount}
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const { t } = useTranslation();
  const { impersonate, isAdmin, sessionToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [driverCars, setDriverCars] = useState({}); // { userId: carKey }
  const [tab, setTab] = useState('users'); // 'users' | 'groups' | 'employees' | 'logs' | 'sessions' | 'settings'

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await withRetry(() => getAdminUsersData(sessionToken), { label: 'użytkownicy' });
      setUsers(data?.users || []);
      setDriverCars(data?.driver_cars || {});
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, sessionToken]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  if (!isAdmin) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('admin.noAccess')}</div>;

  const handleAddUser = async (username, name, role) => {
    const { data, error } = await supabase.rpc('admin_create_user', {
      p_session_token: sessionToken,
      p_username: username,
      p_name: name,
      p_role: role,
    });
    if (error) return { error: error.message };
    if (data?.error) return { error: data.error };
    setAddUserOpen(false);
    fetchUsers();
    return { ok: true };
  };

  const handleSaveUser = async (userId, name, role, routes, car) => {
    const { error: e1 } = await supabase.rpc('update_user_role', { p_session_token: sessionToken, p_user_id: userId, p_role: role });
    if (e1) { toastError(t('admin.errSaveRole') + ' ' + e1.message); return; }
    const { error: e2 } = await supabase.rpc('update_user_routes', { p_session_token: sessionToken, p_user_id: userId, p_routes: routes });
    if (e2) { toastError(t('admin.errSaveRoutes') + ' ' + e2.message); return; }
    // Domyślne auto kierowcy → app_settings (jeden wiersz 'driver_cars')
    const nextCars = { ...driverCars };
    if (car) nextCars[userId] = car; else delete nextCars[userId];
    try {
      await upsertAppSetting(sessionToken, DRIVER_CARS_KEY, nextCars);
    } catch (e3) {
      toastError(t('admin.errSaveCar') + ' ' + e3.message);
      return;
    }
    setDriverCars(nextCars);
    setEditUser(null);
    toastSuccess(t('admin.saved'));
    fetchUsers();
  };

  const handleResetPassword = async (userId) => {
    const { data, error } = await supabase.rpc('admin_reset_password', { p_session_token: sessionToken, p_user_id: userId });
    if (error || data?.error) {
      toastError(t('admin.errReset') + ' ' + (error?.message || data?.error));
      return;
    }
    toastSuccess(t('admin.passwordReset'));
    fetchUsers();
  };

  const handleDeleteUser = async (userId) => {
    const { data, error } = await supabase.rpc('admin_delete_user', { p_session_token: sessionToken, p_user_id: userId });
    if (error || data?.error) { toastError(t('admin.errDeleting') + ' ' + (error?.message || data?.error)); return; }
    setEditUser(null);
    toastSuccess(t('admin.userDeleted'));
    fetchUsers();
  };

  const handleImpersonate = async (userId) => {
    const result = await impersonate(userId);
    if (result?.error) { toastError(t('common.error') + ': ' + result.error); return; }
    setEditUser(null);
    // Przekieruj na stronę główną
    window.location.href = '/';
  };

  if (loading) return <div className="loader">{t('admin.loadingUsers')}</div>;
  if (error) return <DataError onRetry={fetchUsers} error={error} />;

  return (
    <div style={{ maxWidth: '600px' }}>
      <div className="segmented-control" style={{ marginBottom: '16px', flexWrap: 'wrap' }}>
        <button type="button" className={`seg-btn ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>{t('admin.users')}</button>
        <button type="button" className={`seg-btn ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>{t('admin.groups')}</button>
        <button type="button" className={`seg-btn ${tab === 'employees' ? 'active' : ''}`} onClick={() => setTab('employees')}>{t('admin.employees')}</button>
        <button type="button" className={`seg-btn ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>{t('admin.logs')}</button>
        <button type="button" className={`seg-btn ${tab === 'sessions' ? 'active' : ''}`} onClick={() => setTab('sessions')}>{t('admin.sessions')}</button>
        <button type="button" className={`seg-btn ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>{t('admin.settings')}</button>
      </div>

      {tab === 'logs' && <LogsSection />}
      {tab === 'employees' && <EmployeesSection />}
      {tab === 'groups' && <GroupsSection />}
      {tab === 'sessions' && <SessionsSection />}
      {tab === 'settings' && <SettingsSection />}

      {tab === 'users' && <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700 }}>{t('admin.usersWithCount', { count: users.length })}</div>
        <button
          onClick={() => setAddUserOpen(true)}
          style={{
            background: 'var(--accent)', color: '#fff',
            border: 'none', borderRadius: '10px',
            padding: '8px 14px', fontSize: '13px', fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('admin.newUserBtn')}
        </button>
      </div>

      <Link to="/rodo" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600, marginBottom: '14px' }}>
        <ShieldCheck size={13} /> {t('admin.rodoFullLink')}
      </Link>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {users.map(u => (
          <div
            key={u.id}
            onClick={() => setEditUser(u)}
            style={{
              background: 'var(--bg-card)', border: '1px solid var(--border)',
              borderRadius: '14px', padding: '14px 16px',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer',
            }}
          >
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px' }}>{u.name}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                @{u.username} · {roleLabel(t, u.role)}
                {u.routes ? ` · ${t('admin.routes')}: ${u.routes}` : ''}
              </div>
              <div style={{ fontSize: '11px', color: u.privacy_notice_ack_version ? '#25A244' : '#CC6600', marginTop: '4px', fontWeight: 600 }}>
                {t('admin.rodo')}: {u.privacy_notice_ack_version ? t('admin.rodoConfirmed', { version: u.privacy_notice_ack_version }) : t('admin.rodoMissing')}
              </div>
            </div>
            <div style={{
              fontSize: '11px', fontWeight: 600, padding: '3px 8px', borderRadius: '6px',
              background: u.has_password ? 'rgba(52,199,89,0.12)' : 'rgba(255,149,0,0.12)',
              color: u.has_password ? '#25A244' : '#CC6600',
              flexShrink: 0,
            }}>
              {u.has_password ? t('admin.active') : t('admin.noPassword')}
            </div>
          </div>
        ))}
      </div>

      {addUserOpen && (
        <AddUserModal onClose={() => setAddUserOpen(false)} onSave={handleAddUser} />
      )}

      {editUser && (
        <EditUserModal
          user={editUser}
          defaultCar={driverCars[editUser.id] || ''}
          onClose={() => setEditUser(null)}
          onSave={handleSaveUser}
          onResetPassword={handleResetPassword}
          onDelete={handleDeleteUser}
          onImpersonate={() => handleImpersonate(editUser.id)}
        />
      )}
      </>}
    </div>
  );
}
