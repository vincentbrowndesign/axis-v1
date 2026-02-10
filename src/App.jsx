import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { supabase } from "./supabase";

const ROSTER = [
{ id: "cole", name: "Cole" },
{ id: "rocket", name: "Rocket" },
{ id: "chance", name: "Chance" },
{ id: "hailey", name: "Hailey" },
];

const PARENT_MOMENTS = [
{ label: "GOOD", sub: "Good decision" },
{ label: "MISS", sub: "Missed read" },
{ label: "SPACE", sub: "Spacing broke" },
{ label: "PANIC", sub: "Panic dribble" },
{ label: "DIDNTSEE2", sub: "Didn’t see 2" },
{ label: "HUSTLE", sub: "Effort / motor" },
];

const COACH_ACTIONS = [
{ label: "SPACING", sub: "Fix geometry" },
{ label: "HOLD", sub: "Pause + see 2" },
{ label: "RESET", sub: "Re-center" },
{ label: "WATCH", sub: "Observe only" },
{ label: "FORCE", sub: "Bad attempt" },
{ label: "RUSH", sub: "Tempo spike" },
{ label: "SILENCE", sub: "No talk" },
{ label: "TALK", sub: "Early voice" },
];

function suggestConstraint(label) {
const map = {
PANIC: "HOLD",
SPACE: "SPACING",
MISS: "WATCH",
FORCE: "RESET",
RUSH: "HOLD",
TALK: "SILENCE",
DIDNTSEE2: "HOLD",
};
return map[label] || "SPACING";
}

