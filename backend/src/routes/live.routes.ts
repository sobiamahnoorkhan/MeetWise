import { Router } from "express";
import { getMeetup } from "../store.js";
import { analyzeMeetup } from "../services/gemini.service.js";
import { createLivePlan } from "../services/live-plan.service.js";
export const liveRouter=Router();

liveRouter.post("/meetups/:id/analyze",async(req,res)=>{
 const meetup=await getMeetup(req.params.id);
 if(!meetup)return res.status(404).json({error:"Meetup not found or expired"});
 try{return res.json(await analyzeMeetup(meetup,typeof req.body?.message==="string"?req.body.message:undefined))}
 catch{return res.status(502).json({error:"AI provider unavailable"})}
});

liveRouter.post("/meetups/:id/plan",async(req,res)=>{
 const meetup=await getMeetup(req.params.id);
 if(!meetup)return res.status(404).json({error:"Meetup not found or expired"});
 const when=typeof req.body?.when==="string"?req.body.when:undefined;
 try{return res.json(await createLivePlan(meetup,when))}
 catch{return res.status(502).json({error:"Live planning provider unavailable"})}
});
