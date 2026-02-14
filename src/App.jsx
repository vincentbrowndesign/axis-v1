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

function transferInsight(constraints, outcome) {
if (!constraints?.length || !outcome) return "";

// Keep it short and parent-readable:
const held = outcome === "Good Possession" || outcome === "Foul Drawn";
const head = held ? "Transfer held:" : "Transfer gap:";

// A simple “combo meaning”
const tags = constraints.join(" + ");

if (held) {
return `${head} ${tags} showed up and stayed clean under pressure.`;
}
return `${head} ${tags} showed up, but the possession broke down (rushed/turnover).`;
}

export default function App() {
// Session = logs since page open (v1 simple)
const [sessionStartISO, setSessionStartISO] = useState(() => new Date().toISOString());

const [possession, setPossession] = useState(1);

// ✅ multi-select
const [selectedConstraints, setSelectedConstraints] = useState([]); // array of strings

const [focusPlayer, setFocusPlayer] = useState("");
const [loading, setLoading] = useState(false);
const [lastStatus, setLastStatus] = useState("");
const [lastCombo, setLastCombo] = useState({ constraints: [], outcome: "" });

// Remote logs
const [remoteLogs, setRemoteLogs] = useState([]);
const [remoteLoading, setRemoteLoading] = useState(false);
const [remoteError, setRemoteError] = useState("");

const [showRecap, setShowRecap] = useState(false);

const focusPlayerTrim = useMemo(() => focusPlayer.trim(), [focusPlayer]);

const canSubmit = useMemo(
() => selectedConstraints.length > 0 && !loading,
[selectedConstraints, loading]
);

const toggleConstraint = (c) => {
setSelectedConstraints((prev) => {
const exists = prev.includes(c);
if (exists) return prev.filter((x) => x !== c);

// limit to 3 max (your full set)
if (prev.length >= 3) return prev; // ignore tap if already 3
return [...prev, c];
});
};

const fetchLogs = async () => {
setRemoteLoading(true);
setRemoteError("");

try {
let q = supabase
.from("axis_logs")
.select("id, possession_number, constraint_name, constraint_names, outcome, focus_player, created_at")
.gte("created_at", sessionStartISO)
.order("created_at", { ascending: true })
.limit(500);

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

useEffect(() => {
if (showRecap) fetchLogs();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [showRecap]);

useEffect(() => {
if (showRecap) fetchLogs();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [focusPlayerTrim]);

// Helper: normalize constraints from DB row (supports old + new)
const rowConstraints = (row) => {
if (Array.isArray(row.constraint_names) && row.constraint_names.length) return row.constraint_names;
if (row.constraint_name) return [row.constraint_name];
return [];
};

// Transfer Score: last 10 possessions “held” count
const last10 = useMemo(() => remoteLogs.slice(-10), [remoteLogs]);

const transferScore = useMemo(() => {
const held = last10.filter(
(r) => r.outcome === "Good Possession" || r.outcome === "Foul Drawn"
).length;
return { held, total: last10.length };
}, [last10]);

// Counts (each constraint inside the array counts)
const last10Summary = useMemo(() => {
const byOutcome = OUTCOMES.reduce((acc, o) => ({ ...acc, [o]: 0 }), {});
const byConstraint = CONSTRAINTS.reduce((acc, c) => ({ ...acc, [c]: 0 }), {});

for (const row of last10) {
if (byOutcome[row.outcome] !== undefined) byOutcome[row.outcome] += 1;
const cs = rowConstraints(row);
for (const c of cs) {
if (byConstraint[c] !== undefined) byConstraint[c] += 1;
}
}

const topConstraint = Object.entries(byConstraint).sort((a, b) => b[1] - a[1])[0];
return {
byOutcome,
byConstraint,
topConstraint: topConstraint ? { name: topConstraint[0], count: topConstraint[1] } : null,
};
}, [last10]);

const insightText = useMemo(() => {
if (!lastCombo.constraints.length || !lastCombo.outcome) return "";
return transferInsight(lastCombo.constraints, lastCombo.outcome);
}, [lastCombo]);

const logOutcome = async (outcome) => {
if (!selectedConstraints.length) {
setLastStatus("Select 1–3 constraints first.");
return;
}

setLoading(true);
setLastStatus("Logging…");

const created_at = new Date().toISOString();

// Keep legacy constraint_name for backward compatibility (first selected)
const payload = {
possession_number: possession,
constraint_name: selectedConstraints[0], // legacy
constraint_names: selectedConstraints, // ✅ new canonical array
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

setLastCombo({ constraints: selectedConstraints, outcome });
setPossession((p) => p + 1);
setSelectedConstraints([]);

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
setSelectedConstraints([]);
setFocusPlayer("");
setLastStatus("");
setLastCombo({ constraints: [], outcome: "" });
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
<button className="btn ghost" type="button" onClick={() => setShowRecap((v) => !v)}>
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
<span className="microLabel">Selected</span>
<span className="microValue">{selectedConstraints.length}/3</span>
</div>
<div className="microPill">
<span className="microLabel">DB Logs</span>
<span className="microValue">{remoteLogs.length}</span>
</div>
<div className="microPill">
<span className="microLabel">Session Start</span>
<span className="microValue">{new Date(sessionStartISO).toLocaleTimeString()}</span>
</div>
</div>
</section>

<section className="card">
<div className="sectionTitle">Constraint (tap 1–3)</div>
<div className="grid">
{CONSTRAINTS.map((c) => (
<button
key={c}
className={`btn ${selectedConstraints.includes(c) ? "active" : ""}`}
onClick={() => toggleConstraint(c)}
type="button"
>
<div className="btnTitle">{c}</div>
<div className="btnSub">{CONSTRAINT_MICRO[c]}</div>
</button>
))}
</div>
<div className="hint">Tap to toggle. You can select 1, 2, or all 3 constraints for the possession.</div>
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
{lastCombo.constraints.length && lastCombo.outcome ? (
<>
<div className="insightLine">
{lastCombo.constraints.map((c) => (
<span className="tag" key={c}>{c}</span>
))}
<span className="arrow">→</span>
<span className="tag greenTag">{lastCombo.outcome}</span>
</div>
<div className="insightText">{insightText}</div>
<div className="hint">Now “transfer” is real: the possession can contain multiple skill rules at once.</div>
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

<div className="scoreLine">
<div className="scoreTitle">Transfer Score (Last 10)</div>
<div className="scoreValue">
{transferScore.held}/{transferScore.total || 10} held
</div>
<div className="scoreHint">
Held = Good Possession + Foul Drawn
</div>
</div>

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
Top tag: <b>{last10Summary.topConstraint.name}</b> ({last10Summary.topConstraint.count})
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
<div className="recapNote">This recap now respects multi-constraint possessions.</div>
</div>
</div>

<div className="miniTable">
<div className="miniHead">
<div>#</div>
<div>Constraints</div>
<div>Outcome</div>
</div>

{remoteLoading ? (
<div className="miniEmpty">Loading…</div>
) : last10.length === 0 ? (
<div className="miniEmpty">No DB logs in this session window yet.</div>
) : (
last10.map((r) => {
const cs = rowConstraints(r);
return (
<div className="miniRow" key={r.id || `${r.created_at}-${r.possession_number}`}>
<div className="miniCell mono">{r.possession_number}</div>
<div className="miniCell">{cs.join(" + ")}</div>
<div className="miniCell">{r.outcome}</div>
</div>
);
})
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
One possession = 1–3 constraints + outcome. Recap pulls from Supabase.
</footer>
</div>
);
}