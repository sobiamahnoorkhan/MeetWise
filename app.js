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
  app.innerHTML = '<main class="shell"><div class="nav"><b class="brand">MeetWise AI</b><button id="logout" class="secondary" style="width:auto">Log out</button></div><div class="grid"><section class="card"><h2>Create meetup</h2><input id="title" placeholder="Saturday evening meetup"><label class="muted">Meetup date & time</label><input id="scheduledAt" type="datetime-local"><button id="create">Create & invite</button></section><section class="card"><h2>Join meetup</h2><input id="code" placeholder="Invite code"><input id="joinName" placeholder="Your name"><button id="join">Join</button></section></div></main>';
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
  app.innerHTML = '<main class="shell"><div class="nav"><div><b class="brand">MeetWise AI</b><div id="meetupTitle" class="muted"></div></div><span id="invite" class="pill"></span></div><div id="meetupReminder" class="muted"></div><div class="grid"><section class="card"><h3>Members</h3><div id="members"></div><h3>Your preferences</h3><div class="row"><input id="area" placeholder="Area / neighborhood"><button id="useLocation" type="button" class="secondary" style="max-width:150px">Use my location</button></div><p id="locationStatus" class="muted"></p><select id="transport"><option value="">Transport</option><option value="walking">Walking</option><option value="bike">Bike</option><option value="car">Car</option><option value="public_transport">Public transport</option></select><input id="budget" type="number" placeholder="Budget PKR"><input id="maxTravel" type="number" placeholder="Max travel minutes"><input id="food" placeholder="Food preferences"><input id="activity" placeholder="Activity preferences"><input id="when" type="datetime-local"><button id="savePrefs">Save preferences</button><button id="research" class="secondary">Research live options</button><button id="replan" class="secondary">Re-plan</button><p id="status" class="muted"></p></section><section class="card"><h3>Group chat</h3><div id="chat" class="chat"></div><div class="row"><input id="chatText" placeholder="Message or new constraint"><button id="send" style="max-width:120px">Send</button></div><button id="analyze" class="secondary">AI constraint analysis</button><pre id="ai" style="white-space:pre-wrap"></pre></section></div><section class="card" style="margin-top:18px"><h2>Live Group Preferences</h2><div id="livePrefs" class="livePrefs"></div><p id="syncStatus" class="muted">Live sync enabled</p></section><section class="card" style="margin-top:18px"><h2>AI Meetup Plan</h2><div id="results" class="emptyState">Save preferences and run research.</div></section><section class="card" style="margin-top:18px"><h2>Meetup Map</h2><div id="meetupMap" class="map"></div><p id="mapStatus" class="muted">Save a member location to place it on the map.</p></section><section class="card" style="margin-top:18px"><h2>Group Voting</h2><div id="votingPanel" class="votingPanel"><div class="emptyState">Run live research to create voting options.</div></div></section></main>';
  $("meetupTitle").textContent = S.meetup.title;
  $("invite").innerHTML = "Invite: <b>" + esc(S.meetup.inviteCode) + "</b>";
  setupMeetupReminder();
  $("savePrefs").onclick = savePrefs;
  $("useLocation").onclick = useCurrentLocation;
  $("research").onclick = research;
  $("replan").onclick = replan;
  $("send").onclick = sendChat;
  $("analyze").onclick = analyzeChat;
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
  $("chat").innerHTML = S.meetup.chat.map(x => {
    const m = S.meetup.members.find(v => v.id === x.memberId);
    return '<div class="msg"><b>' + esc(m?.name || "Member") + ":</b> " + esc(x.text) + "</div>";
  }).join("");
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
  const el = $("votingPanel");
  if (!el) return;
  // Always rebuild from the server-persisted plan. Do not depend on the
  // browser that originally performed the research.
  if (S.meetup?.finalPlan?.status === "ready") {
    S.candidates = (S.meetup.finalPlan.candidates || []).map(x => ({id:x.candidate.id,name:x.candidate.name,address:x.candidate.address||"Address unavailable"}));
  }
  if (!S.candidates.length) {
    el.innerHTML = "<div class=\"emptyState\">Save member locations and run live research to create voting options.</div>";
    return;
  }
  const votes = S.meetup?.votes || [];
  const totalMembers = S.meetup?.members?.length || 0;
  const counts = S.candidates.map(c => ({
    candidate:c,
    count:votes.filter(v => v.optionId === c.id).length
  })).sort((a,b) => b.count - a.count);
  const maxVotes = counts[0]?.count || 0;
  const voters = new Set(votes.map(v => v.memberId));
  const allMembersVoted = totalMembers > 0 && voters.size >= totalMembers;
  const leaders = counts.filter(x => x.count === maxVotes && maxVotes > 0);
  let finalHtml = "";
  if (allMembersVoted && leaders.length === 1) {
    const winner = leaders[0].candidate;
    finalHtml = `<div class="candidate" style="margin-bottom:16px"><div class="score">Final Group Choice</div><h2>🏆 ${esc(winner.name)}</h2><p class="muted">${esc(winner.address)}</p><p><b>${maxVotes} vote${maxVotes === 1 ? "" : "s"} · 100% of members</b></p><p class="muted">Everyone has voted and this place has the highest vote count.</p></div>`;
  } else if (allMembersVoted && leaders.length > 1) {
    finalHtml = `<div class="candidate" style="margin-bottom:16px"><div class="score">Voting Tie</div><h3>Two or more places have the same highest votes.</h3><p class="muted">No place is marked as the final choice until the group breaks the tie.</p></div>`;
  } else {
    const remaining = Math.max(0, totalMembers - voters.size);
    finalHtml = `<div class="candidate" style="margin-bottom:16px"><div class="score">Voting in progress</div><p>${remaining ? remaining + " member" + (remaining === 1 ? "" : "s") + " still need to vote." : "Waiting for votes."}</p></div>`;
  }
  el.innerHTML = finalHtml + counts.map(({candidate:c,count}) => {
    const mine = votes.some(v => v.memberId === S.memberId && v.optionId === c.id);
    return `<div class="candidate"><div class="score">${count} vote${count === 1 ? "" : "s"} · ${totalMembers ? Math.round(count / totalMembers * 100) : 0}% of members</div><h3>${esc(c.name)}</h3><p class="muted">${esc(c.address)}</p><button data-panel-vote="${esc(c.id)}">${mine ? "✓ Your vote" : "Vote for this option"}</button></div>`;
  }).join("");
  el.querySelectorAll("[data-panel-vote]").forEach(b => b.onclick = () => vote(b.dataset.panelVote));
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
    await api("/meetups/" + S.meetup.id + "/chat", {method:"POST", body:JSON.stringify({memberId:S.memberId,text})});
    $("chatText").value = "";
    await refresh();
    analyzeChat(text);
  } catch (e) { alert(e.message); }
}

