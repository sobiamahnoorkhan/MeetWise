import {Router} from "express";
import {authenticate,bearer,login,logout,signup} from "../services/auth.service.js";
export const authRouter=Router();
authRouter.post("/signup",(req,res)=>{const n=req.body?.name,e=req.body?.email,p=req.body?.password;if(typeof n!=="string"||typeof e!=="string"||typeof p!=="string"||!n.trim()||!e.trim()||!p)return res.status(400).json({error:"name, email and password are required"});try{return res.status(201).json(signup(n,e,p))}catch(x){return res.status(400).json({error:x instanceof Error?x.message:"Unable to sign up"})}});
authRouter.post("/login",(req,res)=>{try{return res.json(login(String(req.body?.email??""),String(req.body?.password??"")))}catch(x){return res.status(401).json({error:x instanceof Error?x.message:"Invalid credentials"})}});
authRouter.get("/me",(req,res)=>{const u=authenticate(bearer(req));return u?res.json({user:u}):res.status(401).json({error:"Not authenticated"})});
authRouter.post("/logout",(req,res)=>{logout(bearer(req));res.json({ok:true})});
