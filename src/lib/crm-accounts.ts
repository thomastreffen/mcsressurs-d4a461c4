export interface CrmAccount {
 id: string; name: string; customer_id: string; company_id: string; customer_name: string;
 owner_user_id: string | null; owner_name: string | null; relationship: string | null;
 temperature: string | null; priority: string | null; last_contact_on: string | null;
 next_followup_on: string | null; next_action: string | null; version: number;
}
export const CRM_LABELS: Record<string,string> = {existing:'Eksisterende',prospect:'Prospekt',hot:'Hot',warm:'Warm',cold:'Cold'};
export const FOCUS_CUSTOMERS=['Caverion','Assemblin','Bravida','OneCo','Eltel'];
export function osloToday() { return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Oslo'}).format(new Date()); }
export function filterCrmAccounts(rows:CrmAccount[],filters:{search:string;relationship:string;temperature:string;priority:string;owner:string;due:string;focus:boolean},today:string) {
 return rows.filter(r=>(!filters.search || `${r.name} ${r.customer_name} ${r.owner_name??''}`.toLocaleLowerCase('nb').includes(filters.search.toLocaleLowerCase('nb')))
 &&(!filters.focus||FOCUS_CUSTOMERS.some(n=>r.customer_name.toLowerCase().includes(n.toLowerCase())))
 &&(['relationship','temperature','priority'].every(k=>filters[k as 'relationship']==='all'||r[k as 'relationship']===filters[k as 'relationship']))
 &&(filters.owner==='all'||(filters.owner==='unassigned'?!r.owner_user_id:r.owner_user_id===filters.owner))
 &&(filters.due==='all'||(filters.due==='missing'?!r.next_followup_on:!!r.next_followup_on&&r.next_followup_on<=today)))
 .sort((a,b)=>(a.next_followup_on??'9999').localeCompare(b.next_followup_on??'9999')|| (a.priority??'Z').localeCompare(b.priority??'Z')||a.name.localeCompare(b.name,'nb'));
}
