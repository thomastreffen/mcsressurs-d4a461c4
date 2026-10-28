import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import { afterEach,beforeEach,describe,expect,it,vi } from 'vitest';
import { CombinedPdfPreview } from '@/components/compliance/CombinedPdfPreview';
const m=vi.hoisted(()=>({build:vi.fn(),download:vi.fn()}));
vi.mock('@/lib/documentation/combined-pdf',()=>({buildCombinedPdf:m.build}));
vi.mock('@/lib/dle/export',()=>({deliverDleBlob:m.download}));
vi.mock('sonner',()=>({toast:{error:vi.fn()}}));
const input={company:'MCS Service AS',title:'DLE 63210',caseNumber:'63210',date:'2026-10-28',findings:[{id:'f2',finding_number:2,title:'Internrevisjon',status:'documentation_ready'}],documents:[]};
beforeEach(()=>{vi.clearAllMocks();URL.createObjectURL=vi.fn(()=> 'blob:local-pdf');URL.revokeObjectURL=vi.fn();m.build.mockResolvedValue({name:'Svarpakke_63210.pdf',blob:new Blob(['PDF'],{type:'application/pdf'}),pageCount:5,chapters:[{title:'Funn 2 - Internrevisjon',page:3}],documents:[],warnings:[]});});
afterEach(cleanup);
describe('Read-only PDF preview and download',()=>{
 it('builds only on preview click, downloads the exact same bytes, and changes no data',async()=>{
   render(<CombinedPdfPreview input={input}/>);expect(m.build).not.toHaveBeenCalled();expect(m.download).not.toHaveBeenCalled();
   fireEvent.click(screen.getByRole('button',{name:'Forhåndsvis samlet PDF'}));await screen.findByText('Funn 2 - Internrevisjon · side 3');
   fireEvent.click(screen.getByRole('button',{name:'Last ned svarpakke'}));await waitFor(()=>expect(m.download).toHaveBeenCalledTimes(1));
   expect(m.download.mock.calls[0][0]).toBe((await m.build.mock.results[0].value).blob);expect(m.download.mock.calls[0][1]).toBe('Svarpakke_63210.pdf');expect(m.build).toHaveBeenCalledTimes(1);
 });
 it('requires a new PDF preview when selections change',async()=>{
   const view=render(<CombinedPdfPreview input={input}/>);fireEvent.click(screen.getByRole('button',{name:'Forhåndsvis samlet PDF'}));await screen.findByText(/Svarpakke_63210.pdf/);
   view.rerender(<CombinedPdfPreview input={{...input,title:'Endret sak'}}/>);expect(screen.getByRole('button',{name:'Last ned svarpakke'})).toBeDisabled();expect(m.download).not.toHaveBeenCalled();
 });
});