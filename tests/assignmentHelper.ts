import {request,type Page,expect} from '@playwright/test';
/** Real isolated API accounts/consent/assignment, not a client permission stub. */
export async function assignedPatient(page:Page,testId:string){
 const base='http://127.0.0.1:5188';
 const doctor=await request.newContext({baseURL:base});
 const dr=await doctor.post('/api/auth/register',{data:{email:`assigned-doctor-${crypto.randomUUID()}@example.test`,password:'long-test-password-2026',role:'doctor'}});expect(dr.ok()).toBe(true);const d=await dr.json();const dh={Authorization:`Bearer ${d.accessToken}`};
 const pr=await page.request.post(base+'/api/auth/register',{data:{email:`assigned-patient-${crypto.randomUUID()}@example.test`,password:'long-test-password-2026',role:'patient'}});expect(pr.ok()).toBe(true);const p=await pr.json();const ph={Authorization:`Bearer ${p.accessToken}`};
 const invite=await(await doctor.post('/api/links/invites',{headers:dh})).json();expect((await page.request.post(base+'/api/links/accept',{headers:ph,data:{code:invite.code}})).ok()).toBe(true);
 const plan={assignments:[{id:crypto.randomUUID(),testId,dueDate:new Date().toISOString().slice(0,10),intervalDays:14,createdAt:new Date().toISOString()}],recommendation:'',medications:[],reviews:[]};
 expect((await doctor.put(`/api/links/patients/${p.user.id}/plan`,{headers:dh,data:{version:0,value:plan}})).ok()).toBe(true);await doctor.dispose();
 return {patient:p.user,headers:ph,doctor:d.user};
}
