const app = document.getElementById("app");
const savedAPI = localStorage.getItem("meetwise_api");
const isLocalHost = ["localhost","127.0.0.1"].includes(window.location.hostname);
const API = ((isLocalHost && savedAPI) ? savedAPI : "https://meetwise-backend.vercel.app/api").replace(/\/$/, "");
const S = {
  token: localStorage.getItem("meetwise_token"),
  user: JSON.parse(localStorage.getItem("meetwise_user") || "null"),
  meetup: null,
  memberId: localStorage.getItem("meetwise_member"),
  candidates: [],
  liveTimer: null,
  syncing: false,
  prefsDirty: false,
  map: null,
  selectedLocation: null,
  reminderTimer: null,
  autoPlanRunning: false,
  lastChatCount: null,
  chatPopupTimer: null
};
const $ = id => document.getElementById(id);
const pendingInviteCode = (() => { const code = new URLSearchParams(window.location.search).get("invite"); return code ? code.trim().toUpperCase() : ""; })();
const esc = x => String(x ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function localDateTimeToISO(value) {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

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
  app.innerHTML = '<main class="authShell"><div class="authHero"><div class="brand brandLarge">MeetWise</div><div class="heroBadge">GROUP PLANNING, SIMPLIFIED</div><h1>Plan together.<br><span>Meet better.</span></h1><p>Bring your group, preferences and ideas together in one polished workspace.</p><div class="heroPoints"><span>✓ Shared preferences</span><span>✓ Live place research</span><span>✓ Group voting</span></div></div><div class="authPanel"><div class="authTabs"><button id="tabLogin" class="tab active">Log in</button><button id="tabSignup" class="tab">Create account</button></div><div id="authForm"></div><p id="msg" class="formMsg"></p></div></main>';
  renderLoginForm();
  $("tabLogin").onclick = () => { renderLoginForm(); $("tabLogin").classList.add("active"); $("tabSignup").classList.remove("active"); };
  $("tabSignup").onclick = () => { renderSignupForm(); $("tabSignup").classList.add("active"); $("tabLogin").classList.remove("active"); };
}
function renderLoginForm() {
  $("authForm").innerHTML = '<h2>Welcome back</h2><p class="muted">Continue planning your next meetup.</p><input id="le" placeholder="Email address" autocomplete="email"><input id="lp" type="password" placeholder="Password" autocomplete="current-password"><button id="login" class="primaryAction">Log in to MeetWise <span>→</span></button>';
  $("login").onclick = login;
}
function renderSignupForm() {
  $("authForm").innerHTML = '<h2>Create your workspace</h2><p class="muted">Start a shared meetup in seconds.</p><input id="sn" placeholder="Your name" autocomplete="name"><input id="se" placeholder="Email address" autocomplete="email"><input id="sp" type="password" placeholder="Password (8+ characters)" autocomplete="new-password"><button id="signup" class="primaryAction">Create account <span>→</span></button>';
  $("signup").onclick = signup;
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
  const inviteCode = pendingInviteCode;
  app.innerHTML = '<main class="shell"><div class="topBrand"><div><b class="brand">MeetWise</b><span class="brandTag">Your group planning space</span></div><button id="logout" class="secondary smallBtn">Log out</button></div><div class="welcomeBlock"><div><div class="heroBadge">READY WHEN YOUR GROUP IS</div><h1>Where should we meet?</h1><p class="muted">Create a meetup or join one with an invite code.</p></div></div>' + (inviteCode ? '<div class="inviteJoinBanner"><div><b>You\'ve been invited 🎉</b><span>We found an invite code in your link. Just join your group below.</span></div><strong>' + esc(inviteCode) + '</strong></div>' : "") + '<div class="homeGrid"><section class="card actionCard createCard"><div class="actionIcon">＋</div><div class="cardEyebrow">START A NEW PLAN</div><h2>Create a meetup</h2><p class="muted">Set the occasion, date and time, then invite everyone.</p><input id="title" placeholder="e.g. Saturday dinner with friends"><label class="fieldLabel">Meetup date & time</label><input id="scheduledAt" type="datetime-local"><button id="create" class="primaryAction">Create meetup <span>→</span></button></section><section class="card actionCard joinCard"><div class="actionIcon">↗</div><div class="cardEyebrow">JOIN YOUR GROUP</div><h2>Join a meetup</h2><p class="muted">Enter the invite code shared by your organizer.</p><input id="code" placeholder="6-character invite code" autocomplete="off" value="' + esc(inviteCode) + '"><input id="joinName" placeholder="Your name" value="' + esc(S.user?.name || "") + '"><button id="join" class="secondary fullAction">Join meetup <span>→</span></button></section></div></main>';
  $("logout").onclick = logout;
  $("create").onclick = createMeetup;
  $("join").onclick = joinMeetup;
}
async function createMeetup() {
  try {
    S.meetup = await api("/meetups", {method:"POST", body:JSON.stringify({title:$("title").value || "Group meetup", organizerName:S.user.name, scheduledAt:localDateTimeToISO($("scheduledAt").value)})});
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
  app.innerHTML = '<main class="shell"><div class="nav"><div><b class="brand">MeetWise</b><div id="meetupTitle" class="muted"></div></div><div id="inviteCard" class="inviteCard"><div class="inviteLabel">INVITE CODE</div><div class="inviteCodeRow"><strong id="inviteCode"></strong><button id="copyInvite" class="iconBtn" title="Copy invite code">⧉</button><button id="shareInvite" class="iconBtn" title="Share invite">↗</button><button id="whatsappInvite" class="whatsappBtn" title="Share invite on WhatsApp" aria-label="Share invite on WhatsApp">WhatsApp</button></div><div id="inviteStatus" class="inviteStatus">Share this code with your group</div></div></div><div id="meetupReminder" class="muted"></div><div class="grid"><section class="card"><h3>Members</h3><div id="members"></div><div class="sectionHeading"><div><span class="cardEyebrow">YOUR INPUT</span><h3>Your preferences</h3></div><span class="prefHint">Used to find a fair group option</span></div><div class="preferenceGrid"><div class="fieldWide locationField"><label class="fieldLabel">📍 Area or neighborhood</label><div class="locationRow"><input id="area" placeholder="e.g. Latifabad, Hyderabad"><button id="useLocation" type="button" class="locationBtn">Use my location</button></div><p id="locationStatus" class="muted"></p></div><div><label class="fieldLabel">🚗 Transport</label><select id="transport"><option value="">Choose transport</option><option value="walking">Walking</option><option value="bike">Bike</option><option value="car">Car</option><option value="public_transport">Public transport</option></select></div><div><label class="fieldLabel">💰 Budget</label><input id="budget" type="number" placeholder="PKR per person"></div><div><label class="fieldLabel">⏱ Max travel</label><input id="maxTravel" type="number" placeholder="Minutes"></div><div><label class="fieldLabel">🍽 Food</label><input id="food" placeholder="e.g. desi, pizza, halal"></div><div><label class="fieldLabel">🎯 Activity</label><input id="activity" placeholder="e.g. dinner, cafe, bowling"></div><div class="fieldWide"><label class="fieldLabel">🗓 Available date & time</label><input id="when" type="datetime-local"></div></div><div class="prefActions"><button id="savePrefs" class="primaryAction">Save preferences <span>✓</span></button><button id="research" class="secondary">Find live options <span>→</span></button><button id="replan" class="secondary">Re-plan</button><p id="status" class="muted"></p></section><section class="card"><h3>Group chat</h3><div id="chat" class="chat"></div><div class="chatComposer"><input id="chatText" placeholder="Type a message or new constraint…"><button id="send" aria-label="Send message">➤</button></div></section></div><section class="card" style="margin-top:18px"><h2>Live Group Preferences</h2><div id="livePrefs" class="livePrefs"></div><p id="syncStatus" class="muted">Live sync enabled</p></section><section class="card" style="margin-top:18px"><h2>AI Meetup Plan</h2><div id="results" class="emptyState">Save preferences and run research.</div></section><section class="card" style="margin-top:18px"><h2>Meetup Map</h2><div id="meetupMap" class="map"></div><p id="mapStatus" class="muted">Save a member location to place it on the map.</p></section><section class="card" style="margin-top:18px"><h2>Group Voting</h2><div id="votingPanel" class="votingPanel"><div class="emptyState">Run live research to create voting options.</div></div></section></main>';
  $("meetupTitle").textContent = S.meetup.title;

  $("inviteCode").textContent = S.meetup.inviteCode || "------";
  $("copyInvite").onclick = copyInviteCode;
  $("shareInvite").onclick = shareInviteCode;
  $("whatsappInvite").onclick = shareInviteWhatsApp;
  setupMeetupReminder();
  $("savePrefs").onclick = savePrefs;
  $("useLocation").onclick = useCurrentLocation;
  $("research").onclick = research;
  $("replan").onclick = replan;
  $("send").onclick = sendChat;
  ["area","transport","budget","maxTravel","food","activity","when"].forEach(id => {
    $(id).addEventListener("input", () => { S.prefsDirty = true; });
    $(id).addEventListener("change", () => { S.prefsDirty = true; });
  });
  refresh();
  startLiveSync();
}

function setupMeetupReminder() {
  if (S.reminderTimer) clearTimeout(S.reminderTimer);
  const at = S.meetup?.scheduledAt ? new Date(S.meetup.scheduledAt).getTime() : 0;
  if (!at || at <= Date.now()) return;
  const key = "meetwise_reminded_" + S.meetup.id;
  const remindAt = at - 30 * 60 * 1000;
  const delay = Math.max(0, remindAt - Date.now());
  S.reminderTimer = setTimeout(() => {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    const message = "MeetWise reminder: " + S.meetup.title + " starts at " + new Date(at).toLocaleString();
    if ("Notification" in window) {
      if (Notification.permission === "granted") new Notification("MeetWise reminder", {body:message});
      else if (Notification.permission !== "denied") Notification.requestPermission().then(p => { if (p === "granted") new Notification("MeetWise reminder", {body:message}); });
    }
    alert(message);
  }, delay);
  const reminder = $("meetupReminder");
  if (reminder) reminder.textContent = "Reminder: 30 minutes before · " + new Date(at).toLocaleString();
}

function startLiveSync() {
  if (S.liveTimer) clearInterval(S.liveTimer);
  S.liveTimer = setInterval(() => refresh(true), 1500);
}

async function refresh(silent = false) {
  if (S.syncing || !S.meetup?.id) return;
  S.syncing = true;
  try {
    const previousPlan = S.meetup?.finalPlan;
    S.meetup = await api("/meetups/" + S.meetup.id);
    // Keep a ready plan already held by this browser if an older backend
    // response does not include final_plan yet.
    if (!S.meetup.finalPlan && previousPlan?.status === "ready") S.meetup.finalPlan = previousPlan;
    // Recover a stale local member id after refresh/account switching.
    // The active member must always be one of this meetup's persisted members.
    if (!S.meetup.members.some(m => m.id === S.memberId)) {
      const sameName = S.meetup.members.filter(m => m.name === S.user?.name);
      if (sameName.length === 1) {
        S.memberId = sameName[0].id;
        localStorage.setItem("meetwise_member", S.memberId);
      }
    }
    // Rebuild voting options from the persisted plan so every group member
    // sees the same options after refresh/login, not only the member who ran research.
    if (!S.candidates.length && S.meetup.finalPlan?.status === "ready") {
      S.candidates = (S.meetup.finalPlan.candidates || []).map(x => ({
        id: x.candidate.id,
        name: x.candidate.name,
        address: x.candidate.address || "Address unavailable"
      }));
    }
    renderMembers();
    renderChat();
    fillPrefs();
    renderLivePreferences();
    // The researched plan is persisted on the meetup, so every member
    // renders the same candidates and voting controls after joining.
    if (S.meetup?.finalPlan?.status === "ready" && $("results")) renderPlan(S.meetup.finalPlan);
    else {
      renderVotingPanel();
      renderMap();
    }
    if (!silent && $("votes")) voteSummary();
    if ($("syncStatus")) $("syncStatus").textContent = "Live sync · " + new Date().toLocaleTimeString();
    // If an existing meetup has no persisted plan, recover it once from the
    // server. This makes researched options available to members who join on
    // another browser/account even if an older deployment did not persist the plan.
    const allLocated = S.meetup.members.length > 0 && S.meetup.members.every(m => Number.isFinite(m.preferences?.latitude) && Number.isFinite(m.preferences?.longitude));
    if (!S.meetup.finalPlan && allLocated && !S.autoPlanRunning) {
      S.autoPlanRunning = true;
      try {
        const plan = await api("/live/meetups/" + S.meetup.id + "/plan", {method:"POST", body:JSON.stringify({when:localDateTimeToISO($("when")?.value)})});
        if (plan?.status === "ready") {
          S.meetup.finalPlan = plan;
          renderPlan(plan);
        }
      } catch {}
      finally { S.autoPlanRunning = false; }
    }
  } catch (e) { if (!silent && $("status")) $("status").textContent = e.message; }
  finally { S.syncing = false; }
}

function renderMembers() {
  $("members").innerHTML = S.meetup.members.map(m => {
    const p = m.preferences || {};
    const ready = !!(p.area || (p.foodPreferences || []).length || (p.activityPreferences || []).length);
    return '<span class="pill ' + (ready ? "pillReady" : "") + '">' + esc(m.name) + (ready ? " ✓" : " · pending") + "</span>";
  }).join("");
}

function renderLivePreferences() {
  const el = $("livePrefs");
  if (!el || !S.meetup?.members) return;
  el.innerHTML = S.meetup.members.map(m => {
    const p = m.preferences || {};
    const foods = (p.foodPreferences || []).join(", ") || "—";
    const activities = (p.activityPreferences || []).join(", ") || "—";
    const transport = p.transportMode || "—";
    const budget = p.budget ? "PKR " + p.budget : "—";
    const travel = p.maxTravelMinutes ? p.maxTravelMinutes + " min" : "—";
    const when = p.availableFrom ? new Date(p.availableFrom).toLocaleString() : "—";
    return `<div class="candidate"><div><b>${esc(m.name)}</b> ${m.id === S.memberId ? "<span class=\"pill pillReady\">You</span>" : ""}</div><p class="muted">Area: ${esc(p.area || "—")} · Transport: ${esc(transport)} · Budget: ${esc(budget)} · Max travel: ${esc(travel)}</p><p>Food: ${esc(foods)} · Activity: ${esc(activities)}</p><p class="muted">Availability: ${esc(when)}</p></div>`;
  }).join("") || "<div class=\"emptyState\">No members yet.</div>";
}

function renderChat() {
  const el = $("chat");
  if (!el) return;
  const messages = Array.isArray(S.meetup?.chat) ? S.meetup.chat : [];
  const previousCount = S.lastChatCount;
  S.lastChatCount = messages.length;
  el.innerHTML = messages.length ? messages.map(x => {
    const m = S.meetup.members.find(v => v.id === x.memberId);
    const mine = x.memberId === S.memberId;
    const name = m?.name || "Member";
    const initials = name.split(/\s+/).map(v => v[0]).join("").slice(0,2).toUpperCase();
    const rawTime = x.createdAt || x.created_at;
    const time = rawTime ? new Date(rawTime).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) : "";
    return '<div class="chatMessage ' + (mine ? "mine" : "theirs") + '">' +
      '<div class="chatAvatar">' + esc(initials) + '</div>' +
      '<div class="chatMessageBody"><div class="msgBubble"><span class="msgName">' + (mine ? "You" : esc(name)) + '</span><div class="msgText">' + esc(x.text) + '</div><span class="msgTime">' + esc(time) + '</span></div></div>' +
      '</div>';
  }).join("") : '<div class="chatEmpty"><div class="chatEmptyIcon">💬</div><b>Your group chat is ready</b><span>Share ideas, preferences and meetup decisions here.</span></div>';
  el.scrollTop = el.scrollHeight;
  if (previousCount !== null && messages.length > previousCount) {
    const latest = messages[messages.length - 1];
    if (latest?.memberId !== S.memberId) {
      const member = S.meetup.members.find(v => v.id === latest.memberId);
      showChatPopup(member?.name || "New message", latest.text);
    }
  }
}
function showChatPopup(name, message) {
  let popup = $("chatPopup");
  if (!popup) {
    popup = document.createElement("div");
    popup.id = "chatPopup";
    popup.className = "chatPopup";
    document.body.appendChild(popup);
  }
  popup.innerHTML = '<div class="chatPopupIcon">💬</div><div class="chatPopupCopy"><b>' + esc(name) + '</b><span>' + esc(message) + '</span></div><button type="button" class="chatPopupClose" aria-label="Dismiss">×</button>';
  popup.classList.add("show");
  popup.querySelector(".chatPopupClose").onclick = () => popup.classList.remove("show");
  clearTimeout(S.chatPopupTimer);
  S.chatPopupTimer = setTimeout(() => popup.classList.remove("show"), 4200);
}
function setChatTyping(show, label = "Writing…") {
  let el = $("chatTyping");
  if (!el) {
    const chat = $("chat");
    if (!chat) return;
    el = document.createElement("div");
    el.id = "chatTyping";
    el.className = "chatTyping";
    chat.parentElement.insertBefore(el, chat.nextSibling);
  }
  el.innerHTML = show ? '<span>' + esc(label) + '</span><i></i><i></i><i></i>' : "";
  el.classList.toggle("visible", show);
}
function fillPrefs() {
  if (S.prefsDirty) return;
  if (!$("area") || !$("transport") || !$("budget") || !$("maxTravel") || !$("food") || !$("activity") || !$("when")) return;
  const m = S.meetup?.members?.find(v => v.id === S.memberId);
  if (!m) return;
  const p = m.preferences || {};
  $("area").value = p.area || "";
  if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
    S.selectedLocation = {latitude:p.latitude, longitude:p.longitude};
  } else {
    S.selectedLocation = null;
  }
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
      ...(S.selectedLocation ? {latitude:S.selectedLocation.latitude, longitude:S.selectedLocation.longitude} : {}),
      transportMode: $("transport").value || undefined,
      budget: Number($("budget").value) || undefined,
      maxTravelMinutes: Number($("maxTravel").value) || undefined,
      foodPreferences: $("food").value.split(",").map(x => x.trim()).filter(Boolean),
      activityPreferences: $("activity").value.split(",").map(x => x.trim()).filter(Boolean),
      availableFrom: $("when").value || undefined
    };
    await api("/meetups/" + S.meetup.id + "/members/" + S.memberId + "/preferences", {method:"PATCH", body:JSON.stringify(p)});
    S.prefsDirty = false;
    await refresh();
    $("status").textContent = "Preferences saved.";
  } catch (e) { $("status").textContent = e.message; }
}

