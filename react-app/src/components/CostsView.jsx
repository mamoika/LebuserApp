import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Droplet, Zap, Flame, Truck, Users, Activity, Save } from 'lucide-react';

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS_PL = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];

const FMT = (num) => typeof num === 'number' ? num.toFixed(2) : '---';

export default function CostsView() {
  const { isAdmin } = useAuth();
  
  const [currentDate, setCurrentDate] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0,0,0,0);
    return d;
  });
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('costs'); // 'costs' | 'performance'
  
  const [settings, setSettings] = useState({});
  const [dailyData, setDailyData] = useState({});
  const [timelineStats, setTimelineStats] = useState({});

  const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
  
  const fetchData = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth() + 1;
    const daysInMonth = new Date(year, month, 0).getDate();
    const dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
    const dateTo = `${year}-${String(month).padStart(2, '0')}-${daysInMonth}`;

    const [
      { data: sets },
      { data: costs },
      { data: timeline }
    ] = await Promise.all([
      supabase.from('cost_settings').select('*').eq('month_key', monthKey).single(),
      supabase.from('daily_costs').select('*').gte('entry_date', dateFrom).lte('entry_date', dateTo),
      supabase.from('timeline_entries').select('entry_date, role, employee_id').gte('entry_date', dateFrom).lte('entry_date', dateTo)
    ]);
    
    setSettings(sets || {
      month_key: monthKey,
      fiat_l_100km: 9.01, isuzu_l_100km: 10.88, merc_l_100km: 13.04, iveco_l_100km: 12.25,
      fuel_price: 4.85,
      elec_multiplier: 80, elec_fixed_monthly: 3562.12, elec_price_kwh: 0.6823,
      gas_prod_price_m3: 1.95, gas_prod_fixed_daily: 173.51,
      gas_heat_price_m3: 6.15, gas_heat_fixed_monthly: 49.78,
      water_price_m3: 16.25, water_fixed_monthly: 20.10,
      worker_hourly_rate: 45.82
    });

    const costMap = {};
    (costs || []).forEach(c => costMap[c.entry_date] = c);
    setDailyData(costMap);
    
    // Process timeline stats (hours and unique people per role per day)
    const tStats = {};
    (timeline || []).forEach(t => {
      if (!tStats[t.entry_date]) {
        tStats[t.entry_date] = { 
          total_hours: 0, 
          roles: { ZD1: { hrs: 0, emp: new Set() }, ZD2: { hrs: 0, emp: new Set() }, Kierowcy: { hrs: 0, emp: new Set() } }
        };
      }
      tStats[t.entry_date].total_hours += 1;
      
      const r = t.role === 'Kierowca' || t.role === 'kierowca' ? 'Kierowcy' : t.role;
      if (tStats[t.entry_date].roles[r]) {
        tStats[t.entry_date].roles[r].hrs += 1;
        tStats[t.entry_date].roles[r].emp.add(t.employee_id);
      }
    });
    setTimelineStats(tStats);

    setLoading(false);
  }, [currentDate, monthKey, isAdmin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCostChange = (dateStr, field, value) => {
    const num = value === '' ? null : parseFloat(value);
    setDailyData(prev => ({
      ...prev,
      [dateStr]: { ...prev[dateStr], entry_date: dateStr, [field]: num }
    }));
  };

  const saveAll = async () => {
    setSaving(true);
    // Zapisz ustawienia
    await supabase.from('cost_settings').upsert({
      ...settings, month_key: monthKey, updated_at: new Date().toISOString()
    });
    // Zapisz dane codzienne (filtrowanie tylko tych zmodyfikowanych lub z wpisami)
    const toSave = Object.values(dailyData).filter(d => Object.keys(d).length > 1); // ma coś poza entry_date
    if (toSave.length > 0) {
      await supabase.from('daily_costs').upsert(
        toSave.map(d => ({ ...d, updated_at: new Date().toISOString() }))
      );
    }
    setSaving(false);
    fetchData(); // odśwież
  };

  if (!isAdmin) return <div style={{ padding: '40px', textAlign: 'center' }}>Brak dostępu.</div>;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => toDateStr(new Date(year, month - 1, i + 1)));

  // Obliczenia kosztów dla jednego dnia
  const calcDay = (dStr) => {
    const d = dailyData[dStr] || {};
    const fiat_km = (d.fiat_end || 0) - (d.fiat_start || 0);
    const isuzu_km = (d.isuzu_end || 0) - (d.isuzu_start || 0);
    const merc_km = (d.merc_end || 0) - (d.merc_start || 0);
    const iveco_km = (d.iveco_end || 0) - (d.iveco_start || 0);
    
    const transportCost = ((fiat_km * settings.fiat_l_100km) + (isuzu_km * settings.isuzu_l_100km) + (merc_km * settings.merc_l_100km) + (iveco_km * settings.iveco_l_100km)) / 100 * settings.fuel_price;
    
    const elec_usage = ((d.elec_end || 0) - (d.elec_start || 0)) * settings.elec_multiplier;
    const elec_cost = elec_usage * settings.elec_price_kwh + (settings.elec_fixed_monthly / daysInMonth);
    
    const gas_prod_usage = (d.gas_prod_end || 0) - (d.gas_prod_start || 0);
    const gas_prod_cost = gas_prod_usage * settings.gas_prod_price_m3 + settings.gas_prod_fixed_daily;
    
    const gas_heat_usage = (d.gas_heat_end || 0) - (d.gas_heat_start || 0);
    const gas_heat_cost = gas_heat_usage * settings.gas_heat_price_m3 + (settings.gas_heat_fixed_monthly / daysInMonth);
    
    const water_usage = (d.water_end || 0) - (d.water_start || 0);
    const water_cost = water_usage * settings.water_price_m3 + (settings.water_fixed_monthly / daysInMonth);
    
    const hrs = timelineStats[dStr]?.total_hours || 0;
    const worker_cost = hrs * settings.worker_hourly_rate;
    
    const other_cost = d.other_costs || 0;
    
    const total_cost = transportCost + elec_cost + gas_prod_cost + gas_heat_cost + water_cost + worker_cost + other_cost;
    
    return { transportCost, elec_cost, gas_prod_cost, gas_heat_cost, water_cost, worker_cost, total_cost, other_cost };
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      
      {/* HEADER & TABS */}
      <div style={{ display: 'flex', gap: '12px', background: 'var(--bg-card)', padding: '12px', borderRadius: '16px', border: '1px solid var(--border)', alignItems: 'center' }}>
        <button onClick={() => setCurrentDate(new Date(year, month - 2, 1))} style={{ padding: '8px 12px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer' }}>‹</button>
        <div style={{ fontWeight: 700, fontSize: '15px', flex: 1, textAlign: 'center', color: 'var(--text-primary)' }}>
          {MONTHS_PL[month - 1]} {year}
        </div>
        <button onClick={() => setCurrentDate(new Date(year, month, 1))} style={{ padding: '8px 12px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', fontWeight: 600, cursor: 'pointer' }}>›</button>
        
        <div style={{ width: '1px', height: '24px', background: 'var(--border)', margin: '0 8px' }}></div>
        
        <button 
          onClick={() => setActiveTab('costs')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, border: 'none', cursor: 'pointer', background: activeTab === 'costs' ? 'var(--accent)' : 'transparent', color: activeTab === 'costs' ? '#fff' : 'var(--text-secondary)' }}
        ><Zap size={16}/> Koszty</button>
        
        <button 
          onClick={() => setActiveTab('performance')}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', fontWeight: 600, border: 'none', cursor: 'pointer', background: activeTab === 'performance' ? '#FF9500' : 'transparent', color: activeTab === 'performance' ? '#fff' : 'var(--text-secondary)' }}
        ><Activity size={16}/> Wydajność</button>
        
        <div style={{ flex: 1 }}></div>
        <button onClick={saveAll} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#34C759', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '10px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          <Save size={16}/> {saving ? 'Zapisuję...' : 'Zapisz dane'}
        </button>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Ładowanie danych...</div>
        ) : (
          <div style={{ overflowX: 'auto', paddingBottom: '20px' }}>
            
            {/* WIDOK KOSZTÓW */}
            {activeTab === 'costs' && (
              <table className="costs-table" style={{ width: '100%', minWidth: '1200px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={thStyle}>Data</th>
                    <th colSpan={3} style={{ ...thStyle, background: '#FFF3E0', color: '#E65100' }}><Truck size={12}/> Auta (km)</th>
                    <th colSpan={3} style={{ ...thStyle, background: '#FFF9C4', color: '#F57F17' }}><Zap size={12}/> Prąd (kWh)</th>
                    <th colSpan={3} style={{ ...thStyle, background: '#F3E5F5', color: '#6A1B9A' }}><Flame size={12}/> Gaz Prod. (m³)</th>
                    <th colSpan={3} style={{ ...thStyle, background: '#E1BEE7', color: '#4A148C' }}><Flame size={12}/> Gaz Ogrz. (m³)</th>
                    <th colSpan={3} style={{ ...thStyle, background: '#E1F5FE', color: '#0277BD' }}><Droplet size={12}/> Woda (m³)</th>
                    <th rowSpan={2} style={{ ...thStyle, background: '#E8F5E9', color: '#1B5E20' }}><Users size={12}/><br/>Ludzie<br/>(zł)</th>
                    <th rowSpan={2} style={thStyle}>Inne (zł)</th>
                    <th rowSpan={2} style={{ ...thStyle, background: '#2E7D32', color: '#fff' }}>RAZEM<br/>(zł)</th>
                  </tr>
                  <tr>
                    <th style={{ ...thStyle, background: '#FFF3E0', color: '#E65100' }}>Start</th>
                    <th style={{ ...thStyle, background: '#FFF3E0', color: '#E65100' }}>Koniec</th>
                    <th style={{ ...thStyle, background: '#FFE0B2', color: '#E65100' }}>Koszt (zł)</th>

                    <th style={{ ...thStyle, background: '#FFF9C4', color: '#F57F17' }}>Start</th>
                    <th style={{ ...thStyle, background: '#FFF9C4', color: '#F57F17' }}>Koniec</th>
                    <th style={{ ...thStyle, background: '#FFF59D', color: '#F57F17' }}>Koszt (zł)</th>

                    <th style={{ ...thStyle, background: '#F3E5F5', color: '#6A1B9A' }}>Start</th>
                    <th style={{ ...thStyle, background: '#F3E5F5', color: '#6A1B9A' }}>Koniec</th>
                    <th style={{ ...thStyle, background: '#E1BEE7', color: '#6A1B9A' }}>Koszt (zł)</th>

                    <th style={{ ...thStyle, background: '#E1BEE7', color: '#4A148C' }}>Start</th>
                    <th style={{ ...thStyle, background: '#E1BEE7', color: '#4A148C' }}>Koniec</th>
                    <th style={{ ...thStyle, background: '#CE93D8', color: '#4A148C' }}>Koszt (zł)</th>

                    <th style={{ ...thStyle, background: '#E1F5FE', color: '#0277BD' }}>Start</th>
                    <th style={{ ...thStyle, background: '#E1F5FE', color: '#0277BD' }}>Koniec</th>
                    <th style={{ ...thStyle, background: '#B3E5FC', color: '#0277BD' }}>Koszt (zł)</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(dStr => {
                    const d = new Date(dStr);
                    const isOff = d.getDay() === 0 || d.getDay() === 6;
                    const c = calcDay(dStr);
                    const dt = dailyData[dStr] || {};
                    
                    return (
                      <tr key={dStr} style={{ background: isOff ? '#f8f9fa' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...tdStyle, fontWeight: 700, textAlign: 'center', background: isOff ? '#eee' : '#f0f4f8' }}>
                          {String(d.getDate()).padStart(2, '0')}.{String(month).padStart(2, '0')}
                        </td>
                        
                        {/* AUTA (sumarycznie dla uproszczenia widoku, można rozbić później) */}
                        <td style={tdStyle}><input type="number" value={dt.fiat_start || ''} onChange={(e) => handleCostChange(dStr, 'fiat_start', e.target.value)} style={inpStyle} placeholder="Fiat S"/></td>
                        <td style={tdStyle}><input type="number" value={dt.fiat_end || ''} onChange={(e) => handleCostChange(dStr, 'fiat_end', e.target.value)} style={inpStyle} placeholder="Fiat K"/></td>
                        <td style={{ ...tdStyle, background: isOff ? '#eee' : '#fff8f0', color: '#E65100', fontWeight: 600, textAlign: 'right' }}>{FMT(c.transportCost)}</td>

                        {/* PRĄD */}
                        <td style={tdStyle}><input type="number" value={dt.elec_start || ''} onChange={(e) => handleCostChange(dStr, 'elec_start', e.target.value)} style={inpStyle}/></td>
                        <td style={tdStyle}><input type="number" value={dt.elec_end || ''} onChange={(e) => handleCostChange(dStr, 'elec_end', e.target.value)} style={inpStyle}/></td>
                        <td style={{ ...tdStyle, background: isOff ? '#eee' : '#fffde7', color: '#F57F17', fontWeight: 600, textAlign: 'right' }}>{FMT(c.elec_cost)}</td>

                        {/* GAZ PROD */}
                        <td style={tdStyle}><input type="number" value={dt.gas_prod_start || ''} onChange={(e) => handleCostChange(dStr, 'gas_prod_start', e.target.value)} style={inpStyle}/></td>
                        <td style={tdStyle}><input type="number" value={dt.gas_prod_end || ''} onChange={(e) => handleCostChange(dStr, 'gas_prod_end', e.target.value)} style={inpStyle}/></td>
                        <td style={{ ...tdStyle, background: isOff ? '#eee' : '#f3e5f5', color: '#6A1B9A', fontWeight: 600, textAlign: 'right' }}>{FMT(c.gas_prod_cost)}</td>

                        {/* GAZ OGRZ */}
                        <td style={tdStyle}><input type="number" value={dt.gas_heat_start || ''} onChange={(e) => handleCostChange(dStr, 'gas_heat_start', e.target.value)} style={inpStyle}/></td>
                        <td style={tdStyle}><input type="number" value={dt.gas_heat_end || ''} onChange={(e) => handleCostChange(dStr, 'gas_heat_end', e.target.value)} style={inpStyle}/></td>
                        <td style={{ ...tdStyle, background: isOff ? '#eee' : '#f3e5f5', color: '#4A148C', fontWeight: 600, textAlign: 'right' }}>{FMT(c.gas_heat_cost)}</td>

                        {/* WODA */}
                        <td style={tdStyle}><input type="number" value={dt.water_start || ''} onChange={(e) => handleCostChange(dStr, 'water_start', e.target.value)} style={inpStyle}/></td>
                        <td style={tdStyle}><input type="number" value={dt.water_end || ''} onChange={(e) => handleCostChange(dStr, 'water_end', e.target.value)} style={inpStyle}/></td>
                        <td style={{ ...tdStyle, background: isOff ? '#eee' : '#e1f5fe', color: '#0277BD', fontWeight: 600, textAlign: 'right' }}>{FMT(c.water_cost)}</td>

                        {/* LUDZIE */}
                        <td style={{ ...tdStyle, background: isOff ? '#eee' : '#e8f5e9', color: '#1B5E20', fontWeight: 600, textAlign: 'right' }}>
                          {c.worker_cost > 0 ? FMT(c.worker_cost) : '-'}
                        </td>
                        
                        {/* INNE */}
                        <td style={tdStyle}><input type="number" value={dt.other_costs || ''} onChange={(e) => handleCostChange(dStr, 'other_costs', e.target.value)} style={inpStyle}/></td>

                        {/* RAZEM */}
                        <td style={{ ...tdStyle, background: isOff ? '#ddd' : '#2E7D32', color: isOff ? '#555' : '#fff', fontWeight: 700, textAlign: 'right' }}>
                          {FMT(c.total_cost)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* WIDOK WYDAJNOŚCI */}
            {activeTab === 'performance' && (
              <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr>
                    <th rowSpan={2} style={thStyle}>Data</th>
                    <th colSpan={4} style={{ ...thStyle, background: '#E8F5E9', color: '#1B5E20' }}>Tonaż (kg)</th>
                    <th colSpan={4} style={{ ...thStyle, background: '#E3F2FD', color: '#1565C0' }}>Godziny z Osi (h)</th>
                    <th colSpan={3} style={{ ...thStyle, background: '#FFF3E0', color: '#E65100' }}>Wydajność (kg / h)</th>
                  </tr>
                  <tr>
                    <th style={{ ...thStyle, background: '#E8F5E9', color: '#1B5E20' }}>ZD1</th>
                    <th style={{ ...thStyle, background: '#E8F5E9', color: '#1B5E20' }}>ZD2</th>
                    <th style={{ ...thStyle, background: '#E8F5E9', color: '#1B5E20' }}>Pralki</th>
                    <th style={{ ...thStyle, background: '#C8E6C9', color: '#1B5E20' }}>SUMA</th>

                    <th style={{ ...thStyle, background: '#E3F2FD', color: '#1565C0' }}>ZD1</th>
                    <th style={{ ...thStyle, background: '#E3F2FD', color: '#1565C0' }}>ZD2</th>
                    <th style={{ ...thStyle, background: '#E3F2FD', color: '#1565C0' }}>Kier.</th>
                    <th style={{ ...thStyle, background: '#BBDEFB', color: '#1565C0' }}>SUMA</th>

                    <th style={{ ...thStyle, background: '#FFF3E0', color: '#E65100' }}>KG/H ZD1</th>
                    <th style={{ ...thStyle, background: '#FFF3E0', color: '#E65100' }}>KG/H ZD2</th>
                    <th style={{ ...thStyle, background: '#FFE0B2', color: '#E65100' }}>KG/H WSP.</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(dStr => {
                    const d = new Date(dStr);
                    const isOff = d.getDay() === 0 || d.getDay() === 6;
                    const dt = dailyData[dStr] || {};
                    const ts = timelineStats[dStr]?.roles || { ZD1: { hrs: 0 }, ZD2: { hrs: 0 }, Kierowcy: { hrs: 0 } };
                    
                    const t_zd1 = dt.ton_zd1 || 0;
                    const t_zd2 = dt.ton_zd2 || 0;
                    const t_pralki = dt.ton_pralki || 0;
                    const t_suma = t_zd1 + t_zd2 + t_pralki;

                    const h_zd1 = ts.ZD1?.hrs || 0;
                    const h_zd2 = ts.ZD2?.hrs || 0;
                    const h_kier = ts.Kierowcy?.hrs || 0;
                    const h_suma = h_zd1 + h_zd2 + h_kier;

                    const wyd_zd1 = h_zd1 > 0 ? (t_zd1 / h_zd1) : 0;
                    const wyd_zd2 = h_zd2 > 0 ? (t_zd2 / h_zd2) : 0;
                    const wyd_wsp = h_suma > 0 ? (t_suma / h_suma) : 0;

                    return (
                      <tr key={dStr} style={{ background: isOff ? '#f8f9fa' : 'transparent', borderBottom: '1px solid var(--border)' }}>
                        <td style={{ ...tdStyle, fontWeight: 700, textAlign: 'center', background: isOff ? '#eee' : '#f0f4f8' }}>
                          {String(d.getDate()).padStart(2, '0')}.{String(month).padStart(2, '0')}
                        </td>

                        {/* TONAŻ (Wpisywany) */}
                        <td style={tdStyle}><input type="number" value={dt.ton_zd1 || ''} onChange={(e) => handleCostChange(dStr, 'ton_zd1', e.target.value)} style={inpStyle}/></td>
                        <td style={tdStyle}><input type="number" value={dt.ton_zd2 || ''} onChange={(e) => handleCostChange(dStr, 'ton_zd2', e.target.value)} style={inpStyle}/></td>
                        <td style={tdStyle}><input type="number" value={dt.ton_pralki || ''} onChange={(e) => handleCostChange(dStr, 'ton_pralki', e.target.value)} style={inpStyle}/></td>
                        <td style={{ ...tdStyle, background: isOff ? '#eee' : '#C8E6C9', color: '#1B5E20', fontWeight: 700, textAlign: 'center' }}>{t_suma > 0 ? t_suma : '-'}</td>

                        {/* GODZINY (Automatyczne) */}
                        <td style={{ ...tdStyle, textAlign: 'center', color: '#1565C0', fontWeight: h_zd1 > 0 ? 700 : 400 }}>{h_zd1 > 0 ? h_zd1 : '-'}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', color: '#1565C0', fontWeight: h_zd2 > 0 ? 700 : 400 }}>{h_zd2 > 0 ? h_zd2 : '-'}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', color: '#1565C0', fontWeight: h_kier > 0 ? 700 : 400 }}>{h_kier > 0 ? h_kier : '-'}</td>
                        <td style={{ ...tdStyle, background: isOff ? '#eee' : '#BBDEFB', color: '#0D47A1', fontWeight: 700, textAlign: 'center' }}>{h_suma > 0 ? h_suma : '-'}</td>

                        {/* WYDAJNOŚĆ */}
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: wyd_zd1 > 8 ? '#2E7D32' : '#E65100' }}>{wyd_zd1 > 0 ? wyd_zd1.toFixed(1) : '-'}</td>
                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700, color: wyd_zd2 > 25 ? '#2E7D32' : '#E65100' }}>{wyd_zd2 > 0 ? wyd_zd2.toFixed(1) : '-'}</td>
                        <td style={{ ...tdStyle, background: isOff ? '#eee' : '#FFE0B2', color: '#E65100', fontWeight: 700, textAlign: 'center' }}>{wyd_wsp > 0 ? wyd_wsp.toFixed(1) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

          </div>
        )}
      </div>
    </div>
  );
}

// STYLES
const thStyle = {
  padding: '6px 8px', borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
  textAlign: 'center', fontWeight: 700, fontSize: '11px', whiteSpace: 'nowrap'
};

const tdStyle = {
  padding: '4px', borderRight: '1px solid var(--border)'
};

const inpStyle = {
  width: '100%', minWidth: '50px', padding: '4px 2px', border: 'none', background: 'transparent',
  textAlign: 'center', fontSize: '12px', color: 'var(--text-primary)', outline: 'none'
};
