import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "./supabaseClient";

// --------------------
// v1 Templates (10)
// --------------------
const TEMPLATES = [
{
id: "FIN_1_LIVE_CONTACT_WINDOW",
name: "Finishing — Live Contact Window (1v1)",
goal: "Finishing",
stage: "Skill",
format: "1v1",
knobs: { dribbleLimit: 2, clockSec: 8 },
scoring: ["+2 rim finish", "+1 foul drawn", "-1 forced fade/floater"],
cues: ["Read chest contact", "Find rim line", "Absorb then extend"],
outcomes: ["rim", "foul", "to", "paint"],
tags: ["left_hand", "right_hand", "contact", "no_contact", "help_early", "help_late"],
},
{
id: "SHOT_1_RIM_3_ECONOMY",
name: "Shot Selection — Rim/3 Economy (3v3)",
goal: "Shot Selection",
stage: "Control",
format: "3v3",
knobs: { clockSec: 8 },
scoring: ["+2 rim/3", "0 mid", "-2 turnover"],
cues: ["See rim/3 first", "Paint touch creates gravity", "Kickout if help commits"],
outcomes: ["rim", "kickout", "to", "paint"],
tags: ["paint_touch", "one_more", "late_clock", "early_clock"],
},
{
id: "PASS_1_TOUCH_PAINT_KICK",
name: "Passing — Touch Paint then Kick (2v2)",
goal: "Passing",
stage: "Control",
format: "2v2",
knobs: { must: "paint_touch", dribbleLimit: 3 },
scoring: ["+2 assisted score", "+1 advantage pass", "-1 dead pass"],
cues: ["Help shows → kick", "No help → finish", "Skip if stunt"],
outcomes: ["kickout", "rim", "to", "paint"],
tags: ["skip", "stunt", "help_early", "help_late", "one_more"],
},
{
id: "SPACE_1_CORNERS_STAY",
name: "Spacing — Corners Stay (3v3)",
goal: "Spacing",
stage: "Coordination",
format: "3v3",
knobs: { rule: "corners_locked" },
scoring: ["+2 paint touch + outlet", "+1 wide drive", "-2 crowd"],
cues: ["Drive to daylight", "Corner lifts only on baseline drift cue"],
outcomes: ["paint", "kickout", "to", "rim"],
tags: ["crowd", "baseline_drive", "drift", "lift"],
},
{
id: "DEF_1_NO_REACH_CHEST_UP",
name: "Defense — No Reach, Chest Up (1v1)",
goal: "Defense",
stage: "Coordination",
format: "1v1",
knobs: { defenseRule: "no_reach_2sec" },
scoring: ["+2 stop", "+1 contest", "-2 foul"],
cues: ["Slide not lunge", "Contain line", "Hands high late"],
outcomes: ["stop", "foul", "to", "rim"],
tags: ["beat_left", "beat_right", "cutoff", "contest"],
},
{
id: "HELP_1_TAG_AND_RECOVER",
name: "Help — Tag & Recover (3v3)",
goal: "Help Timing",
stage: "Skill",
format: "3v3",
knobs: { rule: "tag_then_recover" },
scoring: ["+2 stop on drive", "+1 forced kickout", "-2 open 3"],
cues: ["Show body early", "Recover on pass", "No ball watching"],
outcomes: ["stop", "kickout", "rim", "to"],
tags: ["help_early", "help_late", "xout", "ball_watch"],
},
{
id: "DEC_1_TWO_BEATS_DECISION",
name: "Decision Speed — Two Beats (2v2)",
goal: "Decision Speed",
stage: "Control",
format: "2v2",
knobs: { rule: "decide_in_2_beats" },
scoring: ["+2 advantage created", "+1 quick swing", "-2 stalled"],
cues: ["Catch-read-go", "If stuck: swing"],
outcomes: ["kickout", "paint", "to", "rim"],
tags: ["quick_decision", "stalled", "one_more"],
},
{
id: "BALL_1_NO_DRIBBLE_PIVOT_ONLY",
name: "Ball Skill — Pivot Only (1v1)",
goal: "Ball Skill",
stage: "Coordination",
format: "1v1",
knobs: { dribbleLimit: 0 },
scoring: ["+2 score", "+1 drawn foul", "-2 travel/turnover"],
cues: ["Protect ball", "See defender hips", "Sell shot to open step"],
outcomes: ["rim", "foul", "to", "stop"],
tags: ["shot_fake", "rip", "step_through", "travel"],
},
{
id: "TRANS_1_ADVANTAGE_SPRINT",
name: "Transition — Advantage Sprint (3v2)",
goal: "Transition",
stage: "Skill",
format: "3v2",
knobs: { rule: "score_in_6sec", clockSec: 6 },
scoring: ["+2 rim", "+1 corner 3", "-2 forced shot"],
cues: ["Wide lanes", "Middle draws help", "One more to corner"],
outcomes: ["rim", "kickout", "to", "paint"],
tags: ["wide_run", "middle_push", "one_more", "forced"],
},
{
id: "REBOUND_1_HIT_FIND_GET",
name: "Rebounding — Hit, Find, Get (2v2)",
goal: "Rebounding",
stage: "Control",
format: "2v2",
knobs: { rule: "hit_find_get" },
scoring: ["+2 OREB", "+1 boxout", "-2 give up OREB"],
cues: ["Contact first", "Find with eyes", "Pursue with two hands"],
outcomes: ["oreb", "boxout", "gave_up", "to"],
tags: ["hit", "late_hit", "two_hands", "ball_watch"],
},
];

