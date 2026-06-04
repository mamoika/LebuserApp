const fs = require('fs');
let code = fs.readFileSync('react-app/src/components/AdminDashboard.jsx', 'utf8');

// 1. Remove GROUP_COLORS and GROUP_ORDER
code = code.replace(/const GROUP_COLORS = \{[\s\S]*?\};\nconst GROUP_ORDER = \[.*?\];\n/m, '');

// 2. Add GroupsSection and GroupModal
const groupsCode = `function GroupModal({ group, onClose, onSave, onDelete }) {
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
      import('../lib/toast').then(m => m.toastError(res.error));
    }
  };

  return (
    <div className="ap-overlay" style={{ display: 'flex' }} onClick={onClose}>
      <div className="ap-sheet" onClick={e => e.stopPropagation()}>
        <div className="ap-handle" />
        <div className="ap-content">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: \`linear-gradient(145deg, \${color}, \${color}cc)\`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', flexShrink: 0 }}>🏷️</div>
            <div className="ap-title" style={{ textAlign: 'left', fontSize: '19px' }}>{isNew ? 'Nowa grupa' : 'Edytuj grupę'}</div>
          </div>

          <div style={LABEL_STYLE}>Nazwa grupy</div>
          <input className="ap-input" value={name} onChange={e => setName(e.target.value)} placeholder="np. KIEROWCY" style={{ marginBottom: '12px' }} autoFocus />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={LABEL_STYLE}>Kolor HEX</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: '44px', height: '44px', padding: 0, border: 'none', borderRadius: '8px', cursor: 'pointer' }} />
                <input className="ap-input" value={color} onChange={e => setColor(e.target.value)} placeholder="#000000" />
              </div>
            </div>
            <div>
              <div style={LABEL_STYLE}>Kolejność (Sort)</div>
              <input type="number" className="ap-input" value={sortOrder} onChange={e => setSortOrder(e.target.value)} placeholder="10" />
            </div>
          </div>

          <div className="ap-btn-group" style={{ marginTop: '24px' }}>
            <button className="ap-btn ap-btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>{saving ? 'Zapisywanie…' : 'Zapisz'}</button>
            {!isNew && <button className="ap-btn ap-btn-danger" onClick={handleDelete} disabled={saving}>{confirmDelete ? 'Na pewno usunąć?' : 'Usuń'}</button>}
            <button className="ap-btn ap-btn-secondary" onClick={onClose} disabled={saving}>Anuluj</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupsSection() {
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);

  const fetch = async () => {
    const { data } = await supabase.from('groups').select('*').order('sort_order').order('name');
    setGroups(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  const handleSave = async ({ id, name, color, sort_order }) => {
    if (id) {
      await supabase.from('groups').update({ name, color, sort_order }).eq('id', id);
    } else {
      await supabase.from('groups').insert({ name, color, sort_order });
    }
    setModal(null);
    fetch();
  };

  const handleDelete = async (id, groupName) => {
    const { count, error } = await supabase.from('employees').select('id', { count: 'exact', head: true }).eq('group_name', groupName);
    if (error) return { error: error.message };
    if (count > 0) return { error: \`Nie można usunąć grupy, do której przypisanych jest \${count} pracowników.\` };
    
    await supabase.from('groups').delete().eq('id', id);
    setModal(null);
    fetch();
    return { ok: true };
  };

  if (loading) return <div style={{ color: 'var(--text-tertiary)', fontSize: '13px', padding: '12px 0' }}>Ładowanie grup…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '17px', fontWeight: 700 }}>Grupy pracowników</div>
        <button onClick={() => setModal('new')} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>+ Dodaj grupę</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {groups.map(g => (
          <div key={g.id} onClick={() => setModal(g)} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 14px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)', cursor: 'pointer' }}>
            <div style={{ width: '24px', height: '24px', borderRadius: '6px', background: g.color }} />
            <div style={{ flex: 1, fontWeight: 600, fontSize: '15px' }}>{g.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Sort: {g.sort_order}</div>
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

`;
code = code.replace('const CONTRACT_TYPES', groupsCode + 'const CONTRACT_TYPES');

