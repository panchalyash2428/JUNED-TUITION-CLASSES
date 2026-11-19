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
const APP_TITLE = "Juned Tuition Classes";   // shown as the bold title of every notification
const ICON_B64 = "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";   // the logo picture shown beside every notification (served at /icon.png)
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

const topicOf = c => "class_" + c.replace(/[^A-Za-z0-9]/g, "_");
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const b64u = s => b64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - s.length % 4) % 4));
const b64uOut = u8 => btoa(String.fromCharCode(...u8)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const RS256 = {name: "RSASSA-PKCS1-v1_5", hash: "SHA-256"};

// Pictures and notification text: the title is always the institute name, the details go in the body.
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
    const here = new URL(req.url);
    if (req.method === "GET" && here.pathname === "/icon.png") return new Response(b64(ICON_B64), {headers: {"content-type": "image/png", "cache-control": "public, max-age=86400"}});
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
        const r = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {method: "POST", headers: {authorization: "Bearer " + at, "content-type": "application/json"}, body: JSON.stringify({message: {topic: topicOf(body.classId), notification: {title: APP_TITLE, body: text ? title + "\n" + text : title}, webpush: {fcm_options: {link: APP_URL}, notification: {icon: here.origin + "/icon.png"}}}})});
        if (!r.ok) return reply({ok: false, error: "Google refused to send", detail: (await r.text()).slice(0, 160)}, 502);
        return reply({ok: true});
      }
      return reply({error: "not found"}, 404);
    } catch (e) {
      return reply({error: "server error", detail: String((e && e.message) || e).slice(0, 100)}, 500);
    }
  }
};
