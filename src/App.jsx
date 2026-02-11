import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

const PLAYERS = ["Cole", "Rocket", "Chance", "Hailey"];
const MOMENTS = [
{ label: "GOOD", text: "Good decision" },
{ label: "MISS", text: "Missed read" },
{ label: "SPACE", text: "Spacing broke" },
{ label: "PANIC", text: "Panic dribble" },
];

export default function App() {
const [player, setPlayer] = useState("Cole");
const [role, setRole] = useState("parent");
const [mode, setMode] = useState("practice");
const [timeline, setTimeline] = useState([]);

async function logMoment(label) {
const { error } = await supabase.from("decisions").insert([
{
actor: role,
label,
note: "axis live",
state: mode,
player,
},
]);

if (error) {
console.error("Supabase error:", error);
alert("Log failed");
} else {
fetchTimeline();
}
}

async function fetchTimeline() {
const { data, error } = await supabase
.from("decisions")
.select("*")
.order("created_at", { ascending: false })
.limit(25);

if (!error) setTimeline(data || []);
}

useEffect(() => {
fetchTimeline();
}, []);

return (
<div style={{ padding: 20, color: "#fff", background: "#0b0b0f", minHeight: "100vh" }}>
<h1>AXIS LIVE</h1>

<div>
Mode:
<select value={mode} onChange={(e) => setMode(e.target.value)}>
<option value="practice">Practice</option>
<option value="game">Game</option>
</select>

Role:
<select value={role} onChange={(e) => setRole(e.target.value)}>
<option value="parent">Parent</option>
<option value="coach">Coach</option>
</select>
</div>

<div style={{ marginTop: 10 }}>
Player:
{PLAYERS.map((p) => (
<button
key={p}
onClick={() => setPlayer(p)}
style={{
margin: 4,
background: p === player ? "#00ff9c" : "#222",
color: "#000",
padding: "8px 12px",
}}
>
{p}
</button>
))}
</div>

<div style={{ marginTop: 20 }}>
{MOMENTS.map((m) => (
<button
key={m.label}
onClick={() => logMoment(m.label)}
style={{
display: "block",
margin: "10px 0",
padding: 16,
width: "100%",
fontSize: 18,
}}
>
{m.label} — {m.text}
</button>
))}
</div>

<h3>Timeline</h3>
{timeline.map((t) => (
<div key={t.id} style={{ opacity: 0.7 }}>
{t.label} — {t.player} — {t.actor} — {t.state}
</div>
))}
</div>
);
}