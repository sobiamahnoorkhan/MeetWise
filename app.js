const app = document.getElementById("app");
const API = (localStorage.getItem("meetwise_api") || "https://meetwise-backend.vercel.app/api").replace(/\/$/, "");
const S = {
  token: localStorage.getItem("meetwise_token"),
  user: JSON.parse(localStorage.getItem("meetwise_user") || "null"),
  meetup: null,
  memberId: localStorage.getItem("meetwise_member")
};
const $ = id => document.getElementById(id);
const esc = x => String(x ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

async function api(path, opts = {}) {
  const headers = {"Content-Type":"application/json", ...(opts.headers || {})};
  if (S.token) headers.Authorization = "Bearer " + S.token;
  const r = await fetch(API + path, {...opts, headers});
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Request failed");
  return d;
}

function saveAuth(d) {
  S.token = d.token;
  S.user = d.user;
  localStorage.setItem("meetwise_token", d.token);
  localStorage.setItem("meetwise_user", JSON.stringify(d.user));
}

function auth() {
  app.innerHTML = '<main class="shell"><div class="brand">MeetWise AI</div><div class="grid"><section class="card"><h1>Plan together. Smarter.</h1><p class="muted">AI-powered group meetup planning.</p><input id="sn" placeholder="Name"><input id="se" placeholder="Email"><input id="sp" type="password" placeholder="Password (8+ characters)"><button id="signup">Create account</button></section><section class="card"><h2>Log in</h2><input id="le" placeholder="Email"><input id="lp" type="password" placeholder="Password"><button id="login">Log in</button><p id="msg"></p></section></div></main>';
  $("signup").onclick = signup;
  $("login").onclick = login;
}

async function signup() {
  try {
    saveAuth(await api("/auth/signup", {method:"POST", body:JSON.stringify({name:$("sn").value,email:$("se").value,password:$("sp").value})}));
    home();
  } catch (e) { $("msg").textContent = e.message; }
}

async function login() {
  try {
    saveAuth(await api("/auth/login", {method:"POST", body:JSON.stringify({email:$("le").value,password:$("lp").value})}));
    home();
  } catch (e) { $("msg").textContent = e.message; }
}

function home() {
  app.innerHTML = '<main class="shell"><div class="nav"><b class="brand">MeetWise AI</b><button id="logout" class="secondary" style="width:auto">Log out</button></div><div class="grid"><section class="card"><h2>Create meetup</h2><input id="title" placeholder="Saturday evening meetup"><button id="create">Create & invite</button></section><section class="card"><h2>Join meetup</h2><input id="code" placeholder="Invite code"><input id="joinName" placeholder="Your name"><button id="join">Join</button></section></div></main>';
  $("logout").onclick = logout;
  $("create").onclick = createMeetup;
  $("join").onclick = joinMeetup;
}

async function createMeetup() {
  try {
    S.meetup = await api("/meetups", {method:"POST", body:JSON.stringify({title:$("title").value || "Group meetup", organizerName:S.user.name})});
    S.memberId = S.meetup.organizerId;
    localStorage.setItem("meetwise_member", S.memberId);
    dashboard();
  } catch (e) { alert(e.message); }
}

async function joinMeetup() {
  try {
    const found = await api("/meetups/code/" + encodeURIComponent($("code").value));
    const member = await api("/meetups/" + found.id + "/join", {method:"POST", body:JSON.stringify({name:$("joinName").value || S.user.name, inviteCode:found.inviteCode})});
    S.meetup = await api("/meetups/" + found.id);
    S.memberId = member.id;
    localStorage.setItem("meetwise_member", S.memberId);
    dashboard();
  } catch (e) { alert(e.message); }
}

function dashboard() {
  app.innerHTML = '<main class="shell"><div class="nav"><div><b class="brand">MeetWise AI</b><div id="meetupTitle" class="muted"></div></div><span id="invite" class="pill"></span></div><div class="grid"><section class="card"><h3>Members</h3><div id="members"></div><h3>Your preferences</h3><input id="area" placeholder="Area / neighborhood"><select id="transport"><option value="">Transport</option><option value="walking">Walking</option><option value="bike">Bike</option><option value="car">Car</option><option value="public_transport">Public transport</option></select><input id="budget" type="number" placeholder="Budget PKR"><input id="maxTravel" type="number" placeholder="Max travel minutes"><input id="food" placeholder="Food preferences"><input id="activity" placeholder="Activity preferences"><input id="when" type="datetime-local"><button id="savePrefs">Save preferences</button><button id="research" class="secondary">Research live options</button><button id="replan" class="secondary">Re-plan</button><p id="status" class="muted"></p></section><section class="card"><h3>Group chat</h3><div id="chat" class="chat"></div><div class="row"><input id="chatText" placeholder="Message or new constraint"><button id="send" style="max-width:120px">Send</button></div><button id="analyze" class="secondary">AI constraint analysis</button><pre id="ai" style="white-space:pre-wrap"></pre></section></div><section class="card" style="margin-top:18px"><h2>AI Meetup Plan</h2><div id="results" class="emptyState">Save preferences and run research.</div><div id="votes" class="muted"></div></section></main>';
  $("meetupTitle").textContent = S.meetup.title;
  $("invite").innerHTML = "Invite: <b>" + esc(S.meetup.inviteCode) + "</b>";
  $("savePrefs").onclick = savePrefs;
  $("research").onclick = research;
  $("replan").onclick = replan;
  $("send").onclick = sendChat;
  $("analyze").onclick = analyzeChat;
  refresh();
}

async function refresh() {
  try {
    S.meetup = await api("/meetups/" + S.meetup.id);
    renderMembers();
    renderChat();
    fillPrefs();
    voteSummary();
  } catch (e) { if ($("status")) $("status").textContent = e.message; }
}

function renderMembers() {
  $("members").innerHTML = S.meetup.members.map(m => {
    const p = m.preferences || {};
    const ready = !!(p.area || (p.foodPreferences || []).length || (p.activityPreferences || []).length);
    return '<span class="pill ' + (ready ? "pillReady" : "") + '">' + esc(m.name) + (ready ? " ✓" : " · pending") + "</span>";
  }).join("");
}

function renderChat() {
  $("chat").innerHTML = S.meetup.chat.map(x => {
    const m = S.meetup.members.find(v => v.id === x.memberId);
    return '<div class="msg"><b>' + esc(m?.name || "Member") + ":</b> " + esc(x.text) + "</div>";
  }).join("");
}

function fillPrefs() {
  if (!$("area") || !$("transport") || !$("budget") || !$("maxTravel") || !$("food") || !$("activity") || !$("when")) return;
  const m = S.meetup?.members?.find(v => v.id === S.memberId);
  if (!m) return;
  const p = m.preferences || {};
  $("area").value = p.area || "";
  $("transport").value = p.transportMode || "";
  $("budget").value = p.budget ?? "";
  $("maxTravel").value = p.maxTravelMinutes ?? "";
  $("food").value = (p.foodPreferences || []).join(", ");
  $("activity").value = (p.activityPreferences || []).join(", ");
  $("when").value = p.availableFrom || "";
}

async function savePrefs() {
  try {
    $("status").textContent = "Saving...";
    const p = {
      area: $("area").value.trim(),
      transportMode: $("transport").value || undefined,
      budget: Number($("budget").value) || undefined,
      maxTravelMinutes: Number($("maxTravel").value) || undefined,
      foodPreferences: $("food").value.split(",").map(x => x.trim()).filter(Boolean),
      activityPreferences: $("activity").value.split(",").map(x => x.trim()).filter(Boolean),
      availableFrom: $("when").value || undefined
    };
    await api("/meetups/" + S.meetup.id + "/members/" + S.memberId + "/preferences", {method:"PATCH", body:JSON.stringify(p)});
    await refresh();
    $("status").textContent = "Preferences saved.";
  } catch (e) { $("status").textContent = e.message; }
}

async function research() {
  try {
    $("status").textContent = "Researching live places, travel and weather...";
    $("results").innerHTML = '<div class="loading">Researching...</div>';
    const d = await api("/live/meetups/" + S.meetup.id + "/plan", {method:"POST", body:JSON.stringify({when:$("when").value || undefined})});
    renderPlan(d);
  } catch (e) { $("results").innerHTML = '<div class="errorBox">' + esc(e.message) + "</div>"; }
}

async function replan() {
  try {
    $("status").textContent = "Re-planning...";
    const d = await api("/meetups/" + S.meetup.id + "/replan", {method:"POST", body:JSON.stringify({reason:"A member changed a constraint",memberId:S.memberId,when:$("when").value || undefined})});
    renderPlan(d.plan);
    $("status").textContent = "Re-plan complete.";
  } catch (e) { $("results").innerHTML = '<div class="errorBox">' + esc(e.message) + "</div>"; }
}

function renderPlan(d) {
  if (d.status === "needs_input") {
    $("results").innerHTML = '<div class="emptyState"><b>More information is needed</b><p>' + esc((d.missingData || []).join(", ")) + "</p></div>";
    return;
  }
  if (d.status === "no_results") {
    $("results").innerHTML = '<div class="emptyState"><b>No live places found.</b><p>Try a broader area or simpler preferences.</p></div>';
    return;
  }
  if (d.status !== "ready") {
    $("results").textContent = d.status || "Planning unavailable";
    return;
  }
  let html = '<div class="planMeta"><span class="pill">Goal: ' + esc(d.goal) + '</span><span class="pill">Source: ' + esc(d.source) + "</span></div>";
  html += '<p class="muted">' + esc(d.objective || "") + "</p>";
  (d.candidates || []).forEach((x, i) => {
    const travel = (x.travel || []).map(t => {
      const m = S.meetup.members.find(v => v.id === t.memberId);
      return '<span class="pill">' + esc(m?.name || "Member") + ": " + (t.durationMinutes ?? "unknown") + " min</span>";
    }).join("");
    const weather = x.weather?.available ? '<p class="weather"><b>Weather:</b> ' + esc(x.weather.summary || "Forecast available") + "</p>" : "";
    html += '<div class="candidate"><div class="score">Option ' + (i + 1) + " · " + (x.score === null ? "Verified score unavailable" : x.score + "% verified constraints") + "</div><h3>" + esc(x.candidate.name) + '</h3><p class="muted">' + esc(x.candidate.address || "Address unavailable") + "</p><p>" + travel + "</p>" + weather + "<p>" + (x.explanation || []).map(esc).join(" · ") + '</p><p class="muted">' + esc(x.budgetStatus || "Budget not verified") + '</p><button data-vote="' + esc(x.candidate.id) + '">Vote for this option</button></div>';
  });
  $("results").innerHTML = html;
  $("results").querySelectorAll("[data-vote]").forEach(b => b.onclick = () => vote(b.dataset.vote));
}

async function vote(id) {
  try {
    await api("/meetups/" + S.meetup.id + "/votes", {method:"POST", body:JSON.stringify({memberId:S.memberId,optionId:id})});
    await voteSummary();
    alert("Vote recorded");
  } catch (e) { alert(e.message); }
}

async function voteSummary() {
  try {
    const d = await api("/meetups/" + S.meetup.id + "/votes");
    $("votes").textContent = d.counts?.length ? "Votes: " + d.counts.map(x => x.optionId + " = " + x.votes).join(" · ") : "No votes yet";
  } catch {}
}

async function sendChat() {
  const text = $("chatText").value.trim();
  if (!text) return;
  try {
    const d = await api("/meetups/" + S.meetup.id + "/chat", {method:"POST", body:JSON.stringify({memberId:S.memberId,text})});
    $("chatText").value = "";
    if (d.aiAnalysis?.available) $("ai").textContent = typeof d.aiAnalysis.result === "string" ? d.aiAnalysis.result : JSON.stringify(d.aiAnalysis.result, null, 2);
    await refresh();
  } catch (e) { alert(e.message); }
}

async function analyzeChat() {
  try {
    const d = await api("/live/meetups/" + S.meetup.id + "/analyze", {method:"POST"});
    $("ai").textContent = typeof d.result === "string" ? d.result : JSON.stringify(d.result, null, 2);
  } catch (e) { $("ai").textContent = e.message; }
}

async function logout() {
  try { await api("/auth/logout", {method:"POST"}); } catch {}
  localStorage.clear();
  location.reload();
}

if (S.token && S.user) home();
else auth();
