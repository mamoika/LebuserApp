import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../context/AuthContext';
import { toastError, toastSuccess, toastWarn } from '../lib/toast';
import { getTimelineWeek } from '../lib/readRpc';
import { isHoliday } from '../utils/holidays';
import { dayNamesSunSat } from '../lib/dateUtils';

const STATUS_STYLE = {
  'W':   { bg: '#f0f0f0', color: '#aaa' },
  'UW':  { bg: '#bfdbfe', color: '#1e40af' },
  'L4':  { bg: '#ffe4e6', color: '#be123c' },
  'NN':  { bg: '#ff0000', color: '#fff' },
  'END': { bg: '#e2e8f0', color: '#64748b' },
  'I':   { bg: '#ede9fe', color: '#6d28d9' },
};

const VISIBLE_START = 5;
const VISIBLE_END = 22; // exclusive: widoczne na osi godziny 5–21 (stała, niezależna od danych)
const ABSENCE_STATUSES = new Set(['W', 'UW', 'L4', 'NN', 'END', 'I']);
const range = (start, end) => Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);
const VISIBLE_HOURS = range(VISIBLE_START, VISIBLE_END); // 5..21 — siatka zawsze standardowa
const COUNT_HOURS = range(0, 24); // 0..23 — do liczenia sum (łapie też godziny doby spoza osi)

// Czy zmiana to pełna doba / dyżur (przechodzi przez północ lub trwa ~24h).
function isFullDayDuty(endH, duration) {
  return endH > 24 || roundHours(duration) >= 23.5;
}

// Komórki zmiany wypadające poza widoczną osią 5–21 (do panelu „+Xh").
// `side` mówi, przy której krawędzi osi pokazać znacznik.
function getOverflowCells(startH, endH) {
  const cells = [];
  const dayEnd = Math.min(endH, 24);
  const isShownInGrid = (h) => h >= VISIBLE_START && h < VISIBLE_END
    && Math.min(h + 1, dayEnd) > Math.max(h, startH);
  const addRange = (from, to, side) => {
    for (let h = Math.floor(from); h < to; h++) {
      const cs = Math.max(from, h);
      const ce = Math.min(to, h + 1);
      if (ce > cs && !isShownInGrid(h)) cells.push({ h, fillFrom: cs - h, fillTo: ce - h, side });
    }
  };
  if (startH < VISIBLE_START) addRange(startH, Math.min(dayEnd, VISIBLE_START), 'start'); // wczesny ranek dnia startu
  if (dayEnd > VISIBLE_END) addRange(Math.max(startH, VISIBLE_END), dayEnd, 'end');       // wieczór dnia startu
  if (endH > 24) addRange(0, endH - 24, 'end');                                           // poranek po północy
  return cells;
}

function sumOverflowHours(cells) {
  return roundHours(cells.reduce((s, c) => s + (c.fillTo - c.fillFrom), 0));
}

