import { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabase";

const QUICK = [
{ label: "HOLD", sub: "Pause + see 2" },
{ label: "RUSH", sub: "Tempo spike" },
{ label: "RESET", sub: "Re-center" },
{ label: "FORCE", sub: "Bad attempt" },
{ label: "WATCH", sub: "Observe only" },
{ label: "SPACING", sub: "Fix geometry" },
{ label: "TALK", sub: "Early voice" },
{ label: "SILENCE", sub: "No talk" },
];

// Game mode: mapped “expected constraint” per signal (front-end only)
const GAME_MAP = {
RUSH: "HOLD 2 beats",
FORCE: "PASS FIRST LOOK",
HOLD: "SEE 2 before move",
RESET: "RE-ENTER middle",
WATCH: "EYES UP — no dribble",
SPACING: "CORNER + 45 fill",
TALK: "CALL EARLY",
SILENCE: "NEXT PLAY = VOICE",
};

export default function App() {
const [status, setStatus] = useState("Connecting...");
const [recent, setRecent] = useState([]);
const [banner, setBanner] = useState(null);
const [pressed, setPressed] = useState(null);

// Keep only 2 options for mode: live + game
const [stateMode, setStateMode] = useState("live");
// Keep only parent as actor (per your ask)
const actor = "parent";

const UI = useMemo(
() => ({
bg: "#0b0e10",
panel: "#0f1417",
panel2: "#0c1012",
text: "#eaf0f4",
mut: "rgba(234,240,244,0.62)",
line: "rgba(255,255,255,0.08)",
lime: "#B6FF2B",
shadow: "0 12px 40px rgba(0,0,0,0.45)",
radius: 18,
radius2: 14,
font: `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`,
}),
[]
);

function showBanner(text) {
setBanner(text);
window.clearTimeout(showBanner._t);
showBanner._t = window.setTimeout(() => setBanner(null), 3200);
}

// Live mode: pattern-based cues
function checkPatterns(list) {
// In GAME mode, we do not “pattern guess” — we use the mapping
if (stateMode === "game") return;

const last60s = (list || []).filter((r) => {
const t = new Date(r.created_at).getTime();
return Date.now() - t < 60_000;
});

const count = (lbl) =>
last60s.filter((r) => (r.label || "").toUpperCase() === lbl).length;

if (count("RUSH") >= 2) showBanner("Constraint: HOLD 2 beats");
else if (count("FORCE") >= 2) showBanner("Constraint: PASS FIRST LOOK");
else if (count("SILENCE") >= 2) showBanner("Prompt: TALK EARLY");
}

async function fetchRecent() {
const { data, error } = await supabase
.from("decisions")
.select("*")
.order("created_at", { ascending: false })
.limit(14);

if (error) {
console.error(error);
return;
}

const list = data || [];
setRecent(list);
checkPatterns(list);
}

useEffect(() => {
setStatus("Axis connected ✅");
fetchRecent();
const t = setInterval(fetchRecent, 2500);
return () => clearInterval(t);
// include stateMode so pattern checking respects current mode
}, [stateMode]);

async function quickLog(label) {
setPressed(label);
window.setTimeout(() => setPressed(null), 120);

// GAME mode: show mapped constraint immediately (environment responds per rulebook)
if (stateMode === "game") {
const mapped = GAME_MAP[(label || "").toUpperCase()];
if (mapped) showBanner(`Constraint (Game): ${mapped}`);
}

const { error } = await supabase.from("decisions").insert([
{
actor,
label,
state: stateMode,
note: null,
},
]);

if (error) {
console.error(error);
showBanner("Log failed. Check console.");
return;
}

fetchRecent();
}

// Right-side “Now” panel content (fills wide screens)
const latest = recent?.[0];
const latestLabel = (latest?.label || "").toUpperCase();
const nowConstraint =
stateMode === "game"
? GAME_MAP[latestLabel] || "—"
: banner
? banner.replace(/^Constraint:\s*/, "")
: "—";

return (
<div
style={{
minHeight: "100vh",
width: "100%",
background: `radial-gradient(1200px 600px at 20% 0%, rgba(182,255,43,0.12), transparent 60%),
radial-gradient(900px 500px at 80% 10%, rgba(90,180,255,0.10), transparent 55%),
${UI.bg}`,
color: UI.text,
fontFamily: UI.font,
}}
>
{/* FULL WIDTH WRAPPER (no maxWidth caps) */}
<div style={{ width: "100%", margin: 0, padding: "22px 18px 40px" }}>
{/* Top bar */}
<div
style={{
display: "flex",
alignItems: "flex-start",
justifyContent: "space-between",
gap: 14,
}}
>
<div>
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
<h1
style={{
margin: 0,
fontSize: 34,
letterSpacing: -0.6,
lineHeight: 1.05,
}}
>
Axis Console
</h1>

<span
style={{
display: "inline-flex",
alignItems: "center",
gap: 8,
padding: "6px 10px",
borderRadius: 999,
background: "rgba(182,255,43,0.12)",
border: `1px solid rgba(182,255,43,0.22)`,
color: UI.text,
fontWeight: 800,
fontSize: 13,
}}
>
<span
style={{
width: 8,
height: 8,
borderRadius: 99,
background: UI.lime,
boxShadow: "0 0 0 4px rgba(182,255,43,0.12)",
}}
/>
{status}
</span>
</div>

<div style={{ marginTop: 8, color: UI.mut, fontSize: 14 }}>
Parent view · tap-to-log ·{" "}
<span style={{ color: UI.text, fontWeight: 900 }}>{stateMode}</span>
</div>

{/* Banner */}
{banner && (
<div
style={{
marginTop: 14,
display: "inline-flex",
alignItems: "center",
gap: 10,
padding: "10px 12px",
borderRadius: UI.radius2,
background: "rgba(255,255,255,0.06)",
border: `1px solid rgba(255,255,255,0.10)`,
boxShadow: UI.shadow,
}}
>
<span style={{ width: 10, height: 10, borderRadius: 99, background: UI.lime }} />
<span style={{ fontWeight: 900, letterSpacing: 0.2 }}>{banner}</span>
</div>
)}
</div>

{/* Minimal controls: Mode only */}
<div
style={{
background: UI.panel,
border: `1px solid ${UI.line}`,
borderRadius: UI.radius,
padding: 12,
boxShadow: UI.shadow,
minWidth: 220,
height: "fit-content",
}}
>
<div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
<div style={{ color: UI.mut, fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>
INPUT
</div>
<div style={{ color: UI.mut, fontSize: 12 }}>v1</div>
</div>

<div style={{ marginTop: 10 }}>
<div style={{ color: UI.mut, fontSize: 12, marginBottom: 6 }}>Mode</div>
<select
value={stateMode}
onChange={(e) => setStateMode(e.target.value)}
style={selectStyle(UI)}
>
<option value="live">live</option>
<option value="game">game</option>
</select>
</div>

<div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
<span style={pill(UI)}>{actor}</span>
<span style={pill(UI)}>{stateMode}</span>
</div>

<div style={{ marginTop: 10, color: UI.mut, fontSize: 12, lineHeight: 1.3 }}>
Live = pattern cues · Game = mapped constraints per signal.
</div>
</div>
</div>

{/* Main full-width grid (fills screens, no empty right side) */}
<div
style={{
display: "grid",
gridTemplateColumns: "minmax(520px, 1.35fr) minmax(420px, 1fr) minmax(360px, 0.9fr)",
gap: 14,
marginTop: 18,
alignItems: "start",
}}
>
{/* Signals */}
<div
style={{
background: UI.panel,
border: `1px solid ${UI.line}`,
borderRadius: UI.radius,
padding: 14,
boxShadow: UI.shadow,
}}
>
<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
<div style={{ fontWeight: 900, letterSpacing: -0.3, fontSize: 16 }}>Signals</div>
<div style={{ color: UI.mut, fontSize: 12 }}>
{actor} · {stateMode}
</div>
</div>

<div
style={{
display: "grid",
gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
gap: 10,
marginTop: 12,
}}
>
{QUICK.map((x) => {
const isDown = pressed === x.label;
return (
<button
key={x.label}
onClick={() => quickLog(x.label)}
style={{
textAlign: "left",
padding: "14px 14px",
borderRadius: UI.radius2,
border: `1px solid ${UI.line}`,
background: isDown ? "rgba(182,255,43,0.14)" : UI.panel2,
color: UI.text,
cursor: "pointer",
transform: isDown ? "translateY(1px)" : "translateY(0)",
transition: "transform 80ms ease, background 120ms ease, border 120ms ease",
}}
>
<div style={{ fontWeight: 900, letterSpacing: 0.4 }}>{x.label}</div>
<div style={{ marginTop: 6, color: UI.mut, fontSize: 12 }}>{x.sub}</div>
</button>
);
})}
</div>

<div style={{ marginTop: 12, color: UI.mut, fontSize: 12 }}>
{stateMode === "live"
? "Live: patterns trigger cues automatically."
: "Game: each signal immediately shows the mapped constraint."}
</div>
</div>

{/* Timeline */}
<div
style={{
background: UI.panel,
border: `1px solid ${UI.line}`,
borderRadius: UI.radius,
padding: 14,
boxShadow: UI.shadow,
overflow: "hidden",
}}
>
<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
<div style={{ fontWeight: 900, letterSpacing: -0.3, fontSize: 16 }}>Timeline</div>
<div style={{ color: UI.mut, fontSize: 12 }}>{recent.length} recent</div>
</div>

<div
style={{
marginTop: 12,
borderTop: `1px solid ${UI.line}`,
maxHeight: 430,
overflow: "auto",
}}
>
{recent.length === 0 ? (
<div style={{ padding: "14px 0", color: UI.mut }}>No logs yet.</div>
) : (
recent.map((r) => {
const lbl = (r.label || "").toUpperCase();
const isRush = lbl === "RUSH";
const chipBg = isRush ? "rgba(255,90,90,0.18)" : "rgba(182,255,43,0.12)";
const chipLine = isRush ? "rgba(255,90,90,0.25)" : "rgba(182,255,43,0.22)";
const mapped = GAME_MAP[lbl];

return (
<div
key={r.id}
style={{
display: "grid",
gridTemplateColumns: "1fr auto",
gap: 12,
padding: "12px 0",
borderBottom: `1px solid ${UI.line}`,
alignItems: "center",
}}
>
<div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
<span
style={{
padding: "6px 10px",
borderRadius: 999,
background: chipBg,
border: `1px solid ${chipLine}`,
fontWeight: 900,
fontSize: 12,
letterSpacing: 0.4,
}}
>
{lbl || "—"}
</span>

<div
style={{
color: UI.mut,
fontSize: 12,
whiteSpace: "nowrap",
overflow: "hidden",
textOverflow: "ellipsis",
}}
>
{(r.actor || actor) + " · " + (r.state || stateMode)}
{stateMode === "game" && mapped ? (
<span style={{ color: "rgba(234,240,244,0.78)", fontWeight: 700 }}>
{" "}
· {mapped}
</span>
) : null}
</div>
</div>

<div style={{ color: UI.mut, fontSize: 12 }}>
{r.created_at ? new Date(r.created_at).toLocaleTimeString() : ""}
</div>
</div>
);
})
)}
</div>

<div style={{ marginTop: 10, color: UI.mut, fontSize: 12 }}>
{stateMode === "game"
? "Shows mapped constraints next to each action."
: "Shows live actions and pattern cues."}
</div>
</div>

{/* “Now” panel to fill wide screens (no more empty white space) */}
<div
style={{
background: UI.panel,
border: `1px solid ${UI.line}`,
borderRadius: UI.radius,
padding: 14,
boxShadow: UI.shadow,
}}
>
<div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
<div style={{ fontWeight: 900, letterSpacing: -0.3, fontSize: 16 }}>Now</div>
<div style={{ color: UI.mut, fontSize: 12 }}>live panel</div>
</div>

<div style={{ marginTop: 12, padding: 12, borderRadius: UI.radius2, background: UI.panel2, border: `1px solid ${UI.line}` }}>
<div style={{ color: UI.mut, fontSize: 12, marginBottom: 6 }}>Latest</div>
<div style={{ fontSize: 22, fontWeight: 950, letterSpacing: -0.4 }}>
{latestLabel || "—"}
</div>

<div style={{ marginTop: 10, color: UI.mut, fontSize: 12 }}>Constraint</div>
<div style={{ marginTop: 6, fontSize: 16, fontWeight: 900 }}>
{stateMode === "game" ? (GAME_MAP[latestLabel] || "—") : nowConstraint}
</div>
</div>

<div style={{ marginTop: 12, color: UI.mut, fontSize: 12, lineHeight: 1.35 }}>
{stateMode === "game"
? "Game mode: every action points to the constraint they should be following."
: "Live mode: Axis watches patterns and surfaces constraints automatically."}
</div>

<div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
<span style={pill(UI)}>{actor}</span>
<span style={pill(UI)}>{stateMode}</span>
</div>
</div>
</div>
</div>
</div>
);
}

function selectStyle(UI) {
return {
width: "100%",
padding: "10px 10px",
borderRadius: 12,
border: `1px solid ${UI.line}`,
background: UI.panel2,
color: UI.text,
outline: "none",
fontWeight: 800,
};
}

function pill(UI) {
return {
padding: "8px 10px",
borderRadius: 999,
background: "rgba(255,255,255,0.06)",
border: `1px solid rgba(255,255,255,0.10)`,
color: UI.text,
fontWeight: 800,
fontSize: 12,
letterSpacing: 0.2,
};
}
