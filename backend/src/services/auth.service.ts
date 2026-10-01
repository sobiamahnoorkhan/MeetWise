import { createHmac,randomBytes,scryptSync,timingSafeEqual } from "node:crypto";
import { supabase } from "../db.js";

const hash=(p:string,salt:string)=>scryptSync(p,salt,64).toString("hex");
const secret=()=>process.env.SESSION_SECRET??"meetwise-development-secret";
const token=(id:string)=>Buffer.from(id+"."+createHmac("sha256",secret()).update(id).digest("hex")).toString("base64url");

export async function signup(name:string,email:string,password:string){
 const e=email.trim().toLowerCase();
 if(password.length<8)throw new Error("Password must be at least 8 characters");
 const salt=randomBytes(16).toString("hex");
 const encodedHash=salt+":"+hash(password,salt);
 const {data,error}=await supabase.from("users").insert({name:name.trim(),email:e,password_hash:encodedHash}).select("id,name,email").single();
 if(error){
  if(error.code==="23505")throw new Error("An account with this email already exists");
  throw error;
 }
 return{token:token(data.id),user:{id:data.id,name:data.name,email:data.email}};
}

export async function login(email:string,password:string){
 const e=email.trim().toLowerCase();
 const {data,error}=await supabase.from("users").select("id,name,email,password_hash").eq("email",e).maybeSingle();
 if(error||!data)throw new Error("Invalid email or password");
 const parts=String(data.password_hash).split(":");
 if(parts.length!==2)throw new Error("Invalid email or password");
 const actualBuf=Buffer.from(hash(password,parts[0]),"hex");
 const expected=Buffer.from(parts[1],"hex");
 if(actualBuf.length!==expected.length||!timingSafeEqual(actualBuf,expected))throw new Error("Invalid email or password");
 return{token:token(data.id),user:{id:data.id,name:data.name,email:data.email}};
}

export function bearer(req:any){
 const h=typeof req.headers?.authorization==="string"?req.headers.authorization:"";
 return h.startsWith("Bearer ")?h.slice(7):undefined;
}

export async function authenticate(t:string|undefined){
 if(!t)return undefined;
 try{
  const raw=Buffer.from(t,"base64url").toString(),parts=raw.split("."),id=parts[0],sig=parts[1]??"";
  const expected=createHmac("sha256",secret()).update(id).digest("hex");
  if(!id||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return undefined;
  const {data}=await supabase.from("users").select("id,name,email").eq("id",id).maybeSingle();
  return data??undefined;
 }catch{return undefined}
}

export const logout=async(_t:string|undefined)=>{};
