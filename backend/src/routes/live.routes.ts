import { Router } from "express";
import { getMeetup } from "../store.js";
import { analyzeMeetup } from "../services/gemini.service.js";
import { createLivePlan } from "../services/live-plan.service.js";
export const liveRouter=Router();
liveRouter.post("/meetups/:id/analyze",(req,res)=>{
 const meetup=getMeetup(req.params.id);if(!meetup)return res.status(404).json({error:"Meetup not found or expired"});
 analyzeMeetup(meetup,typeof req.body?.message==="string"?req.body.message:undefined).then(x=>res.json(x)).catch(()=>res.status(502).json({error:"AI provider unavailable"}));
});
liveRouter.post("/meetups/:id/plan",(req,res)=>{
 const meetup=getMeetup(req.params.id);if(!meetup)return res.status(404).json({error:"Meetup not found or expired"});
 const when=typeof req.body?.when==="string"?req.body.when:undefined;
 createLivePlan(meetup,when).then(x=>res.json(x)).catch(()=>res.status(502).json({error:"Live planning provider unavailable"}));
});
