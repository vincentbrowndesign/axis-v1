import React, { useEffect, useMemo, useRef, useState } from "react";

/**
* AXIS CONSOLE (GAME LAYER)
* - Full paste replacement for src/App.jsx
* - Works without backend changes
* - Saves progress locally
* - Tries to log to Supabase if ./supabase.js exists (safe dynamic import)
*/

const LS_KEY = "axis_console_game_v2";

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const nowMs = () => Date.now();

function formatTime(ts) {
const d = new Date(ts);
const hh = d.getHours();
const mm = String(d.getMinutes()).padStart(2, "0");
const ap = hh >= 12 ? "PM" : "AM";
const h12 = ((hh + 11) % 12) + 1;
return `${h12}:${mm} ${ap}`;
}

function levelFromXp(xp) {
// simple leveling: 0-99 L1, 100-199 L2, etc
const lvl = Math.floor(xp / 100) + 1;
const into = xp % 100;
return { lvl, into };
}

async function tryLogToSupabase(row) {
// safe: only logs if you have src/supabase.js exporting `supabase`
try {
const mod = await import("./supabase.js");
const supabase = mod?.supabase;
if (!supabase) return;

// You can change table name here if needed:
// decisions OR moments OR signals — depends on your DB.
// We'll try "decisions" first, then "moments".
const tablesToTry = ["decisions", "moments", "signals"];

for (const t of tablesToTry) {
const { error } = await supabase.from(t).insert([row]);
if (!error) return; // success
}
} catch {
// ignore
}
}