export default function App() {
const [mode, setMode] = useState("parent");
const [sessionType, setSessionType] = useState("game");
const [focusPlayer, setFocusPlayer] = useState(ROSTER[0]);
const [showAll, setShowAll] = useState(false);

const [timeline, setTimeline] = useState([]);
const [last, setLast] = useState(null);
const [loading, setLoading] = useState(false);
const [err, setErr] = useState("");

const buttons = useMemo(
() => (mode === "parent" ? PARENT_MOMENTS : COACH_ACTIONS),
[mode]
);

const timelineFiltered = useMemo(() => {
if (showAll) return timeline;
return timeline.filter((x) => x.player_id === focusPlayer.id);
}, [timeline, showAll, focusPlayer.id]);

async function fetchTimeline() {
setLoading(true);
setErr("");

const { data, error } = await supabase
.from("decisions")
.select("*")
.order("created_at", { ascending: false })
.limit(50);

if (error) {
setErr(error.message);
setLoading(false);
return;
}

setTimeline(data || []);
setLast(
showAll
? (data || [])[0] || null
: (data || []).find((r) => r.player_id === focusPlayer.id) || null
);

setLoading(false);
}

async function logTap(label) {
setErr("");

const payload = {
actor: mode,
label,
state: sessionType,
note:
mode === "parent"
? `moment=${label}; suggest=${suggestConstraint(label)}`
: `action=${label}`,
player_id: focusPlayer.id,
player_name: focusPlayer.name,
};

const { data, error } = await supabase
.from("decisions")
.insert([payload])
.select("*")
.single();

if (error) {
setErr(error.message);
return;
}

setTimeline((prev) => [data, ...prev].slice(0, 50));
if (showAll || data.player_id === focusPlayer.id) setLast(data);
}

useEffect(() => {
fetchTimeline();

const channel = supabase
.channel("decisions_feed")
.on(
"postgres_changes",
{ event: "INSERT", schema: "public", table: "decisions" },
(payload) => {
const row = payload.new;
setTimeline((prev) => [row, ...prev].slice(0, 50));
if (showAll || row.player_id === focusPlayer.id) setLast(row);
}
)
.subscribe();

return () => {
supabase.removeChannel(channel);
};
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

useEffect(() => {
setLast(
showAll
? timeline[0] || null
: timeline.find((r) => r.player_id === focusPlayer.id) || null
);
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [focusPlayer.id, showAll]);

return (
<div className="app">
<div className="wrap">
<div className="header">
<div className="brand">
<div className="title">Axis Console</div>
<div className="pill ok">connected</div>
</div>
<button className="btn" onClick={fetchTimeline}>
{loading ? "Refreshing..." : "Refresh"}
</button>
</div>

<div className="grid top">
<div className="card span8">
<div className="subtle">
{mode === "parent" ? "Parent view" : "Coach view"} •{" "}
{mode === "parent"
? "Tap moments (evidence)."
: "Tap actions (assistant coach)."}
</div>

<div className="row gap">
<div className="seg">
<button
className={`segBtn ${mode === "parent" ? "activeLime" : ""}`}
onClick={() => setMode("parent")}
>
parent
</button>
<button
className={`segBtn ${mode === "coach" ? "activeLime" : ""}`}
onClick={() => setMode("coach")}
>
coach
</button>
</div>

<div className="seg">
<button
className={`segBtn ${sessionType === "game" ? "active" : ""}`}
onClick={() => setSessionType("game")}
>
game
</button>
<button
className={`segBtn ${sessionType === "practice" ? "active" : ""}`}
onClick={() => setSessionType("practice")}
>
practice
</button>
</div>

<div className="seg">
<button
className={`segBtn ${!showAll ? "active" : ""}`}
onClick={() => setShowAll(false)}
>
focus
</button>
<button
className={`segBtn ${showAll ? "active" : ""}`}
onClick={() => setShowAll(true)}
>
all
</button>
</div>
</div>

<div className="label">Focus player</div>
<div className="row chips">
{ROSTER.map((p) => (
<button
key={p.id}
className={`chip ${focusPlayer.id === p.id ? "chipActive" : ""}`}
onClick={() => setFocusPlayer(p)}
>
{p.name}
</button>
))}
</div>

{err && <div className="error">{err}</div>}
</div>

<div className="card span4">
<div className="label">Input</div>
<div className="kvs">
<div className="kv">
<span>Mode</span>
<b>{mode}</b>
</div>
<div className="kv">
<span>Session</span>
<b>{sessionType}</b>
</div>
<div className="kv">
<span>Focus</span>
<b className="lime">{focusPlayer.name}</b>
</div>
</div>
<div className="subtle small">
Rule: every tap tags <b>{focusPlayer.name}</b>.
</div>
</div>
</div>

<div className="grid main">
<div className="card span4">
<div className="row between">
<div>
<div className="cardTitle">
{mode === "parent" ? "Moments" : "Actions"}
</div>
<div className="subtle small">
{mode === "parent"
? "Parent flags moments. No live coaching."
: "Coach logs actions. Axis suggests next constraint."}
</div>
</div>
<div className="subtle small">
{showAll ? "All players" : `Locked → ${focusPlayer.name}`}
</div>
</div>

<div className="btnGrid">
{buttons.map((b) => (
<button
key={b.label}
className="bigBtn"
onClick={() => logTap(b.label)}
>
<div className="bigBtnTop">{b.label}</div>
<div className="bigBtnSub">{b.sub}</div>
</button>
))}
</div>
</div>

<div className="card span5">
<div className="row between">
<div className="cardTitle">Timeline</div>
<div className="subtle small">
{timelineFiltered.length} recent
</div>
</div>

<div className="list">
{timelineFiltered.length === 0 ? (
<div className="subtle">No logs yet.</div>
) : (
timelineFiltered.map((row) => (
<div key={row.id} className="rowItem">
<div className="left">
<span className="tag">{row.label || "—"}</span>
<span className="meta">
{row.player_name || row.player_id || "?"} •{" "}
{row.actor || "—"} • {row.state || "—"}
</span>
</div>
<div className="time">
{row.created_at
? new Date(row.created_at).toLocaleTimeString()
: ""}
</div>
</div>
))
)}
</div>
</div>

<div className="card span3">
<div className="cardTitle">Now</div>

{!last ? (
<div className="subtle">No current item.</div>
) : (
<>
<div className="nowTop">
<div className="label">Latest</div>
<div className="nowLabel">{last.label}</div>
<div className="subtle small">
{last.player_name || last.player_id} • {last.actor} •{" "}
{last.state}
</div>
</div>

<div className="divider" />

<div className="label">Suggested constraint</div>
<div className="nowConstraint">
{suggestConstraint(last.label || "")}
</div>

<div className="subtle small">
{mode === "parent"
? "Saved for postgame training. Parent doesn’t push live changes."
: "Coach can confirm/override later."}
</div>
</>
)}
</div>
</div>
</div>
</div>
);
}