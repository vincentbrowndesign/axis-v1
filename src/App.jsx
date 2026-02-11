import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
import.meta.env.VITE_SUPABASE_URL,
import.meta.env.VITE_SUPABASE_ANON_KEY
);

const CONSTRAINTS = [
{ id: "hold_line", label: "HOLD THE LINE", desc: "Catch + freeze. No panic. See the floor first." },
{ id: "triple_threat", label: "TRIPLE THREAT SCORE", desc: "Score from triple-threat. No bailout dribble." },
{ id: "two_dribbles", label: "1–2 DRIBBLES TO SCORE", desc: "Max two dribbles to pull-up or finish." }
];

const TAGS_SUCCESS = ["held", "pivot score", "1–2 dribbles", "made read", "paint touch", "spray out"];
const TAGS_FAIL = ["panic", "picked up dribble", "forced drive", "bad shot", "missed read"];

export default function App() {
const [constraint, setConstraint] = useState(CONSTRAINTS[0]);
const [mode, setMode] = useState("practice");
const [role, setRole] = useState("parent");
const [player, setPlayer] = useState("test");
const [runId, setRunId] = useState(crypto.randomUUID());
const [windowId, setWindowId] = useState(crypto.randomUUID());
const [stats, setStats] = useState({ success: 0, fail: 0, streak: 0 });
const [tag, setTag] = useState(null);
const [recent, setRecent] = useState([]);

async function log(outcome) {
const { error } = await supabase.from("signals").insert({
mode,
role,
player,
constraint: constraint.label,
outcome,
tag,
run_id: runId,
window_id: windowId
});

if (error) {
alert("Log failed");
console.error(error);
return;
}

setStats(s => ({
success: outcome === "success" ? s.success + 1 : s.success,
fail: outcome === "fail" ? s.fail + 1 : s.fail,
streak: outcome === "success" ? s.streak + 1 : 0
}));

setTag(null);
loadRecent();
}

async function loadRecent() {
const { data } = await supabase
.from("signals")
.select("*")
.eq("window_id", windowId)
.order("created_at", { ascending: false })
.limit(10);

setRecent(data || []);
}

useEffect(() => {
loadRecent();
}, [windowId]);

return (
<div style={{ padding: 16, background: "#0b0b0f", color: "white", minHeight: "100vh", width: 320 }}>
<h2>AXIS LIVE</h2>

<select value={mode} onChange={e => setMode(e.target.value)}>
<option value="practice">Practice</option>
<option value="game">Game</option>
</select>

<select value={role} onChange={e => setRole(e.target.value)}>
<option value="parent">Parent</option>
<option value="coach">Coach</option>
</select>

<input value={player} onChange={e => setPlayer(e.target.value)} />

<select onChange={e => setConstraint(CONSTRAINTS.find(c => c.id === e.target.value))}>
{CONSTRAINTS.map(c => (
<option key={c.id} value={c.id}>{c.label}</option>
))}
</select>

<p style={{ opacity: 0.7 }}>{constraint.desc}</p>

<button onClick={() => log("success")} style={{ background: "lime", padding: 10 }}>SUCCESS</button>
<button onClick={() => log("fail")} style={{ background: "tomato", padding: 10 }}>FAIL</button>

<h4>Tags (optional)</h4>
{[...TAGS_SUCCESS, ...TAGS_FAIL].map(t => (
<button key={t} onClick={() => setTag(t)} style={{ margin: 4 }}>
{t}
</button>
))}

<h4>Recent reps (this window)</h4>
{recent.map(r => (
<div key={r.id}>{r.outcome} – {r.tag || "no tag"}</div>
))}

<button onClick={() => setWindowId(crypto.randomUUID())}>Next Window</button>
<button onClick={() => setRunId(crypto.randomUUID())}>New Run</button>
</div>
);
}