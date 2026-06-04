const fs = require('fs');
let code = fs.readFileSync('react-app/src/components/GrafikView.jsx', 'utf8');

// 1. Remove GROUP_COLORS and GROUP_ORDER
code = code.replace(/const GROUP_COLORS = \{[\s\S]*?\};\nconst GROUP_ORDER = \[.*?\];\n/m, '');

// 2. Add groupData state
code = code.replace("const [employees, setEmployees] = useState([]);", "const [employees, setEmployees] = useState([]);\n  const [groupData, setGroupData] = useState([]);");

// 3. Update fetchData
const oldFetch = `    const [{ data: emps }, { data: sched }] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('schedule_entries').select('*').eq('year', year).eq('month', month),
    ]);
    setEmployees(emps || []);`;

const newFetch = `    const [{ data: emps }, { data: sched }, { data: grps }] = await Promise.all([
      supabase.from('employees').select('*').eq('active', true).order('sort_order').order('name'),
      supabase.from('schedule_entries').select('*').eq('year', year).eq('month', month),
      supabase.from('groups').select('*').order('sort_order').order('name')
    ]);
    setEmployees(emps || []);
    setGroupData(grps || []);`;

code = code.replace(oldFetch, newFetch);

// 4. Update groups memo
const oldGroups = `  const groups = useMemo(() => {
    const g = GROUP_ORDER
      .map(g => ({ g, members: employees.filter(e => e.group_name === g) }))
      .filter(({ members }) => members.length > 0);
    [...new Set(employees.map(e => e.group_name))].filter(g => !GROUP_ORDER.includes(g))
      .forEach(g => { const m = employees.filter(e => e.group_name === g); if (m.length) g.push({ g, members: m }); });
    return g;
  }, [employees]);`;

const newGroups = `  const groups = useMemo(() => {
    const res = groupData.map(g => ({ g: g.name, color: g.color, members: employees.filter(e => e.group_name === g.name) }))
      .filter(({ members }) => members.length > 0);
    
    const extraNames = [...new Set(employees.map(e => e.group_name))].filter(name => !groupData.find(g => g.name === name));
    extraNames.forEach(name => {
      const members = employees.filter(e => e.group_name === name);
      if (members.length) res.push({ g: name, color: '#455a64', members });
    });
    return res;
  }, [employees, groupData]);`;

code = code.replace(oldGroups, newGroups);

// 5. Update render
code = code.replace(/groups\.map\(\(\{ g, members \}\) => \{[\s\S]*?const grpColor = GROUP_COLORS\[g\] \|\| '#455a64';/, 'groups.map(({ g, color: grpColor, members }) => {');

fs.writeFileSync('react-app/src/components/GrafikView.jsx', code);
