import { Meetup } from "../types.js";
export async function analyzeMeetup(meetup:Meetup,latestMessage?:string){
 const key=process.env.GEMINI_API_KEY;
 if(!key)return{available:false,reason:"GEMINI_API_KEY is not configured"};
 const prompt=`You are the MeetWise planning agent. Analyze this meetup and return strict JSON with keys goal,constraints,conflicts,suggestedActions. Do not invent real-world venue/weather/travel facts. Meetup: ${JSON.stringify({title:meetup.title,members:meetup.members,chat:meetup.chat.slice(-20),latestMessage})}`;
 const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;
 const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{responseMimeType:"application/json"}})});
 if(!r.ok)throw new Error("Gemini provider unavailable");
 const d=await r.json() as any;return{available:true,result:d.candidates?.[0]?.content?.parts?.[0]?.text??""};
}