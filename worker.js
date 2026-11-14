// JUNAID TUTION CLASSES: push notification sender (Cloudflare Worker, free plan)
//
// The app calls this Worker in two ways:
//   POST /subscribe  a student's phone joins the notification group of their class
//   POST /notify     an admin or teacher sends a notification to one class
// Every call must carry the signed-in user's Firebase login token. The Worker checks it,
// then looks the person up in your database, so students cannot send notifications.
//
// One secret is needed in Cloudflare: SERVICE_ACCOUNT (the Firebase private key file, pasted whole).

const PROJECT_ID = "juned-tuition-classes";
const APP_URL = "https://panchalyash2428.github.io/KIM-ACADEMY-/";
const ALLOWED_ORIGIN = "https://panchalyash2428.github.io";
const CLASSES = ["Class 7", "Class 8", "Class 9", "Class 10", "Class 11 Science", "Class 12 Science"];
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const topicOf = c => "class_" + c.replace(/[^A-Za-z0-9]/g, "_");
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64u = s => b64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4));
const b64uOut = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const RS256 = {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"};

// Check that a Firebase login token is genuine and belongs to this project.
async function verifyIdToken(token) {
  const [h, p, sig] = String(token || "").split(".");
  if (!sig) throw new Error("bad token");
  const header = JSON.parse(dec.decode(b64u(h))), payload = JSON.parse(dec.decode(b64u(p)));
  if (header.alg !== "RS256") throw new Error("bad algorithm");
  const jwks = await (await fetch(JWKS_URL, {cf: {cacheTtl: 3600}})).json();
  const jwk = (jwks.keys || []).find(k => k.kid === header.kid);
  if (!jwk) throw new Error("unknown key");
  const key = await crypto.subtle.importKey("jwk", jwk, RS256, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(sig), enc.encode(h + "." + p));
  if (!ok || payload.aud !== PROJECT_ID || payload.iss !== "https://securetoken.google.com/" + PROJECT_ID || !(payload.exp > Date.now() / 1000) || !payload.sub) throw new Error("invalid token");
  return payload;
}

// Get a short-lived access token for the Firebase service account.
let cached = {token: "", exp: 0};
async function accessToken(env) {
  if (cached.exp > Date.now() + 60000) return cached.token;
  const sa = JSON.parse(env.SERVICE_ACCOUNT), now = Math.floor(Date.now() / 1000);
  const head = b64uOut(enc.encode(JSON.stringify({alg: "RS256", typ: "JWT"})));
  const claim = b64uOut(enc.encode(JSON.stringify({iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600})));
  const key = await crypto.subtle.importKey("pkcs8", b64(sa.private_key.replace(/-----[A-Z ]+-----|\s/g, "")), RS256, false, ["sign"]);
  const sig = b64uOut(new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(head + "." + claim))));
  const r = await fetch("https://oauth2.googleapis.com/token", {method: "POST", headers: {"content-type": "application/x-www-form-urlencoded"}, body: new URLSearchParams({grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + claim + "." + sig})});
  const d = await r.json();
  if (!d.access_token) throw new Error("service account sign-in failed");
  cached = {token: d.access_token, exp: Date.now() + d.expires_in * 1000};
  return cached.token;
}

// Read the person's role, status and class from the database (never trust the phone for this).
async function profile(uid, at) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/users/${uid}`, {headers: {authorization: "Bearer " + at}});
  if (!r.ok) return null;
  const f = (await r.json()).fields || {}, g = k => f[k] && f[k].stringValue;
  return {role: g("role"), status: g("status"), classId: g("classId")};
}

export default {
  async fetch(req, env) {
    const cors = {"access-control-allow-origin": ALLOWED_ORIGIN, "access-control-allow-headers": "authorization, content-type", "access-control-allow-methods": "POST, OPTIONS", vary: "origin"};
    const reply = (o, s = 200) => new Response(JSON.stringify(o), {status: s, headers: {"content-type": "application/json", ...cors}});
    if (req.method === "OPTIONS") return new Response(null, {status: 204, headers: cors});
    if (req.method !== "POST") return reply({error: "POST only"}, 405);
    if (req.headers.get("origin") !== ALLOWED_ORIGIN) return reply({error: "origin not allowed"}, 403);

    let user, body;
    try { user = await verifyIdToken((req.headers.get("authorization") || "").replace(/^Bearer /, "")); } catch (e) { return reply({error: "not signed in"}, 401); }
    try { body = await req.json(); } catch (e) { return reply({error: "bad request"}, 400); }

    try {
      const at = await accessToken(env), me = await profile(user.sub, at), path = new URL(req.url).pathname;
      if (!me || me.status !== "approved") return reply({error: "not approved"}, 403);

      if (path === "/subscribe") {
        const tok = String(body.token || "");
        if (me.role === "admin" || me.role === "teacher") return reply({ok: true, skipped: "staff have no class group"});
        if (tok.length < 50 || tok.length > 4096 || !CLASSES.includes(me.classId)) return reply({error: "bad token or class"}, 400);
        const iid = (op, topic) => fetch("https://iid.googleapis.com/iid/v1:" + op, {method: "POST", headers: {authorization: "Bearer " + at, access_token_auth: "true", "content-type": "application/json"}, body: JSON.stringify({to: "/topics/" + topic, registration_tokens: [tok]})});
        const add = await iid("batchAdd", topicOf(me.classId));
        await Promise.allSettled(CLASSES.filter(c => c !== me.classId).map(c => iid("batchRemove", topicOf(c))));
        if (!add.ok) return reply({ok: false, error: "Google refused to subscribe this phone", detail: (await add.text()).slice(0, 160)}, 502);
        return reply({ok: true, topic: topicOf(me.classId)});
      }

      if (path === "/notify") {
        if (me.role !== "admin" && me.role !== "teacher") return reply({error: "staff only"}, 403);
        const title = String(body.title || "").trim().slice(0, 80), text = String(body.body || "").trim().slice(0, 180);
        if (!CLASSES.includes(body.classId) || !title) return reply({error: "bad class or title"}, 400);
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {method: "POST", headers: {authorization: "Bearer " + at, "content-type": "application/json"}, body: JSON.stringify({message: {topic: topicOf(body.classId), notification: {title, body: text}, webpush: {fcm_options: {link: APP_URL}}}})});
        if (!r.ok) return reply({ok: false, error: "Google refused to send", detail: (await r.text()).slice(0, 160)}, 502);
        return reply({ok: true});
      }
      return reply({error: "not found"}, 404);
    } catch (e) {
      return reply({error: "server error", detail: String((e && e.message) || e).slice(0, 100)}, 500);
    }
  }
};