async function analyzeChat(latestMessage) {
  try {
    const d = await api("/live/meetups/" + S.meetup.id + "/analyze", {
      method:"POST",
      body:JSON.stringify({message:latestMessage || undefined})
    });
    let result = d.result;
    if (typeof result === "string") {
      try { result = JSON.parse(result); } catch {}
    }
    if (result && typeof result === "object") {
      const reply = result.reply ? "AI: " + result.reply + "\n\n" : "";
      const constraints = Array.isArray(result.constraints) && result.constraints.length
        ? "Constraints:\n• " + result.constraints.join("\n• ")
        : "";
      const conflicts = Array.isArray(result.conflicts) && result.conflicts.length
        ? "\n\nConflicts:\n• " + result.conflicts.join("\n• ")
        : "";
      $("ai").textContent = reply + constraints + conflicts;

      // Apply only explicit, schema-shaped preference updates returned by the AI.
      const allowed = new Set(["area","transportMode","budget","foodPreferences","activityPreferences","availableFrom","availableTo","maxTravelMinutes"]);
      const updates = Array.isArray(result.preferenceUpdates) ? result.preferenceUpdates : [];
      let applied = 0;
      for (const item of updates) {
        if (!item || typeof item.memberName !== "string" || !item.fields || typeof item.fields !== "object") continue;
        const member = S.meetup.members.find(m => m.name.toLowerCase() === item.memberName.trim().toLowerCase());
        if (!member) continue;
        const patch = {};
        for (const [key,value] of Object.entries(item.fields)) {
          if (!allowed.has(key)) continue;
          if (["area","transportMode","availableFrom","availableTo"].includes(key) && typeof value === "string" && value.trim()) patch[key]=value.trim();
          else if (["budget","maxTravelMinutes"].includes(key) && Number.isFinite(Number(value))) patch[key]=Number(value);
          else if (["foodPreferences","activityPreferences"].includes(key) && Array.isArray(value)) patch[key]=value.map(String).map(x=>x.trim()).filter(Boolean);
        }
        if (Object.keys(patch).length) {
          await api("/meetups/" + S.meetup.id + "/members/" + member.id + "/preferences", {
            method:"PATCH", body:JSON.stringify(patch)
          });
          applied++;
        }
      }
      if (applied) {
        await refresh(true);
        const planTime = $("when")?.value ? localDateTimeToISO($("when").value) : undefined;
        const replanned = await api("/meetups/" + S.meetup.id + "/replan", {
          method:"POST",
          body:JSON.stringify({reason:"AI extracted an explicit constraint from group chat",memberId:S.memberId,when:planTime})
        });
        S.meetup.finalPlan = replanned.plan;
        renderPlan(replanned.plan);
        $("status").textContent = "AI understood the new constraint and re-planned the meetup.";
      }
    } else {
      $("ai").textContent = String(result ?? "");
    }
  } catch (e) {
    $("ai").textContent = e.message;
  }
}

async function logout() {
  if (S.liveTimer) clearInterval(S.liveTimer);
  try { await api("/auth/logout", {method:"POST"}); } catch {}
  localStorage.clear();
  location.reload();
}

if (S.token && S.user) home();
else auth();