async function research() {
  try {
    $("status").textContent = "Researching live places, travel and weather...";
    $("results").innerHTML = '<div class="loading">Researching...</div>';
    const d = await api("/live/meetups/" + S.meetup.id + "/plan", {method:"POST", body:JSON.stringify({when:localDateTimeToISO($("when").value)})});
    S.meetup.finalPlan = d;
    renderPlan(d);
  } catch (e) { $("results").innerHTML = '<div class="errorBox">' + esc(e.message) + "</div>"; }
}

async function replan() {
  try {
    $("status").textContent = "Re-planning...";
    const d = await api("/meetups/" + S.meetup.id + "/replan", {method:"POST", body:JSON.stringify({reason:"A member changed a constraint",memberId:S.memberId,when:localDateTimeToISO($("when").value)})});
    S.meetup.finalPlan = d.plan;
    renderPlan(d.plan);
    $("status").textContent = "Re-plan complete.";
  } catch (e) { $("results").innerHTML = '<div class="errorBox">' + esc(e.message) + "</div>"; }
}

function renderPlan(d) {
  S.candidates = [];
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
  if (d.center) html += '<p class="muted"><b>Fair meeting center:</b> ' + Number(d.center.latitude).toFixed(4) + ", " + Number(d.center.longitude).toFixed(4) + ' · candidates are searched around the shared center.</p>';
  html += '<p class="muted">' + esc(d.objective || "") + "</p>";
  (d.candidates || []).forEach((x, i) => {
    const travel = (x.travelByMember || x.travel || []).map(t => {
      const name = t.memberName || S.meetup.members.find(v => v.id === t.memberId)?.name || "Member";
      const distance = Number.isFinite(t.distanceMeters) ? " · " + (t.distanceMeters / 1000).toFixed(1) + " km" : "";
      return '<span class="pill">' + esc(name) + ": " + (t.durationMinutes ?? "unknown") + " min" + distance + "</span>";
    }).join("");
    const preferenceCoverage = Array.isArray(x.preferenceMatches) ? x.preferenceMatches.map(m => esc(m.memberName) + ": " + ((m.matched || []).join(", ") || "no exact match")).join(" · ") : "";
    const weather = x.weather?.available ? '<p class="weather"><b>Weather:</b> ' + esc(x.weather.summary || "Forecast available") + "</p>" : "";
    const fairness = '<p><span class="pill">Fairness: ' + (x.fairnessScore ?? "unavailable") + '%</span><span class="pill">Longest trip: ' + (x.maxTravelMinutes ?? "unknown") + ' min</span><span class="pill">Total travel: ' + (x.totalTravelMinutes ?? "unknown") + ' min</span></p>';
    const availability = '<p class="muted"><b>Venue verification:</b> ' + esc(x.availabilityStatus || "Opening/availability not verified") + '</p>';
    const venueInfo = '<p class="muted">' + (x.candidate.openingHours ? 'Opening hours: ' + esc(x.candidate.openingHours) : 'Opening hours: not listed') + (x.candidate.cuisine ? ' · Cuisine: ' + esc(x.candidate.cuisine) : '') + '</p>';
    const directions = 'https://www.openstreetmap.org/directions?to=' + encodeURIComponent(Number(x.candidate.latitude).toFixed(6) + ',' + Number(x.candidate.longitude).toFixed(6));
    html += '<div class="candidate"><div class="score">Option ' + (i + 1) + " · " + (x.score === null ? "Verified constraint score unavailable" : x.score + "% verified constraints") + "</div><h3>" + esc(x.candidate.name) + '</h3><p class="muted">' + esc(x.candidate.address || "Address unavailable") + "</p><p>" + travel + "</p>" + fairness + availability + venueInfo + weather + "<p>" + (x.explanation || []).map(esc).join(" · ") + '</p><p class="muted">' + esc(x.budgetStatus || "Budget not verified") + '</p><a href="' + directions + '" target="_blank" rel="noopener" class="mapLink">Open directions</a><button data-vote="' + esc(x.candidate.id) + '">Vote for this option</button></div>';
  });
  S.candidates = (d.candidates || []).map(x => ({id:x.candidate.id, name:x.candidate.name, address:x.candidate.address || "Address unavailable"}));
  $("results").innerHTML = html;
  $("results").querySelectorAll("[data-vote]").forEach(b => b.onclick = () => vote(b.dataset.vote));
  renderVotingPanel();
  renderMap();
}

