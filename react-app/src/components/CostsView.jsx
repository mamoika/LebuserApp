import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Droplet, Zap, Flame, Truck, Users, Activity, Save } from 'lucide-react';

function toDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MONTHS_PL = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];

const FMT = (num) => typeof num === 'number' ? num.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '---';

// iOS 18 Design Constants
const IOS_THEME = {
  bg: '#F2F2F7',
  cardBg: '#FFFFFF',
  textPrimary: '#000000',
  textSecondary: '#3C3C4399',
  accent: '#007AFF',
  success: '#34C759',
  warning: '#FF9500',
  border: 'rgba(60, 60, 67, 0.12)',
  radius: '16px',
  shadow: '0 4px 20px rgba(0,0,0,0.06)'
};

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
    await supabase.from('cost_settings').upsert({
      ...settings, month_key: monthKey, updated_at: new Date().toISOString()
    });
    const toSave = Object.values(dailyData).filter(d => Object.keys(d).length > 1);
    if (toSave.length > 0) {
      await supabase.from('daily_costs').upsert(
        toSave.map(d => ({ ...d, updated_at: new Date().toISOString() }))
      );
    }
    setSaving(false);
    fetchData();
  };

  if (!isAdmin) return <div style={{ padding: '40px', textAlign: 'center' }}>Brak dostępu.</div>;

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => toDateStr(new Date(year, month - 1, i + 1)));

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

  // Calculate Monthly Totals
  const monthlyTotals = days.reduce((acc, dStr) => {
    const c = calcDay(dStr);
    acc.transport += c.transportCost;
    acc.elec += c.elec_cost;
    acc.gas += (c.gas_prod_cost + c.gas_heat_cost);
    acc.water += c.water_cost;
    acc.workers += c.worker_cost;
    acc.total += c.total_cost;
    return acc;
  }, { transport: 0, elec: 0, gas: 0, water: 0, workers: 0, total: 0 });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '2px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif' }}>
      
      {/* iOS 18 HEADER & SEGMENTED CONTROL */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        background: IOS_THEME.cardBg,
        padding: '16px 20px',
        borderRadius: IOS_THEME.radius,
        boxShadow: IOS_THEME.shadow,
        border: `1px solid ${IOS_THEME.border}`
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => setCurrentDate(new Date(year, month - 2, 1))} style={navBtnStyle}>‹</button>
          <div style={{ fontWeight: 700, fontSize: '17px', minWidth: '140px', textAlign: 'center' }}>
            {MONTHS_PL[month - 1]} {year}
          </div>
          <button onClick={() => setCurrentDate(new Date(year, month, 1))} style={navBtnStyle}>›</button>
        </div>

        <div style={{ 
          display: 'flex', 
          background: '#EEEEEE', 
          padding: '2px', 
          borderRadius: '10px',
          gap: '2px'
        }}>
          <button 
            onClick={() => setActiveTab('costs')}
            style={{ ...segmentBtnStyle, background: activeTab === 'costs' ? '#FFFFFF' : 'transparent', boxShadow: activeTab === 'costs' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none' }}
          >Koszty</button>
          <button 
            onClick={() => setActiveTab('performance')}
            style={{ ...segmentBtnStyle, background: activeTab === 'performance' ? '#FFFFFF' : 'transparent', boxShadow: activeTab === 'performance' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none' }}
          >Wydajność</button>
        </div>

        <button onClick={saveAll} disabled={saving} style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '8px', 
          background: IOS_THEME.success, 
          color: '#fff', 
          border: 'none', 
          padding: '10px 24px', 
          borderRadius: '12px', 
          fontWeight: 700, 
          fontSize: '14px',
          cursor: 'pointer', 
          opacity: saving ? 0.7 : 1,
          transition: 'transform 0.1s active'
        }}>
          <Save size={18}/> {saving ? 'Zapisuję...' : 'Zapisz'}
        </button>
      </div>

      {/* SUMMARY CARDS */}
      {!loading && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '16px' }}>
          <SummaryCard title="Transport" value={monthlyTotals.transport} icon={<Truck size={20}/>} color="#E65100" />
          <SummaryCard title="Energia" value={monthlyTotals.elec} icon={<Zap size={20}/>} color="#F57F17" />
          <SummaryCard title="Gaz" value={monthlyTotals.gas} icon={<Flame size={20}/>} color="#6A1B9A" />
          <SummaryCard title="Woda" value={monthlyTotals.water} icon={<Droplet size={20}/>} color="#0277BD" />
          <SummaryCard title="Pracownicy" value={monthlyTotals.workers} icon={<Users size={20}/>} color="#1B5E20" />
          <SummaryCard title="RAZEM" value={monthlyTotals.total} color={IOS_THEME.accent} isTotal />
        </div>
      )}

      {/* DATA GRID */}
      <div style={{ 
        background: IOS_THEME.cardBg, 
        borderRadius: IOS_THEME.radius, 
        boxShadow: IOS_THEME.shadow,
        border: `1px solid ${IOS_THEME.border}`,
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: IOS_THEME.textSecondary, fontSize: '15px' }}>Ładowanie danych finansowych...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {activeTab === 'costs' && (
              <table style={{ width: '100%', minWidth: '1200px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9F9FB', borderBottom: `1px solid ${IOS_THEME.border}` }}>
                    <th style={newThStyle}>Data</th>
                    <th style={newThStyle}><Truck size={14}/> Auto Start</th>
                    <th style={newThStyle}><Truck size={14}/> Auto Koniec</th>
                    <th style={{ ...newThStyle, color: '#E65100' }}>Koszt Auta</th>
                    <th style={newThStyle}><Zap size={14}/> Prąd S</th>
                    <th style={newThStyle}><Zap size={14}/> Prąd K</th>
                    <th style={{ ...newThStyle, color: '#F57F17' }}>Koszt Prąd</th>
                    <th style={newThStyle}><Flame size={14}/> Gaz S</th>
                    <th style={newThStyle}><Flame size={14}/> Gaz K</th>
                    <th style={{ ...newThStyle, color: '#6A1B9A' }}>Koszt Gaz</th>
                    <th style={newThStyle}><Droplet size={14}/> Woda S</th>
                    <th style={newThStyle}><Droplet size={14}/> Woda K</th>
                    <th style={{ ...newThStyle, color: '#0277BD' }}>Koszt Woda</th>
                    <th style={{ ...newThStyle, color: '#1B5E20' }}>Ludzie</th>
                    <th style={newThStyle}>Inne</th>
                    <th style={{ ...newThStyle, background: '#F2F2F7', fontWeight: 800 }}>SUMA</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(dStr => {
                    const d = new Date(dStr);
                    const isOff = d.getDay() === 0 || d.getDay() === 6;
                    const c = calcDay(dStr);
                    const dt = dailyData[dStr] || {};
                    return (
                      <tr key={dStr} style={{ borderBottom: `1px solid ${IOS_THEME.border}`, background: isOff ? 'rgba(60, 60, 67, 0.03)' : 'transparent' }}>
                        <td style={{ ...newTdStyle, fontWeight: 700, color: isOff ? IOS_THEME.textSecondary : IOS_THEME.textPrimary }}>
                          {String(d.getDate()).padStart(2, '0')}.{String(month).padStart(2, '0')}
                        </td>
                        <td style={newTdStyle}><input type="number" value={dt.fiat_start || ''} onChange={(e) => handleCostChange(dStr, 'fiat_start', e.target.value)} style={newInpStyle}/></td>
                        <td style={newTdStyle}><input type="number" value={dt.fiat_end || ''} onChange={(e) => handleCostChange(dStr, 'fiat_end', e.target.value)} style={newInpStyle}/></td>
                        <td style={{ ...newTdStyle, fontWeight: 600, color: '#E65100', textAlign: 'right' }}>{FMT(c.transportCost)}</td>
                        <td style={newTdStyle}><input type="number" value={dt.elec_start || ''} onChange={(e) => handleCostChange(dStr, 'elec_start', e.target.value)} style={newInpStyle}/></td>
                        <td style={newTdStyle}><input type="number" value={dt.elec_end || ''} onChange={(e) => handleCostChange(dStr, 'elec_end', e.target.value)} style={newInpStyle}/></td>
                        <td style={{ ...newTdStyle, fontWeight: 600, color: '#F57F17', textAlign: 'right' }}>{FMT(c.elec_cost)}</td>
                        <td style={newTdStyle}><input type="number" value={dt.gas_prod_start || ''} onChange={(e) => handleCostChange(dStr, 'gas_prod_start', e.target.value)} style={newInpStyle}/></td>
                        <td style={newTdStyle}><input type="number" value={dt.gas_prod_end || ''} onChange={(e) => handleCostChange(dStr, 'gas_prod_end', e.target.value)} style={newInpStyle}/></td>
                        <td style={{ ...newTdStyle, fontWeight: 600, color: '#6A1B9A', textAlign: 'right' }}>{FMT(c.gas_prod_cost + c.gas_heat_cost)}</td>
                        <td style={newTdStyle}><input type="number" value={dt.water_start || ''} onChange={(e) => handleCostChange(dStr, 'water_start', e.target.value)} style={newInpStyle}/></td>
                        <td style={newTdStyle}><input type="number" value={dt.water_end || ''} onChange={(e) => handleCostChange(dStr, 'water_end', e.target.value)} style={newInpStyle}/></td>
                        <td style={{ ...newTdStyle, fontWeight: 600, color: '#0277BD', textAlign: 'right' }}>{FMT(c.water_cost)}</td>
                        <td style={{ ...newTdStyle, fontWeight: 600, color: '#1B5E20', textAlign: 'right' }}>{c.worker_cost > 0 ? FMT(c.worker_cost) : '-'}</td>
                        <td style={newTdStyle}><input type="number" value={dt.other_costs || ''} onChange={(e) => handleCostChange(dStr, 'other_costs', e.target.value)} style={newInpStyle}/></td>
                        <td style={{ ...newTdStyle, fontWeight: 800, background: '#F9F9FB', textAlign: 'right' }}>{FMT(c.total_cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {activeTab === 'performance' && (
              <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#F9F9FB', borderBottom: `1px solid ${IOS_THEME.border}` }}>
                    <th style={newThStyle}>Data</th>
                    <th style={newThStyle}>ZD1 (kg)</th>
                    <th style={newThStyle}>ZD2 (kg)</th>
                    <th style={newThStyle}>Pralki (kg)</th>
                    <th style={{ ...newThStyle, color: '#1B5E20' }}>SUMA KG</th>
                    <th style={newThStyle}>ZD1 (h)</th>
                    <th style={newThStyle}>ZD2 (h)</th>
                    <th style={newThStyle}>Kier. (h)</th>
                    <th style={{ ...newThStyle, color: '#1565C0' }}>SUMA H</th>
                    <th style={{ ...newThStyle, color: '#E65100' }}>KG / H</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map(dStr => {
                    const d = new Date(dStr);
                    const isOff = d.getDay() === 0 || d.getDay() === 6;
                    const dt = dailyData[dStr] || {};
                    const ts = timelineStats[dStr]?.roles || { ZD1: { hrs: 0 }, ZD2: { hrs: 0 }, Kierowcy: { hrs: 0 } };
                    const t_suma = (dt.ton_zd1 || 0) + (dt.ton_zd2 || 0) + (dt.ton_pralki || 0);
                    const h_suma = (ts.ZD1?.hrs || 0) + (ts.ZD2?.hrs || 0) + (ts.Kierowcy?.hrs || 0);
                    const wyd_wsp = h_suma > 0 ? (t_suma / h_suma) : 0;

                    return (
                      <tr key={dStr} style={{ borderBottom: `1px solid ${IOS_THEME.border}`, background: isOff ? 'rgba(60, 60, 67, 0.03)' : 'transparent' }}>
                        <td style={{ ...newTdStyle, fontWeight: 700, color: isOff ? IOS_THEME.textSecondary : IOS_THEME.textPrimary }}>
                          {String(d.getDate()).padStart(2, '0')}.{String(month).padStart(2, '0')}
                        </td>
                        <td style={newTdStyle}><input type="number" value={dt.ton_zd1 || ''} onChange={(e) => handleCostChange(dStr, 'ton_zd1', e.target.value)} style={newInpStyle}/></td>
                        <td style={newTdStyle}><input type="number" value={dt.ton_zd2 || ''} onChange={(e) => handleCostChange(dStr, 'ton_zd2', e.target.value)} style={newInpStyle}/></td>
                        <td style={newTdStyle}><input type="number" value={dt.ton_pralki || ''} onChange={(e) => handleCostChange(dStr, 'ton_pralki', e.target.value)} style={newInpStyle}/></td>
                        <td style={{ ...newTdStyle, fontWeight: 700, textAlign: 'center' }}>{t_suma > 0 ? t_suma : '-'}</td>
                        <td style={{ ...newTdStyle, textAlign: 'center' }}>{ts.ZD1?.hrs || '-'}</td>
                        <td style={{ ...newTdStyle, textAlign: 'center' }}>{ts.ZD2?.hrs || '-'}</td>
                        <td style={{ ...newTdStyle, textAlign: 'center' }}>{ts.Kierowcy?.hrs || '-'}</td>
                        <td style={{ ...newTdStyle, fontWeight: 700, color: '#1565C0', textAlign: 'center' }}>{h_suma > 0 ? h_suma : '-'}</td>
                        <td style={{ ...newTdStyle, fontWeight: 800, color: '#E65100', textAlign: 'center' }}>{wyd_wsp > 0 ? wyd_wsp.toFixed(1) : '-'}</td>
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

// COMPONENTS
function SummaryCard({ title, value, icon, color, isTotal }) {
  return (
    <div style={{ 
      background: isTotal ? color : IOS_THEME.cardBg, 
      padding: '16px', 
      borderRadius: IOS_THEME.radius, 
      boxShadow: IOS_THEME.shadow,
      border: isTotal ? 'none' : `1px solid ${IOS_THEME.border}`,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isTotal ? '#fff' : color, opacity: isTotal ? 0.9 : 1 }}>
        {icon}
        <span style={{ fontSize: '13px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</span>
      </div>
      <div style={{ fontSize: '20px', fontWeight: 800, color: isTotal ? '#fff' : IOS_THEME.textPrimary }}>
        {FMT(value)} <span style={{ fontSize: '12px', fontWeight: 600 }}>zł</span>
      </div>
    </div>
  );
}

// STYLES
const navBtnStyle = {
  padding: '6px 14px', borderRadius: '10px', background: '#F2F2F7', border: 'none', fontWeight: 700, fontSize: '18px', cursor: 'pointer'
};

const segmentBtnStyle = {
  padding: '6px 20px', borderRadius: '8px', border: 'none', fontSize: '13px', fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s'
};

const newThStyle = {
  padding: '12px 8px', textAlign: 'center', fontWeight: 600, fontSize: '12px', color: IOS_THEME.textSecondary, whiteSpace: 'nowrap'
};

const newTdStyle = {
  padding: '8px 6px', fontSize: '13px'
};

const newInpStyle = {
  width: '100%', padding: '6px 4px', border: 'none', background: 'rgba(60, 60, 67, 0.05)', borderRadius: '6px', textAlign: 'center', fontSize: '13px', outline: 'none', transition: 'background 0.2s'
};