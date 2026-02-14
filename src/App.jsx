import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import "./styles.css";

const CONSTRAINTS = [
{ key: "triple_threat", label: "Triple Threat" },
{ key: "straight_line", label: "Straight Line" },
{ key: "draw_two", label: "Draw Two" },
];

export default function App() {
const [ledger, setLedger] = useState([]);
const [active, setActive] = useState([]);

async function log(delta, reason) {
const { data, error } = await supabase
.from("axis_transactions")
.insert([{ delta, reason }])
.select();

if (error) console.error(error);
else setLedger((l) => [data[0], ...l]);
}

function hitConstraint(key) {
if (!active.includes(key)) {
const next = [...active, key];
setActive(next);

// Reward switching through all 3
if (next.length === 3) {
log(1, "full_sequence_completed");
setActive([]);
} else {
log(1, key);
}
}
}

async function burn(reason = "rep_fail") {
await log(-1, reason);
}

useEffect(() => {
supabase
.from("axis_transactions")
.select("*")
.order("created_at", { ascending: false })
.limit(20)
.then(({ data }) => setLedger(data || []));
}, []);

return (
<div className="app">
<h1>AXIS LIVE</h1>

<div className="controls">
{CONSTRAINTS.map((c) => (
<button key={c.key} onClick={() => hitConstraint(c.key)}>
{c.label}
</button>
))}
<button className="burn" onClick={() => burn("rep_fail")}>
Burn
</button>
</div>

<div className="status">
Active Chain: {active.join(" → ") || "None"}
</div>

<h3>Ledger Feed</h3>
<ul className="ledger">
{ledger.map((row) => (
<li key={row.id}>
{row.delta > 0 ? "MINT" : "BURN"} {row.delta} – {row.reason}
</li>
))}
</ul>
</div>
);
}