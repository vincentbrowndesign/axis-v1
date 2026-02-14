// src/App.jsx
import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

const UNLOCK_KEY = "axis_key_field_access";

export default function App() {
const [ownerLabel, setOwnerLabel] = useState(localStorage.getItem("axis_owner_label") || "Coach V");
const [wallet, setWallet] = useState(null);
const [tx, setTx] = useState([]);
const [hasKey, setHasKey] = useState(false);
const [busy, setBusy] = useState(false);
const [status, setStatus] = useState("booting...");

const owner = useMemo(() => (ownerLabel || "Coach V").trim(), [ownerLabel]);

// ---------- Helpers ----------
async function ensureWallet(label) {
// 1) Try fetch wallet
const { data: existing, error: e1 } = await supabase
.from("axis_wallets")
.select("*")
.eq("owner_label", label)
.maybeSingle();

if (e1) throw e1;
if (existing) return existing;

// 2) Create wallet
const { data: created, error: e2 } = await supabase
.from("axis_wallets")
.insert([{ owner_label: label }])
.select("*")
.single();

if (e2) throw e2;
return created;
}

async function refreshAll() {
setStatus("syncing...");
const w = await ensureWallet(owner);
setWallet(w);

// check unlock
const { data: unlockRow, error: uerr } = await supabase
.from("axis_user_unlocks")
.select("id")
.eq("owner_label", owner)
.eq("unlock_key", UNLOCK_KEY)
.maybeSingle();

if (uerr) throw uerr;
setHasKey(!!unlockRow);

// transactions
const { data: tdata, error: terr } = await supabase
.from("axis_transactions")
.select("*")
.eq("wallet_id", w.id)
.order("created_at", { ascending: false })
.limit(50);

if (terr) throw terr;
setTx(tdata || []);
setStatus("ready");
}

async function addTx(type, amount, meta = {}) {
if (!wallet) return;
setBusy(true);
try {
const { error } = await supabase.from("axis_transactions").insert([
{
wallet_id: wallet.id,
type,
amount,
meta,
},
]);
if (error) throw error;

// update wallet balance locally by re-fetching wallet
const { data: w2, error: werr } = await supabase.from("axis_wallets").select("*").eq("id", wallet.id).single();
if (werr) throw werr;

setWallet(w2);
await refreshAll();
} finally {
setBusy(false);
}
}

async function unlockFieldAccess() {
setBusy(true);
try {
const { error } = await supabase.from("axis_user_unlocks").insert([
{ owner_label: owner, unlock_key: UNLOCK_KEY }
]);
if (error) throw error;
await refreshAll();
} finally {
setBusy(false);
}
}

function exportIndex() {
// v1: export a clean “identity artifact” from the ledger
const minted = tx.filter(t => t.type === "mint").reduce((a, b) => a + (b.amount || 0), 0);
const burned = tx.filter(t => t.type === "burn").reduce((a, b) => a + (b.amount || 0), 0);

const artifact = {
axis: "AXIS LIVE",
owner_label: owner,
unlocks: { field_access: hasKey },
wallet: wallet,
index: {
signal_minted: minted,
signal_burned: burned,
net_signal: minted - burned,
// Later: Pressure/Recovery/Orientation indices computed from event tags
},
recent_transactions: tx.slice(0, 25),
generated_at: new Date().toISOString(),
};

const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: "application/json" });
const url = URL.createObjectURL(blob);
const a = document.createElement("a");
a.href = url;
a.download = `AXIS_INDEX_${owner.replace(/\s+/g, "_")}.json`;
a.click();
URL.revokeObjectURL(url);
}

