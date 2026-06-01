import { supabase } from './supabaseClient.js';

function checkAuth(token) {
  if (token !== '123') throw new Error('Brak uprawnień'); // Zastąpienie prostym sprawdzeniem, docelowo Auth
}

export const api = {
  getAppData: async () => {
    const [{data: clients}, {data: routes}, {data: drivers}] = await Promise.all([
      supabase.from('clients').select('*').order('sort_order'),
      supabase.from('routes').select('*').order('id'),
      supabase.from('drivers').select('*')
    ]);
    return { 
      clients: clients || [], 
      routes: routes || [], 
      drivers: (drivers || []).map(d => ({
        id: d.id,
        name: d.name,
        routes: (d.routes || '').split(',').map(r => parseInt(r.trim())).filter(r => !isNaN(r))
      }))
    };
  },
  
  getEntriesForWeeks: async (weeks) => {
    const { data, error } = await supabase.from('entries')
      .select('*')
      .or(`week_key.in.(${weeks.map(w=>`"${w}"`).join(',')}),pick_week_key.in.(${weeks.map(w=>`"${w}"`).join(',')})`);
    if (error) throw error;
    return data.map(r => ({
      id: r.id, weekKey: r.week_key, pickWeekKey: r.pick_week_key, client: r.client_name,
      arrDay: r.arr_day, pickDay: r.pick_day, done: r.done, addedAt: r.added_at,
      weight: r.weight, route: r.route_id, type: r.type, addedBy: r.added_by,
      pickedBy: r.picked_by, pickedAt: r.picked_at, comment: r.comment, urgent: r.urgent, order: r.sort_order
    }));
  },

  addEntry: async (arrWeekKey, client, arrDay, pickDay, pickWeekKey, weight, route, type, driverName, isUrgent, comment) => {
    let parsedWeight = weight ? parseFloat(String(weight).trim().replace(',', '.')) : null;
    const { data, error } = await supabase.from('entries').insert([{
      id: 'ID_' + new Date().getTime(),
      week_key: arrWeekKey, client_name: client, arr_day: arrDay, pick_day: pickDay,
      pick_week_key: pickWeekKey, weight: parsedWeight, route_id: route, type: type,
      added_by: driverName, urgent: isUrgent, comment: comment
    }]).select();
    if (error) return { error: error.message };
    
    await supabase.from('logs').insert([{ user_name: driverName, action: 'Dodanie', target_id: data[0].id, details: 'Klient: ' + client }]);
    return { ok: true, id: data[0].id };
  },

  updateEntry: async (id, newArrDay, newPickDay, isNextWeek, newWeight, fallback, adminToken, type, isUrgent, comment) => {
    checkAuth(adminToken);
    let parsedWeight = newWeight ? parseFloat(String(newWeight).trim().replace(',', '.')) : null;
    let updates = { arr_day: newArrDay, pick_day: newPickDay, type: type || 'P', urgent: !!isUrgent };
    if (parsedWeight !== null) updates.weight = parsedWeight;
    if (comment !== undefined) updates.comment = comment;
    
    if (isNextWeek) {
      const { data: entry } = await supabase.from('entries').select('week_key').eq('id', id).single();
      if (entry) {
        const parts = entry.week_key.split('-');
        const d = new Date(parts[0], parts[1]-1, parts[2]);
        d.setDate(d.getDate() + 7);
        const y = d.getFullYear(); const m = String(d.getMonth()+1).padStart(2,'0'); const day = String(d.getDate()).padStart(2,'0');
        updates.pick_week_key = `${y}-${m}-${day}`;
      }
    }
    
    const { error } = await supabase.from('entries').update(updates).eq('id', id);
    if (error) return { error: error.message };
    await supabase.from('logs').insert([{ user_name: 'Admin', action: 'Edycja', target_id: id, details: 'Dzień odb: ' + newPickDay }]);
    return { ok: true };
  },

  toggleDone: async (id, driverName) => {
    const { data: entry } = await supabase.from('entries').select('done').eq('id', id).single();
    if (!entry) return { error: 'Nie znaleziono' };
    
    const isDone = !entry.done;
    const pickedAt = isDone ? new Date().toISOString() : null;
    const pickedBy = isDone ? driverName : null;
    
    const { error } = await supabase.from('entries').update({ done: isDone, picked_by: pickedBy, picked_at: pickedAt }).eq('id', id);
    if (error) return { error: error.message };
    await supabase.from('logs').insert([{ user_name: driverName, action: isDone?'Odbiór':'Cofnięcie odbioru', target_id: id }]);
    return { ok: true };
  },

  removeEntry: async (id, adminToken) => {
    checkAuth(adminToken);
    const { error } = await supabase.from('entries').delete().eq('id', id);
    if (error) return { error: error.message };
    await supabase.from('logs').insert([{ user_name: 'Admin', action: 'Usunięcie', target_id: id }]);
    return { ok: true };
  },

  removeOwnEntry: async (id, driverName) => {
    const { data: entry } = await supabase.from('entries').select('added_by').eq('id', id).single();
    if (!entry || entry.added_by !== driverName) return { error: 'Możesz usunąć tylko wpisy dodane przez siebie' };
    
    const { error } = await supabase.from('entries').delete().eq('id', id);
    if (error) return { error: error.message };
    await supabase.from('logs').insert([{ user_name: driverName, action: 'Usunięcie własne', target_id: id }]);
    return { ok: true };
  },

  saveCommentByDriver: async (id, driverName, comment) => {
    const { data: entry } = await supabase.from('entries').select('added_by').eq('id', id).single();
    if (!entry || entry.added_by !== driverName) return { error: 'Możesz edytować komentarz tylko własnych wpisów' };
    
    const { error } = await supabase.from('entries').update({ comment: comment }).eq('id', id);
    if (error) return { error: error.message };
    await supabase.from('logs').insert([{ user_name: driverName, action: 'Komentarz', target_id: id, details: comment }]);
    return { ok: true };
  },

  addRoute: async (name, adminToken) => {
    checkAuth(adminToken);
    const { data, error } = await supabase.from('routes').insert([{ name: name }]).select();
    if (error) return { error: error.message };
    return { ok: true, newId: data[0].id };
  },

  updateRouteName: async (id, newName, adminToken) => {
    checkAuth(adminToken);
    const { error } = await supabase.from('routes').update({ name: newName }).eq('id', id);
    if (error) return { error: error.message };
    return { ok: true };
  },

  removeRoute: async (id, adminToken) => {
    checkAuth(adminToken);
    const { count } = await supabase.from('clients').select('id', { count: 'exact', head: true }).eq('route_id', id);
    if (count > 0) return { error: 'Nie można usunąć trasy z przypisanymi klientami' };
    
    const { error } = await supabase.from('routes').delete().eq('id', id);
    if (error) return { error: error.message };
    return { ok: true };
  },

  addClient: async (name, route, adminToken) => {
    checkAuth(adminToken);
    const { error } = await supabase.from('clients').insert([{ name: name, route_id: route }]);
    if (error) return { error: error.message };
    return { ok: true };
  },

  updateClient: async (oldName, newName, newRoute, lat, lng, adminToken) => {
    checkAuth(adminToken);
    const updates = { name: newName, route_id: newRoute };
    if (lat !== undefined && lat !== '') updates.lat = parseFloat(String(lat).replace(',', '.'));
    if (lng !== undefined && lng !== '') updates.lng = parseFloat(String(lng).replace(',', '.'));
    
    const { error } = await supabase.from('clients').update(updates).eq('name', oldName);
    if (error) return { error: error.message };
    
    // Update entries with new client name and route
    await supabase.from('entries').update({ client_name: newName, route_id: newRoute }).eq('client_name', oldName);
    return { ok: true };
  },

  removeClient: async (name, adminToken) => {
    checkAuth(adminToken);
    const { error } = await supabase.from('clients').delete().eq('name', name);
    if (error) return { error: error.message };
    return { ok: true };
  },

  updateRoutesOrder: async (fromRouteId, fromNames, toRouteId, toNames, adminToken) => {
    checkAuth(adminToken);
    for (let i = 0; i < fromNames.length; i++) {
      await supabase.from('clients').update({ route_id: fromRouteId, sort_order: i+1 }).eq('name', fromNames[i]);
    }
    if (fromRouteId !== toRouteId) {
      for (let i = 0; i < toNames.length; i++) {
        await supabase.from('clients').update({ route_id: toRouteId, sort_order: i+1 }).eq('name', toNames[i]);
      }
    }
    return { ok: true };
  },

  updateDriverRoutes: async (driverId, routesStr, adminToken) => {
    checkAuth(adminToken);
    const { error } = await supabase.from('drivers').update({ routes: routesStr }).eq('id', driverId);
    if (error) return { error: error.message };
    return { ok: true };
  },

  getLogs: async () => {
    const { data, error } = await supabase.from('logs').select('*').order('created_at', { ascending: false }).limit(100);
    if (error) return [];
    return data.map(r => ({
      date: new Date(r.created_at).toLocaleString('pl-PL'),
      user: r.user_name,
      action: r.action,
      target: r.target_id,
      details: r.details
    }));
  },

  archiveOldData: async (adminToken) => {
    checkAuth(adminToken);
    return { archivedEntries: 0, archivedLogs: 0 }; // TODO: implement archiving logic in Supabase if needed
  },

  // Dummy implementations for Grafik/Timeline since they relied on Google Sheets structure heavily.
  // We can return empty for now so the app doesn't break, until we model them.
  getGrafikOverview: async () => ({ monthly: null, weekly: [] }),
  getGrafikMonthData: async () => ({ error: 'Nie zaimplementowano' }),
  setGrafikCell: async () => ({ ok: true }),
  listWeeklySheets: async () => [],
  getWeeklyData: async () => ({ error: 'Nie zaimplementowano' }),
  setWeeklyStationCell: async () => ({ ok: true })
};
