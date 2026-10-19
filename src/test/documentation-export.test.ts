import { describe, it, expect } from 'vitest';
import { filterExportRecords, PRESETS } from '@/lib/documentation/catalog';
const records=[{id:'a',title:'A',sections:[],date:'2026-10-01',projectId:'project-a',personId:'person-a',status:'approved'},{id:'b',title:'B',sections:[],date:'2026-11-01',projectId:'project-b',personId:'person-b',status:'draft'}];
const empty={from:'',to:'',project:'',person:'',status:''};
describe('Documentation selection',()=>{
 it('filters to the selected project without leaking sibling project documents',()=>expect(filterExportRecords(records,{...empty,project:'project-a'}).map(r=>r.id)).toEqual(['a']));
 it('filters to the selected employee',()=>expect(filterExportRecords(records,{...empty,person:'person-b'}).map(r=>r.id)).toEqual(['b']));
 it('filters the selected date interval inclusively',()=>expect(filterExportRecords(records,{...empty,from:'2026-10-01',to:'2026-10-01'}).map(r=>r.id)).toEqual(['a']));
 it('filters to the selected document status',()=>expect(filterExportRecords(records,{...empty,status:'draft'}).map(r=>r.id)).toEqual(['b']));
 it('provides the editable DLE preset including original SDS',()=>expect(PRESETS['DLE-tilsyn']).toContain('sds'));
});
