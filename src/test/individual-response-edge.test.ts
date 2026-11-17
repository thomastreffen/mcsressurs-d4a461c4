// @vitest-environment node
import { readFileSync } from 'node:fs';
import { expect,it,vi } from 'vitest';
async function handler(result:unknown={success:true,http_status:200,message:'Din tildeling er avslått.'}){
 let serve:((r:Request)=>Promise<Response>)|undefined;
 const rpc=vi.fn(async(_name:string,_args:unknown)=>({data:result,error:null}));
 const createClient=()=>({rpc});
 const Deno={env:{get:()=> 'isolated-server-configuration'},serve:(h:(r:Request)=>Promise<Response>)=>{serve=h;}};
 const source=readFileSync('supabase/functions/handle-approval/index.ts','utf8').replace(/^import .*;\n/gm,'');
 // Transpile only to exercise the production entrypoint with injected DB and no network.
 const ts=await import('typescript');
 const js=ts.transpile(source,{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None});
 new Function('Deno','createClient','corsHeaders',js)(Deno,createClient,{});
 if(!serve)throw Error('handler missing');
 return {serve,rpc};
}
const token='00000000-0000-4000-8000-000000000001';
it('individual rejection calls only atomic response command; no Graph or broad job writes',async()=>{
 const {serve,rpc}=await handler();const fetchSpy=vi.spyOn(globalThis,'fetch').mockRejectedValue(Error('live network forbidden'));
 try{
  const r=await serve(new Request('http://isolated.test',{method:'POST',body:JSON.stringify({token,action:'reject',comment:'ferie'})}));
  expect(r.status).toBe(200);expect(rpc).toHaveBeenCalledTimes(1);expect(rpc.mock.calls[0]?.[0]).toBe('respond_to_job_assignment');expect(fetchSpy).not.toHaveBeenCalled();
 }finally{fetchSpy.mockRestore();}
});
it.each([{token:'malicious',action:'reject'},{token,action:'cancel_job'},{token,action:'reschedule',proposed_start:'invalid',proposed_end:'invalid'}])('rejects unsafe response input before DB',async(body)=>{
 const {serve,rpc}=await handler();const r=await serve(new Request('http://isolated.test',{method:'POST',body:JSON.stringify(body)}));expect(r.status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
it.each([403,409,410])('preserves transaction refusal HTTP %s',async(status)=>{
 const {serve}=await handler({error:'blocked',http_status:status});expect((await serve(new Request('http://isolated.test',{method:'POST',body:JSON.stringify({token,action:'approve'})}))).status).toBe(status);
});
