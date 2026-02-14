import React, { useEffect, useMemo, useState } from "react";
import { Routes, Route, Link, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "./supabaseClient";

/**
* AXIS — Parent at Games v1
* Modes:
* - Simple: 1 constraint per possession
* - Full Read: 3 constraints per possession (rewarded)
* Constraints:
* - Triple Threat First
* - Straight-Line Attack
* - Draw Two
*/

const CONSTRAINTS = [
{ key: "triple_threat", label: "Triple Threat First" },
{ key: "straight_line", label: "Straight-Line Attack" },
{ key: "draw_two", label: "Draw Two" }
];

const STORAGE_KEY = "AXIS_PARENT_V1_LOCAL";

function safeJsonParse(str) {
try { return JSON.parse(str); } catch { return null; }
}

function useLocalState() {
const [state, setState] = useState(() => {
const raw = localStorage.getItem(STORAGE_KEY);
return (
safeJsonParse(raw) || {
parentLabel: "Parent",
parentId: null,
playerId: null,
playerName: "",
sessionId: null,
mode: "simple", // "simple" | "full"
activeConstraint: "triple_threat",
hasFieldAccess: false // paywall placeholder
}
);
});

useEffect(() => {
localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}, [state]);

return [state, setState];
}

async function upsertParentByLabel(label) {
// naive: create parent row every time label changes if not found.
// for v1 speed: try find, else insert.
const { data: found, error: findErr } = await supabase
.from("parents")
.select("*")
.eq("label", label)
.limit(1);

if (findErr) throw findErr;

if (found && found.length > 0) return found[0];

const { data: inserted, error: insErr } = await supabase
.from("parents")
.insert([{ label }])
.select("*")
.single();

if (insErr) throw insErr;
return inserted;
}

async function createPlayer(parentId, name) {
const { data, error } = await supabase
.from("players")
.insert([{ parent_id: parentId, name }])
.select("*")
.single();
if (error) throw error;
return data;
}

async function listPlayers(parentId) {
const { data, error } = await supabase
.from("players")
.select("*")
.eq("parent_id", parentId)
.order("created_at", { ascending: false });
if (error) throw error;
return data || [];
}

async function createSession(parentId) {
const { data, error } = await supabase
.from("game_sessions")
.insert([{ parent_id: parentId }])
.select("*")
.single();
if (error) throw error;
return data;
}

async function endSession(sessionId) {
const { error } = await supabase
.from("game_sessions")
.update({ ended_at: new Date().toISOString() })
.eq("id", sessionId);
if (error) throw error;
}

async function insertPossessionSimple({ sessionId, playerId, constraintKey, followed }) {
const payload = {
session_id: sessionId,
player_id: playerId,
triple_threat: null,
straight_line: null,
draw_two: null
};

if (constraintKey === "triple_threat") payload.triple_threat = followed;
if (constraintKey === "straight_line") payload.straight_line = followed;
if (constraintKey === "draw_two") payload.draw_two = followed;

const { error } = await supabase.from("parent_game_possessions").insert([payload]);
if (error) throw error;
}

async function insertPossessionFull({ sessionId, playerId, tripleThreat, straightLine, drawTwo }) {
const payload = {
session_id: sessionId,
player_id: playerId,
triple_threat: tripleThreat,
straight_line: straightLine,
draw_two: drawTwo
};

const { error } = await supabase.from("parent_game_possessions").insert([payload]);
if (error) throw error;
}

async function fetchSessionPossessions(sessionId, playerId) {
const { data, error } = await supabase
.from("parent_game_possessions")
.select("*")
.eq("session_id", sessionId)
.eq("player_id", playerId)
.order("created_at", { ascending: false })
.limit(250);
if (error) throw error;
return data || [];
}

function computeScore(possessions, key) {
// key maps to boolean field
const vals = possessions.map((p) => p[key]).filter((v) => v === true || v === false);
const total = vals.length;
const yes = vals.filter((v) => v === true).length;
return { yes, total, pct: total ? Math.round((yes / total) * 100) : 0 };
}

function Shell({ children }) {
const loc = useLocation();
return (
<div className="wrap">
<header className="top">
<div className="brand">
<div className="title">AXIS</div>
<div className="sub">Parent-at-Games v1</div>
</div>
<nav className="nav">
<Link className={`navlink ${loc.pathname === "/" ? "on" : ""}`} to="/">Start</Link>
<Link className={`navlink ${loc.pathname === "/live" ? "on" : ""}`} to="/live">Live</Link>
<Link className={`navlink ${loc.pathname === "/summary" ? "on" : ""}`} to="/summary">Summary</Link>
</nav>
</header>
{children}
<footer className="foot">Decision under pressure. Proof after.</footer>
</div>
);
}

function StartScreen({ app, setApp }) {
const nav = useNavigate();
const [status, setStatus] = useState("");
const [players, setPlayers] = useState([]);
const [newPlayerName, setNewPlayerName] = useState("");

async function bootstrapParent() {
setStatus("Connecting…");
try {
const p = await upsertParentByLabel(app.parentLabel.trim() || "Parent");
setApp((s) => ({ ...s, parentId: p.id }));
setStatus("Parent ready.");
const list = await listPlayers(p.id);
setPlayers(list);
} catch (e) {
setStatus(`Error: ${e.message}`);
}
}

useEffect(() => {
if (app.parentId) {
(async () => {
try {
const list = await listPlayers(app.parentId);
setPlayers(list);
} catch {}
})();
}
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [app.parentId]);

async function onAddPlayer() {
if (!app.parentId) {
setStatus("Set Parent label → Connect first.");
return;
}
const name = newPlayerName.trim();
if (!name) return;
setStatus("Adding player…");
try {
const pl = await createPlayer(app.parentId, name);
setPlayers((prev) => [pl, ...prev]);
setNewPlayerName("");
setStatus("Player added.");
} catch (e) {
setStatus(`Error: ${e.message}`);
}
}

async function onStartGame() {
if (!app.parentId) {
setStatus("Connect parent first.");
return;
}
if (!app.playerId) {
setStatus("Select a player.");
return;
}
setStatus("Starting session…");
try {
const sess = await createSession(app.parentId);
setApp((s) => ({ ...s, sessionId: sess.id }));
setStatus("Session started.");
nav("/live");
} catch (e) {
setStatus(`Error: ${e.message}`);
}
}

return (
<Shell>
<div className="grid">
<section className="panel">
<div className="card">
<div className="label">Parent label</div>
<input
className="input"
value={app.parentLabel}
onChange={(e) => setApp((s) => ({ ...s, parentLabel: e.target.value }))}
placeholder="Parent"
/>
<button className="btn ghost" onClick={bootstrapParent}>
CONNECT
</button>
<div className="muted small">{status || "Use one label per household."}</div>
</div>

<div className="card">
<div className="label">Mode</div>
<div className="modeRow">
<button
className={`chipBtn ${app.mode === "simple" ? "on" : ""}`}
onClick={() => setApp((s) => ({ ...s, mode: "simple" }))}
>
Simple
</button>
<button
className={`chipBtn ${app.mode === "full" ? "on" : ""}`}
onClick={() => setApp((s) => ({ ...s, mode: "full" }))}
>
Full Read
</button>
</div>
<div className="muted small">
Full Read tracks all 3 constraints per possession.
</div>
</div>

<div className="card">
<div className="label">Start game</div>
<button className="btn mint" onClick={onStartGame}>
START LIVE
</button>
<div className="muted small">
This creates a session ID and logs possessions to Supabase.
</div>
</div>
</section>

<section className="panel">
<div className="card">
<div className="label">Players</div>

{!app.parentId ? (
<div className="muted small">Connect parent to load players.</div>
) : (
<>
<div className="playerAdd">
<input
className="input"
value={newPlayerName}
onChange={(e) => setNewPlayerName(e.target.value)}
placeholder="Add player name"
/>
<button className="btn" onClick={onAddPlayer}>
ADD
</button>
</div>

<div className="playerList">
{players.length === 0 ? (
<div className="muted small">No players yet. Add one.</div>
) : (
players.map((pl) => (
<button
key={pl.id}
className={`playerBtn ${app.playerId === pl.id ? "on" : ""}`}
onClick={() =>
setApp((s) => ({
...s,
playerId: pl.id,
playerName: pl.name
}))
}
>
<span>{pl.name}</span>
{app.playerId === pl.id ? <span className="pill">focus</span> : null}
</button>
))
)}
</div>
</>
)}
</div>

<div className="card">
<div className="label">Constraints (v1)</div>
<div className="tags">
{CONSTRAINTS.map((c) => (
<span key={c.key} className="tag">{c.label}</span>
))}
</div>
</div>
</section>
</div>
</Shell>
);
}

function LiveScreen({ app, setApp }) {
const nav = useNavigate();
const [status, setStatus] = useState("");
const [loading, setLoading] = useState(false);

// Full Read toggles
const [tt, setTt] = useState(null); // true/false/null
const [sl, setSl] = useState(null);
const [dt, setDt] = useState(null);

const activeLabel = useMemo(() => {
return CONSTRAINTS.find((c) => c.key === app.activeConstraint)?.label || "";
}, [app.activeConstraint]);

function guard() {
if (!app.sessionId) return "No active session. Go to Start.";
if (!app.playerId) return "No focus player selected.";
return "";
}

async function logSimple(followed) {
const g = guard();
if (g) {
setStatus(g);
return;
}
setLoading(true);
setStatus("");
try {
await insertPossessionSimple({
sessionId: app.sessionId,
playerId: app.playerId,
constraintKey: app.activeConstraint,
followed
});
setStatus("Logged.");
} catch (e) {
setStatus(`Error: ${e.message}`);
}
setLoading(false);
}

async function logFull() {
const g = guard();
if (g) {
setStatus(g);
return;
}
// require all 3 set
if (![tt, sl, dt].every((v) => v === true || v === false)) {
setStatus("Set all 3 (✅/❌) then Log Possession.");
return;
}
setLoading(true);
setStatus("");
try {
await insertPossessionFull({
sessionId: app.sessionId,
playerId: app.playerId,
tripleThreat: tt,
straightLine: sl,
drawTwo: dt
});
setStatus("Possession logged (Full Read).");
// reset for next possession
setTt(null); setSl(null); setDt(null);
} catch (e) {
setStatus(`Error: ${e.message}`);
}
setLoading(false);
}

async function finish() {
if (!app.sessionId) {
nav("/summary");
return;
}
setLoading(true);
setStatus("");
try {
await endSession(app.sessionId);
setStatus("Session ended.");
nav("/summary");
} catch (e) {
setStatus(`Error: ${e.message}`);
}
setLoading(false);
}

function cycleConstraint(dir) {
const idx = CONSTRAINTS.findIndex((c) => c.key === app.activeConstraint);
const next = (idx + dir + CONSTRAINTS.length) % CONSTRAINTS.length;
setApp((s) => ({ ...s, activeConstraint: CONSTRAINTS[next].key }));
}

return (
<Shell>
<div className="grid">
<section className="panel">
<div className="card">
<div className="row">
<div>
<div className="label">Focus</div>
<div className="big">{app.playerName || "—"}</div>
<div className="muted small">Mode: {app.mode === "full" ? "Full Read" : "Simple"}</div>
</div>
<div className="pill">{app.sessionId ? "live" : "no session"}</div>
</div>
</div>

{app.mode === "simple" ? (
<div className="card">
<div className="label">Constraint</div>

<div className="constraintRow">
<button className="btn tiny" onClick={() => cycleConstraint(-1)} disabled={loading}>
←
</button>
<div className="constraintName">{activeLabel}</div>
<button className="btn tiny" onClick={() => cycleConstraint(1)} disabled={loading}>
→
</button>
</div>

<div className="btnrow">
<button className="btn mint" disabled={loading} onClick={() => logSimple(true)}>
✅ FOLLOWED
</button>
<button className="btn burn" disabled={loading} onClick={() => logSimple(false)}>
❌ MISSED
</button>
</div>

<div className="muted small">
One tap per possession. Switch constraints with arrows.
</div>
</div>
) : (
<div className="card">
<div className="label">Full Read (3 constraints)</div>

<div className="triGrid">
<MiniToggle
title="Triple Threat First"
value={tt}
onSet={setTt}
/>
<MiniToggle
title="Straight-Line Attack"
value={sl}
onSet={setSl}
/>
<MiniToggle
title="Draw Two"
value={dt}
onSet={setDt}
/>
</div>

<button className="btn mint" disabled={loading} onClick={logFull}>
LOG POSSESSION
</button>

<div className="muted small">
Full Read is higher attention. It will be rewarded in Proof.
</div>
</div>
)}

<div className="card">
<div className="btnrow">
<button className="btn ghost" disabled={loading} onClick={() => nav("/")}>
BACK
</button>
<button className="btn" disabled={loading} onClick={finish}>
END → SUMMARY
</button>
</div>

{status ? <div className="status">{status}</div> : null}
</div>
</section>

<section className="panel">
<div className="card">
<div className="label">Operator notes</div>
<div className="muted small">
This v1 is built for game environments:
<ul className="bul">
<li>Track one kid at a time (focus player).</li>
<li>Simple Mode keeps usage high.</li>
<li>Full Read Mode earns higher proof quality.</li>
</ul>
</div>
</div>

<div className="card">
<div className="label">Paywall placeholder</div>
<div className="row">
<div className="muted small">Field Access</div>
<button
className={`chipBtn ${app.hasFieldAccess ? "on" : ""}`}
onClick={() => setApp((s) => ({ ...s, hasFieldAccess: !s.hasFieldAccess }))}
>
{app.hasFieldAccess ? "ON" : "OFF"}
</button>
</div>
<div className="muted small">
Toggle for testing. Later replace with Stripe.
</div>
</div>
</section>
</div>
</Shell>
);
}

function MiniToggle({ title, value, onSet }) {
return (
<div className="mini">
<div className="miniTitle">{title}</div>
<div className="miniBtns">
<button
className={`miniBtn ${value === true ? "on" : ""}`}
onClick={() => onSet(true)}
>
✅
</button>
<button
className={`miniBtn ${value === false ? "on" : ""}`}
onClick={() => onSet(false)}
>
❌
</button>
</div>
</div>
);
}

function SummaryScreen({ app, setApp }) {
const nav = useNavigate();
const [status, setStatus] = useState("");
const [loading, setLoading] = useState(false);
const [possessions, setPossessions] = useState([]);

async function load() {
if (!app.sessionId || !app.playerId) {
setStatus("Missing session or player. Go to Start.");
return;
}
setLoading(true);
setStatus("");
try {
const rows = await fetchSessionPossessions(app.sessionId, app.playerId);
setPossessions(rows);
} catch (e) {
setStatus(`Error: ${e.message}`);
}
setLoading(false);
}

useEffect(() => {
load();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [app.sessionId, app.playerId]);

const tt = useMemo(() => computeScore(possessions, "triple_threat"), [possessions]);
const sl = useMemo(() => computeScore(possessions, "straight_line"), [possessions]);
const dt = useMemo(() => computeScore(possessions, "draw_two"), [possessions]);

const fullReadCount = useMemo(() => {
// full read possession = all three fields are boolean
return possessions.filter((p) =>
(p.triple_threat === true || p.triple_threat === false) &&
(p.straight_line === true || p.straight_line === false) &&
(p.draw_two === true || p.draw_two === false)
).length;
}, [possessions]);

function newSession() {
setApp((s) => ({ ...s, sessionId: null }));
nav("/");
}

function exportProof() {
if (!app.hasFieldAccess) {
setStatus("Export locked. Field Access required.");
return;
}
// v1: simple alert. Later: generate image/pdf.
alert("Export unlocked (v1). Next: generate Proof Card image.");
}

return (
<Shell>
<div className="grid">
<section className="panel">
<div className="card">
<div className="label">Session summary</div>
<div className="big">{app.playerName || "—"}</div>
<div className="muted small">
Total possessions logged: <b>{possessions.length}</b> • Full Read possessions: <b>{fullReadCount}</b>
</div>

<div className="scoreGrid">
<ScoreCard title="Triple Threat First" score={tt} />
<ScoreCard title="Straight-Line Attack" score={sl} />
<ScoreCard title="Draw Two" score={dt} />
</div>

<div className="btnrow">
<button className="btn ghost" disabled={loading} onClick={load}>REFRESH</button>
<button className="btn mint" onClick={exportProof}>
EXPORT PROOF (LOCKED)
</button>
</div>

{!app.hasFieldAccess ? (
<div className="muted small">
Unlock Field Access to export Proof Cards + session history.
</div>
) : (
<div className="muted small">
Field Access ON — exports enabled.
</div>
)}

{status ? <div className="status">{status}</div> : null}
</div>
</section>

<section className="panel">
<div className="card">
<div className="label">Proof Card (preview)</div>
<div className={`proof ${app.hasFieldAccess ? "" : "blur"}`}>
<div className="proofTop">
<div className="proofTitle">AXIS — Game Focus Report</div>
<div className="proofSub">{new Date().toLocaleString()}</div>
</div>

<div className="proofName">{app.playerName || "Player"}</div>

<div className="proofLines">
<ProofLine label="Triple Threat First" score={tt} />
<ProofLine label="Straight-Line Attack" score={sl} />
<ProofLine label="Draw Two" score={dt} />
</div>

<div className="proofFoot">
Full Read possessions: {fullReadCount} / {possessions.length}
</div>
</div>

{!app.hasFieldAccess ? (
<div className="muted small">
Preview blurred until Field Access is on.
</div>
) : null}
</div>

<div className="card">
<div className="btnrow">
<button className="btn" onClick={() => nav("/live")}>BACK TO LIVE</button>
<button className="btn ghost" onClick={newSession}>NEW SESSION</button>
</div>
</div>
</section>
</div>
</Shell>
);
}

function ScoreCard({ title, score }) {
return (
<div className="scoreCard">
<div className="scoreTitle">{title}</div>
<div className="scoreBig">{score.pct}%</div>
<div className="muted small">{score.yes} / {score.total}</div>
</div>
);
}

function ProofLine({ label, score }) {
return (
<div className="proofLine">
<div className="proofLabel">{label}</div>
<div className="proofVal">{score.yes}/{score.total} • {score.pct}%</div>
</div>
);
}

export default function App() {
const [app, setApp] = useLocalState();

return (
<Routes>
<Route path="/" element={<StartScreen app={app} setApp={setApp} />} />
<Route path="/live" element={<LiveScreen app={app} setApp={setApp} />} />
<Route path="/summary" element={<SummaryScreen app={app} setApp={setApp} />} />
<Route path="*" element={
<Shell>
<div className="panel">
<div className="card">
<div className="label">Not found</div>
<Link className="navlink on" to="/">Go home</Link>
</div>
</div>
</Shell>
} />
</Routes>
);
}