import { useState } from "react";
import { supabase } from "./supabase";
import { getAxisWeek } from "./axisweek";

export default function AwayCheckIn({ focusPlayer }) {
const w = getAxisWeek();
const [location, setLocation] = useState("team_practice");
const [held, setHeld] = useState(null);
const [note, setNote] = useState("");
const [saving, setSaving] = useState(false);

async function submit() {
if (held === null) return alert("Tap Yes or No first.");

setSaving(true);

const label = `AWAY:${w.title}:${held ? "HOLD" : "CLEAN"}`;
const packedNote = JSON.stringify({
weekKey: w.weekKey,
rule: w.title,
focusPlayer: focusPlayer || null,
location,
heldUnderPressure: held,
note: note?.trim() || "",
ts: new Date().toISOString(),
});

const { error } = await supabase.from("decisions").insert([
{ actor: "parent", state: "away", label, note: packedNote },
]);

setSaving(false);

if (error) {
console.error(error);
alert("Error saving check-in");
return;
}

setHeld(null);
setNote("");
alert("Saved ✅");
}

return (
<div className="card">
<div className="subtle small">Away check-in</div>
<div className="h2">{w.title}</div>
<div className="subtle small">Parent lens: {w.parentLens}</div>

<select
className="select"
value={location}
onChange={(e) => setLocation(e.target.value)}
style={{ marginTop: 8 }}
>
<option value="team_practice">Team practice</option>
<option value="game">Game</option>
<option value="home">Home</option>
<option value="watching">Watching games</option>
</select>

<div style={{ display: "flex", gap: 8, marginTop: 8 }}>
<button
className={`btn ${held === true ? "btnSolid" : ""}`}
onClick={() => setHeld(true)}
>
Yes (held)
</button>
<button
className={`btn ${held === false ? "btnSolid" : ""}`}
onClick={() => setHeld(false)}
>
No (clean)
</button>
</div>

<textarea
className="textarea"
rows={2}
placeholder="Optional note (1 sentence)"
value={note}
onChange={(e) => setNote(e.target.value)}
style={{ marginTop: 8 }}
/>

<button
className="btn btnWide btnSolid"
onClick={submit}
disabled={saving}
>
{saving ? "Saving..." : "Submit"}
</button>
</div>
);
}