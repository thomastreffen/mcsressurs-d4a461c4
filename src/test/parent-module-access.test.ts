// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, it } from "vitest";
const U="10000000-0000-0000-0000-000000000001", C="a0000000-0000-0000-0000-000000000001", C2="a0000000-0000-0000-0000-000000000002";
const H="30000000-0000-0000-0000-000000000001", H2="30000000-0000-0000-0000-000000000002", K="30000000-0000-0000-0000-000000000003", CC="30000000-0000-0000-0000-000000000004";
let db:PGlite;
beforeAll(async()=>{ db=new PGlite(); await db.exec(`
 CREATE FUNCTION has_company_access(uuid,uuid,text,text) RETURNS boolean LANGUAGE sql AS $$ SELECT $1='${U}'::uuid AND $2='${C}'::uuid $$;
 ${["hms_handbook_versions","hms_submissions","hms_templates","calculations","customers","planning_projects"].map(t=>`CREATE TABLE ${t}(id uuid PRIMARY KEY, company_id uuid);`).join("\n")}
 CREATE TABLE customer_contacts(id uuid PRIMARY KEY, customer_id uuid);
 CREATE TABLE secrets(id uuid PRIMARY KEY, company_id uuid);
 INSERT INTO hms_submissions VALUES('${H}','${C}'),('${H2}','${C2}'); INSERT INTO customers VALUES('${K}','${C}'); INSERT INTO customer_contacts VALUES('${CC}','${K}');
 INSERT INTO secrets VALUES('${H}','${C}');`);
 await db.exec(readFileSync("drizzle/migrations/0103_parent_module_access_static_sql.sql","utf8")); },30000);
afterAll(()=>db.close());
const q=async(parent:string,id:string,uid=U)=>(await db.query<{r:boolean}>("select parent_module_access($1,$2,$3,'hms','view') r",[uid,parent,id])).rows[0].r;
it("normal own-company access works incl. customer_contacts join",async()=>{
 expect(await q("hms_submissions",H)).toBe(true); expect(await q("customer_contacts",CC)).toBe(true);
});
it("other company, other user and missing rows are denied",async()=>{
 expect(await q("hms_submissions",H2)).toBe(false); expect(await q("hms_submissions",H,"10000000-0000-0000-0000-000000000099")).toBe(false);
 expect(await q("calculations",H)).toBe(false);
});
it("malicious or non-allow-listed parent names never reach another table",async()=>{
 for(const p of ["secrets","public.secrets","hms_submissions; DROP TABLE secrets","hms_submissions WHERE true--",'"secrets"',"HMS_SUBMISSIONS",""]) expect(await q(p,H)).toBe(false);
 expect((await db.query("select count(*)::int n from secrets")).rows).toEqual([{n:1}]);
 expect(readFileSync("drizzle/migrations/0103_parent_module_access_static_sql.sql","utf8")).not.toMatch(/EXECUTE|format\(/i);
});