export default function App() {
// --- Core "console" state (matches your current layout) ---
const [role, setRole] = useState("parent"); // parent | coach
const [mode, setMode] = useState("practice"); // game | practice
const [focusPlayer, setFocusPlayer] = useState("Cole");
const players = ["Cole", "Rocket", "Chance", "Hailey"];

// moments grid (left panel)
const MOMENTS = useMemo(
() => [
{ id: "GOOD", label: "GOOD", sub: "Good decision", kind: "positive" },
{ id: "MISS", label: "MISS", sub: "Missed read", kind: "negative" },
{ id: "SPACING", label: "SPACE", sub: "Spacing broke", kind: "neutral" },
{ id: "PANIC", label: "PANIC", sub: "Panic dribble", kind: "negative" },
{ id: "DUNK", label: "DUNK", sub: "Didn’t see 2", kind: "negative" },
{ id: "HUSTLE", label: "HUSTLE", sub: "Effort / motor", kind: "positive" },
{ id: "WATCH", label: "WATCH", sub: "Observe only", kind: "neutral" },
{ id: "HOLD", label: "HOLD", sub: "Pause • see 2", kind: "neutral" },
],
[]
);

// --- Game Layer ---
const [connected, setConnected] = useState(true);

const [sessionOn, setSessionOn] = useState(false);
const [xp, setXp] = useState(0);
const [streak, setStreak] = useState(0);
const [bestStreak, setBestStreak] = useState(0);

const [mission, setMission] = useState("WATCH"); // active constraint/quest
const [missionLocked, setMissionLocked] = useState(false);

const [timeline, setTimeline] = useState([]); // events feed
const [nowCard, setNowCard] = useState(null);

const lastTapRef = useRef(0);

// Load persisted
useEffect(() => {
try {
const raw = localStorage.getItem(LS_KEY);
if (!raw) return;
const s = JSON.parse(raw);
if (s.role) setRole(s.role);
if (s.mode) setMode(s.mode);
if (s.focusPlayer) setFocusPlayer(s.focusPlayer);

if (typeof s.xp === "number") setXp(s.xp);
if (typeof s.bestStreak === "number") setBestStreak(s.bestStreak);
if (typeof s.mission === "string") setMission(s.mission);
if (Array.isArray(s.timeline)) setTimeline(s.timeline);
if (s.nowCard) setNowCard(s.nowCard);
} catch {}
}, []);

// Save persisted
useEffect(() => {
const payload = {
role,
mode,
focusPlayer,
xp,
bestStreak,
mission,
timeline: timeline.slice(0, 50),
nowCard,
};
try {
localStorage.setItem(LS_KEY, JSON.stringify(payload));
} catch {}
}, [role, mode, focusPlayer, xp, bestStreak, mission, timeline, nowCard]);

// Suggested constraint logic (simple, but feels smart)
const suggestedConstraint = useMemo(() => {
const recent = timeline.slice(0, 10).map((e) => e.momentId);
const bad = recent.filter((x) => x === "PANIC" || x === "MISS" || x === "DUNK").length;

if (bad >= 4) return "HOLD";
if (bad >= 2) return "WATCH";
return "SPACING";
}, [timeline]);

const lvl = levelFromXp(xp);

function startSession() {
setSessionOn(true);
setMissionLocked(false);
setStreak(0);
setNowCard(null);

// auto choose suggested mission for “game start” feel
setMission(suggestedConstraint);

pushEvent({
type: "system",
title: "SESSION START",
desc: `${role} • ${mode} • ${focusPlayer}`,
momentId: null,
deltaXp: 0,
});
}

function endSession() {
setSessionOn(false);
setMissionLocked(false);

pushEvent({
type: "system",
title: "SESSION END",
desc: `XP ${xp} • Best streak ${bestStreak}`,
momentId: null,
deltaXp: 0,
});
}

function lockMission() {
if (!sessionOn) return;
if (!mission) return;
setMissionLocked(true);

pushEvent({
type: "system",
title: "MISSION LOCKED",
desc: mission,
momentId: mission,
deltaXp: 0,
});
}

function setMissionFromSuggestion() {
setMission(suggestedConstraint);
setMissionLocked(false);
pushEvent({
type: "system",
title: "MISSION SET",
desc: suggestedConstraint,
momentId: suggestedConstraint,
deltaXp: 0,
});
}

function pushEvent(evt) {
const entry = {
id: `${nowMs()}_${Math.random().toString(16).slice(2)}`,
ts: nowMs(),
role,
mode,
player: focusPlayer,
mission,
missionLocked,
...evt,
};
setTimeline((prev) => [entry, ...prev].slice(0, 80));
}

async function tapMoment(momentId) {
const m = MOMENTS.find((x) => x.id === momentId);

// update “Now” card always (even if not in session)
const now = {
title: momentId,
subtitle: `${focusPlayer} • ${role} • ${mode}`,
ts: nowMs(),
};
setNowCard(now);

// if not session, still log an event but no game scoring
if (!sessionOn) {
pushEvent({
type: "moment",
title: momentId,
desc: `${m?.sub || ""}`.trim(),
momentId,
deltaXp: 0,
});
// optional backend log
tryLogToSupabase({
actor: role,
label: momentId,
note: `${focusPlayer} • ${mode}`,
state: "idle",
});
return;
}

// GAME SCORING
const t = nowMs();
const fast = lastTapRef.current ? t - lastTapRef.current < 3500 : false;
lastTapRef.current = t;

const matchesMission = missionLocked && mission ? momentId === mission : false;

let gain = 2; // baseline (hook)
if (matchesMission) gain += 10;
if (fast) gain += 3;

// mode pressure
if (mode === "game" && (momentId === "PANIC" || momentId === "DUNK")) gain -= 2;

// never go below 0 gained XP (keep it game-feel)
gain = clamp(gain, 0, 20);

// streak
setStreak((prev) => {
const next = matchesMission ? prev + 1 : 0;
setBestStreak((b) => Math.max(b, next));
return next;
});

setXp((prev) => prev + gain);

pushEvent({
type: fast ? "combo" : "moment",
title: momentId,
desc: `${m?.sub || ""}`.trim(),
momentId,
deltaXp: gain,
matched: matchesMission,
});

// optional backend log
tryLogToSupabase({
actor: role,
label: momentId,
note: `${focusPlayer} • ${mode} • mission:${mission}${missionLocked ? ":locked" : ""} • +${gain}xp`,
state: sessionOn ? "live" : "idle",
});
}

function resetLocal() {
localStorage.removeItem(LS_KEY);
window.location.reload();
}

// --- UI styles (dark, tight, game-ish) ---
const S = {
page: {
minHeight: "100vh",
background: "#0b0d10",
color: "#e9eef7",
fontFamily:
"ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
padding: 14,
},
shell: {
maxWidth: 1200,
margin: "0 auto",
display: "grid",
gridTemplateColumns: "1.25fr 1fr 1fr",
gap: 12,
},
card: {
background: "rgba(255,255,255,0.03)",
border: "1px solid rgba(255,255,255,0.10)",
borderRadius: 14,
padding: 12,
boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
},
row: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
h: { fontSize: 13, fontWeight: 950, letterSpacing: 0.4, margin: 0 },
sub: { fontSize: 12, opacity: 0.75 },
btn: (on) => ({
padding: "8px 10px",
borderRadius: 999,
border: `1px solid ${on ? "rgba(124,252,0,0.55)" : "rgba(255,255,255,0.14)"}`,
background: on ? "rgba(124,252,0,0.10)" : "rgba(255,255,255,0.04)",
color: on ? "#bfffb0" : "#e9eef7",
fontWeight: 900,
cursor: "pointer",
userSelect: "none",
}),
btnPrimary: {
padding: "8px 10px",
borderRadius: 999,
border: "1px solid rgba(124,252,0,0.60)",
background: "rgba(124,252,0,0.16)",
color: "#bfffb0",
fontWeight: 950,
cursor: "pointer",
userSelect: "none",
},
btnDanger: {
padding: "8px 10px",
borderRadius: 999,
border: "1px solid rgba(255,110,110,0.55)",
background: "rgba(255,110,110,0.14)",
color: "#ffd1d1",
fontWeight: 950,
cursor: "pointer",
userSelect: "none",
},
pill: (text, good) => ({
padding: "6px 10px",
borderRadius: 999,
border: `1px solid ${good ? "rgba(124,252,0,0.40)" : "rgba(255,255,255,0.14)"}`,
background: good ? "rgba(124,252,0,0.08)" : "rgba(255,255,255,0.04)",
fontSize: 12,
fontWeight: 950,
letterSpacing: 0.3,
color: good ? "#bfffb0" : "#e9eef7",
userSelect: "none",
}),
gridMoments: {
marginTop: 10,
display: "grid",
gridTemplateColumns: "1fr 1fr",
gap: 10,
},
momentBtn: (hot) => ({
padding: 12,
borderRadius: 12,
border: `1px solid ${hot ? "rgba(124,252,0,0.45)" : "rgba(255,255,255,0.12)"}`,
background: hot ? "rgba(124,252,0,0.08)" : "rgba(255,255,255,0.03)",
cursor: "pointer",
textAlign: "left",
userSelect: "none",
}),
split2: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
timeline: { marginTop: 10, display: "grid", gap: 10, maxHeight: 420, overflow: "auto", paddingRight: 6 },
item: (good) => ({
padding: 10,
borderRadius: 12,
border: `1px solid ${good ? "rgba(124,252,0,0.28)" : "rgba(255,255,255,0.12)"}`,
background: "rgba(255,255,255,0.02)",
}),
};

return (
<div style={S.page}>
{/* Top Bar */}
<div style={{ ...S.card, marginBottom: 12 }}>
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
<div style={S.row}>
<div style={{ fontWeight: 950, letterSpacing: 0.5 }}>Axis Console</div>
<span style={S.pill(connected ? "connected" : "offline", connected)}>{connected ? "connected" : "offline"}</span>
<span style={S.pill(`Level ${lvl.lvl}`, true)}>Level {lvl.lvl}</span>
<span style={S.pill(`XP ${xp}`, false)}>XP {xp}</span>
<span style={S.pill(`🔥 ${streak} / best ${bestStreak}`, false)}>🔥 {streak} / best {bestStreak}</span>
<span style={S.pill(`Mission ${mission}${missionLocked ? " ✓" : ""}`, missionLocked)}>
Mission {mission}{missionLocked ? " ✓" : ""}
</span>
</div>

<div style={S.row}>
{!sessionOn ? (
<button style={S.btnPrimary} onClick={startSession}>START</button>
) : (
<button style={S.btnDanger} onClick={endSession}>END</button>
)}
<button style={S.btn(missionLocked)} onClick={lockMission} disabled={!sessionOn || !mission || missionLocked}>
LOCK
</button>
<button style={S.btn(false)} onClick={resetLocal} title="Resets XP/streak/timeline locally">
Reset
</button>
</div>
</div>
</div>

<div style={S.shell}>
{/* LEFT: Controls + Moments */}
<div style={S.card}>
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
<div>
<div style={S.h}>Parent view • Tap moments (evidence).</div>
<div style={S.sub}>{role === "parent" ? "Parent tags moments. No live coaching." : "Coach can tag + guide."}</div>
</div>
<button style={S.btn(false)} onClick={() => window.location.reload()}>Refresh</button>
</div>

<div style={{ marginTop: 10, ...S.row }}>
<button style={S.btn(role === "parent")} onClick={() => setRole("parent")}>parent</button>
<button style={S.btn(role === "coach")} onClick={() => setRole("coach")}>coach</button>
<button style={S.btn(mode === "game")} onClick={() => setMode("game")}>game</button>
<button style={S.btn(mode === "practice")} onClick={() => setMode("practice")}>practice</button>
</div>

<div style={{ marginTop: 10 }}>
<div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950, marginBottom: 8 }}>Focus player</div>
<div style={S.row}>
{players.map((p) => (
<button key={p} style={S.btn(focusPlayer === p)} onClick={() => setFocusPlayer(p)}>
{p}
</button>
))}
</div>
</div>

