import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./styles.css";

const CONSTRAINTS = ["Triple Threat / Pivot", "Attack the Line", "2 Dribbles Max"];
const OUTCOMES = ["Good Possession", "Forced Shot", "Foul Drawn", "Turnover"];

const isHeld = (outcome) => outcome === "Good Possession" || outcome === "Foul Drawn";

export default function App() {
// wall | game
const [mode, setMode] = useState("wall");

// session window since page opened / started
const [sessionStartISO, setSessionStartISO] = useState(() => new Date().toISOString());

// game state
const [possession, setPossession] = useState(1);
const [focusPlayer, setFocusPlayer] = useState("");
const [selectedConstraints, setSelectedConstraints] = useState([]);

// logging status
const [loading, setLoading] = useState(false);
const [status, setStatus] = useState("");

// recap
const [remoteLogs, setRemoteLogs] = useState([]);
const [remoteLoading, setRemoteLoading] = useState(false);
const [remoteError, setRemoteError] = useState("");
const [copyStatus, setCopyStatus] = useState("");

const focusPlayerTrim = useMemo(() => focusPlayer.trim(), [focusPlayer]);

const canSubmit = useMemo(
() => selectedConstraints.length > 0 && !loading,
[selectedConstraints, loading]
);

const toggleConstraint = (c) => {
setSelectedConstraints((prev) => {
if (prev.includes(c)) return prev.filter((x) => x !== c);
if (prev.length >= 3) return prev; // cap 3
return [...prev, c];
});
};

const rowConstraints = (row) => {
if (Array.isArray(row.constraint_names) && row.constraint_names.length) return row.constraint_names;
if (row.constraint_name) return [row.constraint_name];
return [];
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

if (focusPlayerTrim) q = q.eq("focus_player", focusPlayerTrim);

const { data, error } = await q;

if (error) {
console.error("Fetch logs error:", error);
setRemoteError("Could not load recap (RLS/env).");
setRemoteLogs([]);
} else {
setRemoteLogs(data || []);
}
} catch (e) {
console.error("Fetch logs unexpected:", e);
setRemoteError("Could not load recap (unexpected).");
setRemoteLogs([]);
} finally {
setRemoteLoading(false);
}
};

