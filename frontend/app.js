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
  autoPlanRunning: false
};
const $ = id => document.getElementById(id);
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
  app.innerHTML = '<main class="authShell"><section class="authHero"><div class="brandMark"><span>MW</span> MeetWise</div><div class="heroCopy"><span class="eyebrow">GROUP PLANNING, SIMPLIFIED</span><h1>Plan once.<br><span>Enjoy together.</span></h1><p>Bring everyone's preferences, locations and votes into one beautiful meetup workspace.</p><div class="heroPoints"><span>✓ Smart group matching</span><span>✓ Live place research</span><span>✓ Shared voting</span></div></div></section><section class="authPanel"><div class="authTabs"><button id="tabLogin" class="authTab active" type="button">Log in</button><button id="tabSignup" class="authTab" type="button">Create account</button></div><div id="authForm"></div></section></main>';
  const renderAuth = mode => {
    const signupMode = mode === "signup";
    $("authForm").innerHTML = signupMode
      ? '<div class="formIntro"><h2>Create your MeetWise</h2><p class="muted">Start planning your next group meetup.</p></div><input id="sn" placeholder="Your name" autocomplete="name"><input id="se" placeholder="Email address" type="email" autocomplete="email"><input id="sp" type="password" placeholder="Password (8+ characters)" autocomplete="new-password"><button id="signup" class="primaryAction">Create account <span>→</span></button><p id="msg" class="formMsg"></p>'
      : '<div class="formIntro"><h2>Welcome back</h2><p class="muted">Continue planning with your group.</p></div><input id="le" placeholder="Email address" type="email" autocomplete="email"><input id="lp" type="password" placeholder="Password" autocomplete="current-password"><button id="login" class="primaryAction">Log in <span>→</span></button><p id="msg" class="formMsg"></p>';
    if (signupMode) $("signup").onclick = signup;
    else $("login").onclick = login;
  };
  $("tabLogin").onclick = () => { $("tabLogin").classList.add("active"); $("tabSignup").classList.remove("active"); renderAuth("login"); };
  $("tabSignup").onclick = () => { $("tabSignup").classList.add("active"); $("tabLogin").classList.remove("active"); renderAuth("signup"); };
  renderAuth("login");
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
  app.innerHTML = '<main class="shell homeShell"><div class="topbar"><div class="brandMark"><span>MW</span> MeetWise</div><div class="userChip"><span class="avatar">' + esc((S.user?.name || "U").slice(0,1).toUpperCase()) + '</span><span>' + esc(S.user?.name || "Member") + '</span><button id="logout" class="iconButton" title="Log out">↗</button></div></div><section class="welcomeHero"><div><span class="eyebrow">YOUR GROUP, YOUR PLAN</span><h1>Make plans everyone<br><span>will love.</span></h1><p>Choose a meetup, invite your group, share preferences and let MeetWise find the best options.</p></div><div class="heroOrb"><span>MW</span></div></section><div class="homeGrid"><section class="card actionCard"><div class="sectionIcon">＋</div><h2>Create a meetup</h2><p class="muted">Start a new group plan and invite everyone.</p><input id="title" placeholder="e.g. Saturday dinner"><label class="muted">Meetup date & time</label><input id="scheduledAt" type="datetime-local"><button id="create" class="primaryAction">Create meetup <span>→</span></button></section><section class="card actionCard"><div class="sectionIcon joinIcon">↗</div><h2>Join a meetup</h2><p class="muted">Have an invite code? Jump right in.</p><input id="code" placeholder="Enter invite code" autocapitalize="characters"><input id="joinName" placeholder="Your name"><button id="join" class="secondaryAction">Join meetup <span>→</span></button></section></div></main>';
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
  app.innerHTML = '<main class="shell dashboardShell"><header class="dashboardNav"><div class="brandMark"><span>MW</span> MeetWise</div><nav class="quickNav"><a href="#overview">Overview</a><a href="#planSection">Plan</a><a href="#chatSection">Chat</a><a href="#mapSection">Map</a><a href="#voteSection">Vote</a></nav><div class="navActions"><span id="invite" class="invitePill"></span><button id="logout" class="iconButton" title="Log out">↗</button></div></header><section id="overview" class="dashboardHero"><div><span class="eyebrow">GROUP WORKSPACE</span><h1 id="meetupTitle">Meetup</h1><p class="muted">Everything your group needs, in one place.</p></div><div id="meetupReminder" class="reminderPill"></div></section><section class="statsStrip"><div><strong id="memberCount">0</strong><span>Members</span></div><div><strong id="readyCount">0</strong><span>Ready</span></div><div><strong id="optionCount">0</strong><span>Options</span></div><div><strong id="voteCount">0</strong><span>Votes</span></div></section><div class="dashboardGrid"><section class="card" id="preferencesSection"><div class="cardHeading"><div><span class="eyebrow">01 · YOUR INPUT</span><h2>Your preferences</h2></div><span class="statusDot">Live</span></div><div id="members" class="memberList"></div><div class="prefForm"><div class="row"><div class="fieldGrow"><label>Area / neighborhood</label><input id="area" placeholder="e.g. Latifabad, Clifton"></div><button id="useLocation" type="button" class="secondaryAction locationButton">⌖ Use my location</button></div><p id="locationStatus" class="fieldHint"></p><div class="formGrid"><div><label>Transport</label><select id="transport"><option value="">Choose transport</option><option value="walking">Walking</option><option value="bike">Bike</option><option value="car">Car</option><option value="public_transport">Public transport</option></select></div><div><label>Budget (PKR)</label><input id="budget" type="number" min="0" placeholder="e.g. 2500"></div><div><label>Max travel (minutes)</label><input id="maxTravel" type="number" min="0" placeholder="e.g. 30"></div><div><label>Available from</label><input id="when" type="datetime-local"></div><div class="wideField"><label>Food preferences</label><input id="food" placeholder="Pizza, desi, coffee..."></div><div class="wideField"><label>Activity preferences</label><input id="activity" placeholder="Dinner, cafe, bowling..."></div></div><div class="actionRow"><button id="savePrefs" class="primaryAction">Save preferences</button><button id="research" class="secondaryAction">Find live options</button><button id="replan" class="ghostAction">Re-plan</button></div><p id="status" class="fieldHint"></p></div></section><section class="card chatCard" id="chatSection"><div class="cardHeading"><div><span class="eyebrow">02 · GROUP CHAT</span><h2>Talk it out</h2></div><span class="statusDot">Live sync</span></div><div id="chat" class="chat"></div><div class="chatComposer"><input id="chatText" placeholder="Share a preference or message..."><button id="send" class="sendButton" title="Send">↑</button></div></section></div><section class="card" id="liveSection"><div class="cardHeading"><div><span class="eyebrow">03 · EVERYONE</span><h2>Live group preferences</h2></div><span id="syncStatus" class="fieldHint">Syncing...</span></div><div id="livePrefs" class="livePrefs"></div></section><section class="card" id="planSection"><div class="cardHeading"><div><span class="eyebrow">04 · RECOMMENDATIONS</span><h2>AI Meetup Plan</h2></div><span class="planBadge">LIVE RESEARCH</span></div><div id="results" class="emptyState">Save preferences and find live options.</div></section><section class="card" id="mapSection"><div class="cardHeading"><div><span class="eyebrow">05 · LOCATIONS</span><h2>Meetup map</h2></div></div><div id="meetupMap" class="map"></div><p id="mapStatus" class="fieldHint">Save a member location to place it on the map.</p></section><section class="card" id="voteSection"><div class="cardHeading"><div><span class="eyebrow">06 · DECIDE TOGETHER</span><h2>Group voting</h2></div><span class="planBadge">LIVE</span></div><div id="votingPanel" class="votingPanel"><div class="emptyState">Run live research to create voting options.</div></div></section></main>';
  $("logout").onclick = logout;
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
  const members = S.meetup.members || [];
  const ready = members.filter(m => {
    const p=m.preferences||{};
    return !!(p.area || Number.isFinite(p.latitude) || (p.foodPreferences||[]).length || (p.activityPreferences||[]).length);
  }).length;
  if ($("memberCount")) $("memberCount").textContent = members.length;
  if ($("readyCount")) $("readyCount").textContent = ready;
  $("members").innerHTML = members.map(m => {
    const p=m.preferences||{};
    const isReady=!!(p.area || Number.isFinite(p.latitude) || (p.foodPreferences||[]).length || (p.activityPreferences||[]).length);
    return '<div class="memberItem"><span class="avatar">' + esc((m.name||"M").slice(0,1).toUpperCase()) + '</span><div><b>' + esc(m.name) + '</b><span>' + (m.id===S.memberId ? "You" : (isReady ? "Preferences ready" : "Waiting for preferences")) + '</span></div><i class="' + (isReady ? "ready" : "") + '"></i></div>';
  }).join("") || '<div class="emptyState">No members yet.</div>';
}

