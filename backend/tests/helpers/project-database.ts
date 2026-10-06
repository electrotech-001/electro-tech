import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
export const legacyId = "11111111-1111-1111-1111-111111111111";
export const otherId = "22222222-2222-2222-2222-222222222222";
export const draftId = "33333333-3333-3333-3333-333333333333";
export async function createProjectDatabase() {
 const db = new PGlite();
 // Minimal Supabase platform schemas; application migrations are executed unchanged.
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);`);
 for (const file of ["20260920112637_projects_management.sql", "20260920221500_project_media_and_redesign.sql", "20260921004500_homepage_projects_variable_limit.sql"]) {
  await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
 }
 for (const [id, slug] of [[legacyId, "legacy"], [otherId, "other"], [draftId, "draft"]]) {
  await db.query(`INSERT INTO projects(id,slug,title,location,size,client_organization,category,completion_year,short_summary)
   VALUES ($1,$2,$2,'Attock','10 kW','Client','Complete Solar System Installation',2026,'A complete installation story.')`, [id, slug]);
  await db.query(`INSERT INTO project_media(project_id,object_path,mime_type,alt_text,is_primary) VALUES ($1,'photo.webp','image/webp','Solar array',true)`, [id]);
  if (id !== draftId) await db.query("UPDATE projects SET status='published' WHERE id=$1", [id]);
 }
 await db.query("UPDATE projects SET is_featured_homepage=true, homepage_order=1 WHERE id=$1", [legacyId]);
 const before = await db.query("SELECT * FROM projects ORDER BY id");
 const mediaBefore = await db.query("SELECT * FROM project_media ORDER BY id");
 await db.exec(await readFile("supabase/migrations/20261006090000_project_reviews_and_completion_dates.sql", "utf8"));
 return { db, client: sqlClient(db), before: before.rows, mediaBefore: mediaBefore.rows };
}
// A test-only PostgREST-shaped adapter: every service call executes real PostgreSQL SQL.
function identifier(value: string) {
 if (!/^[a-z_]+$/.test(value)) throw new Error("Invalid test identifier");
 return '"' + value + '"';
}
export function sqlClient(db: PGlite): SupabaseClient {
 return {
  rpc: async (name: string, args: Record<string, unknown>) => {
   try {
    const entries = Object.entries(args);
    const sql = "SELECT " + identifier(name) + "(" + entries.map(([key], index) => identifier(key) + " => $" + (index + 1)).join(",") + ") AS value";
    const result = await db.query<{value: unknown}>(sql, entries.map(([, value]) => value));
    return { data: result.rows[0]?.value, error: null };
   } catch (error) { return { data: null, error }; }
  },
  from: (table: string) => {
   let operation = "select"; let columns = "*"; let payload: Record<string, unknown> = {};
   const filters: [string, unknown][] = []; const orders: string[] = []; let range = ""; let single = false;
   const builder = {
    select: (value = "*") => { columns = value; return builder; },
    eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
    order: (key: string, options: {ascending: boolean}) => { orders.push(identifier(key) + (options.ascending ? " ASC" : " DESC")); return builder; },
    range: (start: number, end: number) => { range = " LIMIT " + (end - start + 1) + " OFFSET " + start; return builder; },
    limit: (count: number) => { range = " LIMIT " + count; return builder; },
    insert: (value: Record<string, unknown>) => { operation = "insert"; payload = value; return builder; },
    update: (value: Record<string, unknown>) => { operation = "update"; payload = value; return builder; },
    delete: () => { operation = "delete"; return builder; },
    maybeSingle: () => { single = true; return execute(); },
    single: () => { single = true; return execute(); },
    then: (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) => execute().then(resolve, reject),
   };
   async function execute() {
    try {
     const params: unknown[] = [];
     const bind = (value: unknown) => { params.push(value); return "$" + params.length; };
     const entries = Object.entries(payload);
     let statement: string;
     if (operation === "insert") statement = "INSERT INTO " + identifier(table) + "(" + entries.map(([key]) => identifier(key)).join(",") + ") VALUES (" + entries.map(([,value]) => bind(value)).join(",") + ") RETURNING *";
     else {
      const where = filters.length ? " WHERE " + filters.map(([key,value]) => identifier(key) + "=" + bind(value)).join(" AND ") : "";
      if (operation === "select") {
       const projection = columns.includes("project_media") ? '*, COALESCE((SELECT jsonb_agg(m) FROM project_media m WHERE m.project_id=projects.id),\'[]\'::jsonb) AS project_media' : columns;
       statement = "SELECT " + projection + " FROM " + identifier(table) + where + (orders.length ? " ORDER BY " + orders.join(",") : "") + range;
      } else if (operation === "delete") statement = "DELETE FROM " + identifier(table) + where + " RETURNING *";
      else statement = "UPDATE " + identifier(table) + " SET " + entries.map(([key,value]) => identifier(key) + "=" + bind(value)).join(",") + where + " RETURNING *";
     }
     const result = await db.query<Record<string, unknown>>(statement, params);
     for (const row of result.rows) if (row.completion_date instanceof Date) row.completion_date = row.completion_date.toISOString().slice(0,10);
     return { data: single ? result.rows[0] ?? null : result.rows, error: null };
    } catch (error) { return { data: null, error }; }
   }
   return builder;
  },
 } as unknown as SupabaseClient;
}