useEffect(() => {
if (mode === "game") fetchLogs();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [mode]);

useEffect(() => {
if (mode === "game") fetchLogs();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [focusPlayerTrim]);

// ✅ last 10 possessions (rows) from DB
const last10 = useMemo(() => remoteLogs.slice(-10), [remoteLogs]);

const transferScore = useMemo(() => {
const held = last10.filter((r) => isHeld(r.outcome)).length;
return { held, total: last10.length };
}, [last10]);

const summary = useMemo(() => {
const byOutcome = OUTCOMES.reduce((acc, o) => ({ ...acc, [o]: 0 }), {});
const byConstraint = CONSTRAINTS.reduce((acc, c) => ({ ...acc, [c]: 0 }), {});

for (const row of last10) {
if (byOutcome[row.outcome] !== undefined) byOutcome[row.outcome] += 1;
const cs = rowConstraints(row);
for (const c of cs) {
if (byConstraint[c] !== undefined) byConstraint[c] += 1;
}
}

const top = Object.entries(byConstraint).sort((a, b) => b[1] - a[1])[0];
return {
byOutcome,
byConstraint,
topConstraint: top ? { name: top[0], count: top[1] } : null,
};
}, [last10]);

const logOutcome = async (outcome) => {
if (!selectedConstraints.length) {
setStatus("Select 1–3 constraints first.");
return;
}

setLoading(true);
setStatus("Logging…");

const payload = {
possession_number: possession,
constraint_name: selectedConstraints[0], // legacy (kept)
constraint_names: selectedConstraints, // canonical
outcome,
focus_player: focusPlayerTrim ? focusPlayerTrim : null,
created_at: new Date().toISOString(),
};

try {
const { error } = await supabase.from("axis_logs").insert([payload]);
if (error) {
console.error("Insert error:", error);
setStatus("DB blocked (RLS/env).");
alert("Insert blocked. Check Supabase RLS + Vercel env vars.");
} else {
setStatus("Logged ✅");
}

setPossession((p) => p + 1);
setSelectedConstraints([]);
await fetchLogs();
} catch (e) {
console.error("Unexpected insert error:", e);
setStatus("Log failed.");
alert("Unexpected error. Check console.");
} finally {
setLoading(false);
}
};

const resetGame = () => {
setSessionStartISO(new Date().toISOString());
setPossession(1);
setSelectedConstraints([]);
setFocusPlayer("");
setStatus("");
setRemoteLogs([]);
setRemoteError("");
setCopyStatus("");
};

const buildReportText = () => {
const playerLabel = focusPlayerTrim ? focusPlayerTrim : "All Players";
const time = new Date().toLocaleString();

const constraintsBlock = CONSTRAINTS.map(
(c) => `- ${c}: ${summary.byConstraint[c] || 0}`
).join("\n");

const outcomesBlock = OUTCOMES.map(
(o) => `- ${o}: ${summary.byOutcome[o] || 0}`
).join("\n");

const lastPossessionsBlock =
last10.length === 0
? "- None yet"
: last10
.map((r) => {
const cs = rowConstraints(r).join(" + ") || "—";
return `- #${r.possession_number}: ${cs} → ${r.outcome}`;
})
.join("\n");

return [
"AXIS — GAME TRANSFER REPORT",
`Player: ${playerLabel}`,
`Time: ${time}`,
"",
`Transfer Score (Last 10): ${transferScore.held}/${transferScore.total || 10} held`,
"(Held = Good Possession + Foul Drawn)",
"",
`Top Constraint Tag (Last 10): ${
summary.topConstraint?.count > 0 ? `${summary.topConstraint.name} (${summary.topConstraint.count})` : "N/A"
}`,
"",
"Constraint Mix (Last 10)",
constraintsBlock,
"",
"Outcome Mix (Last 10)",
outcomesBlock,
"",
"Last Possessions (Last 10)",
lastPossessionsBlock,
"",
'Parent language: "We track what shows up in games, then we train exactly that."',
].join("\n");
};

const copyReport = async () => {
setCopyStatus("");
try {
const text = buildReportText();

if (navigator.clipboard?.writeText) {
await navigator.clipboard.writeText(text);
} else {
const ta = document.createElement("textarea");
ta.value = text;
ta.setAttribute("readonly", "");
ta.style.position = "fixed";
ta.style.top = "-9999px";
ta.style.left = "-9999px";
document.body.appendChild(ta);
ta.select();
document.execCommand("copy");
document.body.removeChild(ta);
}

setCopyStatus("Copied ✅");
setTimeout(() => setCopyStatus(""), 1800);
} catch (e) {
console.error("Copy failed:", e);
setCopyStatus("Copy failed");
setTimeout(() => setCopyStatus(""), 1800);
alert("Copy failed.");
}
};

// ---------------- WALL (Photo 1) ----------------
if (mode === "wall") {
return (
<div className="wall">
<h1>Axis Game Transfer</h1>
<p className="tagline">Track what shows up in games. Train exactly that.</p>

<ul className="bullets">
<li>Log live game decisions</li>
<li>See what transfers from training</li>
<li>Get instant parent-readable recap</li>
</ul>

<button className="cta" onClick={() => setMode("game")}>
Start a Game
</button>

<div className="wallFoot">Courtside-safe. No setup. No clutter.</div>
</div>
);
}

// ---------------- GAME (Photo 3 recap) ----------------
return (
<div className="app">
<header className="header">
<div>
<h1>Axis Constraint Lab</h1>
<p className="sub">Live Game Transfer Logger</p>
</div>

<div className="headerActions">
<button className="btn ghost" type="button" onClick={() => setMode("wall")}>
Exit
</button>
<button className="btn ghost" type="button" onClick={resetGame}>
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
/>

<div className="possessionRow">
<div className="possession">Possession #{possession}</div>
<div className={`status ${loading ? "loading" : ""}`}>{status}</div>
</div>

<div className="hint">Tap 1–3 constraints, then tap outcome.</div>
</section>

<section className="card">
<div className="sectionTitle">Constraints (tap all that applied)</div>
<div className="grid">
{CONSTRAINTS.map((c) => (
<button
key={c}
className={`btn ${selectedConstraints.includes(c) ? "active" : ""}`}
onClick={() => toggleConstraint(c)}
type="button"
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
type="button"
>
{loading ? "…" : o}
</button>
))}
</div>
</section>

<section className="card">
<div className="recapHeader">
<div className="sectionTitle">Parent Recap (from Supabase)</div>

<div className="recapActions">
<button className="btn ghost small" type="button" onClick={fetchLogs} disabled={remoteLoading}>
{remoteLoading ? "Refreshing…" : "Refresh"}
</button>
<button className="btn ghost small" type="button" onClick={copyReport} disabled={remoteLoading}>
Copy Report
</button>
</div>
</div>

<div className="recapSub">
{focusPlayerTrim ? `Focus: "${focusPlayerTrim}" • Session window since page open` : "All players • Session window since page open"}
{copyStatus ? <span className="copyBadge">{copyStatus}</span> : null}
</div>

{remoteError ? <div className="errorBox">{remoteError}</div> : null}

<div className="scoreLine">
<div className="scoreTitle">Transfer Score (Last 10)</div>
<div className="scoreValue">
{transferScore.held}/{transferScore.total || 10} held
</div>
<div className="scoreHint">Held = Good Possession + Foul Drawn</div>
</div>

<div className="recapGrid">
<div className="recapBox">
<div className="recapLabel">Constraint Mix (Last 10)</div>
{CONSTRAINTS.map((c) => (
<div className="recapRow" key={c}>
<div className="recapKey">{c}</div>
<div className="recapVal">{summary.byConstraint[c] || 0}</div>
</div>
))}
<div className="recapNote">
Focus: <b>{summary.topConstraint?.count > 0 ? summary.topConstraint.name : "—"}</b>{" "}
{summary.topConstraint?.count > 0 ? `showed up ${summary.topConstraint.count} times.` : ""}
</div>
</div>

<div className="recapBox">
<div className="recapLabel">Outcome Mix (Last 10)</div>
{OUTCOMES.map((o) => (
<div className="recapRow" key={o}>
<div className="recapKey">{o}</div>
<div className="recapVal">{summary.byOutcome[o] || 0}</div>
</div>
))}
<div className="recapNote">This is the transfer meter — how often the constraint holds under pressure.</div>
</div>
</div>

<div className="miniTable">
<div className="miniHead">
<div>#</div>
<div>CONSTRAINT</div>
<div>OUTCOME</div>
</div>

{remoteLoading ? (
<div className="miniEmpty">Loading…</div>
) : last10.length === 0 ? (
<div className="miniEmpty">No DB logs in this session window yet.</div>
) : (
last10.map((r) => (
<div className="miniRow" key={r.id}>
<div className="miniCell mono">{r.possession_number}</div>
<div className="miniCell">{rowConstraints(r).join(" + ")}</div>
<div className="miniCell">{r.outcome}</div>
</div>
))
)}
</div>

<div className="recapFooter">
<div className="footerLine">Parent language: “We track what shows up in games, then we train exactly that.”</div>
</div>
</section>

<footer className="footer">One possession = 1–3 constraints + outcome. Courtside-safe. Recap pulls from Supabase.</footer>
</div>
);
}