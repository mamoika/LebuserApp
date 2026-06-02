const fs = require('fs');
let code = fs.readFileSync('src/js/supabaseApi.js', 'utf8');
code = code.replace('clients: clients || [],', 'clients: (clients || []).map(c => ({ name: c.name, route: c.route_id, order: c.sort_order, lat: c.lat, lng: c.lng })),');
fs.writeFileSync('src/js/supabaseApi.js', code);
