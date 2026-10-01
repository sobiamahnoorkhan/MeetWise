import { Meetup } from "../types.js";
export async function analyzeMeetup(meetup:Meetup,latestMessage?:string){
 const key=process.env.GEMINI_API_KEY;
 if(!key)return{available:false,reason:"GEMINI_API_KEY is not configured"};
 const prompt=`You are the MeetWise group-planning AI agent. Analyze the meetup conversation and extract actionable planning constraints. Return ONLY valid JSON with exactly these keys: goal, constraints, conflicts, suggestedActions, preferenceUpdates, reply.\n- goal: one concise shared planning goal.\n- constraints: array of concrete constraints explicitly supported by member preferences or chat.\n- conflicts: array of actual conflicts between members.\n- suggestedActions: array of practical next actions for the planner.\n- preferenceUpdates: array of objects with memberName and fields to update, but ONLY when the chat explicitly gives a new preference; never invent values.\n- reply: a short natural-language response to the latest message that explains what MeetWise understood and what it will do next.\nDo not invent real-world venue, weather, travel, price, or availability facts. Distinguish user-provided facts from assumptions. Meetup data: ${JSON.stringify({title:meetup.title,members:meetup.members,chat:meetup.chat.slice(-20),latestMessage})}`;
 const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
 const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json"}})});
 if(!r.ok)throw new Error("Gemini provider unavailable");
 const d=await r.json() as any;return{available:true,result:d.candidates?.[0]?.content?.parts?.[0]?.text??""};
}