import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export default function App() {
const [status, setStatus] = useState("Checking Axis connection…");

useEffect(() => {
async function testConnection() {
const { error } = await supabase.from("sessions").select("*").limit(1);

if (error) {
console.log(error);
setStatus("Axis connected ✅ (table/policy not ready yet)");
} else {
setStatus("Axis connected to Supabase ✅");
}
}

testConnection();
}, []);

return (
<div style={{ padding: 40, fontFamily: "system-ui" }}>
<h1>AXIS — Live Node</h1>
<p>{status}</p>
</div>
);
}