function getOverflowEndMarker(startH, endH) {
  if (endH <= 24) return null;
  const end = endH - 24;
  const h = Math.floor(end);
  const fillTo = end - h;
  if (fillTo <= 0) return null;
  const dayEnd = Math.min(endH, 24);
  const shownInGrid = h >= VISIBLE_START && h < VISIBLE_END
    && Math.min(h + 1, dayEnd) > Math.max(h, startH);
  return shownInGrid ? { h, fillTo } : null;
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
function fmtDate(d) { return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`; }
function toDateStr(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function parseHourValue(str) {
  if (!str) return 0;
  const s = String(str).trim();
  if (!s) return 0;
  if (s.includes(':')) {
    const p = s.split(':');
    const h = parseInt(p[0], 10);
    const m = parseInt(p[1], 10) || 0;
    return Number.isFinite(h) ? h + m / 60 : null;
  }
  const n = parseFloat(s.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}
function parseHour(str) {
  return parseHourValue(str) ?? 0;
}
function getWeekNum(d) {
  const date = new Date(d); date.setHours(0,0,0,0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const w1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - w1) / 86400000 - 3 + (w1.getDay() + 6) % 7) / 7);
}

function roundHours(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function fmtHours(value) {
  const n = roundHours(value);
  return Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
}

function fmtClockLabel(value) {
  const normalized = ((value % 24) + 24) % 24;
  const totalMinutes = Math.round(normalized * 60);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return m ? `${h}:${String(m).padStart(2, '0')}` : String(h);
}

function getShiftDuration(startH, endH) {
  if (!Number.isFinite(startH) || !Number.isFinite(endH)) return 0;
  return roundHours(endH >= startH ? endH - startH : 24 - startH + endH);
}

function getVisibleShiftSegments(startH, endH) {
  // Tylko część zmiany przypadająca na dzień startu, bez zawijania nocy przez północ —
  // dzięki temu pasmo zaczyna się o realnej godzinie startu (np. 7:20), a nie od 5:00.
  const os = Math.max(startH, VISIBLE_START);
  const oe = Math.min(endH, VISIBLE_END, 24);
  return oe > os ? [{ start: os, end: oe }] : [];
}

function getCellShiftFill(h, startH, endH) {
  const cellStart = h;
  const cellEnd = h + 1;
  let fillFrom = 1;
  let fillTo = 0;

  getVisibleShiftSegments(startH, endH).forEach((seg) => {
    const os = Math.max(cellStart, seg.start);
    const oe = Math.min(cellEnd, seg.end);
    if (oe <= os) return;
    fillFrom = Math.min(fillFrom, os - cellStart);
    fillTo = Math.max(fillTo, oe - cellStart);
  });

  return fillTo > fillFrom ? { fillFrom, fillTo } : null;
}

function parseScheduleShift(value, emp) {
  const rawValue = String(value || '').trim().toUpperCase();
  const defaultStart = parseHour(emp.default_start);
  const defaultEndRaw = parseHour(emp.default_end);
  const defaultEnd = defaultEndRaw < defaultStart ? defaultEndRaw + 24 : defaultEndRaw;
  const isWorking = !!rawValue && !ABSENCE_STATUSES.has(rawValue);

  if (!isWorking) {
    return {
      start: defaultStart,
      end: defaultEnd,
      duration: 0,
      working: false,
      status: rawValue,
      confirmed: false,
      fullDay: false,
      rawValue,
    };
  }

  let finalStart = defaultStart;
  let finalEnd = defaultEnd;
  let duration = getShiftDuration(defaultStart, defaultEnd);

  if (rawValue.includes('-')) {
    const [a, b] = rawValue.split('-');
    const st = parseHourValue(a);
    const en = parseHourValue(b);
    if (st !== null && en !== null) {
      finalStart = st;
      finalEnd = en <= st ? en + 24 : en;
      duration = roundHours(finalEnd - finalStart);
    }
  } else if (rawValue.includes('+')) {
    const [a, b] = rawValue.split('+');
    const st = parseHourValue(a);
    const dur = parseHourValue(b);
    if (st !== null && dur !== null) {
      finalStart = st;
      finalEnd = st + dur;
      duration = roundHours(dur);
    }
  } else {
    const dur = parseHourValue(rawValue);
    if (dur !== null) {
      finalStart = defaultStart;
      finalEnd = defaultStart + dur;
      duration = roundHours(dur);
    }
  }

  return {
    start: finalStart,
    end: finalEnd,
    duration,
    working: true,
    status: null,
    confirmed: true,
    fullDay: isFullDayDuty(finalEnd, duration),
    rawValue,
  };
}

function getCellBackground(h, startH, endH, working, role, confirmed, roles) {
  if (!working) return { background: 'transparent', color: 'transparent' };

  const rInfo = roles[role];
  const unassignedColor = confirmed ? 'rgba(0, 122, 255, 0.15)' : 'rgba(0, 0, 0, 0.04)';
  const shiftColor = rInfo ? rInfo.bg : unassignedColor;
  const shiftTextColor = rInfo ? rInfo.fc : 'transparent';
  const emptyColor = 'transparent';

  const fill = getCellShiftFill(h, startH, endH);
  if (!fill) return { background: 'transparent', color: 'transparent' };
  const { fillFrom, fillTo } = fill;

  if (fillTo <= 0) return { background: 'transparent', color: 'transparent' };
  
  if (fillFrom <= 0 && fillTo >= 1) {
    return { background: shiftColor, color: shiftTextColor };
  }

  const pF = Math.round(fillFrom * 100);
  const pT = Math.round(fillTo * 100);
  
  return { 
    background: `linear-gradient(to right, ${emptyColor} ${pF}%, ${shiftColor} ${pF}%, ${shiftColor} ${pT}%, ${emptyColor} ${pT}%)`, 
    color: shiftTextColor 
  };
}

function isHourInShift(h, startH, endH) {
  return !!getCellShiftFill(h, startH, endH);
}

// Zmiana danej osoby w danym dniu (godziny, czy pracuje, potwierdzona, status nieobecności)
function getEmpDayShift(emp, scheduleMap, dateStr) {
  const sched = scheduleMap[`${emp.id}_${dateStr}`];
  const dow = new Date(dateStr + 'T00:00:00').getDay();
  const isWe = dow === 0 || dow === 6;
  const defaultStart = parseHour(emp.default_start);
  const defaultEndRaw = parseHour(emp.default_end);
  const defaultEnd = defaultEndRaw < defaultStart ? defaultEndRaw + 24 : defaultEndRaw;
  const startH = sched ? sched.start : defaultStart;
  const endH = sched ? sched.end : defaultEnd;
  const working = sched ? sched.working : !isWe;
  const confirmed = sched ? sched.confirmed : false;
  const dayStatus = sched?.status || null;
  const duration = sched?.duration ?? getShiftDuration(startH, endH);
  return { startH, endH, duration, working, confirmed, dayStatus, fullDay: sched?.fullDay || false };
}

// Zmemoizowany komponent wiersza
const TimelineRow = React.memo(({
  emp, weekDays, scheduleMap, entries, isAdmin, rowBg, roles,
  brushRole, onBrushCell, isPaintingRef, copyMode, copySource, onCopyClick
}) => {
  const { t } = useTranslation();
  // Panel godzin doby spoza osi 5–21 ("+Xh"): { dateStr, side, count, cells, rect } | null
  const [duty, setDuty] = useState(null);

  useEffect(() => {
    if (!duty) return;
    const close = () => setDuty(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [duty]);

  const cells = weekDays.map((d, di) => {
    const isWe = d.getDay() === 0 || d.getDay() === 6;
    const dateStr = toDateStr(d);
    const sched = scheduleMap[`${emp.id}_${dateStr}`];
    const defaultStart = parseHour(emp.default_start);
    const defaultEndRaw = parseHour(emp.default_end);
    const defaultEnd = defaultEndRaw < defaultStart ? defaultEndRaw + 24 : defaultEndRaw;
    const startH = sched ? sched.start : defaultStart;
    const endH = sched ? sched.end : defaultEnd;
    // Dwie 15-min przerwy: start+3h i start+6h
    const breakCell1 = ((Math.floor(startH + 3) % 24) + 24) % 24;
    const breakCell2 = ((Math.floor(startH + 6) % 24) + 24) % 24;
    const holiday = isHoliday(d);
    const working = sched ? sched.working : false;
    const confirmed = sched ? sched.confirmed : false;
    // Brak wpisu = domyślna wartość grafiku: weekend/święto → 'W' (wolne), powszedni → 'I' (Planowany)
    const dayStatus = sched ? sched.status : ((isWe || holiday) ? 'W' : 'I');
    const statusSt = dayStatus ? STATUS_STYLE[dayStatus] : null;
    const duration = sched?.duration ?? getShiftDuration(startH, endH);
    const schedHours = working ? fmtHours(duration) : '';
    const fullDay = working && !dayStatus && (sched?.fullDay ?? isFullDayDuty(endH, duration));
    // Godziny zmiany wykraczające poza widoczną oś 5–21 → znacznik "+Xh" i wysuwany panel.
    const overflowCells = working && !dayStatus ? getOverflowCells(startH, endH) : [];
    const overflowStartCells = overflowCells.filter(c => c.side === 'start');
    const overflowEndCells = overflowCells.filter(c => c.side === 'end');
    const overflowEndMarker = working && !dayStatus ? getOverflowEndMarker(startH, endH) : null;
    // Realne godziny poza osią = suma wypełnień komórek (np. 1+1+1+0,5 = 3,5),
    // a nie liczba dotkniętych komórek (która zaokrąglała 3,5 h w górę do 4).
    const overflowStartH = sumOverflowHours(overflowStartCells);
    const overflowEndH = sumOverflowHours(overflowEndCells);
    const isCopySource = copyMode && copySource === `${emp.id}_${dateStr}`;
    const canCopyHere = copyMode && isAdmin && working && !dayStatus;

    return (
      <React.Fragment key={di}>
        <td className={`tl-sum-col ${fullDay ? 'tl-duty-sum' : ''}`}
          onClick={canCopyHere ? () => onCopyClick(emp.id, dateStr) : undefined}
          title={canCopyHere ? (copySource ? t('timeline.pasteHere') : t('timeline.copyThisDay')) : undefined}
          style={{
            background: isCopySource ? 'var(--accent)' : dayStatus ? (statusSt?.bg || '#f5f5f7') : fullDay ? '#ffedd5' : working ? 'var(--accent-green-light)' : '#f5f5f7',
            color: isCopySource ? '#fff' : dayStatus ? (statusSt?.color || '#ccc') : fullDay ? '#c2410c' : working ? 'var(--accent-green)' : '#ccc',
            cursor: canCopyHere ? 'copy' : 'default',
            outline: isCopySource ? '2px solid var(--accent)' : 'none',
            boxShadow: copyMode && copySource && canCopyHere && !isCopySource
              ? 'inset 0 0 0 1px var(--accent)'
              : fullDay && !isCopySource
                ? 'inset 0 0 0 2px rgba(249, 115, 22, 0.35)'
                : 'none',
          }}>
          {dayStatus || (working ? schedHours : '')}
        </td>
        {VISIBLE_HOURS.map(h => {
          const key = `${emp.id}_${dateStr}_${h}`;
          const role = entries[key];
          const cellStyle = statusSt
            ? { background: statusSt.bg, color: statusSt.color }
            : getCellBackground(h, startH, endH, working, role, confirmed, roles);

          const isShiftHour = isHourInShift(h, startH, endH);

          const isBrushable = isAdmin && brushRole && !dayStatus && working && isShiftHour && confirmed;
          const isBreakHour = working && !dayStatus && !fullDay && isShiftHour && (h === breakCell1 || h === breakCell2);
          const showStartBadge = h === VISIBLE_START && overflowStartCells.length > 0;
          const showEndBadge = h === VISIBLE_END - 1 && overflowEndCells.length > 0;
          const showBadge = showStartBadge || showEndBadge;
          const badgeSide = showStartBadge ? 'start' : 'end';
          const badgeCells = showStartBadge ? overflowStartCells : overflowEndCells;
          const badgeHours = showStartBadge ? overflowStartH : overflowEndH;
          const badgeEndMarker = showEndBadge ? overflowEndMarker : null;

          return (
            <td key={h}
              className={`tl-cell ${isBrushable ? 'brushable' : ''}`}
              onMouseDown={() => {
                if (!isBrushable) return;
                isPaintingRef.current = true;
                onBrushCell(emp.id, dateStr, h, dayStatus, working, confirmed, isShiftHour);
              }}
              onMouseEnter={() => {
                if (!isPaintingRef.current || !isBrushable) return;
                onBrushCell(emp.id, dateStr, h, dayStatus, working, confirmed, isShiftHour);
              }}
              onContextMenu={(e) => {
                if (!brushRole || !isAdmin) return;
                e.preventDefault();
              }}
              style={{ cursor: isBrushable ? (brushRole === '__erase__' ? 'cell' : 'crosshair') : 'default' }}
            >
              <div
                className="tl-cell-inner"
                style={{ ...cellStyle, overflow: showBadge ? 'visible' : undefined }}
              >
                {isBreakHour && <span className="tl-break-mark" title={t('timeline.break15')} />}
                {!dayStatus && isShiftHour && (role || '')}
                {showBadge && (
                  <button
                    type="button"
                    className={`tl-duty-badge ${badgeSide === 'start' ? 'start' : 'end'} ${duty?.dateStr === dateStr && duty?.side === badgeSide ? 'open' : ''}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setDuty(prev => (prev && prev.dateStr === dateStr && prev.side === badgeSide)
                        ? null
                        : { dateStr, side: badgeSide, count: badgeHours, cells: badgeCells, endMarker: badgeEndMarker, endH, rect: r });
                    }}
                  >
                    +{fmtHours(badgeHours)}h
                  </button>
                )}
              </div>
            </td>
          );
        })}
      </React.Fragment>
    );
  });

  const dutyPanelCols = duty ? duty.cells.length + (duty.endMarker ? 1 : 0) : 0;

  return (
    <tr style={{ background: rowBg, height: '30px' }}>
      <td className="tl-sticky-col" style={{ background: rowBg, padding: 0, minWidth: '200px' }}>
        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
          <div style={{ flex: 1, padding: '0 8px 0 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontWeight: 650, fontSize: '11px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{emp.name}</span>
            <span style={{ fontSize: '9px', color: 'var(--text-quaternary)', fontWeight: 600, flexShrink: 0, marginLeft: '6px', background: 'rgba(0,0,0,0.03)', padding: '2px 4px', borderRadius: '6px' }}>
              {emp.default_start}–{emp.default_end}
            </span>
          </div>
        </div>
      </td>
      {cells}
      {duty && createPortal(
        <div className="tl-duty-pop-backdrop" onMouseDown={() => setDuty(null)}>
          <div
            className="tl-duty-pop"
            style={{
              top: Math.min(duty.rect.bottom + 6, window.innerHeight - 96),
              left: Math.max(8, Math.min(duty.rect.right - 40, window.innerWidth - 12 - (dutyPanelCols * 40 + 24))),
            }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="tl-duty-pop-head">
              <span><i className="ti ti-moon" aria-hidden="true" /> +{fmtHours(duty.count)} · {t('timeline.dutyPanel')}</span>
              <button type="button" onClick={() => setDuty(null)} aria-label={t('common.close')}>×</button>
            </div>
            <div className="tl-duty-pop-cells">
              {duty.cells.map(({ h, fillFrom, fillTo }) => {
                const role = entries[`${emp.id}_${duty.dateStr}_${h}`];
                const rInfo = role ? roles[role] : null;
                const base = rInfo ? rInfo.bg : 'rgba(0,122,255,0.12)';
                const full = fillFrom <= 0 && fillTo >= 1;
                const pF = Math.round(fillFrom * 100);
                const pT = Math.round(fillTo * 100);
                const paintable = isAdmin && brushRole;
                return (
                  <div key={h} className="tl-duty-pop-col">
                    <span className="tl-duty-pop-hl">{h}</span>
                    <div
                      className="tl-duty-pop-cell"
                      title={full ? undefined : `${h}:00–${h}:${String(Math.round(fillTo * 60)).padStart(2, '0')}`}
                      style={{
                        background: full
                          ? base
                          : `linear-gradient(to right, transparent ${pF}%, ${base} ${pF}%, ${base} ${pT}%, transparent ${pT}%)`,
                        color: rInfo ? rInfo.fc : 'transparent',
                        cursor: paintable ? (brushRole === '__erase__' ? 'cell' : 'crosshair') : 'default',
                      }}
                      onMouseDown={() => {
                        if (!paintable) return;
                        isPaintingRef.current = true;
                        onBrushCell(emp.id, duty.dateStr, h, null, true, true, true);
                      }}
                      onMouseEnter={() => {
                        if (!isPaintingRef.current || !paintable) return;
                        onBrushCell(emp.id, duty.dateStr, h, null, true, true, true);
                      }}
                    >{role || ''}</div>
                  </div>
                );
              })}
              {duty.endMarker && (
                <div key={`end-${duty.endMarker.h}`} className="tl-duty-pop-col tl-duty-pop-end-col">
                  <span className="tl-duty-pop-hl">{fmtClockLabel(duty.endH)}</span>
                  <div
                    className="tl-duty-pop-cell tl-duty-pop-end"
                    title={fmtClockLabel(duty.endH)}
                    style={{
                      background: `linear-gradient(to right, rgba(0,122,255,0.12) 0%, rgba(0,122,255,0.12) ${Math.round(duty.endMarker.fillTo * 100)}%, transparent ${Math.round(duty.endMarker.fillTo * 100)}%)`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </tr>
  );
}, (prev, next) => {
  if (prev.emp.id !== next.emp.id) return false;
  if (prev.isAdmin !== next.isAdmin) return false;
  if (prev.brushRole !== next.brushRole) return false;
  if (prev.copyMode !== next.copyMode) return false;
  if (prev.copySource !== next.copySource) return false;
  if (prev.roles !== next.roles) return false;
  if (prev.weekDays !== next.weekDays) return false;
  for (let d of next.weekDays) {
    const dateStr = toDateStr(d);
    if (prev.scheduleMap[`${prev.emp.id}_${dateStr}`] !== next.scheduleMap[`${next.emp.id}_${dateStr}`]) return false;
    for (let h of COUNT_HOURS) {
      const key = `${next.emp.id}_${dateStr}_${h}`;
      if (prev.entries[key] !== next.entries[key]) return false;
    }
  }
  return true;
});



export default function TimelineView() {
  const { t, i18n } = useTranslation();
  const { user, isAdmin, canViewAdminData, sessionToken } = useAuth();
  const DAY_NAMES = dayNamesSunSat();
  const today = new Date();
  // Kotwica bieżącego widoku — dowolny dzień w obrębie wyświetlanego fragmentu tygodnia.
  const [anchor, setAnchor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [employees, setEmployees] = useState([]);
  const [groupData, setGroupData] = useState([]);
  const [rolesData, setRolesData] = useState([]);
  const [entries, setEntries] = useState({});
  const [scheduleMap, setScheduleMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [brushRole, setBrushRole] = useState(null);
  const [copyMode, setCopyMode] = useState(false);
  const [copySource, setCopySource] = useState(null); // `${empId}_${dateStr}` | null
  const isPainting = useRef(false);
  const paintedInStroke = useRef(new Map()); // key -> prevRole for undo on cancel
  const containerRef = useRef(null);

  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  const monday = useMemo(() => getMondayOfWeek(anchor), [anchor]);
  const allWeekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(monday, i)), [monday]);
  const weekNum = getWeekNum(monday);

  // Tydzień ISO może przecinać granicę miesiąca (np. Pn 29.06 – Nd 05.07). Grafik i roster
  // są miesięczne, więc pokazujemy tylko dni z miesiąca kotwicy; reszta tygodnia to osobny
  // "fragment", do którego przechodzi się strzałką Poprzedni/Następny.
  const segMonth = anchor.getMonth();
  const segYear = anchor.getFullYear();
  const segDays = useMemo(
    () => allWeekDays.filter(d => d.getMonth() === segMonth && d.getFullYear() === segYear),
    [allWeekDays, segMonth, segYear]
  );
  const segStart = segDays[0];
  const segEnd = segDays[segDays.length - 1];
  const isPartialWeek = segDays.length < 7;

  const weekDays = useMemo(() => {
    return segDays.filter(d => {
      const dw = d.getDay();
      if (dw !== 0 && dw !== 6) return true;
      const ds = toDateStr(d);
      // Weekend widoczny, gdy ktoś ma malowanie godzinowe (entries) LUB przepracowaną
      // zmianę z grafiku (scheduleMap) tego dnia — np. sobotnia zmiana nocna 23:00.
      const hasTimeline = Object.keys(entries).some(k => k.includes(`_${ds}_`));
      const hasWorkShift = Object.keys(scheduleMap).some(k => k.endsWith(`_${ds}`) && scheduleMap[k]?.working);
      return hasTimeline || hasWorkShift;
    });
  }, [segDays, entries, scheduleMap]);

  const fetchData = useCallback(async () => {
    if (!canViewAdminData || !sessionToken) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const dateFrom = toDateStr(segStart);
    const dateTo = toDateStr(segEnd);

    try {
      const data = await getTimelineWeek(
        sessionToken,
        dateFrom,
        dateTo,
        segYear,
        segMonth + 1
      );
      const emps = data?.roster || [];
      const tl = data?.timeline_entries || [];
      const sched = data?.schedule_entries || [];
      setEmployees(emps);
      setGroupData(data?.groups || []);
      setRolesData(data?.roles || []);
      const map = {};
      tl.forEach(e => { map[`${e.employee_id}_${e.entry_date}_${e.hour}`] = e.role; });
      setEntries(map);
      const sm = {};
      sched.forEach(e => {
        const emp = emps.find(x => x.id === e.employee_id);
        if (!emp) return;
        const dayDate = segDays.find(d => d.getDate() === e.day);
        if (!dayDate) return;
        const ds = toDateStr(dayDate);
        sm[`${e.employee_id}_${ds}`] = parseScheduleShift(e.value, emp);
      });
      setScheduleMap(sm);
    } catch (err) {
      toastError(t('common.error') + ': ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [segDays, segStart, segEnd, segYear, segMonth, canViewAdminData, sessionToken, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Brush / copy mode: keyboard escape to exit
  useEffect(() => {
    if (!brushRole && !copyMode) return;
    const onKey = (e) => { if (e.key === 'Escape') { setBrushRole(null); setCopyMode(false); setCopySource(null); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [brushRole, copyMode]);

  // Zmiana tygodnia/fragmentu kasuje zaznaczone źródło kopiowania
  useEffect(() => { setCopySource(null); }, [anchor]);

  // Stop painting on mouseup anywhere
  useEffect(() => {
    const stop = () => { isPainting.current = false; paintedInStroke.current.clear(); };
    window.addEventListener('mouseup', stop);
    return () => window.removeEventListener('mouseup', stop);
  }, []);

  // Mysz: pionowe kółko przewija całą tabelę w bok (tabela rozciąga się w pionie,
  // więc scroll pionowy strony działa, a kółko nad tabelą przesuwa w bok).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY === 0) return;
      // trackpad poziomy gest – zostaw natywne zachowanie
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      // brak poziomego przewijania – nie przejmuj kółka
      if (el.scrollWidth <= el.clientWidth) return;
      const atStart = el.scrollLeft <= 0;
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
      // na krańcach pozwól stronie przewijać się pionowo
      if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [loading]);



  const handleBrushCell = useCallback(async (empId, dateStr, hour, dayStatus, working, confirmed, isShiftHour) => {
    if (!isAdmin || !brushRole || dayStatus || !working || !isShiftHour || !confirmed) return;
    const key = `${empId}_${dateStr}_${hour}`;
    const isErase = brushRole === '__erase__';
    const newRole = isErase ? null : brushRole;
    const current = entriesRef.current[key];
    if (current === newRole) return;
    setEntries(prev => {
      const next = { ...prev };
      if (newRole) next[key] = newRole; else delete next[key];
      return next;
    });
    const { data, error } = await supabase.rpc('admin_save_timeline_entry', {
      p_session_token: sessionToken,
      p_employee_id: empId,
      p_entry_date: dateStr,
      p_hour: hour,
      p_role: newRole,
      p_updated_by: user?.name || null,
    });
    if (error || data?.error) {
      // cofnij zmianę lokalną gdy zapis się nie powiódł
      setEntries(prev => {
        const next = { ...prev };
        if (current) next[key] = current; else delete next[key];
        return next;
      });
      toastError(t('timeline.saveError'));
    }
  }, [isAdmin, brushRole, user, sessionToken, t]);

  // Kopiowanie dnia jednej osoby na inny dzień (tryb "dołóż")
  const handleCopyClick = useCallback(async (empId, dateStr) => {
    if (!isAdmin) return;
    const srcKey = `${empId}_${dateStr}`;
    // pierwszy klik (lub klik w to samo źródło) — ustaw/wyczyść źródło
    if (!copySource || copySource === srcKey) {
      setCopySource(copySource === srcKey ? null : srcKey);
      return;
    }
    // drugi klik = cel; wklejamy źródło na ten dzień tej osoby
    const [srcEmpId, srcDateStr] = copySource.split('_');
    const tgtEmp = employees.find(e => e.id === empId);
    if (!tgtEmp) return;

    const tShift = getEmpDayShift(tgtEmp, scheduleMap, dateStr);
    if (tShift.dayStatus || !tShift.working) { toastWarn(t('timeline.targetFreeOrAbsent')); return; }
    if (!tShift.confirmed) { toastWarn(t('timeline.targetNotConfirmed')); return; }

    // godziny ze źródła, które mieszczą się w zmianie docelowej
    const toWrite = [];
    for (const h of COUNT_HOURS) {
      const role = entriesRef.current[`${srcEmpId}_${srcDateStr}_${h}`];
      if (!role) continue;
      if (!isHourInShift(h, tShift.startH, tShift.endH)) continue;
      toWrite.push({ h, role });
    }
    if (!toWrite.length) { toastWarn(t('timeline.noHoursToCopy')); return; }

    const prevValues = toWrite.map(({ h }) => ({ h, role: entriesRef.current[`${empId}_${dateStr}_${h}`] }));
    setEntries(prev => {
      const next = { ...prev };
      toWrite.forEach(({ h, role }) => { next[`${empId}_${dateStr}_${h}`] = role; });
      return next;
    });

    const results = await Promise.all(toWrite.map(({ h, role }) =>
      supabase.rpc('admin_save_timeline_entry', {
        p_session_token: sessionToken,
        p_employee_id: empId,
        p_entry_date: dateStr,
        p_hour: h,
        p_role: role,
        p_updated_by: user?.name || null,
      })
    ));
    if (results.some(r => r.error || r.data?.error)) {
      setEntries(prev => {
        const next = { ...prev };
        prevValues.forEach(({ h, role }) => { if (role) next[`${empId}_${dateStr}_${h}`] = role; else delete next[`${empId}_${dateStr}_${h}`]; });
        return next;
      });
      toastError(t('timeline.copyError'));
    } else {
      toastSuccess(t('timeline.copied', { count: toWrite.length, name: tgtEmp.name, date: fmtDate(new Date(dateStr + 'T00:00:00')) }));
    }
  }, [isAdmin, copySource, employees, scheduleMap, user, sessionToken, t]);

  const minMonday = getMondayOfWeek(new Date(2026, 0, 1)); // start: tydzień ze stycznia 2026
  const atMinWeek = segStart <= minMonday;
  // Poprzedni/następny fragment: dzień tuż przed/po obecnym segmencie ustala nową kotwicę,
  // co samo w sobie wylicza właściwy miesiąc — jeśli sąsiedni tydzień też przecina granicę
  // miesiąca, pokaże się tylko jego fragment należący do tego miesiąca.
  const prevWeek = () => setAnchor(a => { const p = addDays(segStart, -1); return p < minMonday ? a : p; });
  const nextWeek = () => setAnchor(() => addDays(segEnd, 1));

  // Stanowiska z bazy (public.roles); grupa (r.group_name) to grupa, do której
  // FIZYCZNIE należy stanowisko — to ona, nie stała grupa pracownika, decyduje
  // do której grupy liczą się godziny w tabeli Suma (patrz buildSummary niżej).
  const ROLES = useMemo(() => Object.fromEntries(rolesData.map(r => [r.code, {
    bg: r.color,
    fc: r.text_color,
    group: r.group_name,
    name: i18n.language === 'de' ? r.name_de : r.name_pl,
  }])), [rolesData, i18n.language]);

  // Stanowiska pogrupowane wg grupy, do której należą — do legendy pędzla, żeby
  // było od razu widać, które stanowisko jest "ZD1" a które "ZD2".
  const rolesByGroup = useMemo(() => {
    const buckets = new Map();
    Object.entries(ROLES).forEach(([code, r]) => {
      if (!buckets.has(r.group)) buckets.set(r.group, []);
      buckets.get(r.group).push([code, r]);
    });
    return groupData
      .map(g => ({ name: g.name, color: g.color, items: buckets.get(g.name) || [] }))
      .filter(b => b.items.length > 0);
  }, [ROLES, groupData]);

  const groups = useMemo(() => {
    // Pracownicy w grupie sortowani alfabetycznie po nazwisku (locale PL).
    const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pl');
    const grps = groupData.map(g => ({ g: g.name, color: g.color, members: employees.filter(e => e.group_name === g.name).sort(byName) }))
      .filter(({ members }) => members.length > 0);
    const extraNames = [...new Set(employees.map(e => e.group_name))].filter(name => !groupData.find(g => g.name === name));
    extraNames.forEach(name => {
      const m = employees.filter(e => e.group_name === name).sort(byName);
      if (m.length) grps.push({ g: name, color: '#455a64', members: m });
    });
    return grps;
  }, [groupData, employees]);

  const groupNames = useMemo(() => groups.map(g => g.g), [groups]);

  // Optymalizacja: jednorazowe przeliczenie wszystkich podsumowań z entries
  const stats = useMemo(() => {
    const summaries = {};
    const roleWeekTotals = {};
    const dayTotals = {};
    const dayGroupTotals = {};
    const weekTotal = { os: new Set(), godz: 0 };
    const weekGroupTotals = {};

    Object.keys(ROLES).forEach(role => { roleWeekTotals[role] = { os: new Set(), godz: 0 }; });

    weekDays.forEach(d => {
      const dateStr = toDateStr(d);
      summaries[dateStr] = {};
      Object.keys(ROLES).forEach(role => { summaries[dateStr][role] = {}; });
      dayTotals[dateStr] = { os: new Set(), godz: 0 };
      dayGroupTotals[dateStr] = {};
      groupNames.forEach(gn => { 
        dayGroupTotals[dateStr][gn] = { os: new Set(), godz: 0 };
        if (!weekGroupTotals[gn]) weekGroupTotals[gn] = { os: new Set(), godz: 0 };
      });
    });

    const empToGroup = {};
    employees.forEach(e => { empToGroup[e.id] = e.group_name; });
    const validDates = new Set(weekDays.map(toDateStr));

    Object.entries(entries).forEach(([key, role]) => {
      if (!role) return;
      const [empIdStr, dateStr] = key.split('_');
      if (!validDates.has(dateStr)) return;
      
      const empId = String(empIdStr);

      const roleGroup = ROLES[role]?.group;
      if (roleGroup) {
        if (!summaries[dateStr][role][roleGroup]) {
           summaries[dateStr][role][roleGroup] = { os: new Set(), godz: 0 };
        }
        summaries[dateStr][role][roleGroup].os.add(empId);
        summaries[dateStr][role][roleGroup].godz += 1;
        
        if (roleWeekTotals[role]) {
          roleWeekTotals[role].os.add(empId);
          roleWeekTotals[role].godz += 1;
        }
      }

      dayTotals[dateStr].os.add(empId);
      dayTotals[dateStr].godz += 1;
      
      weekTotal.os.add(empId);
      weekTotal.godz += 1;
      
      const empGroup = empToGroup[empId];
      if (empGroup && dayGroupTotals[dateStr][empGroup]) {
        dayGroupTotals[dateStr][empGroup].os.add(empId);
        dayGroupTotals[dateStr][empGroup].godz += 1;
        
        weekGroupTotals[empGroup].os.add(empId);
        weekGroupTotals[empGroup].godz += 1;
      }
    });

    return { summaries, roleWeekTotals, dayTotals, dayGroupTotals, weekTotal, weekGroupTotals };
  }, [entries, weekDays, ROLES, groupNames, employees]);

  const summaries = stats.summaries;

  const NAME_W = 160;
  const HOUR_W = 24;
  const todayStr = toDateStr(today);

  // Nagłówek dni/godzin — identyczny w obu tabelach (roster i Suma), żeby
  // kolumny się pokrywały. Wspólna funkcja zamiast kopiowania JSX-a dwa razy.
  const renderTimeHeader = () => (
    <>
      <tr>
        <th rowSpan={2} className="tl-th-corner" style={{ padding: 0, minWidth: '200px' }}>
          <div style={{ display: 'flex', height: '100%', alignItems: 'center', padding: '0 10px' }}>
            {t('timeline.empStation')}
          </div>
        </th>
        {weekDays.map((d, di) => {
          const dw = d.getDay();
          const isWe = dw === 0 || dw === 6;
          const isToday = toDateStr(d) === todayStr;
          return (
            <th key={di} colSpan={VISIBLE_HOURS.length + 1} className="tl-th-day" style={{
              background: isToday ? 'var(--accent)' : isWe ? 'var(--accent-red-light)' : 'var(--bg-secondary)',
              color: isToday ? '#fff' : isWe ? 'var(--accent-red)' : 'var(--text-secondary)',
            }}>
              {DAY_NAMES[dw]} {fmtDate(d)}
            </th>
          );
        })}
      </tr>
      <tr>
        {weekDays.map((d, di) => {
          const isWe = d.getDay() === 0 || d.getDay() === 6;
          const isToday = toDateStr(d) === todayStr;
          return [
            <th key={`sum-${di}`} style={{ width: '28px', background: 'var(--bg-tertiary)', color: 'var(--text-quaternary)', fontSize: '8px', fontWeight: 700, textAlign: 'center', borderBottom: '2px solid var(--border)', borderLeft: '2px solid var(--border-strong)', padding: '2px 0' }}>Σ</th>,
            ...VISIBLE_HOURS.map(h => (
              <th key={`h-${di}-${h}`} className="tl-th-hour" style={{ width: `${HOUR_W}px`, background: isToday ? 'var(--accent-light)' : isWe ? 'var(--accent-red-light)' : 'var(--bg-secondary)', color: isWe ? 'var(--accent-red)' : 'var(--text-tertiary)' }}>{h}</th>
            )),
          ];
        })}
      </tr>
    </>
  );
  const tableMinWidth = useMemo(() => `${NAME_W + weekDays.length * (VISIBLE_HOURS.length * HOUR_W + 29)}px`, [weekDays.length]);

  if (!canViewAdminData) return <div style={{ padding: '40px', textAlign: 'center' }}>{t('admin.noAccess')}</div>;
  if (loading) return <div className="loader">{t('timeline.loading')}</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Nawigacja */}
      <div className="print-hide" style={{
        display: 'flex', alignItems: 'center', gap: '12px',
        background: 'var(--bg-card)', backdropFilter: 'blur(16px)',
        padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'
      }}>
        <button onClick={prevWeek} disabled={atMinWeek} style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 14px', fontSize: '14px', cursor: atMinWeek ? 'not-allowed' : 'pointer', opacity: atMinWeek ? 0.4 : 1, fontWeight: 700, color: 'var(--text-primary)' }}>{t('timeline.prev')}</button>
        <div style={{ fontWeight: 700, fontSize: '16px', flex: 1, textAlign: 'center', color: 'var(--text-primary)' }}>
          {t('timeline.week', { num: weekNum })} · {fmtDate(segStart)} – {fmtDate(segEnd)}
          {isPartialWeek && <span style={{ fontWeight: 500, color: 'var(--text-tertiary)' }}> · {t('timeline.partialWeek')}</span>}
        </div>
        <button onClick={nextWeek} style={{ background: 'var(--bg-card-solid)', border: '1px solid var(--border)', borderRadius: '10px', padding: '7px 14px', fontSize: '14px', cursor: 'pointer', fontWeight: 700, color: 'var(--text-primary)' }}>{t('timeline.next')}</button>
      </div>

      {/* Pasek pędzla */}
      {isAdmin && (
        <div className="print-hide" style={{
          display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap',
          background: 'var(--bg-card)', backdropFilter: 'blur(16px)',
          padding: '10px 14px', borderRadius: '16px', border: '1px solid var(--border)', boxShadow: 'var(--shadow-sm)'
        }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-quaternary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px', whiteSpace: 'nowrap' }}>
            {t('timeline.brush')}
          </span>
          {rolesByGroup.map(bucket => (
            <React.Fragment key={bucket.name}>
              <span style={{ fontSize: '9px', fontWeight: 800, color: bucket.color, textTransform: 'uppercase', letterSpacing: '0.3px', whiteSpace: 'nowrap' }}>
                {bucket.name}
              </span>
              {bucket.items.map(([key, r]) => {
                const isActive = brushRole === key;
                return (
                  <button key={key} title={r.name} onClick={() => { setBrushRole(isActive ? null : key); setCopyMode(false); setCopySource(null); }} style={{
                    background: isActive ? r.bg : `${r.bg}18`,
                    color: isActive ? r.fc : r.bg,
                    border: isActive ? `2px solid ${r.bg}` : '2px solid transparent',
                    borderRadius: '10px', padding: '4px 8px',
                    fontSize: '11px', fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.15s', boxShadow: isActive ? `0 0 0 3px ${r.bg}35` : 'none',
                    transform: isActive ? 'scale(1.08)' : 'scale(1)',
                  }}>
                    {key}
                  </button>
                );
              })}
            </React.Fragment>
          ))}
          <div style={{ width: '1px', height: '20px', background: 'var(--border-strong)', margin: '0 4px' }} />
          <button onClick={() => { setBrushRole(brushRole === '__erase__' ? null : '__erase__'); setCopyMode(false); setCopySource(null); }} style={{
            background: brushRole === '__erase__' ? '#ef4444' : 'rgba(239,68,68,0.1)',
            color: brushRole === '__erase__' ? '#fff' : '#ef4444',
            border: brushRole === '__erase__' ? '2px solid #ef4444' : '2px solid transparent',
            borderRadius: '10px', padding: '4px 10px',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: brushRole === '__erase__' ? '0 0 0 3px rgba(239,68,68,0.25)' : 'none',
            transform: brushRole === '__erase__' ? 'scale(1.08)' : 'scale(1)',
          }}>
            {t('timeline.eraser')}
          </button>
          {brushRole && (
            <button onClick={() => setBrushRole(null)} style={{
              background: 'transparent', color: 'var(--text-tertiary)',
              border: '1px dashed var(--border-strong)', borderRadius: '10px', padding: '4px 10px',
              fontSize: '11px', cursor: 'pointer', marginLeft: '4px',
            }}>
              {t('timeline.escDisable')}
            </button>
          )}
          {!brushRole && !copyMode && (
            <span style={{ fontSize: '10px', color: 'var(--text-quaternary)', marginLeft: '4px' }}>
              {t('timeline.brushHint')}
            </span>
          )}

          <div style={{ width: '1px', height: '20px', background: 'var(--border-strong)', margin: '0 4px' }} />
          <button onClick={() => { setCopyMode(m => !m); setCopySource(null); setBrushRole(null); }} style={{
            background: copyMode ? 'var(--accent)' : 'var(--accent-light, rgba(0,122,255,0.12))',
            color: copyMode ? '#fff' : 'var(--accent)',
            border: copyMode ? '2px solid var(--accent)' : '2px solid transparent',
            borderRadius: '10px', padding: '4px 10px',
            fontSize: '11px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
            boxShadow: copyMode ? '0 0 0 3px rgba(0,122,255,0.25)' : 'none',
            transform: copyMode ? 'scale(1.08)' : 'scale(1)',
          }}>
            {t('timeline.copyDay')}
          </button>
          {copyMode && (
            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginLeft: '4px', fontWeight: 600 }}>
              {copySource
                ? t('timeline.copyHintTarget')
                : t('timeline.copyHintSource')}
            </span>
          )}
          {copyMode && (
            <button onClick={() => { setCopyMode(false); setCopySource(null); }} style={{
              background: 'transparent', color: 'var(--text-tertiary)',
              border: '1px dashed var(--border-strong)', borderRadius: '10px', padding: '4px 10px',
              fontSize: '11px', cursor: 'pointer', marginLeft: '4px',
            }}>
              {t('timeline.escDisable')}
            </button>
          )}
        </div>
      )}



      {/* Roster: lista pracowników, cała na ekranie (bez pionowego scrolla) */}
      <div className="tl-container" ref={containerRef}>
        <table className="tl-table" style={{ minWidth: tableMinWidth }}>
          <thead>
            {renderTimeHeader()}
          </thead>

          {/* Ciało tabeli: Grupy i Pracownicy */}
          {groups.map(({ g, color: grpColor, members }) => (
            <tbody key={`grp-${g}`}>
              <tr style={{ height: '22px' }}>
                <td className="tl-sticky-col" style={{ background: '#fff', borderTop: `1px solid ${grpColor}30`, borderBottom: `1px solid ${grpColor}30`, padding: 0, minWidth: '200px' }}>
                  <div style={{ display: 'flex', width: '100%', height: '100%', background: `${grpColor}15` }}>
                    <div style={{ flex: 1, padding: '0 10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: grpColor }} />
                      <span style={{ fontWeight: 800, fontSize: '10px', color: grpColor, letterSpacing: '0.5px', textTransform: 'uppercase' }}>{g}</span>
                    </div>
                  </div>
                </td>
                <td colSpan={weekDays.length * (VISIBLE_HOURS.length + 1)} style={{ background: `${grpColor}08`, borderTop: `1px solid ${grpColor}20`, borderBottom: `1px solid ${grpColor}20` }} />
              </tr>
              {members.map((emp) => {
                const rowBg = '#ffffff';

                return (
                  <TimelineRow
                    key={emp.id}
                    emp={emp}
                    weekDays={weekDays}
                    scheduleMap={scheduleMap}
                    entries={entries}
                    isAdmin={isAdmin}
                    rowBg={rowBg}
                    roles={ROLES}
                    brushRole={brushRole}
                    onBrushCell={handleBrushCell}
                    isPaintingRef={isPainting}
                    copyMode={copyMode}
                    copySource={copySource}
                    onCopyClick={handleCopyClick}
                  />
                );
              })}
            </tbody>
          ))}
          {/* PRZERWA MIĘDZY LISTĄ A PODSUMOWANIEM ORAZ DOLNY NAGŁÓWEK */}
          <tbody>
            <tr>
              <td colSpan={weekDays.length * (VISIBLE_HOURS.length + 1) + 1} style={{ height: '32px', border: 'none', background: 'var(--bg-primary)' }}></td>
            </tr>
            {renderTimeHeader()}
          </tbody>

          {/* Ciało tabeli: Podsumowanie */}
          <tbody>
            <tr className="tl-summary-header">
              <th className="tl-sticky-col" style={{ background: 'var(--bg-card-solid)', padding: 0, minWidth: '200px', borderRight: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center' }}>
                  <div style={{ flex: 1, padding: '0 12px', color: 'var(--text-primary)', fontSize: '13px', fontWeight: 800 }}>
                    {t('timeline.sum')}
                  </div>
                  <div style={{ display: 'flex', alignSelf: 'stretch', width: '88px', background: 'var(--bg-tertiary)', borderLeft: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700, borderRight: '1px solid var(--border)' }}>OS.</div>
                    <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700 }}>GODZ.</div>
                  </div>
                </div>
              </th>
              {weekDays.map((d, di) => {
                const isToday = toDateStr(d) === todayStr;
                return (
                  <td key={di} colSpan={VISIBLE_HOURS.length + 1} style={{ padding: 0, borderLeft: '2px solid var(--border-strong)', background: isToday ? 'var(--accent-light)' : 'var(--bg-card-solid)' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: '52px' }}>
                      
                      {/* TOP ROW: GROUP NAMES */}
                      <div style={{ display: 'flex', flex: 1, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ flex: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: '11px', fontWeight: 800, borderRight: '1px solid var(--border)' }}>
                          RAZEM
                        </div>
                        {groupNames.map((gn, idx) => {
                          const gc = groups.find(g => g.g === gn)?.color || '#555';
                          return (
                            <div key={gn} style={{ flex: 2, display: 'flex', justifyContent: 'center', alignItems: 'center', background: `${gc}15`, color: gc, fontSize: '11px', fontWeight: 800, borderRight: idx === groupNames.length - 1 ? 'none' : '1px solid var(--border)' }}>
                              {gn.toUpperCase()}
                            </div>
                          );
                        })}
                      </div>

                      {/* BOTTOM ROW: Os. Godz. */}
                      <div style={{ display: 'flex', flex: 1, background: 'transparent' }}>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700 }}>
                          OS.
                        </div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border-strong)', color: 'var(--text-secondary)', fontSize: '10px', fontWeight: 700 }}>
                          GODZ.
                        </div>
                        {groupNames.flatMap((gn, idx) => {
                          const gc = groups.find(g => g.g === gn)?.color || '#555';
                          const isLast = idx === groupNames.length - 1;
                          return [
                            <div key={`${gn}-o`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: gc, fontSize: '10px', fontWeight: 700 }}>
                              OS.
                            </div>,
                            <div key={`${gn}-g`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: isLast ? 'none' : '1px solid var(--border)', color: gc, fontSize: '10px', fontWeight: 700 }}>
                              GODZ.
                            </div>
                          ];
                        })}
                      </div>

                    </div>
                  </td>
                );
              })}
            </tr>
            {Object.entries(ROLES).map(([role, r], ri) => {
              const rowBg = ri % 2 === 0 ? '#ffffff' : '#f6f6f9';
              
              const weekOs = stats.roleWeekTotals[role]?.os || new Set();
              const weekGodz = stats.roleWeekTotals[role]?.godz || 0;

              return (
                <tr key={role} style={{ background: rowBg, height: '36px' }}>
                  <td className="tl-sticky-col" style={{ background: rowBg, borderBottom: '1px solid var(--border)', padding: 0, minWidth: '200px' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center' }}>
                      <div style={{ flex: 1, minWidth: 0, padding: '0 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          minWidth: '24px', height: '20px', padding: '0 6px', borderRadius: '6px',
                          background: r.bg, color: r.fc, fontSize: '11px', fontWeight: 800, flexShrink: 0,
                        }}>{role}</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ROLES[role]?.name || role}</span>
                      </div>
                      <div style={{ display: 'flex', width: '88px', background: `${r.bg}10`, borderLeft: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: weekOs.size ? r.bg : 'var(--text-quaternary)', fontWeight: weekOs.size ? 800 : 500, fontSize: '12px', borderRight: '1px solid var(--border)' }}>
                          {weekOs.size || '·'}
                        </div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: weekGodz ? r.bg : 'var(--text-quaternary)', fontWeight: weekGodz ? 800 : 500, fontSize: '12px' }}>
                          {weekGodz || '·'}
                        </div>
                      </div>
                    </div>
                  </td>
                  {weekDays.map((d, di) => {
                    const dateStr = toDateStr(d);
                    const isToday = dateStr === todayStr;
                    const roleData = summaries[dateStr]?.[role] || {};
                    const totalOs = new Set(Object.values(roleData).flatMap(x => [...(x?.os || [])])).size;
                    const totalGodz = Object.values(roleData).reduce((s, x) => s + (x?.godz || 0), 0);

                    return (
                      <td key={di} colSpan={VISIBLE_HOURS.length + 1} style={{ padding: 0, borderLeft: '2px solid var(--border-strong)', background: isToday ? 'rgba(56,189,248,0.03)' : 'transparent' }}>
                        <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                          
                          {/* RAZEM */}
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: totalOs ? 'var(--text-primary)' : 'var(--text-quaternary)', fontWeight: totalOs ? 800 : 500, fontSize: '12px' }}>
                            {totalOs || '·'}
                          </div>
                          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border-strong)', color: totalGodz ? 'var(--text-primary)' : 'var(--text-quaternary)', fontWeight: totalGodz ? 800 : 500, fontSize: '12px' }}>
                            {totalGodz || '·'}
                          </div>

                          {/* GROUPS */}
                          {groupNames.flatMap((gn, idx) => {
                            const gc = groups.find(g => g.g === gn)?.color || '#555';
                            const gd = roleData[gn];
                            const isLast = idx === groupNames.length - 1;
                            return [
                              <div key={`${gn}-o`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: gd?.os?.size ? gc : 'var(--text-quaternary)', fontWeight: gd?.os?.size ? 800 : 500, fontSize: '12px' }}>
                                {gd?.os?.size || '·'}
                              </div>,
                              <div key={`${gn}-g`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: isLast ? 'none' : '1px solid var(--border)', color: gd?.godz ? gc : 'var(--text-quaternary)', fontWeight: gd?.godz ? 800 : 500, fontSize: '12px' }}>
                                {gd?.godz || '·'}
                              </div>
                            ];
                          })}

                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            <tr style={{ height: '36px' }}>
              {(() => {
                const wOs = stats.weekTotal.os;
                const wGodz = stats.weekTotal.godz;

                return (
                  <td className="tl-sticky-col" style={{ background: '#f2f2f7', padding: 0, minWidth: '200px', borderRight: '1px solid var(--border)', borderTop: '2px solid var(--border-strong)' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                      <div style={{ flex: 1, padding: '0 12px', display: 'flex', alignItems: 'center', color: 'var(--text-primary)', fontWeight: 800, fontSize: '13px' }}>
                        {t('timeline.total')}
                      </div>
                      <div style={{ display: 'flex', width: '88px', borderLeft: '1px solid var(--border)' }}>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: wOs.size ? 'var(--text-primary)' : 'var(--text-quaternary)', fontWeight: 800, fontSize: '12px', borderRight: '1px solid var(--border)' }}>
                          {wOs.size || '·'}
                        </div>
                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', color: wGodz ? 'var(--text-primary)' : 'var(--text-quaternary)', fontWeight: 800, fontSize: '12px' }}>
                          {wGodz || '·'}
                        </div>
                      </div>
                    </div>
                  </td>
                );
              })()}
              {weekDays.map((d, di) => {
                const dateStr = toDateStr(d);
                const isToday = dateStr === todayStr;
                const allOs = stats.dayTotals[dateStr]?.os || new Set();
                const allGodz = stats.dayTotals[dateStr]?.godz || 0;
                
                return (
                  <td key={di} colSpan={VISIBLE_HOURS.length + 1} style={{ padding: 0, borderLeft: '2px solid var(--border-strong)', background: isToday ? 'rgba(56,189,248,0.06)' : 'var(--bg-tertiary)', borderTop: '2px solid var(--border-strong)' }}>
                    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
                      
                      {/* RAZEM */}
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '13px' }}>
                        {allOs.size || '·'}
                      </div>
                      <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border-strong)', color: 'var(--text-primary)', fontWeight: 800, fontSize: '13px' }}>
                        {allGodz || '·'}
                      </div>

                      {/* GROUPS */}
                      {groupNames.flatMap((gn, idx) => {
                        const gc = groups.find(g => g.g === gn)?.color || '#555';
                        const gOs = stats.dayGroupTotals[dateStr]?.[gn]?.os || new Set();
                        const gGodz = stats.dayGroupTotals[dateStr]?.[gn]?.godz || 0;
                        const isLast = idx === groupNames.length - 1;
                        
                        return [
                          <div key={`${gn}-o`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: '1px solid var(--border)', color: gc, fontWeight: 800, fontSize: '13px' }}>
                            {gOs.size || '·'}
                          </div>,
                          <div key={`${gn}-g`} style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', borderRight: isLast ? 'none' : '1px solid var(--border)', color: gc, fontWeight: 800, fontSize: '13px' }}>
                            {gGodz || '·'}
                          </div>
                        ];
                      })}

                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="print-hide" style={{ fontSize: '11px', color: 'var(--text-quaternary)', textAlign: 'right' }}>
        {t('timeline.week', { num: weekNum })} · {t('timeline.employees', { count: employees.length })}
      </div>
    </div>
  );
}