// 3. EmployeeModal logic update
code = code.replace('function EmployeeModal({ employee, onClose, onSave, onDelete }) {', 'function EmployeeModal({ employee, groups, onClose, onSave, onDelete }) {');
code = code.replace("const [groupName, setGroupName] = useState(employee?.group_name || 'ZD 1');", "const [groupName, setGroupName] = useState(employee?.group_name || (groups[0]?.name || ''));");
code = code.replace("const grpColor = GROUP_COLORS[groupName] || '#455a64';", "const grpColor = groups.find(g => g.name === groupName)?.color || '#455a64';");
code = code.replace("{GROUP_ORDER.map(g => <option key={g} value={g}>{g}</option>)}", "{groups.map(g => <option key={g.id} value={g.name}>{g.name}</option>)}");

// 4. EmployeesSection logic update
const oldEmployeesSection = `function EmployeesSection() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | employee obj

  const fetch = async () => {
    const { data } = await supabase.from('employees').select('*').order('sort_order').order('name');
    setEmployees(data || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);`;

const newEmployeesSection = `function EmployeesSection() {
  const [employees, setEmployees] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // null | 'new' | employee obj

  const fetch = async () => {
    const [{ data: empData }, { data: grpData }] = await Promise.all([
      supabase.from('employees').select('*').order('sort_order').order('name'),
      supabase.from('groups').select('*').order('sort_order')
    ]);
    setEmployees(empData || []);
    setGroups(grpData || []);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);`;

code = code.replace(oldEmployeesSection, newEmployeesSection);

const oldGroupsLogic = `  const groups = GROUP_ORDER.map(g => ({ g, members: employees.filter(e => e.group_name === g) }))
    .filter(({ members }) => members.length > 0);
  // grupy spoza listy
  const extraGroups = [...new Set(employees.map(e => e.group_name))].filter(g => !GROUP_ORDER.includes(g));
  extraGroups.forEach(g => groups.push({ g, members: employees.filter(e => e.group_name === g) }));`;

const newGroupsLogic = `  const groupedEmps = groups.map(g => ({ g: g.name, color: g.color, members: employees.filter(e => e.group_name === g.name) }))
    .filter(({ members }) => members.length > 0);
  const extraGroups = [...new Set(employees.map(e => e.group_name))].filter(name => !groups.find(g => g.name === name));
  extraGroups.forEach(name => groupedEmps.push({ g: name, color: '#455a64', members: employees.filter(e => e.group_name === name) }));`;

code = code.replace(oldGroupsLogic, newGroupsLogic);

code = code.replace(/groups\.map\(\(\{ g, members \}\) => \{[\s\S]*?const color = GROUP_COLORS\[g\] \|\| '#455a64';/, 'groupedEmps.map(({ g, color, members }) => {');
code = code.replace(/employee=\{modal === 'new' \? null : modal\}/, "employee={modal === 'new' ? null : modal}\n          groups={groups}");

// 5. Tabs
code = code.replace(/<button type="button" className={`seg-btn \${tab === 'users' \? 'active' : ''}`} onClick=\{\(\) => setTab\('users'\)\}>Użytkownicy<\/button>/, `<button type="button" className={\`seg-btn \${tab === 'users' ? 'active' : ''}\`} onClick={() => setTab('users')}>Użytkownicy</button>
        <button type="button" className={\`seg-btn \${tab === 'groups' ? 'active' : ''}\`} onClick={() => setTab('groups')}>Grupy</button>`);

code = code.replace("{tab === 'employees' && <EmployeesSection />}", "{tab === 'employees' && <EmployeesSection />}\n      {tab === 'groups' && <GroupsSection />}");


fs.writeFileSync('react-app/src/components/AdminDashboard.jsx', code);