// ---------- Boot ----------
useEffect(() => {
(async () => {
try {
localStorage.setItem("axis_owner_label", owner);
await refreshAll();
} catch (e) {
console.error(e);
setStatus("❌ error (check RLS / table names / env vars)");
}
})();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [owner]);

// ---------- UI ----------
return (
<div style={styles.page}>
<div style={styles.panel}>
<div style={styles.brand}>AXIS LIVE</div>
<div style={styles.sub}>portable environment engine</div>

<div style={styles.block}>
<div style={styles.label}>Owner label</div>
<input
value={ownerLabel}
onChange={(e) => setOwnerLabel(e.target.value)}
style={styles.input}
placeholder="Coach V / Hailey / Player 01"
/>
<div style={styles.hint}>This is your identity key for v1. (We can swap to auth later.)</div>
</div>

<div style={styles.block}>
<div style={styles.row}>
<div>
<div style={styles.label}>Wallet</div>
<div style={styles.big}>{wallet ? wallet.balance : "—"} <span style={styles.small}>SIGNAL</span></div>
<div style={styles.hint}>Ledger-based progression.</div>
</div>
<div style={{ textAlign: "right" }}>
<div style={styles.pill}>{status}</div>
<div style={styles.pill2}>{hasKey ? "FIELD ACCESS: ON" : "FIELD ACCESS: LOCKED"}</div>
</div>
</div>

<div style={styles.btnRow}>
<button disabled={busy} style={styles.btnGood} onClick={() => addTx("mint", 1, { reason: "rep_success" })}>
MINT +1
</button>
<button disabled={busy} style={styles.btnBad} onClick={() => addTx("burn", 1, { reason: "rep_fail" })}>
BURN -1
</button>
<button disabled={busy} style={styles.btn} onClick={refreshAll}>
REFRESH
</button>
</div>
</div>

{/* ----- Toll Road ----- */}
<div style={styles.block}>
<div style={styles.label}>Toll Road</div>
<div style={styles.card}>
<div style={styles.cardTitle}>Axis Key: Field Access</div>
<div style={styles.cardText}>
Unlocks <b>Game Mode</b> + <b>Identity Export</b> + <b>Season Progression</b>.
<br />
You don’t pay for logging. You pay for advancement.
</div>

{hasKey ? (
<div style={styles.ok}>Unlocked ✅</div>
) : (
<button disabled={busy} style={styles.btnKey} onClick={unlockFieldAccess}>
UNLOCK FIELD ACCESS
</button>
)}
</div>
</div>

{/* ----- Locked Features ----- */}
<div style={styles.block}>
<div style={styles.label}>Locked Features</div>

<button
disabled={!hasKey || busy}
style={!hasKey ? styles.btnLocked : styles.btn}
onClick={() => alert("Game Mode (v1): active. Next we wire to your live constraint UI.")}
>
GAME MODE {hasKey ? "" : " — REQUIRES AXIS KEY"}
</button>

<button
disabled={!hasKey || busy}
style={!hasKey ? styles.btnLocked : styles.btn}
onClick={exportIndex}
>
EXPORT IDENTITY INDEX {hasKey ? "" : " — REQUIRES AXIS KEY"}
</button>

<div style={styles.hint}>
This is the money-print switch: free value creation, paid value recognition.
</div>
</div>
</div>

<div style={styles.main}>
<div style={styles.mainTitle}>Ledger Feed</div>
<div style={styles.table}>
{tx.length === 0 ? (
<div style={styles.empty}>No transactions yet. Mint/Burn to test.</div>
) : (
tx.map((t) => (
<div key={t.id} style={styles.txRow}>
<div style={styles.txType}>{t.type.toUpperCase()}</div>
<div style={styles.txAmt}>{t.type === "burn" || t.type === "spend" ? `-${t.amount}` : `+${t.amount}`}</div>
<div style={styles.txMeta}>{safeMeta(t.meta)}</div>
<div style={styles.txTime}>{new Date(t.created_at).toLocaleTimeString()}</div>
</div>
))
)}
</div>
</div>
</div>
);
}

function safeMeta(meta) {
try {
if (!meta) return "";
if (typeof meta === "string") return meta;
return JSON.stringify(meta);
} catch {
return "";
}
}

const styles = {
page: { display: "flex", minHeight: "100vh", background: "#070a0f", color: "#d9ff9e", fontFamily: "system-ui" },
panel: { width: 360, padding: 16, borderRight: "1px solid rgba(255,255,255,0.08)", background: "#0b0f14" },
main: { flex: 1, padding: 18 },
brand: { fontSize: 20, letterSpacing: 1, fontWeight: 800 },
sub: { opacity: 0.7, fontSize: 12, marginTop: 4, marginBottom: 14 },
block: { marginBottom: 14, padding: 12, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, background: "#0f1520" },
label: { fontSize: 12, opacity: 0.8, marginBottom: 8, letterSpacing: 0.5 },
input: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "#0b0f14", color: "#d9ff9e" },
hint: { fontSize: 11, opacity: 0.7, marginTop: 8, lineHeight: 1.35 },
row: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" },
big: { fontSize: 26, fontWeight: 800, marginTop: 2 },
small: { fontSize: 11, opacity: 0.75, marginLeft: 6 },
pill: { display: "inline-block", padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.12)", fontSize: 11, opacity: 0.85 },
pill2: { display: "inline-block", marginTop: 6, padding: "6px 10px", borderRadius: 999, border: "1px solid rgba(217,255,158,0.20)", fontSize: 11, color: "#d9ff9e" },
btnRow: { display: "flex", gap: 10, marginTop: 10 },
btn: { flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)", background: "#0b0f14", color: "#d9ff9e", cursor: "pointer" },
btnGood: { flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(0,255,140,0.25)", background: "rgba(0,255,140,0.08)", color: "#d9ff9e", cursor: "pointer" },
btnBad: { flex: 1, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(255,70,70,0.25)", background: "rgba(255,70,70,0.08)", color: "#d9ff9e", cursor: "pointer" },
btnLocked: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px dashed rgba(255,255,255,0.18)", background: "rgba(255,255,255,0.04)", color: "rgba(217,255,158,0.55)", cursor: "not-allowed", marginBottom: 8 },
card: { padding: 12, borderRadius: 12, border: "1px solid rgba(217,255,158,0.18)", background: "rgba(217,255,158,0.06)" },
cardTitle: { fontWeight: 800, letterSpacing: 0.5 },
cardText: { fontSize: 12, opacity: 0.85, marginTop: 6, lineHeight: 1.35 },
btnKey: { width: "100%", marginTop: 10, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(217,255,158,0.35)", background: "rgba(217,255,158,0.14)", color: "#d9ff9e", cursor: "pointer", fontWeight: 700, letterSpacing: 0.5 },
ok: { marginTop: 10, fontSize: 12, fontWeight: 700 },
mainTitle: { fontSize: 16, fontWeight: 800, marginBottom: 10 },
table: { border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, overflow: "hidden", background: "#0b0f14" },
txRow: { display: "grid", gridTemplateColumns: "120px 90px 1fr 120px", gap: 10, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
txType: { fontWeight: 800, letterSpacing: 0.5, opacity: 0.9 },
txAmt: { fontWeight: 800 },
txMeta: { opacity: 0.75, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
txTime: { opacity: 0.6, fontSize: 12, textAlign: "right" },
empty: { padding: 14, opacity: 0.7 },
};