const OUTCOME_LABELS = {
rim: "Rim",
paint: "Paint",
kickout: "Kickout",
foul: "Foul",
to: "Turnover",
stop: "Stop",
oreb: "O-REB",
boxout: "Boxout",
gave_up: "Gave Up",
};

const TEAMS = ["10U", "2033", "2031", "2029G"];

function cx(...classes) {
return classes.filter(Boolean).join(" ");
}

// --------------------
// Over-constraint engine
// --------------------
function analyzeOverConstraint(events) {
// events: array of { outcome, tags: [] }
const n = events.length;
if (n < 10) return { status: "ok", flags: [], suggestions: [] };

const outcomeCounts = {};
const tagCounts = {};
for (const e of events) {
outcomeCounts[e.outcome] = (outcomeCounts[e.outcome] || 0) + 1;
const tags = Array.isArray(e.tags) ? e.tags : [];
for (const t of tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
}

const topOutcome = Object.entries(outcomeCounts).sort((a, b) => b[1] - a[1])[0];
const topOutcomeShare = topOutcome ? topOutcome[1] / n : 0;

const distinctTags = Object.keys(tagCounts).length;
const tagEntropyProxy = distinctTags / Math.max(1, n); // rough

const flags = [];
const suggestions = [];

if (topOutcomeShare >= 0.8) {
flags.push(`Outcome collapse: "${topOutcome[0]}" is ${(topOutcomeShare * 100).toFixed(0)}% of reps.`);
suggestions.push("Widen variability: change start spot, defender rule, or remove one restriction.");
} else if (topOutcomeShare >= 0.7) {
flags.push(`Narrow outcomes: "${topOutcome[0]}" is ${(topOutcomeShare * 100).toFixed(0)}% of reps.`);
suggestions.push("Add a new cue: vary defender behavior or add a clock/scoring twist.");
}

if (tagEntropyProxy < 0.12) {
flags.push("Tag diversity is low (same look repeating).");
suggestions.push("Introduce a second constraint knob (space or time) instead of more rules.");
}

const status = flags.length ? "warn" : "ok";
return { status, flags, suggestions };
}

// --------------------
// App
// --------------------
export default function App() {
const [teamLabel, setTeamLabel] = useState("10U");

const [players, setPlayers] = useState([]); // {id,label}
const [focusPlayerId, setFocusPlayerId] = useState(""); // "" means none

const [templateId, setTemplateId] = useState(TEMPLATES[0].id);

const [activeRun, setActiveRun] = useState(null); // {id, created_at, ...}
const [repNumber, setRepNumber] = useState(1);

const [selectedTags, setSelectedTags] = useState([]);
const [lastSavedEvent, setLastSavedEvent] = useState(null);

const [view, setView] = useState("build"); // build | run | review
const [loading, setLoading] = useState(false);

const [reviewEventsTeam, setReviewEventsTeam] = useState([]);
const [reviewEventsPlayer, setReviewEventsPlayer] = useState([]);

const template = useMemo(
() => TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0],
[templateId]
);

// Load players for team
useEffect(() => {
(async () => {
setLoading(true);
const { data, error } = await supabase
.from("players")
.select("id,label,team_label")
.eq("team_label", teamLabel)
.order("label", { ascending: true });

if (error) {
console.error(error);
} else {
setPlayers(data || []);
}
setFocusPlayerId("");
setLoading(false);
})();
}, [teamLabel]);

const focusPlayer = useMemo(
() => players.find((p) => p.id === focusPlayerId) || null,
[players, focusPlayerId]
);

const tagsForTemplate = template.tags || [];

function toggleTag(tag) {
setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
}

async function startRun() {
setLoading(true);
setLastSavedEvent(null);
setSelectedTags([]);
setRepNumber(1);

const payload = {
team_label: teamLabel,
template_id: template.id,
focus_player_id: focusPlayerId || null,
operator: "coach",
notes: null,
};

const { data, error } = await supabase.from("runs").insert([payload]).select("*").single();
if (error) {
console.error(error);
alert("Error starting run. Check Supabase tables + RLS.");
setLoading(false);
return;
}

setActiveRun(data);
setView("run");
setLoading(false);
}

async function endRun() {
setActiveRun(null);
setRepNumber(1);
setSelectedTags([]);
setLastSavedEvent(null);
setView("review");
await refreshReview();
}

async function logRep(outcome) {
if (!activeRun?.id) return;

const eventPayload = {
run_id: activeRun.id,
rep_number: repNumber,
template_id: template.id,
focus_player_id: focusPlayerId || null,
outcome,
tags: selectedTags,
note: null,
};

setLoading(true);
const { data, error } = await supabase.from("rep_events").insert([eventPayload]).select("*").single();

if (error) {
console.error(error);
alert("Error logging rep. Check table + RLS.");
setLoading(false);
return;
}

setLastSavedEvent(data);
setRepNumber((n) => n + 1);
setSelectedTags([]);
setLoading(false);
}

async function undoLastRep() {
if (!lastSavedEvent?.id) return;
setLoading(true);
const { error } = await supabase.from("rep_events").delete().eq("id", lastSavedEvent.id);
if (error) {
console.error(error);
alert("Undo failed.");
setLoading(false);
return;
}
setRepNumber((n) => Math.max(1, n - 1));
setLastSavedEvent(null);
setLoading(false);
}

async function refreshReview() {
setLoading(true);

// Team view: by team + template, last 200 reps
const { data: teamData, error: teamErr } = await supabase
.from("rep_events")
.select("outcome,tags,created_at,focus_player_id,template_id")
.eq("template_id", template.id)
.order("created_at", { ascending: false })
.limit(200);

if (teamErr) console.error(teamErr);
setReviewEventsTeam(teamData || []);

// Focus Player view: filter if selected
if (focusPlayerId) {
const { data: pData, error: pErr } = await supabase
.from("rep_events")
.select("outcome,tags,created_at,focus_player_id,template_id")
.eq("template_id", template.id)
.eq("focus_player_id", focusPlayerId)
.order("created_at", { ascending: false })
.limit(200);

if (pErr) console.error(pErr);
setReviewEventsPlayer(pData || []);
} else {
setReviewEventsPlayer([]);
}

setLoading(false);
}

useEffect(() => {
if (view === "review") refreshReview();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [view, templateId, focusPlayerId, teamLabel]);

// --------------------
// Aggregation helpers
// --------------------
function summarize(events) {
const outcomeCounts = {};
const tagCounts = {};
for (const e of events) {
outcomeCounts[e.outcome] = (outcomeCounts[e.outcome] || 0) + 1;
const tags = Array.isArray(e.tags) ? e.tags : [];
for (const t of tags) tagCounts[t] = (tagCounts[t] || 0) + 1;
}
const outcomeList = Object.entries(outcomeCounts).sort((a, b) => b[1] - a[1]);
const tagList = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]);
return { outcomeList, tagList, total: events.length };
}

