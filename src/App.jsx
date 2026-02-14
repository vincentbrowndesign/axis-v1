import { useMemo, useState } from "react";
import { supabase } from "./supabaseClient";
import "./styles.css";

const CONSTRAINTS = ["Triple Threat / Pivot", "Attack the Line", "2 Dribbles Max"];

const OUTCOMES = ["Good Possession", "Forced Shot", "Foul Drawn", "Turnover"];

export default function App() {
const [possession, setPossession] = useState(1);
const [selectedConstraint, setSelectedConstraint] = useState(null);
const [focusPlayer, setFocusPlayer] = useState("");
const [loading, setLoading] = useState(false);
const [lastStatus, setLastStatus] = useState(""); // small on-screen feedback

const canSubmit = useMemo(() => !!selectedConstraint && !loading, [selectedConstraint, loading]);

const logOutcome = async (outcome) => {
if (!selectedConstraint) {
setLastStatus("Select a constraint first.");
return;
}

setLoading(true);
setLastStatus("Logging…");

try {
const payload = {
possession_number: possession,
constraint_name: selectedConstraint, // ✅ matches Supabase column
outcome,
focus_player: focusPlayer?.trim() ? focusPlayer.trim() : null,
created_at: new Date().toISOString(),
};

const { error } = await supabase.from("axis_logs").insert([payload]);

if (error) {
console.error("Supabase insert error:", error);
setLastStatus("Log failed. Check RLS + env vars.");
alert("Log failed. Check Supabase RLS policies + Vercel env vars.");
} else {
setPossession((p) => p + 1);
setSelectedConstraint(null);
setLastStatus("Logged ✅");
}
} catch (e) {
console.error("Unexpected log error:", e);
setLastStatus("Log failed (unexpected).");
alert("Log failed (unexpected). Check console.");
} finally {
setLoading(false);
}
};

const resetPossession = () => {
setPossession(1);
setSelectedConstraint(null);
setLastStatus("");
};

return (
<div className="app">
<header className="header">
<div>
<h1>Axis Constraint Lab</h1>
<p className="sub">5v5 Live Game Logger (Coach View)</p>
</div>
<button className="btn ghost" onClick={resetPossession} type="button">
Reset
</button>
</header>

<section className="card">
<label className="label">Focus Player (optional)</label>
<input
className="input"
placeholder="P1"
value={focusPlayer}
onChange={(e) => setFocusPlayer(e.target.value)}
inputMode="text"
/>

<div className="possessionRow">
<div className="possession">Possession #{possession}</div>
<div className={`status ${loading ? "loading" : ""}`}>{lastStatus}</div>
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
{c}
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
{loading ? "…" : o}
</button>
))}
</div>
<div className="hint">Tap outcome → auto-advances to next possession.</div>
</section>

<footer className="footer">One possession = constraint + outcome. Simple. Courtside-safe.</footer>
</div>
);
}