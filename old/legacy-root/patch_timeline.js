const fs = require('fs');
let code = fs.readFileSync('react-app/src/components/TimelineView.jsx', 'utf8');

// 1. Remove GROUP_COLORS and GROUP_ORDER
code = code.replace(/const GROUP_COLORS = \{[\s\S]*?\};\nconst GROUP_ORDER = \[.*?\];\n/m, '');

// 2. Add groupData state
code = code.replace("const [employees, setEmployees] = useState([]);", "const [employees, setEmployees] = useState([]);\n  const [groupData, setGroupData] = useState([]);");

// 3. Update fetchData
const oldFetch = `    const [{ data: emps }, { data: tl }, { data: sched }] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('timeline_entries').select('*').gte('entry_date', dateFrom).lte('entry_date', dateTo),
      supabase.from('schedule_entries').select('employee_id,day,value')
        .eq('year', monday.getFullYear())
        .eq('month', monday.getMonth() + 1),
    ]);

    setEmployees(emps || []);`;

const newFetch = `    const [{ data: emps }, { data: tl }, { data: sched }, { data: grps }] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('timeline_entries').select('*').gte('entry_date', dateFrom).lte('entry_date', dateTo),
      supabase.from('schedule_entries').select('employee_id,day,value')
        .eq('year', monday.getFullYear())
        .eq('month', monday.getMonth() + 1),
      supabase.from('groups').select('*').order('sort_order').order('name')
    ]);

    setEmployees(emps || []);
    setGroupData(grps || []);`;

code = code.replace(oldFetch, newFetch);

// 4. Update groups computation
const oldGroups = `  // Group employees
  const groups = GROUP_ORDER
    .map(g => ({ g, members: employees.filter(e => e.group_name === g) }))
    .filter(({ members }) => members.length > 0);
  [...new Set(employees.map(e => e.group_name))].filter(g => !GROUP_ORDER.includes(g))
    .forEach(g => { const m = employees.filter(e => e.group_name === g); if (m.length) groups.push({ g, members: m }); });`;

const newGroups = `  // Group employees
  const groups = groupData.map(g => ({ g: g.name, color: g.color, members: employees.filter(e => e.group_name === g.name) }))
    .filter(({ members }) => members.length > 0);
  const extraNames = [...new Set(employees.map(e => e.group_name))].filter(name => !groupData.find(g => g.name === name));
  extraNames.forEach(name => {
    const m = employees.filter(e => e.group_name === name);
    if (m.length) groups.push({ g: name, color: '#455a64', members: m });
  });`;

code = code.replace(oldGroups, newGroups);

// 5. Render
code = code.replace(/groups\.map\(\(\{ g, members \}\) => \{[\s\S]*?const grpColor = GROUP_COLORS\[g\] \|\| '#455a64';/, 'groups.map(({ g, color: grpColor, members }) => {');

fs.writeFileSync('react-app/src/components/TimelineView.jsx', code);