const teamSummary = useMemo(() => summarize(reviewEventsTeam), [reviewEventsTeam]);
const playerSummary = useMemo(() => summarize(reviewEventsPlayer), [reviewEventsPlayer]);

const teamHealth = useMemo(() => analyzeOverConstraint(reviewEventsTeam), [reviewEventsTeam]);
const playerHealth = useMemo(() => analyzeOverConstraint(reviewEventsPlayer), [reviewEventsPlayer]);

// --------------------
// UI
// --------------------
return (
<div className="min-h-screen bg-black text-zinc-100">
<div className="max-w-5xl mx-auto p-4 sm:p-6">
<Header
view={view}
setView={setView}
loading={loading}
activeRun={activeRun}
onRefresh={refreshReview}
/>

<div className="mt-4 grid gap-4">
<Card>
<div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
<div className="flex flex-wrap items-center gap-2">
<Pill label="Team" />
<Select value={teamLabel} onChange={(e) => setTeamLabel(e.target.value)}>
{TEAMS.map((t) => (
<option key={t} value={t}>
{t}
</option>
))}
</Select>

<Pill label="Template" />
<Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
{TEMPLATES.map((t) => (
<option key={t.id} value={t.id}>
{t.name}
</option>
))}
</Select>

<Pill label="Focus Player" />
<Select value={focusPlayerId} onChange={(e) => setFocusPlayerId(e.target.value)}>
<option value="">None</option>
{players.map((p) => (
<option key={p.id} value={p.id}>
{p.label}
</option>
))}
</Select>
</div>

<div className="flex gap-2">
{view !== "build" && (
<Button onClick={() => setView("build")} variant="ghost">
Build
</Button>
)}
{view !== "run" && activeRun && (
<Button onClick={() => setView("run")} variant="ghost">
Run
</Button>
)}
{view !== "review" && (
<Button onClick={() => setView("review")} variant="ghost">
Review
</Button>
)}
</div>
</div>
</Card>

{view === "build" && (
<BuildPanel
template={template}
focusPlayer={focusPlayer}
loading={loading}
onStart={startRun}
activeRun={activeRun}
setView={setView}
/>
)}

{view === "run" && (
<RunPanel
template={template}
focusPlayer={focusPlayer}
activeRun={activeRun}
repNumber={repNumber}
selectedTags={selectedTags}
tagsForTemplate={tagsForTemplate}
onToggleTag={toggleTag}
onLog={logRep}
onUndo={undoLastRep}
onEnd={endRun}
loading={loading}
/>
)}

{view === "review" && (
<ReviewPanel
template={template}
focusPlayer={focusPlayer}
teamSummary={teamSummary}
playerSummary={playerSummary}
teamHealth={teamHealth}
playerHealth={playerHealth}
loading={loading}
onRefresh={refreshReview}
/>
)}

<Footer />
</div>
</div>

{/* Tailwind-like minimal CSS without Tailwind */}
<style>{baseCss}</style>
</div>
);
}