function renderMap() {
  const el = $("meetupMap");
  if (!el || typeof L === "undefined") return;
  if (S.map) S.map.remove();
  S.map = L.map(el).setView([30.3753, 69.3451], 5);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19, attribution:"© OpenStreetMap contributors"}).addTo(S.map);
  const points = [];
  (S.meetup?.members || []).forEach(m => {
    const p = m.preferences || {};
    if (Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
      const point=[p.latitude,p.longitude]; points.push(point);
      L.marker(point).addTo(S.map).bindPopup("<b>"+esc(m.name)+"</b><br>"+esc(p.area||"Member location"));
    }
  });
  (S.meetup?.finalPlan?.candidates || []).forEach(x => {
    const p=x.candidate;
    if (p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude)) {
      const point=[p.latitude,p.longitude]; points.push(point);
      L.marker(point).addTo(S.map).bindPopup("<b>"+esc(p.name)+"</b><br>"+esc(p.address||""));
    }
  });
  if (points.length) S.map.fitBounds(points,{padding:[25,25]});
  const status=$("mapStatus");
  if(status) status.textContent=points.length ? "Member locations and researched meetup places are shown on the map." : "Save an area first, then research live options.";
}

async function useCurrentLocation() {
  if (!navigator.geolocation) { $("locationStatus").textContent="Browser location is unavailable."; return; }
  $("locationStatus").textContent="Getting your precise location...";
  navigator.geolocation.getCurrentPosition(async pos=>{
    const lat=pos.coords.latitude, lon=pos.coords.longitude;
    S.selectedLocation = { latitude: lat, longitude: lon };
    $("area").value = lat.toFixed(5) + ", " + lon.toFixed(5);
    $("locationStatus").textContent="Location found. Getting the area name...";
    try {
      const r = await fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat="+encodeURIComponent(lat)+"&lon="+encodeURIComponent(lon)+"&zoom=18&addressdetails=1", {headers:{"Accept":"application/json"}});
      const d = await r.json();
      const a = d.address || {};
      const readable = [a.neighbourhood || a.suburb || a.quarter, a.city || a.town || a.village, a.state].filter(Boolean).join(", ");
      if (readable) $("area").value = readable;
      $("locationStatus").innerHTML = "✓ Location selected · <button type=\"button\" id=\"openMyLocation\" class=\"inlineLink\">Open location</button>";
      $("openMyLocation").onclick = () => openMapLocation(lat, lon);
    } catch {
      $("locationStatus").innerHTML = "✓ Location selected · <button type=\"button\" id=\"openMyLocation\" class=\"inlineLink\">Open location</button>";
      $("openMyLocation").onclick = () => openMapLocation(lat, lon);
    }
    S.prefsDirty=true;
  },err=>{
    $("locationStatus").textContent = err.code === 1 ? "Location permission was denied. Allow location access in your browser." : "Could not get your current location. Try again.";
  },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}
function openMapLocation(lat, lon) {
  const url = "https://www.openstreetmap.org/?mlat=" + encodeURIComponent(lat) + "&mlon=" + encodeURIComponent(lon) + "#map=18/" + encodeURIComponent(lat) + "/" + encodeURIComponent(lon);
  window.open(url, "_blank", "noopener");
}

function renderVotingPanel() {
  const el = $("votingPanel");
  if (!el) return;
  if (S.meetup?.finalPlan?.status === "ready") {
    S.candidates = (S.meetup.finalPlan.candidates || []).map(x => ({id:x.candidate.id,name:x.candidate.name,address:x.candidate.address||"Address unavailable"}));
  }
  if (!S.candidates.length) {
    el.innerHTML = '<div class="voteEmpty"><div class="voteEmptyIcon">🗳️</div><b>Voting will appear here</b><span>Run live research to create places your group can vote on.</span></div>';
    return;
  }
  const votes = S.meetup?.votes || [];
  const totalMembers = S.meetup?.members?.length || 0;
  const counts = S.candidates.map(c => ({candidate:c,count:votes.filter(v => v.optionId === c.id).length})).sort((a,b) => b.count-a.count);
  const maxVotes = counts[0]?.count || 0;
  const voters = new Set(votes.map(v => v.memberId));
  const remaining = Math.max(0,totalMembers-voters.size);
  const allMembersVoted = totalMembers > 0 && voters.size >= totalMembers;
  const leaders = counts.filter(x => x.count === maxVotes && maxVotes > 0);
  const myVote = votes.find(v => v.memberId === S.memberId)?.optionId;
  let result = '<div class="voteStatus progress"><b>Voting is open</b><span>' + remaining + ' member' + (remaining===1?"":"s") + ' still to vote</span></div>';
  if (allMembersVoted && leaders.length === 1) {
    const w=leaders[0].candidate;
    result='<div class="voteResult winner"><div class="resultIcon">🏆</div><div><span class="resultEyebrow">FINAL GROUP CHOICE</span><h3>'+esc(w.name)+'</h3><p>'+esc(w.address)+'</p></div><strong>'+maxVotes+'/'+totalMembers+'</strong></div>';
  } else if (allMembersVoted && leaders.length > 1) {
    result='<div class="voteResult tie"><div class="resultIcon">⚖️</div><div><span class="resultEyebrow">VOTING TIE</span><h3>More than one place is leading</h3><p>Choose again to break the tie.</p></div></div>';
  }
  el.innerHTML='<div class="voteHeader"><div><span class="cardEyebrow">GROUP DECISION</span><h3>Where should we meet?</h3><p>Vote for the place that works best for everyone.</p></div>'+result+'</div><div class="voteOptions">'+counts.map(({candidate:c,count})=>{
    const pct=totalMembers?Math.round(count/totalMembers*100):0;
    const mine=myVote===c.id;
    return '<article class="voteOption '+(mine?"selected":"")+'"><div class="voteOptionTop"><div class="placeIcon">📍</div><div class="placeInfo"><h4>'+esc(c.name)+'</h4><p>'+esc(c.address)+'</p></div><div class="voteCount"><b>'+count+'</b><span>'+ (count===1?"vote":"votes")+'</span></div></div><div class="voteBar"><span style="width:'+pct+'%"></span></div><div class="voteOptionBottom"><span>'+pct+'% of members</span><button class="'+(mine?"voted":"")+'" data-panel-vote="'+esc(c.id)+'">'+(mine?"✓ Voted":"Vote")+'</button></div></article>';
  }).join("")+'</div>';
  el.querySelectorAll("[data-panel-vote]").forEach(b => b.onclick=()=>vote(b.dataset.panelVote));
}
async function vote(id) {
  try {
    if (!S.meetup?.members?.some(m => m.id === S.memberId)) {
      await refresh();
    }
    if (!S.meetup?.members?.some(m => m.id === S.memberId)) {
      throw new Error("Your membership for this meetup is not active. Please leave and join this meetup again.");
    }
    await api("/meetups/" + S.meetup.id + "/votes", {method:"POST", body:JSON.stringify({memberId:S.memberId,optionId:id})});
    await refresh();
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
    setChatTyping(true, "Sending");
    await api("/meetups/" + S.meetup.id + "/chat", {method:"POST", body:JSON.stringify({memberId:S.memberId,text})});
    $("chatText").value = "";
    setChatTyping(false);
    await refresh();
  } catch (e) { setChatTyping(false); alert(e.message); }
}
async function logout() {
  if (S.liveTimer) clearInterval(S.liveTimer);
  try { await api("/auth/logout", {method:"POST"}); } catch {}
  localStorage.clear();
  location.reload();
}

if (S.token && S.user) home();
else auth();


async function copyInviteCode() {
  const code = S.meetup?.inviteCode;
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    const status = $("inviteStatus");
    if (status) {
      status.textContent = "Invite code copied ✓";
      status.className = "inviteStatus success";
      setTimeout(() => { status.textContent = "Share this code with your group"; status.className = "inviteStatus"; }, 1800);
    }
  } catch {
    const status = $("inviteStatus");
    if (status) status.textContent = "Copy failed — select the code manually.";
  }
}

