import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { createApp } from "../src/app.js";
import { createProjectsRouter } from "../src/routes/projects.js";
import { createAdminReviewsRouter } from "../src/routes/project-reviews.js";
import { createAdminProjectsRouter } from "../src/routes/admin-projects.js";
import { createReviewRateLimiter } from "../src/services/rate-limit.js";
import { createPublicReviewsRouter } from "../src/routes/project-reviews.js";
import { completionDateSchema } from "../src/validation/projects.js";
import { createAuthenticateAdmin } from "../src/middleware/authenticate-admin.js";
import { createProjectDatabase, legacyId, otherId, draftId } from "./helpers/project-database.js";
let fixture: Awaited<ReturnType<typeof createProjectDatabase>>;
let server: Server; let origin: string;
const missingId = "99999999-9999-9999-9999-999999999999";
const valid = { reviewerName: "  Customer  ", rating: 5, reviewText: "  A very helpful installation team.  " };
const auth = createAuthenticateAdmin({
 getUser: async (token) => ({ data: { user: token === "allowed" ? { id: legacyId } : null }, error: null }),
 getActiveAdmin: async () => ({ userId: legacyId, displayName: "Admin", isActive: true, email: "admin@example.com" }),
});
before(async () => {
 fixture = await createProjectDatabase();
 const deps = { client: fixture.client, publicUrlBase: "https://example.com" };
 const app = createApp({ config: { nodeEnv: "test", frontendOrigin: "" },
 projectsRouter: createProjectsRouter({ ...deps, reviewRateLimiter: createReviewRateLimiter(1000) }),
 adminReviewsRouter: createAdminReviewsRouter({ ...deps, authMiddleware: auth }),
 adminProjectsRouter: createAdminProjectsRouter({ ...deps, authMiddleware: auth }),
 });
 app.use("/limited", createPublicReviewsRouter({ ...deps, rateLimiter: createReviewRateLimiter(1) }));
 server = app.listen(0, "127.0.0.1");
 await new Promise<void>((resolve) => server.once("listening", resolve));
 origin = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
});
after(async () => { if (server) await new Promise<void>((resolve) => server.close(() => resolve())); await fixture?.db.close(); });
function request(path: string, method = "GET", body?: unknown, admin = false) {
 return fetch(origin + path, { method, headers: { "Content-Type": "application/json", ...(admin ? { Authorization: "Bearer allowed" } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
test("migration preserves every legacy project field, media item, publication and homepage assignment", async () => {
 const afterRows = await fixture.db.query<Record<string,unknown>>("SELECT * FROM projects ORDER BY id");
 assert.deepEqual(afterRows.rows.map(({ completion_date, completion_date_required, ...old }) => {
  assert.equal(completion_date, null); assert.equal(completion_date_required, false); return old;
 }), fixture.before);
 assert.deepEqual((await fixture.db.query("SELECT * FROM project_media ORDER BY id")).rows, fixture.mediaBefore);
});
test("real calendar dates only, including leap-year boundaries", () => {
 for (const date of ["2026-09-15","2024-02-29","2000-02-29"]) assert.equal(completionDateSchema.safeParse(date).success,true);
 for (const date of ["2026-2-01","2026","2026-02-29","2026-04-31","2026-13-01","0000-01-01","2026-09-15T00:00:00Z"]) assert.equal(completionDateSchema.safeParse(date).success,false,date);
});
test("public review API validation rejects malformed bodies and nonexistent/unpublished projects", async () => {
 for (const body of [{...valid,reviewerName:""}, {...valid,reviewerName:undefined}, {...valid,reviewerName:"x".repeat(81)},
 {...valid,rating:0},{...valid,rating:6},{...valid,rating:2.5},{...valid,rating:"5"},{...valid,rating:undefined},
 {...valid,reviewText:"  "},{...valid,reviewText:"short"},{...valid,reviewText:"x".repeat(1001)},{...valid,projectId:otherId},{...valid,isVisible:false}]) {
  assert.equal((await request("/api/projects/"+legacyId+"/reviews","POST",body)).status,400);
 }
 for (const id of [missingId,draftId]) {
  assert.equal((await request("/api/projects/"+id+"/reviews","POST",valid)).status,404);
  assert.equal((await request("/api/projects/"+id+"/reviews")).status,404);
 }
 assert.equal((await request("/api/projects/"+legacyId+"/reviews?page=0")).status,400);
});
test("submit/store/list, project isolation, atomic duplicate retries, hide/show/delete and aggregates", async () => {
 const path = "/api/projects/"+legacyId+"/reviews";
 const created = await request(path,"POST",valid); assert.equal(created.status,201);
 const review = await created.json() as { id:string; reviewerName:string; reviewText:string; projectId:string };
 assert.equal(review.reviewerName,"Customer"); assert.equal(review.reviewText,valid.reviewText.trim()); assert.equal(review.projectId,legacyId);
 const retry = await request(path,"POST",valid); assert.equal(retry.status,200); assert.equal((await retry.json() as {id:string}).id,review.id);
 assert.equal((await request("/api/projects/"+otherId+"/reviews")).status,200);
 assert.equal((await (await request("/api/projects/"+otherId+"/reviews")).json() as {reviewCount:number}).reviewCount,0);
 await fixture.db.query("INSERT INTO project_reviews(project_id,reviewer_name,rating,review_text) VALUES ($1,'Second',3,'Another useful review')", [legacyId]);
 const summary = await (await request(path)).json() as {reviewCount:number;averageRating:number;reviews:unknown[]};
 assert.equal(summary.reviewCount,2); assert.equal(summary.averageRating,4);
 const action = "/api/admin/project-reviews/"+review.id;
 for (const method of ["PATCH","DELETE"]) assert.equal((await request(action,method,method==="PATCH"?{isVisible:false}:undefined)).status,401);
 assert.equal((await request("/api/admin/projects/"+legacyId+"/reviews")).status,401);
 const forbidden = await fetch(origin+action,{method:"DELETE",headers:{Authorization:"Bearer expired"}}); assert.equal(forbidden.status,401);
 assert.equal((await request(action,"PATCH",{isVisible:"false"},true)).status,400);
 assert.equal((await request(action,"PATCH",{isVisible:false},true)).status,200);
 const hidden = await (await request(path)).json() as {reviewCount:number;averageRating:number;reviews:{id:string}[]};
 assert.equal(hidden.reviewCount,1); assert.equal(hidden.averageRating,3); assert.ok(hidden.reviews.every(item=>item.id!==review.id));
 assert.equal((await request(path,"POST",valid)).status,409);
 const adminList = await (await request("/api/admin/projects/"+legacyId+"/reviews","GET",undefined,true)).json() as {reviews:{id:string;isVisible:boolean}[]};
 assert.equal(adminList.reviews.find(item=>item.id===review.id)?.isVisible,false);
 assert.equal((await request(action,"PATCH",{isVisible:true},true)).status,200);
 assert.equal((await (await request(path)).json() as {reviewCount:number}).reviewCount,2);
 assert.equal((await request(action,"DELETE",undefined,true)).status,204);
 assert.equal((await request(action,"DELETE",undefined,true)).status,404);
 assert.equal((await (await request(path)).json() as {reviewCount:number}).reviewCount,1);
});
test("bounded review pagination uses total visible summary and stable newest-first ordering", async () => {
 await fixture.db.query(`INSERT INTO project_reviews(project_id,reviewer_name,rating,review_text,created_at)
 SELECT $1,'Visitor '||n,4,'A helpful installation review '||n,now() + n * interval '1 second' FROM generate_series(1,23) n`,[otherId]);
 const page1 = await (await request("/api/projects/"+otherId+"/reviews")).json() as {reviews:{id:string}[];reviewCount:number;averageRating:number;hasMore:boolean};
 const page2 = await (await request("/api/projects/"+otherId+"/reviews?page=2")).json() as typeof page1;
 assert.equal(page1.reviews.length,20); assert.equal(page2.reviews.length,3);
 assert.equal(page1.reviewCount,23); assert.equal(page2.averageRating,4);
 assert.equal(page1.hasMore,true); assert.equal(page2.hasMore,false);
 assert.ok(page2.reviews.every(row=>!page1.reviews.some(first=>first.id===row.id)));
});
test("rate limit is enforced on public submissions", async () => {
 const path="/limited/"+legacyId+"/reviews";
 assert.equal((await request(path,"POST",{...valid,reviewerName:"Limited"})).status,201);
 const response=await request(path,"POST",valid); assert.equal(response.status,429);
 assert.match((await response.json() as {message:string}).message,/Too many review/);
});
test("new projects require exact dates for publication, legacy projects remain readable, date updates serialize exactly", async () => {
 const legacy=await (await request("/api/projects/legacy")).json() as {completionDate:string|null;completionYear:number};
 assert.equal(legacy.completionDate,null); assert.equal(legacy.completionYear,2026);
 for (const date of ["2026-02-29","09/15/2026"]) assert.equal((await request("/api/admin/projects/"+draftId,"PATCH",{completionDate:date},true)).status,400);
 const updated=await request("/api/admin/projects/"+legacyId,"PATCH",{completionDate:"2026-09-15"},true); assert.equal(updated.status,200);
 assert.equal((await updated.json() as {completionDate:string}).completionDate,"2026-09-15");
 assert.equal((await (await request("/api/projects/legacy")).json() as {completionDate:string}).completionDate,"2026-09-15");
 assert.equal((await request("/api/admin/projects/"+legacyId,"PATCH",{completionDate:null},true)).status,400);
 await assert.rejects(fixture.db.query("UPDATE projects SET completion_date=NULL WHERE id=$1",[legacyId]));
 await assert.rejects(fixture.db.query("UPDATE projects SET completion_date=$1 WHERE id=$2",["2026-02-29",draftId]));
 const created=await request("/api/admin/projects","POST",{title:"New project",slug:"new",clientOrganization:"Client",location:"Attock",size:"10 kW",category:"Electrical Works",completionYear:2026,shortSummary:"A complete electrical installation"},true);
 assert.equal(created.status,201);
 const project=await created.json() as {id:string};
 await fixture.db.query("INSERT INTO project_media(project_id,object_path,mime_type,alt_text,is_primary) VALUES ($1,'new.webp','image/webp','Electrical works',true)",[project.id]);
 const denied=await request("/api/admin/projects/"+project.id+"/publish","POST",undefined,true); assert.equal(denied.status,400);
 assert.ok((await denied.json() as {missingFields:string[]}).missingFields.includes("completionDate"));
 await assert.rejects(fixture.db.query("UPDATE projects SET status='published' WHERE id=$1",[project.id]));
 assert.equal((await request("/api/admin/projects/"+project.id,"PATCH",{completionDate:"2026-10-01"},true)).status,200);
 assert.equal((await request("/api/admin/projects/"+project.id+"/publish","POST",undefined,true)).status,200);
});
test("database constraints, RLS and RPC privileges block browser roles; cascade deletes only the correct reviews", async () => {
 for(const sql of [
 "INSERT INTO project_reviews(project_id,reviewer_name,rating,review_text) VALUES ('"+legacyId+"',' ',5,'Valid review text')",
 "INSERT INTO project_reviews(project_id,reviewer_name,rating,review_text) VALUES ('"+legacyId+"','Visitor',6,'Valid review text')",
 "INSERT INTO project_reviews(project_id,reviewer_name,rating,review_text) VALUES ('"+legacyId+"','Visitor',5,'short')",
 "INSERT INTO project_reviews(project_id,reviewer_name,rating,review_text) VALUES ('"+missingId+"','Visitor',5,'Valid review text')"
 ]) await assert.rejects(fixture.db.exec(sql));
 await assert.rejects(fixture.db.query("INSERT INTO project_reviews(project_id,reviewer_name,rating,review_text) VALUES ($1,$2,5,$3)",[legacyId,"\t","Valid review text"]));
 await assert.rejects(fixture.db.query("INSERT INTO project_reviews(project_id,reviewer_name,rating,review_text) VALUES ($1,$2,5,$3)",[legacyId,"Visitor","\t".repeat(20)]));
 for (const role of ["anon","authenticated"]) {
  await fixture.db.exec("SET ROLE "+role);
  for(const sql of ["SELECT * FROM project_reviews","INSERT INTO project_reviews DEFAULT VALUES","UPDATE project_reviews SET is_visible=false","DELETE FROM project_reviews","SELECT get_public_project_reviews('"+legacyId+"')","SELECT submit_project_review('"+legacyId+"','Visitor',5::smallint,'Valid review text')"]) await assert.rejects(fixture.db.exec(sql));
  await fixture.db.exec("RESET ROLE");
 }
 const existing = await fixture.db.query<{count:number}>("SELECT count(*)::int AS count FROM project_reviews WHERE project_id=$1",[legacyId]);
 await fixture.db.query("DELETE FROM projects WHERE id=$1",[otherId]);
 assert.equal((await fixture.db.query<{count:number}>("SELECT count(*)::int AS count FROM project_reviews WHERE project_id=$1",[otherId])).rows[0]?.count,0);
 assert.equal((await fixture.db.query<{count:number}>("SELECT count(*)::int AS count FROM project_reviews WHERE project_id=$1",[legacyId])).rows[0]?.count,existing.rows[0]?.count);
});