<div style={{ marginTop: 12, ...S.split2 }}>
<div style={{ fontSize: 12, opacity: 0.85, fontWeight: 950 }}>Moments</div>
<div style={{ fontSize: 12, opacity: 0.65, textAlign: "right" }}>All players</div>
</div>

<div style={S.gridMoments}>
{MOMENTS.map((m) => {
const hot = mission === m.id;
return (
<div
key={m.id}
style={S.momentBtn(hot)}
onClick={() => tapMoment(m.id)}
role="button"
tabIndex={0}
onKeyDown={(e) => {
if (e.key === "Enter" || e.key === " ") tapMoment(m.id);
}}
>
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
<div style={{ fontWeight: 950 }}>{m.label}</div>
{hot ? <span style={{ color: "#bfffb0", fontWeight: 950 }}>★</span> : null}
</div>
<div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>{m.sub}</div>
</div>
);
})}
</div>
</div>

{/* MIDDLE: Timeline */}
<div style={S.card}>
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
<div style={S.h}>Timeline</div>
<div style={S.sub}>{Math.min(timeline.length, 50)} recent</div>
</div>

<div style={S.timeline}>
{timeline.length === 0 ? (
<div style={{ fontSize: 13, opacity: 0.75 }}>
No events yet. Tap a moment.
</div>
) : (
timeline.slice(0, 50).map((e) => {
const good = e.type === "combo" || e.matched;
return (
<div key={e.id} style={S.item(good)}>
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
<div style={{ fontWeight: 950 }}>
{e.title} {e.type === "combo" ? <span style={{ color: "#bfffb0" }}>⚡</span> : null}
</div>
<div style={{ fontSize: 12, opacity: 0.65 }}>{formatTime(e.ts)}</div>
</div>
<div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
{e.player} • {e.role} • {e.mode}
</div>
<div style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
<div style={{ fontSize: 12, opacity: 0.75 }}>{e.desc}</div>
<div style={{ fontWeight: 950, color: "#bfffb0" }}>
{e.deltaXp ? `+${e.deltaXp}xp` : ""}
</div>
</div>
</div>
);
})
)}
</div>
</div>

