import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient.js";

/**
* AXIS LIVE v2.1
* Fixes:
* - Training picks are no longer "dead": mission preview is always visible
* - Coach can ARM mission from main panel (no hunting left)
* - Parent training mode shows "waiting on coach" and disables coach-only actions
* - Left rail spacing / layout improved
*/

const STATS = [
{ key: "SHOT", hot: "1" },
{ key: "REBOUND", hot: "2" },
{ key: "ASSIST", hot: "3" },
{ key: "STEAL", hot: "4" },
{ key: "FOUL", hot: "5" },
{ key: "TURNOVER", hot: "6" },
];

const STATES = [
{ key: "SHOOK", hot: "Q" },
{ key: "WILD", hot: "W" },
{ key: "FLOW", hot: "E" },
{ key: "DAWG", hot: "R" },
];

function nowClock() {
const d = new Date();
return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function safeJsonParse(str, fallback) {
try { return JSON.parse(str); } catch { return fallback; }
}
function rand4() {
return Math.floor(1000 + Math.random() * 9000);
}
function makeSessionCode(mode, context) {
const m = mode === "training" ? "TRN" : mode === "review" ? "REV" : "SID";
const c = context === "game" ? "GM" : "PR";
return `AX-${m}-${c}-${rand4()}`;
}
function scoreDelta({ context, stat, hit }) {
const baseGood = context === "game" ? 2 : 1;
const baseBad = context === "game" ? -2 : -1;
const isBadStat = stat === "TURNOVER" || stat === "FOUL";
if (isBadStat) return hit ? baseGood : baseBad * 2;
return hit ? baseGood : baseBad;
}

export default function App() {
const [mode, setMode] = useState(() => localStorage.getItem("ax_mode") || "sideline");
const [context, setContext] = useState(() => localStorage.getItem("ax_context") || "game");
const [role, setRole] = useState(() => localStorage.getItem("ax_role") || "parent");
const [playerLabel, setPlayerLabel] = useState(() => localStorage.getItem("ax_playerLabel") || "Coach V");

const [sessionId, setSessionId] = useState(() => {
const stored = localStorage.getItem("ax_sessionId");
return stored || makeSessionCode(localStorage.getItem("ax_mode") || "sideline", localStorage.getItem("ax_context") || "game");
});

const [realtimeOn, setRealtimeOn] = useState(() => localStorage.getItem("ax_realtime") === "1");

const [pickStat, setPickStat] = useState(null);
const [pickState, setPickState] = useState(null);

// Mission draft (preview) for TRAINING
const [draftStat, setDraftStat] = useState("SHOT");
const [draftState, setDraftState] = useState("FLOW");

// logs
const [logs, setLogs] = useState([]);
const [loadingLogs, setLoadingLogs] = useState(false);
const [counts, setCounts] = useState({});

// toast
const [toast, setToast] = useState(null);
const toastTimerRef = useRef(null);

// mission per session
const missionKey = useMemo(() => `ax_mission_${sessionId}`, [sessionId]);
const [mission, setMission] = useState(() => {
const stored = localStorage.getItem(`ax_mission_${localStorage.getItem("ax_sessionId") || ""}`);
if (!stored) return null;
return safeJsonParse(stored, null);
});

const [trainScore, setTrainScore] = useState(0);
const [trainStreak, setTrainStreak] = useState(0);
const [trainHits, setTrainHits] = useState(0);
const [trainMiss, setTrainMiss] = useState(0);

const isCoach = role === "coach";
const isParent = role === "parent";

// Persist
useEffect(() => localStorage.setItem("ax_mode", mode), [mode]);
useEffect(() => localStorage.setItem("ax_context", context), [context]);
useEffect(() => localStorage.setItem("ax_role", role), [role]);
useEffect(() => localStorage.setItem("ax_playerLabel", playerLabel), [playerLabel]);
useEffect(() => localStorage.setItem("ax_sessionId", sessionId), [sessionId]);
useEffect(() => localStorage.setItem("ax_realtime", realtimeOn ? "1" : "0"), [realtimeOn]);

useEffect(() => {
const stored = localStorage.getItem(missionKey);
setMission(stored ? safeJsonParse(stored, null) : null);
setTrainScore(0); setTrainStreak(0); setTrainHits(0); setTrainMiss(0);
}, [missionKey]);

function showToast(msg, sub) {
setToast({ msg, sub });
if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
toastTimerRef.current = setTimeout(() => setToast(null), 1600);
}

function computeCounts(rows) {
const map = {};
for (const r of rows) map[r.label] = (map[r.label] || 0) + 1;
setCounts(map);
}

async function fetchLogs() {
setLoadingLogs(true);
const { data, error } = await supabase
.from("decisions")
.select("created_at, session_id, actor, label, note")
.eq("session_id", sessionId)
.order("created_at", { ascending: false })
.limit(25);

setLoadingLogs(false);

if (error) {
console.error(error);
showToast("Fetch failed", "Check Supabase / RLS / columns");
return;
}
setLogs(data || []);
computeCounts(data || []);
}

useEffect(() => {
if (!realtimeOn) return;

const channel = supabase
.channel(`axis-decisions-${sessionId}`)
.on(
"postgres_changes",
{ event: "INSERT", schema: "public", table: "decisions", filter: `session_id=eq.${sessionId}` },
(payload) => {
const row = payload.new;
setLogs((prev) => {
const next = [row, ...prev].slice(0, 25);
computeCounts(next);
return next;
});
}
)
.subscribe((status) => {
if (status === "SUBSCRIBED") showToast("Realtime ON", sessionId);
});

return () => { supabase.removeChannel(channel); };
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [realtimeOn, sessionId]);

useEffect(() => { fetchLogs(); /* eslint-disable-next-line */ }, [sessionId]);

async function logDecision({ label, noteObj }) {
const note = JSON.stringify({
...noteObj,
ts: nowClock(),
session: sessionId,
mode,
context,
role,
playerLabel,
});

const payload = { session_id: sessionId, actor: role, label, note };

const { error } = await supabase.from("decisions").insert([payload]);
if (error) {
console.error(error);
showToast("Log failed", "Check Supabase / RLS");
return false;
}
return true;
}

function newSession() {
const next = makeSessionCode(mode, context);
setSessionId(next);
setPickStat(null); setPickState(null);
showToast("New session", next);
}
function copySession() {
navigator.clipboard?.writeText(sessionId);
showToast("Copied", sessionId);
}

// SIDELINE
async function commitSideline(statKey, stateKey) {
const label = `${statKey}_${stateKey || "NA"}`;
const ok = await logDecision({ label, noteObj: { type: "sideline", stat: statKey, state: stateKey || null } });
if (ok) showToast(label, `${role} • ${nowClock()}`);
}
function onStatPick(statKey) {
if (mode === "sideline") {
if (isParent) { commitSideline(statKey, pickState); setPickStat(null); return; }
setPickStat(statKey);
if (pickState) { commitSideline(statKey, pickState); setPickStat(null); }
} else {
// training/review uses draft selections
setDraftStat(statKey);
showToast("Draft stat", statKey);
}
}
function onStatePick(stateKey) {
if (mode === "sideline") {
if (isParent) { setPickState(stateKey); showToast("State tag", stateKey); return; }
setPickState(stateKey);
if (pickStat) { commitSideline(pickStat, stateKey); setPickStat(null); }
} else {
setDraftState(stateKey);
showToast("Draft state", stateKey);
}
}

// TRAINING
function setNewMission(nextMission) {
localStorage.setItem(missionKey, JSON.stringify(nextMission));
setMission(nextMission);
setTrainScore(0); setTrainStreak(0); setTrainHits(0); setTrainMiss(0);
showToast("Mission armed", `${nextMission.targetStat}_${nextMission.targetState}`);
}

async function armMission() {
const reps = context === "game" ? 6 : 10;
setNewMission({ targetStat: draftStat, targetState: draftState, reps, createdAt: Date.now() });

// optional: log mission set event
await logDecision({
label: "TRN_MISSION_SET",
noteObj: { type: "training", mission: { targetStat: draftStat, targetState: draftState, reps } },
});
}

async function logTrainingResult(hit) {
if (!mission) { showToast("No mission", "Coach must arm mission"); return; }

const delta = scoreDelta({ context, stat: mission.targetStat, hit });
const nextScore = trainScore + delta;

const nextStreak = hit ? trainStreak + 1 : 0;
const nextHits = hit ? trainHits + 1 : trainHits;
const nextMiss = hit ? trainMiss : trainMiss + 1;

setTrainScore(nextScore);
setTrainStreak(nextStreak);
setTrainHits(nextHits);
setTrainMiss(nextMiss);

const label = hit ? "TRN_HIT" : "TRN_MISS";

const ok = await logDecision({
label,
noteObj: { type: "training", hit, delta, score: nextScore, streak: nextStreak, mission },
});
if (ok) showToast(hit ? "HIT ✅" : "MISS ❌", `${delta > 0 ? "+" : ""}${delta} • score ${nextScore}`);

const total = nextHits + nextMiss;
if (total >= mission.reps) showToast("Mission complete", `Score: ${nextScore} • Hits: ${nextHits}`);
}

// REVIEW
const topCounts = useMemo(() => {
return Object.entries(counts || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
}, [counts]);

// clean session display
const sessionShort = useMemo(() => {
const parts = sessionId.split("-");
if (parts.length >= 4) return `${parts[1]} ${parts[2]} ${parts[3]}`;
return sessionId;
}, [sessionId]);

// when context changes, new session keeps integrity
useEffect(() => {
const next = makeSessionCode(mode, context);
setSessionId(next);
setPickStat(null); setPickState(null);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [context]);

// HOTKEYS
useEffect(() => {
function onKey(e) {
const k = e.key.toUpperCase();

if (k === "ESCAPE") { setPickStat(null); setPickState(null); showToast("Cleared", "Pick reset"); return; }

if (k === "S") setMode("sideline");
if (k === "T") setMode("training");
if (k === "R") setMode("review");

const stat = STATS.find((x) => x.hot === k);
if (stat) { onStatPick(stat.key); return; }

const st = STATES.find((x) => x.hot === k);
if (st) { onStatePick(st.key); return; }

if (mode === "training") {
if (k === "Y") logTrainingResult(true);
if (k === "N") logTrainingResult(false);
if (k === "A" && isCoach) armMission(); // A = arm mission
}

if (k === "C") copySession();
if (k === "F") fetchLogs();
}
window.addEventListener("keydown", onKey);
return () => window.removeEventListener("keydown", onKey);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [mode, pickStat, pickState, mission, trainScore, trainStreak, trainHits, trainMiss, role, context, sessionId, draftStat, draftState]);

// UI helper
const sidelineHint = isParent
? "Parent Sideline: tap a STAT (state tags optional)."
: "Coach Sideline: tap STAT then STATE (2 taps).";

return (
<div className="wrap">
<div className="topbar">
<div className="brand">
<div className="dot" />
<div>
<div>AXIS LIVE</div>
<small>capture • mission • review</small>
</div>
</div>

<div className="pills">
<div className="pill">session <strong>{sessionShort}</strong></div>
<div className="pill">role <strong>{role}</strong></div>
<div className="pill">context <strong>{context}</strong></div>
<div className="pill">mode <strong>{mode}</strong></div>
<div className="pill">time <strong>{nowClock()}</strong></div>
</div>
</div>

<div className="grid">
{/* LEFT RAIL */}
<div className="card">
<div className="hd">
<h3>Control</h3>
<span className="pill"><strong>{sessionId}</strong></span>
</div>

<div className="bd">
{/* tighter meaning, more spacing */}
<div className="section">
<div className="label">Mode</div>
<div className="toggleGroup">
<button className={`toggle ${mode === "sideline" ? "on" : ""}`} onClick={() => setMode("sideline")}>Sideline</button>
<button className={`toggle ${mode === "training" ? "on" : ""}`} onClick={() => setMode("training")}>Training</button>
<button className={`toggle ${mode === "review" ? "on" : ""}`} onClick={() => setMode("review")}>Review</button>
</div>

<div className="padTop" />

<div className="label">Context</div>
<div className="toggleGroup">
<button className={`toggle ${context === "game" ? "on" : ""}`} onClick={() => setContext("game")}>Game</button>
<button className={`toggle ${context === "practice" ? "on" : ""}`} onClick={() => setContext("practice")}>Practice</button>
</div>

<div className="padTop" />

<div className="label">Role</div>
<div className="toggleGroup">
<button className={`toggle ${role === "parent" ? "on" : ""}`} onClick={() => setRole("parent")}>Parent</button>
<button className={`toggle ${role === "coach" ? "on" : ""}`} onClick={() => setRole("coach")}>Coach</button>
</div>
</div>

<div className="section">
<div className="label">Player label</div>
<input className="input" value={playerLabel} onChange={(e) => setPlayerLabel(e.target.value)} />

<div className="padTop row">
<button className="btn btnPrimary" onClick={newSession}>New <strong>Session</strong></button>
<button className="btn" onClick={copySession}>Copy</button>
</div>

<div className="padTop row">
<button className={`btn ${realtimeOn ? "btnPrimary" : ""}`} onClick={() => setRealtimeOn((v) => !v)}>
Realtime {realtimeOn ? <strong>ON</strong> : <strong>OFF</strong>}
</button>
<button className="btn" onClick={fetchLogs}>Refresh</button>
</div>

<div className="padTop kbd">
<span><b>S</b> Sideline</span>
<span><b>T</b> Training</span>
<span><b>R</b> Review</span>
<span><b>F</b> Fetch</span>
<span><b>C</b> Copy</span>
<span><b>Esc</b> Clear</span>
{mode === "training" && isCoach ? <span><b>A</b> Arm</span> : null}
</div>
</div>

<div className="section">
<div className="label">Rule</div>
<div className="kbd">
{mode === "sideline" && <span>{sidelineHint}</span>}
{mode === "training" && <span>Training: mission → log HIT/MISS → score & streak.</span>}
{mode === "review" && <span>Review: counts + recent. Tight signal.</span>}
</div>
</div>
</div>
</div>

{/* MAIN PANEL */}
<div className="card bigArea">
<div className="hd">
<div className="titleLine">
<h2>{mode}</h2>
<span>{context.toUpperCase()} • {role.toUpperCase()} • {playerLabel}</span>
</div>
<div className="kbd">
<span><b>1-6</b> stats</span>
<span><b>QWER</b> states</span>
{mode === "training" && <span><b>Y/N</b> hit/miss</span>}
{mode === "training" && isCoach && <span><b>A</b> arm</span>}
</div>
</div>

<div className="bd">
{/* SIDELINE */}
{mode === "sideline" && (
<>
<div className="blockTitle">Pick stat</div>
<div className="gridBtns">
{STATS.map((s) => (
<button key={s.key} className="actionBtn" onClick={() => onStatPick(s.key)} title={`Hotkey ${s.hot}`}>
<div className="cap"><strong>{s.key}</strong><em>{s.hot}</em></div>
</button>
))}
</div>

<div className="padTop" />

<div className="blockTitle">Pick state {isParent ? "(tag)" : ""}</div>
<div className="gridBtns">
{STATES.map((s) => (
<button key={s.key} className="actionBtn" onClick={() => onStatePick(s.key)} title={`Hotkey ${s.hot}`}>
<div className="cap"><strong>{s.key}</strong><em>{s.hot}</em></div>
</button>
))}
</div>

<div className="selectedBar">
<div>
<div className="tag">Selected: {pickStat || "—"} {pickState ? `• ${pickState}` : ""}</div>
<div className="hint">{isParent ? "Tap STAT to log. State optional." : "STAT then STATE logs."}</div>
</div>
<button className="btn" onClick={() => { setPickStat(null); setPickState(null); showToast("Cleared", "Pick reset"); }}>
Clear
</button>
</div>

<LogsPanel logs={logs} loading={loadingLogs} sessionId={sessionId} />
</>
)}

{/* TRAINING */}
{mode === "training" && (
<>
{/* Mission Preview always visible */}
<div className="missionBox">
<h4>Mission preview</h4>
<p>
Draft: <b>{draftStat}</b> + <b>{draftState}</b> • {context === "game" ? "game pressure" : "practice reps"}
<br />
{isCoach ? "Coach can arm this mission." : "Waiting on coach mission."}
</p>

<div className="scoreLine">
<span className="badge">session <strong>{sessionShort}</strong></span>
{mission ? <span className="badge good">active <strong>{mission.targetStat}_{mission.targetState}</strong></span> : <span className="badge warn">active <strong>none</strong></span>}
</div>

{isCoach ? (
<div className="trainBtns">
<button className="btn btnPrimary" onClick={armMission}>
ARM MISSION <strong>(A)</strong>
</button>
<button
className="btn btnDanger"
onClick={() => {
localStorage.removeItem(missionKey);
setMission(null);
showToast("Mission cleared", sessionShort);
}}
>
CLEAR
</button>
</div>
) : (
<div className="padTop kbd">
<span>Coach sets mission. You log:</span>
<span><b>Y</b> HIT</span>
<span><b>N</b> MISS</span>
</div>
)}
</div>

<div className="padTop" />

{/* If mission active, show hit/miss controls */}
{mission ? (
<>
<div className="missionBox">
<h4>Active mission</h4>
<p>
Target: <b>{mission.targetStat}</b> + <b>{mission.targetState}</b> • reps: <b>{mission.reps}</b>
</p>

<div className="scoreLine">
<span className="badge good">score <strong>{trainScore}</strong></span>
<span className="badge">streak <strong>{trainStreak}</strong></span>
<span className="badge">hits <strong>{trainHits}</strong></span>
<span className="badge bad">miss <strong>{trainMiss}</strong></span>
</div>

<div className="trainBtns">
<button className="btn btnPrimary" onClick={() => logTrainingResult(true)}>HIT ✅</button>
<button className="btn btnDanger" onClick={() => logTrainingResult(false)}>MISS ❌</button>
</div>
</div>
<div className="padTop" />
</>
) : null}

{/* Draft selection grid (always meaningful) */}
<div className="blockTitle">Pick draft stat</div>
<div className="gridBtns">
{STATS.map((s) => (
<button key={s.key} className="actionBtn" onClick={() => onStatPick(s.key)} title={`Hotkey ${s.hot}`}>
<div className="cap"><strong>{s.key}</strong><em>{draftStat === s.key ? "SEL" : s.hot}</em></div>
</button>
))}
</div>

<div className="padTop" />

<div className="blockTitle">Pick draft state</div>
<div className="gridBtns">
{STATES.map((s) => (
<button key={s.key} className="actionBtn" onClick={() => onStatePick(s.key)} title={`Hotkey ${s.hot}`}>
<div className="cap"><strong>{s.key}</strong><em>{draftState === s.key ? "SEL" : s.hot}</em></div>
</button>
))}
</div>

<LogsPanel logs={logs} loading={loadingLogs} sessionId={sessionId} />
</>
)}

{/* REVIEW */}
{mode === "review" && (
<>
<div className="section">
<div className="blockTitle">Top signals (this session)</div>
{topCounts.length === 0 ? (
<div className="kbd">No logs yet.</div>
) : (
<div className="logList">
{topCounts.map(([label, n]) => (
<div className="logRow" key={label}>
<div className="left">
<strong>{label}</strong>
<span>count</span>
</div>
<div className="right"><strong style={{ color: "var(--green)" }}>{n}</strong></div>
</div>
))}
</div>
)}
</div>

<LogsPanel logs={logs} loading={loadingLogs} sessionId={sessionId} />
</>
)}
</div>
</div>
</div>

<div className={`toast ${toast ? "on" : ""}`}>
{toast?.msg}
{toast?.sub ? <small>{toast.sub}</small> : null}
</div>
</div>
);
}

function LogsPanel({ logs, loading, sessionId }) {
return (
<>
<div className="padTop" />
<div className="blockTitle">Recent (this session)</div>

<div className="logList">
{loading ? (
<div className="logRow">
<div className="left">
<strong>Loading…</strong>
<span>{sessionId}</span>
</div>
</div>
) : logs?.length ? (
logs.map((r, idx) => {
const note = safeJsonParse(r.note || "{}", {});
const ts = note.ts || new Date(r.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
return (
<div className="logRow" key={`${r.created_at}-${idx}`}>
<div className="left">
<strong>{r.label}</strong>
<span>{note.type || "log"} • {note.playerLabel || ""}</span>
</div>
<div className="right">
<div>{r.actor}</div>
<div>{ts}</div>
</div>
</div>
);
})
) : (
<div className="logRow">
<div className="left">
<strong>No logs yet</strong>
<span>Tap something to start.</span>
</div>
</div>
)}
</div>
</>
);
}