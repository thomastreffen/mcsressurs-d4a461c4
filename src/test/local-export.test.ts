import { describe, it, expect } from 'vitest';
import { selectExportRows, buildLocalCsv, buildLocalWorkbook, type LocalExportSnapshot } from '@/lib/local-export';
import { permitsModule } from '@/lib/company-module-access';
const snapshot:LocalExportSnapshot={title:'Ansvarsmatrise',company:'MCS Service',actor:'Thomas',date:new Date('2026-10-19'),filters:{Type:'FSE'},columns:['Rolle','Antall','Gyldig'],rows:[{'Rolle':'FSE','Antall':3,'Gyldig':new Date('2026-11-01')},{'Rolle':'HMS','Antall':5,'Gyldig':null}]};
describe('Local export standard',()=>{
  it('exports selected visible rows only and omits excluded columns',()=>{
    expect(selectExportRows(snapshot.rows,[0],['Rolle','Antall'])).toEqual([{'Rolle':'FSE','Antall':3}]);
  });
  it('cannot select records outside the supplied visible result set',()=>{
    expect(selectExportRows(snapshot.rows,[-1,99],['Rolle'])).toEqual([]);
  });
  it('preserves real numbers and dates in editable Excel',()=>{
    const s=buildLocalWorkbook(snapshot).Sheets.Data;
    expect(s.B2).toMatchObject({t:'n',v:3});
    expect(s.C2.t).toBe('d'); expect(s.C2.v).toEqual(new Date('2026-11-01'));
  });
  it('uses UTF-8 BOM and identical selected columns for CSV',()=>{
    expect(buildLocalCsv({...snapshot,rows:selectExportRows(snapshot.rows,[0],['Rolle']),columns:['Rolle']})).toBe('\uFEFF"Rolle"\r\n"FSE"');
  });
  it('escapes quotes and formula-like imported text without changing numeric cells',()=>{
    const csv=buildLocalCsv({...snapshot,columns:['Rolle','Antall'],rows:[{Rolle:'=HYPERLINK("bad")',Antall:-3}]});
    expect(csv).toContain(`"'=HYPERLINK(""bad"")";"-3"`);
  });
  it('resource plan grant never grants HMS or employees export in that company',()=>{
    const grants=[{company_id:'service',company_name:'MCS Service',org_number:null,module:'resource_plan',can_view:true,can_edit:true,can_admin:false,is_home:false}];
    expect(permitsModule(grants,'service','resource_plan','view')).toBe(true);
    expect(permitsModule(grants,'service','hms','view')).toBe(false);
    expect(permitsModule(grants,'service','employees','view')).toBe(false);
    expect(permitsModule(grants,'other','resource_plan','view')).toBe(false);
  });
});