function renderLivePreferences() {
  const el = $("livePrefs");
  if (!el || !S.meetup?.members) return;
  el.innerHTML = S.meetup.members.map(m => {
    const p=m.preferences||{};
    const foods=(p.foodPreferences||[]).join(", ") || "No preference";
    const activities=(p.activityPreferences||[]).join(", ") || "No preference";
    const transport=p.transportMode || "Flexible";
    const budget=p.budget ? "PKR " + p.budget : "Flexible";
    const travel=p.maxTravelMinutes ? p.maxTravelMinutes + " min" : "Flexible";
    return '<article class="liveMember"><div class="liveMemberTop"><span class="avatar">' + esc((m.name||"M").slice(0,1).toUpperCase()) + '</span><div><b>' + esc(m.name) + '</b>' + (m.id===S.memberId ? '<span class="youBadge">You</span>' : '') + '</div></div><div class="preferenceTags"><span>⌖ ' + esc(p.area||"Location pending") + '</span><span>↗ ' + esc(transport) + '</span><span>₨ ' + esc(budget) + '</span><span>◷ ' + esc(travel) + '</span></div><p><b>Food:</b> ' + esc(foods) + ' · <b>Activity:</b> ' + esc(activities) + '</p></article>';
  }).join("") || '<div class="emptyState">No members yet.</div>';
}

