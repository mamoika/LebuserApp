import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Play, CheckCircle2, Box, Flame, Droplet, Archive, AlertCircle, XCircle } from 'lucide-react';

const STAGE_COLORS = {
  queued: { bg: '#FEF3C7', text: '#D97706', border: '#FDE68A', label: 'Oczekuje', icon: Box },
  entry: { bg: '#DBEAFE', text: '#2563EB', border: '#BFDBFE', label: 'Wejście', icon: Play },
  wash: { bg: '#E0E7FF', text: '#4F46E5', border: '#C7D2FE', label: 'Pranie', icon: Droplet },
  rinse: { bg: '#E0E7FF', text: '#4F46E5', border: '#C7D2FE', label: 'Płukanie', icon: Droplet },
  dry: { bg: '#FFEDD5', text: '#EA580C', border: '#FED7AA', label: 'Suszenie', icon: Flame },
  pack: { bg: '#CCFBF1', text: '#0D9488', border: '#99F6E4', label: 'Pakowanie', icon: Archive },
  done: { bg: '#D1FAE5', text: '#059669', border: '#A7F3D0', label: 'Zakończony', icon: CheckCircle2 },
  error: { bg: '#FEE2E2', text: '#DC2626', border: '#FECACA', label: 'Błąd', icon: AlertCircle },
  cancelled: { bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB', label: 'Anulowany', icon: XCircle }
};

export default function WashView() {
  const { t } = useTranslation();
  const [bags, setBags] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBags();

    const channel = supabase.channel('tunnel_bags_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tunnel_bags' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setBags(prev => [payload.new, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setBags(prev => prev.map(b => b.id === payload.new.id ? payload.new : b));
        } else if (payload.eventType === 'DELETE') {
          setBags(prev => prev.filter(b => b.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchBags = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('tunnel_bags')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    
    if (data) setBags(data);
    setLoading(false);
  };

  const activeBags = useMemo(() => bags.filter(b => !['done', 'cancelled', 'error'].includes(b.status)), [bags]);
  const completedToday = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return bags.filter(b => b.status === 'done' && new Date(b.created_at) >= today).length;
  }, [bags]);

  const pipelineStages = [
    { id: 'queued', label: 'Oczekujące' },
    { id: 'entry', label: 'Tunel' },
    { id: 'wash', label: 'Pranie' },
    { id: 'dry', label: 'Suszenie' },
    { id: 'pack', label: 'Pakowanie' },
  ];

  const getCountByStage = (stageId) => bags.filter(b => b.status === stageId || (stageId === 'entry' && b.status === 'rinse')).length;

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 16px 40px', fontFamily: 'var(--font)' }}>
      
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', letterSpacing: '-0.5px' }}>
            System Pralni
          </h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '14px' }}>
            Podgląd worków z brudną odzieżą na żywo (synchronizacja WinForms / PLC)
          </p>
        </div>
        <button 
          onClick={fetchBags}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 16px', borderRadius: '8px', border: '1px solid var(--border)',
            background: 'var(--bg-card)', color: 'var(--text-secondary)',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
        >
          <RefreshCw size={14} className={loading ? 'spin' : ''} />
          Odśwież
        </button>
      </div>

      {/* KPI WIDGETS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Aktywne worki</div>
          <div style={{ fontSize: '36px', fontWeight: 800, color: '#0A84FF', lineHeight: 1 }}>{activeBags.length}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Zakończone dziś</div>
          <div style={{ fontSize: '36px', fontWeight: 800, color: '#10B981', lineHeight: 1 }}>{completedToday}</div>
        </div>
        <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Błędy</div>
          <div style={{ fontSize: '36px', fontWeight: 800, color: '#EF4444', lineHeight: 1 }}>{bags.filter(b => b.status === 'error').length}</div>
        </div>
      </div>

      {/* PIPELINE VISUALIZATION */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', marginBottom: '32px', padding: '24px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: 700, margin: '0 0 20px', color: 'var(--text-primary)' }}>Przepływ w tunelu</h2>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'relative' }}>
          <div style={{ position: 'absolute', top: '24px', left: '10%', right: '10%', height: '4px', background: 'var(--bg-secondary)', zIndex: 0, borderRadius: '4px' }} />
          
          {pipelineStages.map((stage, idx) => {
            const count = getCountByStage(stage.id);
            const active = count > 0;
            return (
              <div key={stage.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 1, flex: 1 }}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '24px', 
                  background: active ? '#0A84FF' : '#fff',
                  border: `4px solid ${active ? '#DBEAFE' : 'var(--border)'}`,
                  color: active ? '#fff' : 'var(--text-tertiary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', fontWeight: 800,
                  boxShadow: active ? '0 4px 12px rgba(10,132,255,0.3)' : 'none',
                  transition: 'all 0.3s ease'
                }}>
                  {count}
                </div>
                <div style={{ marginTop: '12px', fontSize: '13px', fontWeight: 600, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {stage.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TABLE */}
      <div style={{ background: '#fff', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: '#F8FAFC' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Lista worków (Realtime)</h2>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#fff', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '16px 24px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)' }}>Kod / Klient</th>
                <th style={{ padding: '16px 24px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)' }}>Maszyna</th>
                <th style={{ padding: '16px 24px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)' }}>Status</th>
                <th style={{ padding: '16px 24px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-tertiary)' }}>Utworzono</th>
              </tr>
            </thead>
            <tbody>
              {loading && bags.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Ładowanie danych...</td></tr>
              ) : bags.length === 0 ? (
                <tr><td colSpan="4" style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Brak worków w bazie.</td></tr>
              ) : bags.map(bag => {
                const conf = STAGE_COLORS[bag.status] || STAGE_COLORS['queued'];
                const Icon = conf.icon;
                
                return (
                  <tr key={bag.id} style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.2s', ':hover': { background: '#F8FAFC' } }}>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '14px', marginBottom: '2px' }}>{bag.code}</div>
                      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{bag.hotel_name || 'Brak przypisania'}</div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div style={{ background: '#F1F5F9', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                          Prog {bag.program_number}
                        </div>
                        <div style={{ background: '#F1F5F9', padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                          Tor {bag.track_number}
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px' }}>
                      <div style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        background: conf.bg, color: conf.text, border: `1px solid ${conf.border}`,
                        padding: '6px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 700 
                      }}>
                        <Icon size={14} />
                        {conf.label}
                      </div>
                    </td>
                    <td style={{ padding: '16px 24px', fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {new Date(bag.created_at).toLocaleString('pl-PL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
