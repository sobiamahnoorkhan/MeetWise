import "dotenv/config";
import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import { deleteExpiredMeetups } from "./store.js";
import { meetupRouter } from "./routes/meetup.routes.js";
import { liveRouter } from "./routes/live.routes.js";

export const app=express();
app.use(cors({origin:process.env.CORS_ORIGIN?.split(",").map(v=>v.trim())??true}));
app.use(express.json({limit:"1mb"}));
app.get("/api/health",(_req,res)=>res.json({ok:true,service:"meetwise-backend",time:new Date().toISOString()}));
app.use("/api/meetups",meetupRouter);
app.use("/api/live",liveRouter);
app.use((_req,res)=>res.status(404).json({error:"Route not found"}));
app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{console.error(err);res.status(500).json({error:"Internal server error"});});
setInterval(deleteExpiredMeetups,60000).unref();