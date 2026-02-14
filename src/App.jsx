import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./styles.css";

const CONSTRAINTS = ["Triple Threat / Pivot", "Attack the Line", "2 Dribbles Max"];
const OUTCOMES = ["Good Possession", "Forced Shot", "Foul Drawn", "Turnover"];

const OUTCOME_MICRO = {
"Good Possession": "Decision + spacing held under pressure.",
"Forced Shot": "Constraint broke → rushed attempt.",
"Foul Drawn": "Advantage created from first step / angle.",
"Turnover": "Read failed under pressure.",
};

const CONSTRAINT_MICRO = {
"Triple Threat / Pivot": "Feet & eyes first. Create angle before dribble.",
"Attack the Line": "Pressure the rim. Collapse help, then decide.",
"2 Dribbles Max": "Fast decisions. No over-dribble. Move it or score.",
};

function transferInsight(constraint, outcome) {
if (!constraint || !outcome) return "";

if (constraint === "Attack the Line") {
if (outcome === "Good Possession") return "Transfer: first step created help → decision stayed clean.";
if (outcome === "Foul Drawn") return "Transfer: downhill pressure forced contact (good).";
if (outcome === "Forced Shot") return "Transfer gap: attacked late → no angle, ended rushed.";
if (outcome === "Turnover") return "Transfer gap: drove into help without a plan.";
}

if (constraint === "Triple Threat / Pivot") {
if (outcome === "Good Possession") return "Transfer: pivot + eyes created a clean lane or pass.";
if (outcome === "Foul Drawn") return "Transfer: strong base → defender reached.";
if (outcome === "Forced Shot") return "Transfer gap: skipped the pivot/read → rushed attempt.";
if (outcome === "Turnover") return "Transfer gap: telegraphed the read from triple threat.";
}

if (constraint === "2 Dribbles Max") {
if (outcome === "Good Possession") return "Transfer: quick decision beat pressure.";
if (outcome === "Foul Drawn") return "Transfer: 2-dribble attack got downhill fast.";
if (outcome === "Forced Shot") return "Transfer gap: used dribbles without advantage → bailout shot.";
if (outcome === "Turnover") return "Transfer gap: dribbles ended with no outlet.";
}

return "Transfer: constraint + outcome connected.";
}

