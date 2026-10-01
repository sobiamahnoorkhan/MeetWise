import "dotenv/config";
import express,{NextFunction,Request,Response} from "express";
import cors from "cors";
import {deleteExpiredMeetups} from "./store.js";
import {supabase} from "./db.js";
import {meetupRouter} from "./routes/meetup.routes.js";
import {liveRouter} from "./routes/live.routes.js";
import {authRouter} from "./routes/auth.routes.js";

export const app=express();
app.use(cors({origin:process.env.CORS_ORIGIN?.split(",").map(v=>v.trim())??true}));
app.use(express.json({limit:"1mb"}));

app.get("/api/health",async(_req,res)=>{
 const {error}=await supabase.from("users").select("id",{head:true,count:"exact"});
 res.json({
  ok:!error,
  service:"meetwise-backend",
  database:error?"error":"connected",
  time:new Date().toISOString()
 });
});

app.use("/api/auth",authRouter);
app.use("/api/meetups",meetupRouter);
app.use("/api/live",liveRouter);
app.use((_req,res)=>res.status(404).json({error:"Route not found"}));
app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{console.error(err);res.status(500).json({error:"Internal server error"});});
setInterval(()=>{deleteExpiredMeetups().catch(console.error)},60000).unref();