async function shareInviteWhatsApp() {
  const code = S.meetup?.inviteCode;
  if (!code) return;
  const title = S.meetup?.title || "Group meetup";
  const joinUrl = new URL(window.location.href);
  joinUrl.search = "";
  joinUrl.hash = "";
  joinUrl.searchParams.set("invite", code);
  const text = "Join my MeetWise meetup 🎉\n" + title + "\n\nOpen this link to join:\n" + joinUrl.toString() + "\n\nYour invite code is already included — just tap Join Meetup.";
  const url = "https://wa.me/?text=" + encodeURIComponent(text);
  window.open(url, "_blank", "noopener");
}
async function shareInviteCode() {
  const code = S.meetup?.inviteCode;
  if (!code) return;
  const text = "Join my MeetWise meetup: " + (S.meetup.title || "Group meetup") + "\nInvite code: " + code;
  if (navigator.share) {
    try { await navigator.share({title:"Join " + (S.meetup.title || "MeetWise meetup"),text}); return; } catch {}
  }
  try {
    await navigator.clipboard.writeText(text);
    const status = $("inviteStatus");
    if (status) {
      status.textContent = "Invite message copied ✓";
      status.className = "inviteStatus success";
      setTimeout(() => { status.textContent = "Share this code with your group"; status.className = "inviteStatus"; }, 1800);
    }
  } catch {}
}