{/* RIGHT: Now + Suggested Constraint */}
<div style={S.card}>
<div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
<div style={S.h}>Now</div>
<div style={S.sub}>Latest</div>
</div>

<div style={{ marginTop: 10, ...S.card, padding: 12 }}>
<div style={{ fontSize: 12, opacity: 0.75, fontWeight: 950 }}>Latest</div>
<div style={{ marginTop: 6, fontSize: 18, fontWeight: 950 }}>
{nowCard?.title || "—"}
</div>
<div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
{nowCard ? `${nowCard.subtitle} • ${formatTime(nowCard.ts)}` : "No tags yet."}
</div>

<div style={{ marginTop: 12 }}>
<div style={{ fontSize: 12, opacity: 0.75, fontWeight: 950 }}>Suggested constraint</div>

<div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
<span style={S.pill(suggestedConstraint, true)}>{suggestedConstraint}</span>
<button style={S.btnPrimary} onClick={setMissionFromSuggestion}>
Set Mission
</button>
</div>

<div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
Saved for postgame training. Parent doesn’t push live changes.
</div>
</div>

<div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.10)" }}>
<div style={{ fontSize: 12, opacity: 0.8, fontWeight: 950 }}>Input</div>
<div style={{ marginTop: 6, fontSize: 12, opacity: 0.75, lineHeight: 1.5 }}>
<div><b>Mode</b> {role}</div>
<div><b>Session</b> {mode}</div>
<div><b>Focus</b> <span style={{ color: "#bfffb0", fontWeight: 950 }}>{focusPlayer}</span></div>
<div><b>Rule</b> every tap tags <span style={{ color: "#bfffb0", fontWeight: 950 }}>{focusPlayer}</span>.</div>
</div>
</div>

</div>
</div>
</div>
</div>
);
}