function renderChat() {
  const chat=$("chat");
  if (!chat) return;
  chat.innerHTML = S.meetup.chat.map(x => {
    const m=S.meetup.members.find(v=>v.id===x.memberId);
    const mine=x.memberId===S.memberId;
    return '<div class="chatMsg ' + (mine ? "mine" : "") + '"><div class="chatAvatar">' + esc((m?.name||"M").slice(0,1).toUpperCase()) + '</div><div><span class="chatName">' + esc(m?.name||"Member") + '</span><div class="bubble">' + esc(x.text) + '</div></div></div>';
  }).join("") || '<div class="chatEmpty">No messages yet. Start the conversation.</div>';
  chat.scrollTop=chat.scrollHeight;
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
  const candidates = d.candidates || [];
  if (candidates.length) {
    html += '<div class="placesHeader"><div><h3>Recommended places</h3><p class="muted">Choose from the best group-friendly options.</p></div><span class="pill">' + candidates.length + ' options</span></div><div class="placesGrid">';
  }
  candidates.forEach((x, i) => {
    const travel = (x.travelByMember || x.travel || []).map(t => {
      const name = t.memberName || S.meetup.members.find(v => v.id === t.memberId)?.name || "Member";
      const distance = Number.isFinite(t.distanceMeters) ? " · " + (t.distanceMeters / 1000).toFixed(1) + " km" : "";
      return '<span class="pill">' + esc(name) + ": " + (t.durationMinutes ?? "unknown") + " min" + distance + "</span>";
    }).join("");
    const weather = x.weather?.available ? '<p class="weather"><b>Weather:</b> ' + esc(x.weather.summary || "Forecast available") + "</p>" : "";
    const fairness = '<div class="placeStats"><span class="pill">Fairness ' + (x.fairnessScore ?? "—") + '%</span><span class="pill">Longest ' + (x.maxTravelMinutes ?? "—") + ' min</span></div>';
    const availability = '<p class="muted"><b>Venue:</b> ' + esc(x.availabilityStatus || "Not verified") + '</p>';
    const venueInfo = '<p class="muted">' + (x.candidate.openingHours ? 'Hours: ' + esc(x.candidate.openingHours) : 'Hours: not listed') + (x.candidate.cuisine ? ' · ' + esc(x.candidate.cuisine) : '') + '</p>';
    const details = '<details><summary>View travel & details</summary><p>' + travel + '</p>' + fairness + availability + venueInfo + weather + '<p>' + (x.explanation || []).map(esc).join(" · ") + '</p><p class="muted">' + esc(x.budgetStatus || "Budget not verified") + '</p></details>';
    const directions = 'https://www.openstreetmap.org/directions?to=' + encodeURIComponent(Number(x.candidate.latitude).toFixed(6) + ',' + Number(x.candidate.longitude).toFixed(6));
    html += '<article class="placeCard"><div class="placeTop"><span class="optionBadge">Option ' + (i + 1) + '</span><span class="scoreBadge">' + (x.score === null ? "Verified" : x.score + "% match") + '</span></div><h3>' + esc(x.candidate.name) + '</h3><p class="placeAddress">' + esc(x.candidate.address || "Address unavailable") + '</p>' + details + '<div class="placeActions"><a href="' + directions + '" target="_blank" rel="noopener" class="mapLink">Open directions</a><button data-vote="' + esc(x.candidate.id) + '">Vote</button></div></article>';
  });
  if (candidates.length) html += '</div>';
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

function useCurrentLocation() {
  if (!navigator.geolocation) { $("locationStatus").textContent="Browser location is unavailable."; return; }
  $("locationStatus").textContent="Getting your location...";
  navigator.geolocation.getCurrentPosition(async pos=>{
    const lat=pos.coords.latitude, lon=pos.coords.longitude;
    $("area").value=lat.toFixed(5)+", "+lon.toFixed(5);
    S.selectedLocation = { latitude: lat, longitude: lon };
    $("locationStatus").textContent="Location selected. Save preferences.";
    S.prefsDirty=true;
  },()=>{$("locationStatus").textContent="Location permission denied or unavailable.";});
}

function renderVotingPanel() {
  const el=$("votingPanel");
  if (!el) return;
  if (S.meetup?.finalPlan?.status==="ready") {
    S.candidates=(S.meetup.finalPlan.candidates||[]).map(x=>({id:x.candidate.id,name:x.candidate.name,address:x.candidate.address||"Address unavailable"}));
  }
  if (!S.candidates.length) { el.innerHTML='<div class="emptyState">Save member locations and find live options to start voting.</div>'; return; }
  const votes=S.meetup?.votes||[];
  const totalMembers=S.meetup?.members?.length||0;
  const ranked=S.candidates.map(c=>{
    const count=votes.filter(v=>v.optionId===c.id).length;
    const mine=votes.some(v=>v.memberId===S.memberId&&v.optionId===c.id);
    return {...c,count,mine,percent:totalMembers?Math.round(count/totalMembers*100):0};
  }).sort((a,b)=>b.count-a.count);
  const max=ranked[0]?.count||0;
  if ($("voteCount")) $("voteCount").textContent=votes.length;
  el.innerHTML='<div class="voteIntro"><div><b>Pick your favourite</b><span>' + totalMembers + ' member' + (totalMembers===1?"":"s") + ' · live results</span></div><span class="pill">' + votes.length + ' vote' + (votes.length===1?"":"s") + '</span></div><div class="voteGrid">' + ranked.map((c,i)=>{
    const leader=max>0&&c.count===max;
    return '<article class="voteCard ' + (c.mine?"selected ":"") + '"><div class="voteTop"><span class="rankBadge">#' + (i+1) + '</span>' + (leader?'<span class="leaderBadge">Leading</span>':'') + '</div><h3>' + esc(c.name) + '</h3><p class="muted">' + esc(c.address) + '</p><div class="voteMetric"><strong>' + c.count + '</strong><span>vote' + (c.count===1?"":"s") + '</span><b>' + c.percent + '%</b></div><div class="voteBar"><span style="width:' + c.percent + '%"></span></div><button class="' + (c.mine?"selectedButton":"") + '" data-panel-vote="' + esc(c.id) + '">' + (c.mine?"✓ Your vote":"Vote for this") + '</button></article>';
  }).join("") + '</div>';
  el.querySelectorAll("[data-panel-vote]").forEach(b=>b.onclick=()=>vote(b.dataset.panelVote));
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
  const input=$("chatText");
  const text=input.value.trim();
  if (!text) return;
  try {
    input.disabled=true;
    await api("/meetups/" + S.meetup.id + "/chat",{method:"POST",body:JSON.stringify({memberId:S.memberId,text})});
    input.value="";
    await refresh();
  } catch(e) { alert(e.message); }
  finally { input.disabled=false; input.focus(); }
}

async function logout() {
  if (S.liveTimer) clearInterval(S.liveTimer);
  try { await api("/auth/logout",{method:"POST"}); } catch {}
  localStorage.removeItem("meetwise_token");
  localStorage.removeItem("meetwise_user");
  localStorage.removeItem("meetwise_member");
  location.reload();
}

if (S.token && S.user) home();
else auth();
