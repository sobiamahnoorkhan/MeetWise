import { Meetup } from "../types.js";

function fallbackAnalysis(meetup: Meetup, latestMessage?: string) {
  const text = (latestMessage || "").trim();
  const lower = text.toLowerCase();
  const constraints: string[] = [];
  const conflicts: string[] = [];
  const suggestedActions: string[] = [];
  const preferenceUpdates: any[] = [];

  meetup.members.forEach(member => {
    const p = member.preferences || {};
    if (p.area) constraints.push(member.name + " prefers " + p.area);
    if (p.budget) constraints.push(member.name + " budget is PKR " + p.budget);
    if (p.maxTravelMinutes) constraints.push(member.name + " wants travel within " + p.maxTravelMinutes + " minutes");
    if (p.transportMode) constraints.push(member.name + " prefers " + p.transportMode + " transport");
    if ((p.foodPreferences || []).length) constraints.push(member.name + " prefers " + p.foodPreferences.join(", "));
    if ((p.activityPreferences || []).length) constraints.push(member.name + " prefers " + p.activityPreferences.join(", "));
  });

  if (text) {
    if (/budget|cheap|expensive|price|cost|pkr|rs\.?\s*\d+/i.test(lower)) constraints.push("Latest chat message mentions a budget or cost constraint.");
    if (/vegetarian|vegan|halal|pizza|burger|biryani|food|restaurant|eat/i.test(lower)) constraints.push("Latest chat message mentions a food preference.");
    if (/walk|walking|car|bike|transport|drive|travel/i.test(lower)) constraints.push("Latest chat message mentions transport or travel.");
    if (/near|area|location|far|distance/i.test(lower)) constraints.push("Latest chat message mentions location or distance.");
    if (/time|today|tomorrow|tonight|evening|morning|available/i.test(lower)) constraints.push("Latest chat message mentions timing or availability.");
    if (!constraints.length) constraints.push("Latest message recorded: " + text);
  }

  const budgets = meetup.members.map(m => m.preferences?.budget).filter((x): x is number => Number.isFinite(x));
  if (budgets.length > 1 && Math.min(...budgets) !== Math.max(...budgets)) {
    conflicts.push("Members have different budget limits.");
  }
  const travels = meetup.members.map(m => m.preferences?.maxTravelMinutes).filter((x): x is number => Number.isFinite(x));
  if (travels.length > 1 && Math.min(...travels) !== Math.max(...travels)) {
    conflicts.push("Members have different maximum travel times.");
  }

  suggestedActions.push("Use the shared constraints when evaluating meetup options.");
  if (conflicts.length) suggestedActions.push("Review the highlighted conflicts before the next re-plan.");

  return {
    available: false,
    fallback: true,
    reason: "Gemini API is not configured or temporarily unavailable. MeetWise used local constraint analysis.",
    result: JSON.stringify({
      goal: meetup.title || "Find a meetup option that works for the group",
      constraints,
      conflicts,
      suggestedActions,
      preferenceUpdates,
      reply: text ? "Got it. I recorded the message as a planning constraint and will use it during the next plan." : "I reviewed the current group preferences and extracted the active planning constraints."
    })
  };
}

export async function analyzeMeetup(meetup: Meetup, latestMessage?: string) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fallbackAnalysis(meetup, latestMessage);

  const prompt = `You are the MeetWise group-planning AI agent. Analyze the meetup conversation and extract actionable planning constraints. Return ONLY valid JSON with exactly these keys: goal, constraints, conflicts, suggestedActions, preferenceUpdates, reply.
- goal: one concise shared planning goal.
- constraints: array of concrete constraints explicitly supported by member preferences or chat.
- conflicts: array of actual conflicts between members.
- suggestedActions: array of practical next actions for the planner.
- preferenceUpdates: array of objects with memberName and fields to update, but ONLY when the chat explicitly gives a new preference; never invent values.
- reply: a short natural-language response to the latest message that explains what MeetWise understood and what it will do next.
Do not invent real-world venue, weather, travel, price, or availability facts. Distinguish user-provided facts from assumptions. Meetup data: ${JSON.stringify({title:meetup.title,members:meetup.members,chat:meetup.chat.slice(-20),latestMessage})}`;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const r = await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      contents:[{parts:[{text:prompt}]}],
      generationConfig:{responseMimeType:"application/json"}
    })});
    if (!r.ok) return fallbackAnalysis(meetup, latestMessage);
    const d = await r.json() as any;
    const result = d.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!result) return fallbackAnalysis(meetup, latestMessage);
    return {available:true,fallback:false,result};
  } catch {
    return fallbackAnalysis(meetup, latestMessage);
  }
}
