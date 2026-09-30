import { Router } from "express";
import { randomUUID } from "node:crypto";
import { createMeetup,generateInviteCode,getMeetup,getMeetupByCode,getTtlMinutes } from "../store.js";
import { Member,MemberPreferences,Meetup } from "../types.js";
import { addChatMessage,castVote,updatePreferences } from "../services/meetup.service.js";
import { generatePlan } from "../services/planner.service.js";
import { replanMeetup } from "../services/replan.service.js";
export const meetupRouter=Router();
const find=(id:string)=>getMeetup(id);
meetupRouter.post("/",(req,res)=>{
 const title=typeof req.body?.title==="string"?req.body.title.trim():"";
 const organizerName=typeof req.body?.organizerName==="string"?req.body.organizerName.trim():"";
 if(!title||!organizerName)return res.status(400).json({error:"title and organizerName are required"});
 const now=new Date(),organizerId=randomUUID();
 const meetup:Meetup={id:randomUUID(),inviteCode:generateInviteCode(),title,organizerId,createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+getTtlMinutes()*60000).toISOString(),members:[{id:organizerId,name:organizerName,joinedAt:now.toISOString(),preferences:{}}],chat:[],votes:[]};
 return res.status(201).json(createMeetup(meetup));
});
meetupRouter.get("/code/:code",(req,res)=>{const m=getMeetupByCode(req.params.code);return m?res.json(m):res.status(404).json({error:"Invalid or expired invite code"});});
meetupRouter.get("/:id",(req,res)=>{const m=find(req.params.id);return m?res.json(m):res.status(404).json({error:"Meetup not found or expired"});});
meetupRouter.post("/:id/join",(req,res)=>{
 const m=find(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 const name=typeof req.body?.name==="string"?req.body.name.trim():"",code=typeof req.body?.inviteCode==="string"?req.body.inviteCode.trim().toUpperCase():"";
 if(!name||code!==m.inviteCode)return res.status(400).json({error:"Valid name and invite code are required"});
 const member:Member={id:randomUUID(),name,joinedAt:new Date().toISOString(),preferences:{}};m.members.push(member);return res.status(201).json(member);
});
meetupRouter.patch("/:id/members/:memberId/preferences",(req,res)=>{
 const m=find(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 try{return res.json(updatePreferences(m,req.params.memberId,req.body as MemberPreferences));}catch(e){return res.status(404).json({error:e instanceof Error?e.message:"Member not found"});}
});
meetupRouter.post("/:id/chat",(req,res)=>{
 const m=find(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 const memberId=typeof req.body?.memberId==="string"?req.body.memberId:"",text=typeof req.body?.text==="string"?req.body.text.trim():"";
 if(!memberId||!text)return res.status(400).json({error:"memberId and text are required"});
 try{return res.status(201).json(addChatMessage(m,memberId,text));}catch(e){return res.status(403).json({error:e instanceof Error?e.message:"Member does not belong to this meetup"});}
});
meetupRouter.post("/:id/votes",(req,res)=>{
 const m=find(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 const memberId=typeof req.body?.memberId==="string"?req.body.memberId:"",optionId=typeof req.body?.optionId==="string"?req.body.optionId:"";
 if(!memberId||!optionId)return res.status(400).json({error:"memberId and optionId are required"});
 try{return res.status(201).json({votes:castVote(m,memberId,optionId)});}catch(e){return res.status(403).json({error:e instanceof Error?e.message:"Member does not belong to this meetup"});}
});
meetupRouter.post("/:id/plan",(req,res)=>{const m=find(req.params.id);return m?res.json(generatePlan(m)):res.status(404).json({error:"Meetup not found or expired"});});
meetupRouter.post("/:id/replan",(req,res)=>{
 const m=find(req.params.id);if(!m)return res.status(404).json({error:"Meetup not found or expired"});
 const reason=typeof req.body?.reason==="string"&&req.body.reason.trim()?req.body.reason.trim():"A meetup constraint changed";
 const memberId=typeof req.body?.memberId==="string"?req.body.memberId:undefined;
 return res.json(replanMeetup(m,reason,memberId));
});