// --------------------
// Components
// --------------------
function Header({ view, setView, loading, activeRun, onRefresh }) {
return (
<div className="flex items-center justify-between gap-3">
<div>
<div className="text-xl sm:text-2xl font-semibold tracking-tight">Axis Constraint Lab</div>
<div className="text-zinc-400 text-sm">
Build → Run → Review • Team + Focus Player (P1–P12)
</div>
</div>

<div className="flex items-center gap-2">
{view === "review" && (
<Button onClick={onRefresh} variant="ghost" disabled={loading}>
Refresh
</Button>
)}
{activeRun ? (
<span className="text-xs px-2 py-1 rounded-full bg-zinc-900 border border-zinc-800">
Run Live
</span>
) : (
<span className="text-xs px-2 py-1 rounded-full bg-zinc-950 border border-zinc-900 text-zinc-500">
No Run
</span>
)}
</div>
</div>
);
}

function BuildPanel({ template, focusPlayer, loading, onStart, activeRun, setView }) {
return (
<Card>
<div className="grid gap-4">
<div className="flex items-start justify-between gap-4">
<div>
<div className="text-lg font-semibold">{template.name}</div>
<div className="text-sm text-zinc-400 mt-1">
Goal: {template.goal} • Stage: {template.stage} • Format: {template.format}
</div>
</div>

<div className="text-right">
<div className="text-xs text-zinc-500">Focus Player</div>
<div className="text-sm">{focusPlayer ? focusPlayer.label : "None"}</div>
</div>
</div>

<div className="grid sm:grid-cols-3 gap-3">
<MiniBlock title="Knobs">
<ul className="text-sm text-zinc-300 list-disc pl-4">
{Object.entries(template.knobs || {}).map(([k, v]) => (
<li key={k}>
{k}: <span className="text-zinc-100">{String(v)}</span>
</li>
))}
</ul>
</MiniBlock>
<MiniBlock title="Scoring">
<ul className="text-sm text-zinc-300 list-disc pl-4">
{(template.scoring || []).map((s) => (
<li key={s}>{s}</li>
))}
</ul>
</MiniBlock>
<MiniBlock title="Cues">
<ul className="text-sm text-zinc-300 list-disc pl-4">
{(template.cues || []).map((c) => (
<li key={c}>{c}</li>
))}
</ul>
</MiniBlock>
</div>

<div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
<div className="text-sm text-zinc-500">
Start a run to log reps. Keep it fast. Don’t over-talk.
</div>

<div className="flex gap-2">
{activeRun ? (
<Button onClick={() => setView("run")} variant="primary">
Go to Run
</Button>
) : (
<Button onClick={onStart} variant="primary" disabled={loading}>
Start Run
</Button>
)}
</div>
</div>
</div>
</Card>
);
}