export default function App() {
// Session = everything logged since you opened this page (simple + reliable)
const [sessionStartISO, setSessionStartISO] = useState(() => new Date().toISOString());
const [possession, setPossession] = useState(1);
const [selectedConstraint, setSelectedConstraint] = useState(null);
const [focusPlayer, setFocusPlayer] = useState("");
const [loading, setLoading] = useState(false);
const [lastStatus, setLastStatus] = useState("");
const [lastCombo, setLastCombo] = useState({ constraint: "", outcome: "" });

// Remote logs (from Supabase)
const [remoteLogs, setRemoteLogs] = useState([]);
const [remoteLoading, setRemoteLoading] = useState(false);
const [remoteError, setRemoteError] = useState("");

// UI
const [showRecap, setShowRecap] = useState(false);

const focusPlayerTrim = useMemo(() => focusPlayer.trim(), [focusPlayer]);
const canSubmit = useMemo(() => !!selectedConstraint && !loading, [selectedConstraint, loading]);

// Pull logs from Supabase for THIS session window
const fetchLogs = async () => {
setRemoteLoading(true);
setRemoteError("");

try {
// Base query: session window
let q = supabase
.from("axis_logs")
.select("id, possession_number, constraint_name, outcome, focus_player, created_at")
.gte("created_at", sessionStartISO)
.order("created_at", { ascending: true })
.limit(500);

// Optional focus player filter (exact match)
if (focusPlayerTrim) {
q = q.eq("focus_player", focusPlayerTrim);
}

const { data, error } = await q;

if (error) {
console.error("Fetch logs error:", error);
setRemoteError("Could not load recap (RLS/env).");
setRemoteLogs([]);
} else {
setRemoteLogs(data || []);
}
} catch (e) {
console.error("Fetch logs unexpected error:", e);
setRemoteError("Could not load recap (unexpected).");
setRemoteLogs([]);
} finally {
setRemoteLoading(false);
}
};

// When recap is opened, pull from Supabase
useEffect(() => {
if (showRecap) fetchLogs();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [showRecap]);

// When focus player changes and recap is open, refresh the recap
useEffect(() => {
if (showRecap) fetchLogs();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [focusPlayerTrim]);

const totals = useMemo(() => {
const rows = remoteLogs;

const byOutcome = OUTCOMES.reduce((acc, o) => ({ ...acc, [o]: 0 }), {});
const byConstraint = CONSTRAINTS.reduce((acc, c) => ({ ...acc, [c]: 0 }), {});

for (const row of rows) {
if (byOutcome[row.outcome] !== undefined) byOutcome[row.outcome] += 1;
if (byConstraint[row.constraint_name] !== undefined) byConstraint[row.constraint_name] += 1;
}

const total = rows.length;
const topConstraint = Object.entries(byConstraint).sort((a, b) => b[1] - a[1])[0];
const topOutcome = Object.entries(byOutcome).sort((a, b) => b[1] - a[1])[0];

return {
total,
byOutcome,
byConstraint,
topConstraint: topConstraint ? { name: topConstraint[0], count: topConstraint[1] } : null,
topOutcome: topOutcome ? { name: topOutcome[0], count: topOutcome[1] } : null,
};
}, [remoteLogs]);

const last10 = useMemo(() => remoteLogs.slice(-10), [remoteLogs]);

const last10Summary = useMemo(() => {
const byOutcome = OUTCOMES.reduce((acc, o) => ({ ...acc, [o]: 0 }), {});
const byConstraint = CONSTRAINTS.reduce((acc, c) => ({ ...acc, [c]: 0 }), {});
for (const row of last10) {
if (byOutcome[row.outcome] !== undefined) byOutcome[row.outcome] += 1;
if (byConstraint[row.constraint_name] !== undefined) byConstraint[row.constraint_name] += 1;
}
const topConstraint = Object.entries(byConstraint).sort((a, b) => b[1] - a[1])[0];
return {
byOutcome,
byConstraint,
topConstraint: topConstraint ? { name: topConstraint[0], count: topConstraint[1] } : null,
};
}, [last10]);

const insightText = useMemo(() => {
const { constraint, outcome } = lastCombo;
if (!constraint || !outcome) return "";
return transferInsight(constraint, outcome);
}, [lastCombo]);

const logOutcome = async (outcome) => {
if (!selectedConstraint) {
setLastStatus("Select a constraint first.");
return;
}

setLoading(true);
setLastStatus("Logging…");

const created_at = new Date().toISOString();

const payload = {
possession_number: possession,
constraint_name: selectedConstraint,
outcome,
focus_player: focusPlayerTrim ? focusPlayerTrim : null,
created_at,
};

try {
const { error } = await supabase.from("axis_logs").insert([payload]);

if (error) {
console.error("Insert error:", error);
setLastStatus("DB blocked (RLS/env).");
alert("Supabase insert blocked. Check RLS policy + Vercel env vars.");
} else {
setLastStatus("Logged ✅");
}

setLastCombo({ constraint: selectedConstraint, outcome });
setPossession((p) => p + 1);
setSelectedConstraint(null);

// Refresh recap data after every log (so parent sees it instantly)
await fetchLogs();
} catch (e) {
console.error("Unexpected insert error:", e);
setLastStatus("Log failed (unexpected).");
alert("Unexpected error. Check console.");
} finally {
setLoading(false);
}
};

const resetSession = () => {
setSessionStartISO(new Date().toISOString());
setPossession(1);
setSelectedConstraint(null);
setFocusPlayer("");
setLastStatus("");
setLastCombo({ constraint: "", outcome: "" });
setRemoteLogs([]);
setRemoteError("");
setShowRecap(false);
};

return (
<div className="app">
<header className="header">
<div>
<h1>Axis Constraint Lab</h1>
<p className="sub">5v5 Live Game Logger (Coach View)</p>
</div>

<div className="headerActions">
<button
className="btn ghost"
type="button"
onClick={() => setShowRecap((v) => !v)}
>
{showRecap ? "Hide Recap" : "Show Recap"}
</button>
<button className="btn ghost" onClick={resetSession} type="button">
Reset
</button>
</div>
</header>

<section className="card">
<label className="label">Focus Player (optional)</label>
<input
className="input"
placeholder="Bloo / P1 / #3"
value={focusPlayer}
onChange={(e) => setFocusPlayer(e.target.value)}
inputMode="text"
/>

<div className="possessionRow">
<div className="possession">Possession #{possession}</div>
<div className={`status ${loading ? "loading" : ""}`}>{lastStatus}</div>
</div>

<div className="microRow">
<div className="microPill">
<span className="microLabel">Session Start</span>
<span className="microValue">{new Date(sessionStartISO).toLocaleTimeString()}</span>
</div>
<div className="microPill">
<span className="microLabel">DB Logs</span>
<span className="microValue">{remoteLogs.length}</span>
</div>
{totals.topConstraint?.count > 0 ? (
<div className="microPill">
<span className="microLabel">Top</span>
<span className="microValue">
{totals.topConstraint.name} ({totals.topConstraint.count})
</span>
</div>
) : null}
</div>
</section>

<section className="card">
<div className="sectionTitle">Constraint</div>
<div className="grid">
{CONSTRAINTS.map((c) => (
<button
key={c}
className={`btn ${selectedConstraint === c ? "active" : ""}`}
onClick={() => setSelectedConstraint(c)}
type="button"
>
<div className="btnTitle">{c}</div>
<div className="btnSub">{CONSTRAINT_MICRO[c]}</div>
</button>
))}
</div>
<div className="hint">Tap one constraint that applied this possession.</div>
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
type="button"
>
<div className="btnTitle">{loading ? "…" : o}</div>
<div className="btnSub">{OUTCOME_MICRO[o]}</div>
</button>
))}
</div>
<div className="hint">Tap outcome → auto-advances to next possession.</div>
</section>

<section className="card">
<div className="sectionTitle">Transfer Insight</div>
{lastCombo.constraint && lastCombo.outcome ? (
<>
<div className="insightLine">
<span className="tag">{lastCombo.constraint}</span>
<span className="arrow">→</span>
<span className="tag greenTag">{lastCombo.outcome}</span>
</div>
<div className="insightText">{insightText}</div>
<div className="hint">
Parents feel this immediately: we’re measuring decisions under pressure, not makes/misses.
</div>
</>
) : (
<div className="empty">Log one possession to generate a transfer insight.</div>
)}
</section>

{showRecap ? (
<section className="card">
<div className="recapHeader">
<div className="sectionTitle">Parent Recap (from Supabase)</div>
<div className="recapActions">
<button className="btn ghost small" type="button" onClick={fetchLogs} disabled={remoteLoading}>
{remoteLoading ? "Refreshing…" : "Refresh"}
</button>
</div>
</div>

<div className="recapSub">
{focusPlayerTrim
? `Filtering for Focus Player: "${focusPlayerTrim}" • Session window since page open`
: "All players • Session window since page open"}
</div>

{remoteError ? <div className="errorBox">{remoteError}</div> : null}

<div className="recapGrid">
<div className="recapBox">
<div className="recapLabel">Constraint Mix (Last 10)</div>
{CONSTRAINTS.map((c) => (
<div className="recapRow" key={c}>
<div className="recapKey">{c}</div>
<div className="recapVal">{last10Summary.byConstraint[c]}</div>
</div>
))}
{last10Summary.topConstraint?.count > 0 ? (
<div className="recapNote">
Focus: <b>{last10Summary.topConstraint.name}</b> showed up{" "}
<b>{last10Summary.topConstraint.count}</b> times.
</div>
) : (
<div className="recapNote">Log a few possessions to build a pattern.</div>
)}
</div>

<div className="recapBox">
<div className="recapLabel">Outcome Mix (Last 10)</div>
{OUTCOMES.map((o) => (
<div className="recapRow" key={o}>
<div className="recapKey">{o}</div>
<div className="recapVal">{last10Summary.byOutcome[o]}</div>
</div>
))}
<div className="recapNote">
This is the transfer meter — how often the constraint holds under pressure.
</div>
</div>
</div>

<div className="miniTable">
<div className="miniHead">
<div>#</div>
<div>Constraint</div>
<div>Outcome</div>
</div>

{remoteLoading ? (
<div className="miniEmpty">Loading…</div>
) : last10.length === 0 ? (
<div className="miniEmpty">No DB logs in this session window yet.</div>
) : (
last10.map((r) => (
<div className="miniRow" key={r.id || `${r.created_at}-${r.possession_number}`}>
<div className="miniCell mono">{r.possession_number}</div>
<div className="miniCell">{r.constraint_name}</div>
<div className="miniCell">{r.outcome}</div>
</div>
))
)}
</div>

<div className="recapFooter">
<div className="footerLine">
Parent language: “We track what shows up in games, then we train exactly that.”
</div>
</div>
</section>
) : null}

<footer className="footer">
One possession = constraint + outcome. Courtside-safe. Recap pulls from Supabase.
</footer>
</div>
);
}