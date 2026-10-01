import {Router} from "express";
import {authenticate,bearer,login,logout,signup} from "../services/auth.service.js";
export const authRouter=Router();

authRouter.post("/signup",async(req,res)=>{
 const n=req.body?.name,e=req.body?.email,p=req.body?.password;
 if(typeof n!=="string"||typeof e!=="string"||typeof p!=="string"||!n.trim()||!e.trim()||!p)return res.status(400).json({error:"name, email and password are required"});
 try{return res.status(201).json(await signup(n,e,p))}
 catch(x){return res.status(400).json({error:x instanceof Error?x.message:"Unable to sign up"})}
});

authRouter.post("/login",async(req,res)=>{
 try{return res.json(await login(String(req.body?.email??""),String(req.body?.password??"")))}
 catch(x){return res.status(401).json({error:x instanceof Error?x.message:"Invalid credentials"})}
});

authRouter.get("/me",async(req,res)=>{
 const u=await authenticate(bearer(req));
 return u?res.json({user:u}):res.status(401).json({error:"Not authenticated"});
});

authRouter.post("/logout",async(req,res)=>{
 await logout(bearer(req));
 res.json({ok:true});
});
