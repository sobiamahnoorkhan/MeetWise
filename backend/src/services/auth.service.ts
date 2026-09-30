import { createHash,createHmac,randomUUID,timingSafeEqual } from "node:crypto";
interface User{id:string;name:string;email:string;passwordHash:string;createdAt:string}
const users=new Map<string,User>(),sessions=new Map<string,string>();
const secret=process.env.SESSION_SECRET??"meetwise-development-secret";
const hash=(p:string)=>createHash("sha256").update(p).digest("hex");
const token=(id:string)=>Buffer.from(id+"."+createHmac("sha256",secret).update(id).digest("hex")).toString("base64url");
export function signup(name:string,email:string,password:string){const e=email.trim().toLowerCase();if(users.has(e))throw new Error("An account with this email already exists");if(password.length<8)throw new Error("Password must be at least 8 characters");const u={id:randomUUID(),name:name.trim(),email:e,passwordHash:hash(password),createdAt:new Date().toISOString()};users.set(e,u);const t=token(u.id);sessions.set(t,u.id);return{token:t,user:{id:u.id,name:u.name,email:u.email}}}
export function login(email:string,password:string){const u=users.get(email.trim().toLowerCase());if(!u||u.passwordHash!==hash(password))throw new Error("Invalid email or password");const t=token(u.id);sessions.set(t,u.id);return{token:t,user:{id:u.id,name:u.name,email:u.email}}}
export function bearer(req:any){const h=typeof req.headers?.authorization==="string"?req.headers.authorization:"";return h.startsWith("Bearer ")?h.slice(7):undefined}
export function authenticate(t:string|undefined){if(!t)return undefined;const id=sessions.get(t);if(!id)return undefined;const raw=Buffer.from(t,"base64url").toString(),parts=raw.split(".");const sig=parts[1]??"",expected=createHmac("sha256",secret).update(id).digest("hex");if(parts[0]!==id||sig.length!==expected.length||!timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return undefined;for(const u of users.values())if(u.id===id)return{id:u.id,name:u.name,email:u.email};return undefined}
export const logout=(t:string|undefined)=>{if(t)sessions.delete(t)};
