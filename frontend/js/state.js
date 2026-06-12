/**
 * state.js — Shared state management, Graph Coloring Algorithm & Schedule helpers
 */

const APP_KEY = 'vtu_gc_project';

const DEFAULT_STATE = {
  subjects:  [],
  teachers:  [],
  divisions: [],
  coloring:  {},
  algoSteps: [],
  schedule:  {},   // { slotIndex: { day, period, timeLabel } }
};

/* ── Persistence (Async with localStorage fallback) ── */
const API_BASE = ''; // Relative path, works when served from Flask or via proxy

async function loadState() {
  try {
    const res = await fetch(`${API_BASE}/api/state`);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.state) {
        localStorage.setItem(APP_KEY, JSON.stringify(data.state));
        return { ...DEFAULT_STATE, ...data.state };
      }
    }
  } catch (err) {
    console.warn("Backend loadState failed, using local storage:", err);
  }
  
  try {
    const raw = localStorage.getItem(APP_KEY);
    return raw ? { ...DEFAULT_STATE, ...JSON.parse(raw) } : { ...DEFAULT_STATE };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

async function saveState(state) {
  try {
    localStorage.setItem(APP_KEY, JSON.stringify(state));
  } catch (err) {
    console.error("Local storage save failed:", err);
  }

  try {
    const res = await fetch(`${API_BASE}/api/state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state)
    });
    return res.ok;
  } catch (err) {
    console.warn("Backend saveState failed, running in local storage fallback:", err);
    return false;
  }
}

async function clearState() {
  try {
    localStorage.removeItem(APP_KEY);
  } catch {}
  
  try {
    const res = await fetch(`${API_BASE}/api/clear`, { method: 'POST' });
    return res.ok;
  } catch (err) {
    console.warn("Backend clearState failed:", err);
    return false;
  }
}

function uid()            { return Math.random().toString(36).slice(2, 9); }

/* ════════════════════════════════════════════════════
   AUTO-CONFLICT DETECTION
   Conflict = two subjects share a teacher OR a division
════════════════════════════════════════════════════ */
function detectConflicts(state) {
  const set = new Set();
  function add(a, b) { if (a!==b) set.add([a,b].sort().join('::')); }

  state.teachers.forEach(t => {
    const s = t.subjects||[];
    for (let i=0;i<s.length;i++) for (let j=i+1;j<s.length;j++) add(s[i],s[j]);
  });
  state.divisions.forEach(d => {
    const s = d.subjects||[];
    for (let i=0;i<s.length;i++) for (let j=i+1;j<s.length;j++) add(s[i],s[j]);
  });
  return [...set].map(k => k.split('::'));
}

/* ════════════════════════════════════════════════════
   GREEDY GRAPH COLORING
════════════════════════════════════════════════════ */
async function runGraphColoring(state) {
  try {
    // Make sure backend has the latest data
    await saveState(state);
    const res = await fetch(`${API_BASE}/api/generate`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      if (data.success) {
        return { coloring: data.coloring, steps: data.steps };
      }
    }
  } catch (err) {
    console.warn("Backend generate failed, falling back to local coloring:", err);
  }
  return runGraphColoringLocal(state);
}

function runGraphColoringLocal(state) {
  const subjects  = state.subjects;
  const conflicts = detectConflicts(state);
  const coloring  = {};
  const steps     = [];

  subjects.forEach((subject, idx) => {
    const neighborColors = new Set();
    conflicts.forEach(([a,b]) => {
      if (a===subject.id && coloring[b]!==undefined) neighborColors.add(coloring[b]);
      if (b===subject.id && coloring[a]!==undefined) neighborColors.add(coloring[a]);
    });

    let color = 0;
    while (neighborColors.has(color)) color++;
    coloring[subject.id] = color;

    const coloredNeighbors = conflicts
      .filter(([a,b]) => a===subject.id||b===subject.id)
      .map(([a,b]) => a===subject.id?b:a)
      .filter(nid => coloring[nid]!==undefined)
      .map(nid => { const s=subjects.find(s=>s.id===nid); return s?`${s.name} (Slot ${coloring[nid]+1})`:''; })
      .filter(Boolean);

    steps.push({
      num:    idx+1,
      name:   subject.name,
      slot:   color,
      reason: coloredNeighbors.length>0
              ? `Neighbors already assigned: ${coloredNeighbors.join(', ')}`
              : 'No conflicting neighbors colored yet — first available slot assigned',
    });
  });

  return { coloring, steps };
}

/* ════════════════════════════════════════════════════
   WEEKLY SCHEDULE BUILDER
   6 days (Mon–Sat), 6 periods per day, 10 AM – 5 PM
   Two breaks: 11:50–12:10 and 2:00–3:10
════════════════════════════════════════════════════ */
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

/* The 6 teaching periods (breaks are display-only, not slots) */
const PERIOD_TIMES = [
  { label:'10:00 – 10:55 AM', short:'10:00', period:1 },
  { label:'10:55 – 11:50 AM', short:'10:55', period:2 },
  { label:'12:10 – 1:05 PM',  short:'12:10', period:3 },
  { label:'1:05 – 2:00 PM',   short:'1:05',  period:4 },
  { label:'3:10 – 4:05 PM',   short:'3:10',  period:5 },
  { label:'4:05 – 5:00 PM',   short:'4:05',  period:6 },
];

/* Break rows shown visually in the weekly table */
const BREAKS = [
  { afterPeriod: 2, label:'Break', time:'11:50 – 12:10 PM', duration:'20 min' },
  { afterPeriod: 4, label:'Lunch Break', time:'2:00 – 3:10 PM', duration:'70 min' },
];

const PERIODS_PER_DAY = PERIOD_TIMES.length;  // 6

/**
 * buildSchedule(numSlots)
 * Maps each color-slot index to a {day, period, timeLabel}.
 * Distributes round-robin by day first, then by period row.
 * Max capacity: 6 days × 6 periods = 36 slots.
 */
function buildSchedule(numSlots) {
  const schedule = {};
  for (let i = 0; i < numSlots; i++) {
    const dayIdx    = i % DAYS.length;                     // round-robin across days
    const periodIdx = Math.floor(i / DAYS.length) % PERIODS_PER_DAY;
    const pt        = PERIOD_TIMES[periodIdx];
    schedule[i] = {
      day:       DAYS[dayIdx],
      dayIndex:  dayIdx,
      period:    pt.period,
      timeLabel: pt.label,
      short:     pt.short,
    };
  }
  return schedule;
}

/* ════════════════════════════════════════════════════
   TIMETABLE HELPERS
════════════════════════════════════════════════════ */
function buildTimetable(state) {
  const slots = {};
  Object.entries(state.coloring).forEach(([id, c]) => {
    if (!slots[c]) slots[c] = [];
    slots[c].push(id);
  });
  return slots;
}

function subjectName(state, id) {
  const s = state.subjects.find(s => s.id===id);
  return s ? s.name : id;
}
function subjectTeachers(state, id) {
  return state.teachers.filter(t=>(t.subjects||[]).includes(id)).map(t=>t.name);
}
function subjectDivisions(state, id) {
  return state.divisions.filter(d=>(d.subjects||[]).includes(id)).map(d=>d.name);
}

/**
 * getFacultyWeeklySchedule(state, teacherId)
 * Returns a 5-day × period grid for a specific teacher.
 * Grid cell = { subjectId, subjectName, slot, divisions, timeLabel } | null
 */
function getFacultyWeeklySchedule(state, teacherId) {
  const teacher   = state.teachers.find(t => t.id===teacherId);
  if (!teacher) return null;

  const numSlots  = new Set(Object.values(state.coloring)).size;
  const schedule  = buildSchedule(numSlots);

  // Map: slot → schedule entry
  const grid = {};
  DAYS.forEach(d => { grid[d] = {}; });

  (teacher.subjects||[]).forEach(subId => {
    const slot = state.coloring[subId];
    if (slot === undefined) return;
    const sch  = schedule[slot];
    if (!sch) return;
    const day  = sch.day;

    if (!grid[day][sch.period]) grid[day][sch.period] = [];
    grid[day][sch.period].push({
      subjectId:   subId,
      subjectName: subjectName(state, subId),
      slot,
      divisions:   subjectDivisions(state, subId),
      timeLabel:   sch.timeLabel,
      period:      sch.period,
    });
  });

  return { teacher, grid, schedule, numSlots };
}

/* ── Expose globally ── */
window.APP = {
  loadState, saveState, clearState, uid,
  detectConflicts, runGraphColoring, buildTimetable,
  buildSchedule, getFacultyWeeklySchedule,
  subjectName, subjectTeachers, subjectDivisions,
  DAYS, PERIOD_TIMES, BREAKS,
};
