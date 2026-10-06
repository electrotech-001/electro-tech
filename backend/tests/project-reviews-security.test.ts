import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createApp } from "../src/app.js";
import { createProjectsRouter } from "../src/routes/projects.js";
import { createReviewRateLimiter } from "../src/services/rate-limit.js";
const id="11111111-1111-1111-1111-111111111111";
let server:Server;let origin:string;
before(async()=>{
 const client={rpc:async()=>({data:null,error:{message:"private-database-debug"}})} as unknown as SupabaseClient;
 const app=createApp({config:{nodeEnv:"test",frontendOrigin:""},projectsRouter:createProjectsRouter({client,reviewRateLimiter:createReviewRateLimiter(100)})});
 server=app.listen(0,"127.0.0.1");
 await new Promise<void>(resolve=>server.once("listening",resolve));
 origin="http://127.0.0.1:"+(server.address() as AddressInfo).port;
});
after(async()=>{if(server)await new Promise<void>(resolve=>server.close(()=>resolve()));});
test("review failures return sanitized errors without internal details",async()=>{
 for(const method of ["GET","POST"]){
  const response=await fetch(origin+"/api/projects/"+id+"/reviews",{method,headers:{"Content-Type":"application/json"},...(method==="POST"?{body:JSON.stringify({reviewerName:"Visitor",rating:5,reviewText:"Valid installation review"})}:{})});
  assert.equal(response.status,503);
  const text=await response.text();assert.doesNotMatch(text,/private-database-debug|stack|Error:/);
 }
});
test("review request size and JSON parsing are bounded and sanitized",async()=>{
 for(const [body,status] of [["{",400],["x".repeat(9000),413]] as const){
  const response=await fetch(origin+"/api/projects/"+id+"/reviews",{method:"POST",headers:{"Content-Type":"application/json"},body});
  assert.equal(response.status,status);assert.doesNotMatch(await response.text(),/SyntaxError|stack|node_modules/);
 }
});
test("public users cannot edit or delete reviews",async()=>{
 for(const method of ["PATCH","DELETE"]){
  const response=await fetch(origin+"/api/projects/"+id+"/reviews",{method,headers:{"Content-Type":"application/json"},body:JSON.stringify({isVisible:false})});
  assert.equal(response.status,404);
 }
});
