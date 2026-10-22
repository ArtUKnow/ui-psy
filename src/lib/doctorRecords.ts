import { scoreQuestionnaire, doctorQuestionnaires, selfHarmAnswer } from './questionnaires';
import type { TestResult } from './data';
import type { CarePlan } from './clinical';
import type { Answers, PerinatalStatus } from './doctorScreening';

export interface DoctorAssessment {
  id: string;
  createdAt: string;
  updatedAt: string;
  answers: Answers;
  selectedFormIds?: string[];
}

export interface DoctorPatient {
  id: string;
  name: string;
  age: number;
  sex: 'female' | 'male';
  perinatal: PerinatalStatus;
  medicalHistory?: DoctorMedicalHistory;
  createdAt: string;
  assessments: DoctorAssessment[];
  clinicalPlan?: CarePlan;
}

export interface DoctorMedicalHistory {
  chiefComplaint: string;
  symptomDuration: string;
  aviandrUse: 'unknown' | 'never' | 'past' | 'current';
  aviandrDetails: string;
  otherMedications: string;
  adverseReactions: string;
}

export const emptyMedicalHistory: DoctorMedicalHistory = {
  chiefComplaint: '', symptomDuration: '', aviandrUse: 'unknown', aviandrDetails: '', otherMedications: '', adverseReactions: '',
};

const storageKey = 'ui-psy-doctor-patients';

export function loadDoctorPatients(): DoctorPatient[] {
  const value: unknown = JSON.parse(localStorage.getItem(storageKey) || '[]');
  if (!Array.isArray(value) || !value.every(item =>
    !!item && typeof item.id === 'string' && typeof item.name === 'string' &&
    typeof item.age === 'number' && (item.sex === 'female' || item.sex === 'male') &&
    ['none', 'pregnant22', 'postpartum7'].includes(item.perinatal) &&
    (item.medicalHistory === undefined || (item.medicalHistory && typeof item.medicalHistory === 'object' &&
      typeof item.medicalHistory.chiefComplaint === 'string' &&
      typeof item.medicalHistory.symptomDuration === 'string' &&
      ['unknown', 'never', 'past', 'current'].includes(item.medicalHistory.aviandrUse) &&
      typeof item.medicalHistory.aviandrDetails === 'string' &&
      typeof item.medicalHistory.otherMedications === 'string' &&
      typeof item.medicalHistory.adverseReactions === 'string')) &&
    Array.isArray(item.assessments) && item.assessments.every((entry: unknown) =>
      !!entry && typeof entry === 'object' && 'id' in entry && typeof entry.id === 'string' &&
      'answers' in entry && !!entry.answers && typeof entry.answers === 'object'
    ))) throw new Error('Некорректные данные врачебных карточек');
  return value as DoctorPatient[];
}

export function saveDoctorPatients(patients: DoctorPatient[]): void {
  localStorage.setItem(storageKey, JSON.stringify(patients));
}

export function assessmentResults(patient: DoctorPatient): TestResult[] {
  return patient.assessments.flatMap(assessment=>Object.entries(assessment.answers).flatMap(([id, choices])=>{
    const form=doctorQuestionnaires.find(t=>t.id===id);
    if(!form || choices.length!==form.questions.length || choices.some((choice,i)=>choice===null || !Number.isInteger(choice) || !form.questions[i].options[choice]))return [];
    const answers=choices as number[], result=scoreQuestionnaire(form,answers);
    return [{id:`${assessment.id}-${id}`,testId:id,title:form.title,score:result.score,maxScore:result.maxScore,subscores:result.subscores,createdAt:assessment.updatedAt,answers,answerScores:answers.map((choice,i)=>form.questions[i].options[choice].score),safety:answers.some((choice,i)=>selfHarmAnswer(id,i,form.questions[i].options[choice].score)),summary:`${result.label}: ${result.score}`}];
  }));
}
