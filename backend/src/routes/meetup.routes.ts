import { Router } from "express";
import { randomUUID } from "node:crypto";
import { createMeetup,generateInviteCode,getMeetup,getMeetupByCode,getTtlMinutes,saveMeetup,saveMemberPreferences,saveChatMessage,saveVote } from "../store.js";
import { Member,MemberPreferences,Meetup } from "../types.js";
import { addChatMessage,castVote,updatePreferences } from "../services/meetup.service.js";
import { generatePlan } from "../services/planner.service.js";
import { replanMeetup } from "../services/replan.service.js";
import { analyzeMeetup } from "../services/gemini.service.js";
import { authenticate,bearer } from "../services/auth.service.js";
export const meetupRouter=Router();

meetupRouter.post("/",async(req,res)=>{
 const title=typeof req.body?.title==="string"?req.body.title.trim():"";
 const organizerName=typeof req.body?.organizerName==="string"?req.body.organizerName.trim():"";
 const scheduledAt=typeof req.body?.scheduledAt==="string"&&req.body.scheduledAt?new Date(req.body.scheduledAt).toISOString():undefined;
 if(!title||!organizerName)return res.status(400).json({error:"title and organizerName are required"});
 const now=new Date(),organizerId=randomUUID();
 const authUser=await authenticate(bearer(req));
 const expiryBase=scheduledAt?new Date(scheduledAt).getTime():now.getTime();
 const expiresAt=new Date(Math.max(now.getTime()+getTtlMinutes()*60000,expiryBase+24*60*60*1000)).toISOString();
 const meetup:Meetup={id:randomUUID(),inviteCode:generateInviteCode(),title,organizerId,createdAt:now.toISOString(),scheduledAt,expiresAt,members:[{id:organizerId,userId:authUser?.id,name:organizerName,joinedAt:now.toISOString(),preferences:{}}],chat:[],votes:[]};
 try{return res.status(201).json(await createMeetup(meetup));}catch(e:any){
  console.error("Create meetup error:",e);
  return res.status(500).json({
   error:e?.message||"Unable to create meetup",
   details:{code:e?.code,details:e?.details,hint:e?.hint}
  });
}
});

meetupRouter.get("/code/:code",async(req,res)=>{
 const m=await getMeetupByCode(req.params.code);
 return m?res.json(m):res.status(404).json({error:"Invalid or expired invite code"});
});

meetupRouter.get("/:id",async(req,res)=>{
 const m=await getMeetup(req.params.id);
 return m?res.json(m):res.status(404).json({error:"Meetup not found or expired"});
});

meetupRouter.post("/:id/join",async(req,res)=>{
 const m=await getMeetup(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 const name=typeof req.body?.name==="string"?req.body.name.trim():"",code=typeof req.body?.inviteCode==="string"?req.body.inviteCode.trim().toUpperCase():"";
 if(!name||code!==m.inviteCode)return res.status(400).json({error:"Valid name and invite code are required"});
 const authUser=await authenticate(bearer(req));
 const member:Member={id:randomUUID(),userId:authUser?.id,name,joinedAt:new Date().toISOString(),preferences:{}};
 m.members.push(member);
 try{await saveMeetup(m);return res.status(201).json(member);}catch(e){console.error(e);return res.status(500).json({error:"Unable to save meetup member"});}
});

meetupRouter.patch("/:id/members/:memberId/preferences",async(req,res)=>{
 const m=await getMeetup(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 try{
  const member=updatePreferences(m,req.params.memberId,req.body as MemberPreferences);
  const saved=await saveMemberPreferences(m.id,req.params.memberId,req.body as MemberPreferences);
  return res.json(saved);
 }catch(e){return res.status(404).json({error:e instanceof Error?e.message:"Member not found"});}
});

meetupRouter.get("/:id/chat",async(req,res)=>{
 const m=await getMeetup(req.params.id);return m?res.json(m.chat):res.status(404).json({error:"Meetup not found or expired"});
});

meetupRouter.post("/:id/chat",async(req,res)=>{
 const m=await getMeetup(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 const memberId=typeof req.body?.memberId==="string"?req.body.memberId:"",text=typeof req.body?.text==="string"?req.body.text.trim():"";
 if(!memberId||!text)return res.status(400).json({error:"memberId and text are required"});
 try{
  const message=addChatMessage(m,memberId,text);
  await saveChatMessage(m.id,message);
  // Return the persisted message immediately. AI analysis is requested separately
  // by the client so chat delivery is not blocked by the model response time.
  return res.status(201).json({message,aiAnalysis:{available:false,reason:"Analysis runs asynchronously"}});
 }catch(e){return res.status(403).json({error:e instanceof Error?e.message:"Member does not belong to this meetup"});}
});

meetupRouter.get("/:id/votes",async(req,res)=>{
 const m=await getMeetup(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 const counts=Object.entries(m.votes.reduce<Record<string,number>>((a,v)=>(a[v.optionId]=(a[v.optionId]??0)+1,a),{})).map(([optionId,votes])=>({optionId,votes}));
 return res.json({votes:m.votes,counts});
});

meetupRouter.post("/:id/votes",async(req,res)=>{
 const m=await getMeetup(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 const memberId=typeof req.body?.memberId==="string"?req.body.memberId:"",optionId=typeof req.body?.optionId==="string"?req.body.optionId:"";
 if(!memberId||!optionId)return res.status(400).json({error:"memberId and optionId are required"});
 try{const votes=castVote(m,memberId,optionId);const latest=votes.find(v=>v.memberId===memberId);if(!latest)throw new Error("Unable to record vote");await saveVote(m.id,latest);return res.status(201).json({votes});}catch(e){return res.status(403).json({error:e instanceof Error?e.message:"Member does not belong to this meetup"});}
});

meetupRouter.post("/:id/plan",async(req,res)=>{
 const m=await getMeetup(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 try{return res.json(await generatePlan(m,typeof req.body?.when==="string"?req.body.when:undefined));}catch(e){return res.status(502).json({error:e instanceof Error?e.message:"Planning unavailable"});}
});

meetupRouter.post("/:id/replan",async(req,res)=>{
 const m=await getMeetup(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 const reason=typeof req.body?.reason==="string"&&req.body.reason.trim()?req.body.reason.trim():"A meetup constraint changed";
 const memberId=typeof req.body?.memberId==="string"?req.body.memberId:undefined;
 const when=typeof req.body?.when==="string"?req.body.when:undefined;
 try{return res.json(await replanMeetup(m,reason,memberId,when));}catch(e){return res.status(502).json({error:e instanceof Error?e.message:"Replanning unavailable"});}
});
