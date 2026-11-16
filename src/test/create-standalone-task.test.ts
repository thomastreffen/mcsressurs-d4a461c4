import { it, expect, vi } from 'vitest';
import { finishStandaloneTask } from '../lib/create-standalone-task';
function fixture(status: 'created'|'existing'='created') {
 const order:string[]=[];
 return { order, create:vi.fn(async()=>({event_id:'task',status})),
 upload:vi.fn(async()=>{order.push('upload');return [{name:'file',url:'url',size:1}];}),
 saveAttachments:vi.fn(async()=>{order.push('files saved');}),
 notify:vi.fn(async()=>{order.push('mail requested');}),calendar:vi.fn(()=>{order.push('calendar intent');}) };
}
it('files persist before any notification or calendar intent',async()=>{
 const f=fixture(); await finishStandaloneTask(f,true,true);
 expect(f.order).toEqual(['upload','files saved','mail requested','calendar intent']);
});
it('explicit opt-out prevents mail; recipients still have planning',async()=>{
 const f=fixture();await finishStandaloneTask(f,false,true);expect(f.notify).not.toHaveBeenCalled();expect(f.calendar).toHaveBeenCalledOnce();
});
it('idempotent existing result never replays outbound actions',async()=>{
 const f=fixture('existing');await finishStandaloneTask(f,true,true);expect(f.notify).not.toHaveBeenCalled();expect(f.calendar).not.toHaveBeenCalled();
});
it('creation rejection stops uploads, mail and calendar',async()=>{
 const f=fixture();f.create.mockRejectedValue(new Error('assignment rollback'));await expect(finishStandaloneTask(f,true,true)).rejects.toThrow('rollback');expect(f.upload).not.toHaveBeenCalled();expect(f.notify).not.toHaveBeenCalled();
});
it('attachment failure never sends incomplete information',async()=>{
 const f=fixture();f.saveAttachments.mockRejectedValue(new Error('file failure'));await expect(finishStandaloneTask(f,true,true)).rejects.toThrow('file failure');expect(f.notify).not.toHaveBeenCalled();expect(f.calendar).not.toHaveBeenCalled();
});
it('unassigned standalone reminder creates without outbound recipient calls',async()=>{
 const f=fixture();await finishStandaloneTask(f,true,false);expect(f.notify).not.toHaveBeenCalled();expect(f.calendar).not.toHaveBeenCalled();
});