function RunPanel({
template,
focusPlayer,
activeRun,
repNumber,
selectedTags,
tagsForTemplate,
onToggleTag,
onLog,
onUndo,
onEnd,
loading,
}) {
if (!activeRun) {
return (
<Card>
<div className="text-zinc-400">No active run. Go to Build → Start Run.</div>
</Card>
);
}

const outcomes = template.outcomes || ["rim", "paint", "kickout", "to", "foul"];

return (
<Card>
<div className="grid gap-4">
<div className="flex items-start justify-between gap-4">
<div>
<div className="text-lg font-semibold">{template.name}</div>
<div className="text-sm text-zinc-400 mt-1">
Rep <span className="text-zinc-100 font-semibold">#{repNumber}</span> • Focus:{" "}
<span className="text-zinc-100 font-semibold">{focusPlayer ? focusPlayer.label : "None"}</span>
</div>
</div>

<div className="flex gap-2">
<Button onClick={onUndo} variant="ghost" disabled={loading}>
Undo
</Button>
<Button onClick={onEnd} variant="danger" disabled={loading}>
End Run
</Button>
</div>
</div>

<MiniBlock title="Quick Tags">
<div className="flex flex-wrap gap-2">
{tagsForTemplate.map((tag) => (
<TagPill
key={tag}
active={selectedTags.includes(tag)}
onClick={() => onToggleTag(tag)}
label={tag}
/>
))}
</div>
</MiniBlock>

<MiniBlock title="Log Outcome">
<div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
{outcomes.map((o) => (
<Button key={o} onClick={() => onLog(o)} variant="primary" disabled={loading}>
{OUTCOME_LABELS[o] || o}
</Button>
))}
</div>
<div className="text-xs text-zinc-500 mt-2">
Tip: tags first → outcome tap → auto clears tags.
</div>
</MiniBlock>
</div>
</Card>
);
}

