import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

/* ============================
5v5 GAME MODE — LIVE CONSTRAINT LOGGER (SIMPLE)
============================ */

const TEMPLATES = [
{
id: "GAME_5V5_CORE",
name: "5v5 — Live Constraints",
goal: "Track live constraint compliance in-game",
works: "5v5",
constraints: [
"triple_threat_pivot",
"attack_the_line",
"two_dribbles_max",
],
outcomes: [
{ key: "good_possession", label: "Good Possession" },
{ key: "forced_shot", label: "Forced Shot" },
{ key: "turnover", label: "Turnover" },
{ key: "foul_drawn", label: "Foul Drawn" },
],
},
];

function pNum(label) {
const m = String(label || "").match(/P(\d+)/i);
return m ? parseInt(m[1], 10) : 999;
}

export default function App() {
const [players, setPlayers] = useState([]);
const [focusPlayerId, setFocusPlayerId] = useState("");
const [activeRun, setActiveRun] = useState(null);
const [repNumber, setRepNumber] = useState(1);
const [selectedConstraints, setSelectedConstraints] = useState([]);

const template = TEMPLATES[0];

useEffect(() => {
(async () => {
const { data, error } = await supabase
.from("players")
.select("id,display_name,label")
.order("created_at", { ascending: true });

if (error) {
alert("Error loading players");
console.error(error);
} else {
const list = (data || [])
.map((p) => ({
id: p.id,
label: p.label || p.display_name || "",
}))
.sort((a, b) => pNum(a.label) - pNum(b.label));

setPlayers(list);
}
})();
}, []);

async function startRun() {
const { data, error } = await supabase
.from("runs")
.insert([
{
team_label: "5v5",
template_id: template.id,
focus_player_id: focusPlayerId || null,
operator: "coach",
},
])
.select("*")
.single();

if (error) {
alert("Start run failed");
console.error(error);
} else {
setActiveRun(data);
setRepNumber(1);
setSelectedConstraints([]);
}
}

async function logRep(outcome) {
if (!activeRun) return;

const { error } = await supabase.from("rep_events").insert([
{
run_id: activeRun.id,
rep_number: repNumber,
template_id: template.id,
focus_player_id: focusPlayerId || null,
outcome,
tags: selectedConstraints,
},
]);

if (error) {
alert("Log failed");
console.error(error);
} else {
setRepNumber((n) => n + 1);
setSelectedConstraints([]);
}
}

function toggleConstraint(tag) {
setSelectedConstraints((prev) =>
prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
);
}

return (
<div style={styles.app}>
<h1>Axis Constraint Lab</h1>
<p>5v5 Live Game Logger (Coach View)</p>

<div style={styles.panel}>
<label>Focus Player (optional)</label>
<select value={focusPlayerId} onChange={(e) => setFocusPlayerId(e.target.value)}>
<option value="">All Players</option>
{players.map((p) => (
<option key={p.id} value={p.id}>
{p.label}
</option>
))}
</select>

{!activeRun && (
<button onClick={startRun} style={styles.startBtn}>
Start Live Game
</button>
)}
</div>

{activeRun && (
<div style={styles.panel}>
<h3>Possession #{repNumber}</h3>

<div style={styles.constraints}>
<button
onClick={() => toggleConstraint("triple_threat_pivot")}
style={{
...styles.constraint,
background: selectedConstraints.includes("triple_threat_pivot")
? "#fff"
: "#111",
color: selectedConstraints.includes("triple_threat_pivot")
? "#000"
: "#fff",
}}
>
Triple Threat / Pivot
</button>

<button
onClick={() => toggleConstraint("attack_the_line")}
style={{
...styles.constraint,
background: selectedConstraints.includes("attack_the_line")
? "#fff"
: "#111",
color: selectedConstraints.includes("attack_the_line")
? "#000"
: "#fff",
}}
>
Attack the Line
</button>

<button
onClick={() => toggleConstraint("two_dribbles_max")}
style={{
...styles.constraint,
background: selectedConstraints.includes("two_dribbles_max")
? "#fff"
: "#111",
color: selectedConstraints.includes("two_dribbles_max")
? "#000"
: "#fff",
}}
>
2 Dribbles Max
</button>
</div>

<div style={styles.outcomes}>
{template.outcomes.map((o) => (
<button key={o.key} onClick={() => logRep(o.key)} style={styles.outcomeBtn}>
{o.label}
</button>
))}
</div>

<p style={{ opacity: 0.6 }}>
Tap constraint(s) → tap outcome. One tap per possession.
</p>
</div>
)}
</div>
);
}

const styles = {
app: {
minHeight: "100vh",
background: "#000",
color: "#fff",
padding: 20,
fontFamily: "system-ui",
},
panel: {
border: "1px solid #222",
borderRadius: 12,
padding: 12,
marginTop: 12,
},
startBtn: {
marginTop: 10,
padding: "10px 14px",
borderRadius: 10,
border: "none",
fontWeight: 700,
cursor: "pointer",
},
constraints: {
display: "grid",
gridTemplateColumns: "1fr 1fr 1fr",
gap: 8,
marginTop: 10,
},
constraint: {
padding: "12px 10px",
borderRadius: 10,
border: "1px solid #333",
cursor: "pointer",
fontWeight: 600,
},
outcomes: {
display: "grid",
gridTemplateColumns: "repeat(2, 1fr)",
gap: 10,
marginTop: 12,
},
outcomeBtn: {
padding: "12px",
borderRadius: 10,
border: "none",
fontWeight: 700,
cursor: "pointer",
},
};