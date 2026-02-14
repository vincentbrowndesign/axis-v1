import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./styles.css";

const CONSTRAINTS = ["Triple Threat / Pivot", "Attack the Line", "2 Dribbles Max"];
const OUTCOMES = ["Good Possession", "Forced Shot", "Foul Drawn", "Turnover"];

export default function App() {
const [mode, setMode] = useState("wall"); // wall | game
const [possession, setPossession] = useState(1);
const [focusPlayer, setFocusPlayer] = useState("");
const [selectedConstraints, setSelectedConstraints] = useState([]);
const [logs, setLogs] = useState([]);
const [loading, setLoading] = useState(false);
const [status, setStatus] = useState("");

const canSubmit = useMemo(
() => selectedConstraints.length > 0 && !loading,
[selectedConstraints, loading]
);

const toggleConstraint = (c) => {
setSelectedConstraints((prev) =>
prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
);
};

const logOutcome = async (outcome) => {
if (!canSubmit) return;

setLoading(true);
setStatus("Logging…");

try {
const rows = selectedConstraints.map((constraint_name) => ({
possession_number: possession,
constraint_name,
outcome,
focus_player: focusPlayer || null,
created_at: new Date().toISOString(),
}));

const { error } = await supabase.from("axis_logs").insert(rows);
if (error) throw error;

setPossession((p) => p + 1);
setSelectedConstraints([]);
setStatus("Logged ✅");
fetchLogs();
} catch (e) {
console.error(e);
alert("Log failed. Check Supabase RLS + env vars.");
setStatus("Log failed.");
} finally {
setLoading(false);
}
};

const fetchLogs = async () => {
const { data, error } = await supabase
.from("axis_logs")
.select("*")
.order("created_at", { ascending: false })
.limit(10);

if (!error) setLogs(data || []);
};

const copyReport = () => {
const constraintCount = {};
const outcomeCount = {};

logs.forEach((l) => {
constraintCount[l.constraint_name] =
(constraintCount[l.constraint_name] || 0) + 1;
outcomeCount[l.outcome] = (outcomeCount[l.outcome] || 0) + 1;
});

const text = `
AXIS – Game Transfer Report

Last ${logs.length} events:

Constraints:
${Object.entries(constraintCount)
.map(([k, v]) => `- ${k}: ${v}`)
.join("\n")}

Outcomes:
${Object.entries(outcomeCount)
.map(([k, v]) => `- ${k}: ${v}`)
.join("\n")}

Language for parents:
"We track what shows up in games, then we train exactly that."
`;

navigator.clipboard.writeText(text.trim());
alert("Report copied to clipboard.");
};

useEffect(() => {
if (mode === "game") fetchLogs();
}, [mode]);

if (mode === "wall") {
return (
<div className="wall">
<h1>Axis Game Transfer</h1>
<p className="tag">
Track what shows up in games. Train exactly that.
</p>

<ul className="bullets">
<li>Log live game decisions</li>
<li>See what transfers from training</li>
<li>Get instant parent-readable recap</li>
</ul>

<button className="cta" onClick={() => setMode("game")}>
Start a Game
</button>

<div className="footer">Courtside-safe. No setup. No clutter.</div>
</div>
);
}

return (
<div className="app">
<header className="header">
<div>
<h1>Axis Constraint Lab</h1>
<p className="sub">Live Game Transfer Logger</p>
</div>
<button className="btn ghost" onClick={() => setMode("wall")}>
Exit
</button>
</header>

<section className="card">
<label className="label">Focus Player (optional)</label>
<input
className="input"
placeholder="Player name"
value={focusPlayer}
onChange={(e) => setFocusPlayer(e.target.value)}
/>
<div className="possessionRow">
<div className="possession">Possession #{possession}</div>
<div className="status">{status}</div>
</div>
</section>

<section className="card">
<div className="sectionTitle">Constraints (tap all that applied)</div>
<div className="grid">
{CONSTRAINTS.map((c) => (
<button
key={c}
className={`btn ${
selectedConstraints.includes(c) ? "active" : ""
}`}
onClick={() => toggleConstraint(c)}
>
{c}
</button>
))}
</div>
</section>

<section className="card">
<div className="sectionTitle">Outcome</div>
<div className="grid">
{OUTCOMES.map((o) => (
<button
key={o}
className={`btn green ${canSubmit ? "" : "disabled"}`}
disabled={!canSubmit}
onClick={() => logOutcome(o)}
>
{loading ? "…" : o}
</button>
))}
</div>
</section>

<section className="card">
<div className="sectionTitle">Parent Recap (last 10)</div>
<button className="btn ghost" onClick={fetchLogs}>
Refresh
</button>
<ul className="recap">
{logs.map((l, i) => (
<li key={i}>
{l.constraint_name} → {l.outcome}
</li>
))}
</ul>
<button className="btn" onClick={copyReport}>
Copy Report
</button>
</section>
</div>
);
}