function ReviewPanel({
template,
focusPlayer,
teamSummary,
playerSummary,
teamHealth,
playerHealth,
loading,
onRefresh,
}) {
return (
<Card>
<div className="grid gap-4">
<div className="flex items-start justify-between gap-3">
<div>
<div className="text-lg font-semibold">Review — {template.name}</div>
<div className="text-sm text-zinc-400 mt-1">
Team + Focus Player breakdown • last 200 reps (by template)
</div>
</div>

<Button onClick={onRefresh} variant="ghost" disabled={loading}>
Refresh
</Button>
</div>

<div className="grid md:grid-cols-2 gap-3">
<ReviewBlock
title="Team View"
total={teamSummary.total}
outcomeList={teamSummary.outcomeList}
tagList={teamSummary.tagList}
health={teamHealth}
/>
<ReviewBlock
title={`Focus Player View — ${focusPlayer ? focusPlayer.label : "None"}`}
total={playerSummary.total}
outcomeList={playerSummary.outcomeList}
tagList={playerSummary.tagList}
health={playerHealth}
disabled={!focusPlayer}
/>
</div>
</div>
</Card>
);
}

function ReviewBlock({ title, total, outcomeList, tagList, health, disabled }) {
return (
<MiniBlock title={title} disabled={disabled}>
<div className={cx(disabled && "opacity-50")}>
<div className="text-sm text-zinc-400">Total reps: <span className="text-zinc-100">{total}</span></div>

<div className="mt-3 grid gap-2">
<div className="text-xs uppercase tracking-wide text-zinc-500">Outcomes</div>
{outcomeList.length === 0 ? (
<div className="text-sm text-zinc-500">No data yet.</div>
) : (
<ul className="text-sm">
{outcomeList.slice(0, 6).map(([k, v]) => (
<li key={k} className="flex justify-between border-b border-zinc-900 py-1">
<span>{OUTCOME_LABELS[k] || k}</span>
<span className="text-zinc-300">{v}</span>
</li>
))}
</ul>
)}
</div>

<div className="mt-3 grid gap-2">
<div className="text-xs uppercase tracking-wide text-zinc-500">Top Tags</div>
{tagList.length === 0 ? (
<div className="text-sm text-zinc-500">No tags yet.</div>
) : (
<div className="flex flex-wrap gap-2">
{tagList.slice(0, 10).map(([k, v]) => (
<span key={k} className="text-xs px-2 py-1 rounded-full bg-zinc-950 border border-zinc-900">
{k} • {v}
</span>
))}
</div>
)}
</div>

<div className="mt-3 grid gap-2">
<div className="text-xs uppercase tracking-wide text-zinc-500">Constraint Health</div>
{total < 10 ? (
<div className="text-sm text-zinc-500">Need 10+ reps to analyze.</div>
) : health.status === "ok" ? (
<div className="text-sm text-zinc-300">Stable. Keep pressure + variability.</div>
) : (
<div className="grid gap-2">
<div className="text-sm text-zinc-100">Warnings</div>
<ul className="text-sm text-zinc-300 list-disc pl-5">
{health.flags.map((f) => (
<li key={f}>{f}</li>
))}
</ul>
<div className="text-sm text-zinc-100">Next tweak</div>
<ul className="text-sm text-zinc-300 list-disc pl-5">
{health.suggestions.map((s) => (
<li key={s}>{s}</li>
))}
</ul>
</div>
)}
</div>
</div>
</MiniBlock>
);
}

function Footer() {
return (
<div className="text-xs text-zinc-600 pt-2">
v1: Templates hardcoded • Runs + Rep Events stored in Supabase • Team + Focus Player mode
</div>
);
}

// --------------------
// UI Primitives
// --------------------
function Card({ children }) {
return (
<div className="rounded-2xl border border-zinc-900 bg-zinc-950/60 shadow-sm p-4 sm:p-5">
{children}
</div>
);
}

function MiniBlock({ title, children, disabled }) {
return (
<div className={cx("rounded-xl border border-zinc-900 bg-black/40 p-3", disabled && "opacity-70")}>
<div className="text-xs uppercase tracking-wide text-zinc-500">{title}</div>
<div className="mt-2">{children}</div>
</div>
);
}

function Pill({ label }) {
return <span className="text-xs px-2 py-1 rounded-full bg-zinc-950 border border-zinc-900">{label}</span>;
}

function Select({ value, onChange, children }) {
return (
<select
value={value}
onChange={onChange}
className="bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-sm outline-none"
>
{children}
</select>
);
}

