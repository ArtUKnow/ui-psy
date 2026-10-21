import policy from './testPolicy.json';
import {patientQuestionnaires} from './questionnaires';
import type {TestResult} from './data';
import type {PlanRecord} from './clinical';

/** Only the latest complete PHQ-4 opens the appropriate self-screening branch. */
export function selfScreeningTests(results:TestResult[]):Set<string>{
 const ids=new Set(['phq4']);
 const latest=results.filter(r=>r.testId==='phq4'&&Number.isFinite(Date.parse(r.createdAt))).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt))[0];
 if(!latest)return ids;
 const form=patientQuestionnaires.find(t=>t.id==='phq4')!;
 const raw=latest.answerScores??latest.answers?.map((choice,index)=>form.questions[index]?.options[choice]?.score);
 if(!raw||raw.length!==4||raw.some(score=>!Number.isInteger(score)||score<0||score>3))return ids;
 for(const branch of policy.branches)if(branch.items.reduce((sum,index)=>sum+raw[index],0)>=branch.minimum)ids.add(branch.id);
 return ids;
}
export function availablePatientTests(results:TestResult[],plans:PlanRecord[]):Set<string>{
 const ids=selfScreeningTests(results);
 for(const record of plans)for(const item of record.value.assignments)if(patientQuestionnaires.some(t=>t.id===item.testId))ids.add(item.testId);
 return ids;
}
export function canStartPatientTest(id:string,results:TestResult[],plans:PlanRecord[]){
 // Reflection exercises are not clinical questionnaires.
 return id==='balance'||id==='care'||availablePatientTests(results,plans).has(id);
}