function Button({ children, onClick, variant = "primary", disabled }) {
const base =
"rounded-xl px-4 py-2 text-sm font-semibold border transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed";
const styles =
variant === "primary"
? "bg-zinc-100 text-black border-zinc-200"
: variant === "danger"
? "bg-red-600 text-white border-red-700"
: "bg-zinc-950 text-zinc-100 border-zinc-800";
return (
<button className={cx(base, styles)} onClick={onClick} disabled={disabled}>
{children}
</button>
);
}

function TagPill({ label, active, onClick }) {
return (
<button
onClick={onClick}
className={cx(
"text-xs px-3 py-2 rounded-full border transition",
active ? "bg-zinc-100 text-black border-zinc-200" : "bg-zinc-950 text-zinc-200 border-zinc-800"
)}
>
{label}
</button>
);
}

// --------------------
// Minimal base CSS (no Tailwind needed)
// --------------------
const baseCss = `
:root { color-scheme: dark; }
* { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; }
.shadow-sm { box-shadow: 0 8px 24px rgba(0,0,0,0.25); }
.max-w-5xl { max-width: 64rem; }
.mx-auto { margin-left: auto; margin-right: auto; }
.p-4 { padding: 1rem; }
.p-6 { padding: 1.5rem; }
.sm\\:p-6 { }
.mt-4 { margin-top: 1rem; }
.pt-2 { padding-top: .5rem; }
.grid { display: grid; }
.gap-2 { gap: .5rem; }
.gap-3 { gap: .75rem; }
.gap-4 { gap: 1rem; }
.text-xs { font-size: .75rem; }
.text-sm { font-size: .875rem; }
.text-lg { font-size: 1.125rem; }
.text-xl { font-size: 1.25rem; }
.sm\\:text-2xl { }
.font-semibold { font-weight: 600; }
.tracking-tight { letter-spacing: -0.02em; }
.tracking-wide { letter-spacing: 0.08em; }
.uppercase { text-transform: uppercase; }
.rounded-full { border-radius: 9999px; }
.rounded-xl { border-radius: 1rem; }
.rounded-2xl { border-radius: 1.25rem; }
.border { border-width: 1px; border-style: solid; }
.list-disc { list-style-type: disc; }
.pl-4 { padding-left: 1rem; }
.pl-5 { padding-left: 1.25rem; }
.text-right { text-align: right; }
.flex { display: flex; }
.flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.justify-between { justify-content: space-between; }
.text-zinc-100 { color: #f4f4f5; }
.text-zinc-200 { color: #e4e4e7; }
.text-zinc-300 { color: #d4d4d8; }
.text-zinc-400 { color: #a1a1aa; }
.text-zinc-500 { color: #71717a; }
.text-zinc-600 { color: #52525b; }
.bg-black { background: #000; }
.bg-zinc-950 { background: #09090b; }
.bg-zinc-950\\/60 { background: rgba(9,9,11,.6); }
.bg-black\\/40 { background: rgba(0,0,0,.4); }
.border-zinc-900 { border-color: #18181b; }
.border-zinc-800 { border-color: #27272a; }
.border-zinc-200 { border-color: #e4e4e7; }
.min-h-screen { min-height: 100vh; }
.opacity-50 { opacity: .5; }
.opacity-70 { opacity: .7; }
.opacity-80 { opacity: .8; }
.disabled\\:opacity-50:disabled { opacity: .5; }
.disabled\\:cursor-not-allowed:disabled { cursor: not-allowed; }
.transition { transition: all .15s ease; }
.active\\:scale-\$begin:math:display$0\\\\\.99\\$end:math:display$:active { transform: scale(.99); }
.grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.sm\\:grid-cols-3 { }
.sm\\:grid-cols-5 { }
.md\\:grid-cols-2 { }
@media (min-width: 640px){
.sm\\:p-6 { padding: 1.5rem; }
.sm\\:text-2xl { font-size: 1.5rem; }
.sm\\:flex-row { flex-direction: row; }
.sm\\:items-center { align-items: center; }
.sm\\:justify-between { justify-content: space-between; }
.sm\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.sm\\:grid-cols-5 { grid-template-columns: repeat(5, minmax(0, 1fr)); }
}
@media (min-width: 768px){
.md\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;

/* eslint-disable no-unused-vars */