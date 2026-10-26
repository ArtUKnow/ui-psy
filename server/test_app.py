import http.cookiejar
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import HTTPCookieProcessor, ProxyHandler, Request, build_opener

from app import Handler, initialize
from http.server import ThreadingHTTPServer


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        database = Path(self.folder.name) / 'test.sqlite3'
        initialize(database)
        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.server.db_path = database
        self.server.serve_dist = False
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = f'http://127.0.0.1:{self.server.server_port}'
        self.client = build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.folder.cleanup()

    def request(self, path, method='GET', body=None, token=None, client=None):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'
        req = Request(self.base + path, data=json.dumps(body).encode() if body is not None else (b'' if method == 'POST' else None), headers=headers, method=method)
        try:
            response = (client or self.client).open(req)
        except HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def test_accounts_are_isolated_and_versioned(self):
        status, first = self.request('/api/auth/register', 'POST', {'email': 'one@example.test', 'password': 'twelve-long-secret-1'})
        self.assertEqual(status, 200)
        first_token = first['accessToken']
        self.assertEqual(self.request('/api/data/entries')[0], 401)
        self.assertEqual(self.request('/api/data/entries', token=first_token), (200, {'value': None, 'version': 0}))
        self.assertEqual(self.request('/api/data/entries', 'PUT', {'value': [{'id': 'e1'}], 'version': 0}, first_token)[0], 200)
        self.assertEqual(self.request('/api/data/entries', 'PUT', {'value': [], 'version': 0}, first_token)[0], 409)

        other_client = build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()))
        status, second = self.request('/api/auth/register', 'POST', {'email': 'two@example.test', 'password': 'twelve-long-secret-2'}, client=other_client)
        self.assertEqual(status, 200)
        self.assertEqual(self.request('/api/data/entries', token=second['accessToken'], client=other_client), (200, {'value': None, 'version': 0}))
        self.assertEqual(self.request('/api/data/entries', token=first_token)[1]['value'], [{'id': 'e1'}])

    def test_refresh_rotates_and_logout_revokes_session(self):
        status, session = self.request('/api/auth/register', 'POST', {'email': 'refresh@example.test', 'password': 'twelve-long-secret-3'})
        self.assertEqual(status, 200)
        old_access = session['accessToken']
        status, rotated = self.request('/api/auth/refresh', 'POST')
        self.assertEqual(status, 200)
        self.assertNotEqual(rotated['accessToken'], old_access)
        self.assertEqual(self.request('/api/auth/me', token=old_access)[0], 401)
        self.assertEqual(self.request('/api/auth/me', token=rotated['accessToken'])[0], 200)
        self.assertEqual(self.request('/api/auth/logout', 'POST')[0], 200)
        self.assertEqual(self.request('/api/auth/me', token=rotated['accessToken'])[0], 401)
        self.assertEqual(self.request('/api/auth/refresh', 'POST')[0], 401)

    def test_patient_controls_doctor_link_and_shared_data(self):
        _, doctor = self.request('/api/auth/register', 'POST', {'role':'doctor','email': 'doctor@example.test', 'password': 'twelve-long-secret-4'})
        doctor_token = doctor['accessToken']
        _, invite = self.request('/api/links/invites', 'POST', token=doctor_token)
        code = invite['code']
        self.assertEqual(len(code), 16)
        patient_client = build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()))
        _, patient = self.request('/api/auth/register', 'POST', {'email': 'patient@example.test', 'password': 'twelve-long-secret-5'}, client=patient_client)
        patient_token = patient['accessToken']
        self.assertEqual(self.request('/api/links/patients/' + patient['user']['id'], token=doctor_token)[0], 403)
        self.assertEqual(self.request('/api/links/invites/' + code, token=patient_token, client=patient_client)[1]['doctorEmail'], 'doctor@example.test')
        self.assertEqual(self.request('/api/links/accept', 'POST', {'code': code}, patient_token, patient_client)[0], 200)
        self.assertEqual(self.request('/api/links/accept', 'POST', {'code': code}, patient_token, patient_client)[0], 404)
        self.assertEqual(self.request('/api/data/entries', 'PUT', {'value': [{'id': 'e1'}], 'version': 0}, patient_token, patient_client)[0], 200)
        self.assertEqual(self.request('/api/data/conversation', 'PUT', {'value': [{'id': 'private'}], 'version': 0}, patient_token, patient_client)[0], 200)
        status, shared = self.request('/api/links/patients/' + patient['user']['id'], token=doctor_token)
        self.assertEqual(status, 200)
        self.assertEqual(shared['data']['entries'], [{'id': 'e1'}])
        self.assertNotIn('conversation', shared['data'])
        outsider_client = build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()))
        _, outsider = self.request('/api/auth/register', 'POST', {'email': 'other@example.test', 'password': 'twelve-long-secret-6'}, client=outsider_client)
        self.assertEqual(self.request('/api/links/patients/' + patient['user']['id'], token=outsider['accessToken'], client=outsider_client)[0], 403)
        self.assertEqual(self.request('/api/links/doctors/' + doctor['user']['id'], 'DELETE', token=patient_token, client=patient_client)[0], 200)
        self.assertEqual(self.request('/api/links/patients/' + patient['user']['id'], token=doctor_token)[0], 403)

    def test_chat_is_private_idempotent_paginated_and_revoked(self):
        def account(email, role='patient'):
            client = build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()))
            status, data = self.request('/api/auth/register', 'POST', {'email': email, 'role':role,'password': 'long-chat-password-2026'}, client=client)
            self.assertEqual(status, 200)
            return data['user']['id'], data['accessToken'], client
        doctor, dt, dc = account('chat-doctor@example.test','doctor')
        patient, pt, pc = account('chat-patient@example.test')
        _, outsider, oc = account('chat-outsider@example.test')
        patient_path, doctor_path = f'/api/links/messages/doctors/{doctor}', f'/api/links/messages/patients/{patient}'
        self.assertEqual(self.request(patient_path, token=pt, client=pc)[0], 403)
        _, invite = self.request('/api/links/invites', 'POST', token=dt, client=dc)
        self.assertEqual(self.request('/api/links/accept', 'POST', {'code': invite['code']}, pt, pc)[0], 200)
        self.assertEqual(self.request(patient_path, 'POST', {'text': '   ', 'clientId': 'blank'}, pt, pc)[0], 400)
        body = {'text': 'Вопрос врачу', 'clientId': 'retry-key'}
        first = self.request(patient_path, 'POST', body, pt, pc)
        self.assertEqual(first[0], 200)
        self.assertEqual(first, self.request(patient_path, 'POST', body, pt, pc))
        self.assertEqual(self.request(patient_path, 'POST', {'text': 'Другой текст', 'clientId': 'retry-key'}, pt, pc)[0], 409)
        self.assertEqual(self.request(doctor_path, token=outsider, client=oc)[0], 403)
        self.assertEqual(self.request(patient_path, token=outsider, client=oc)[0], 403)
        self.assertEqual(self.request(doctor_path, token=dt, client=dc)[1]['messages'][0]['text'], 'Вопрос врачу')
        for index in range(51):
            self.assertEqual(self.request(doctor_path, 'POST', {'text': f'Ответ {index}', 'clientId': f'd-{index}'}, dt, dc)[0], 200)
        history = self.request(patient_path, token=pt, client=pc)[1]
        self.assertEqual(len(history['messages']), 50)
        self.assertTrue(history['hasMore'])
        older = self.request(patient_path + '?before=' + str(history['messages'][0]['id']), token=pt, client=pc)[1]
        self.assertEqual(len(older['messages']), 2)
        self.assertFalse(older['hasMore'])
        fresh = self.request(patient_path + '?after=' + str(first[1]['message']['id']), token=pt, client=pc)[1]
        self.assertEqual(len(fresh['messages']), 50)
        self.assertTrue(fresh['hasMore'])
        rest = self.request(patient_path + '?after=' + str(fresh['messages'][-1]['id']), token=pt, client=pc)[1]
        self.assertEqual(len(rest['messages']), 1)
        self.assertFalse(rest['hasMore'])
        self.assertEqual(self.request(f'/api/links/doctors/{doctor}', 'DELETE', token=pt, client=pc)[0], 200)
        self.assertEqual(self.request(patient_path, token=pt, client=pc)[0], 403)
        self.assertEqual(self.request(doctor_path, 'POST', {'text': 'После отключения', 'clientId': 'blocked'}, dt, dc)[0], 403)

    def test_clinical_plans_require_live_consent_and_keep_versions(self):
        _, doctor = self.request('/api/auth/register', 'POST', {'role':'doctor','email': 'plan-doctor@example.test', 'password': 'long-password-for-plans'})
        patient_client = build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()))
        _, patient = self.request('/api/auth/register', 'POST', {'email': 'plan-patient@example.test', 'password': 'long-password-for-plans'}, client=patient_client)
        doctor_token, patient_token = doctor['accessToken'], patient['accessToken']
        path = '/api/links/patients/' + patient['user']['id'] + '/plan'
        plan = {'assignments': [], 'medications': [], 'reviews': [], 'recommendation': 'Обсудить самочувствие'}
        self.assertEqual(self.request(path, 'PUT', {'value': plan, 'version': 0}, doctor_token)[0], 403)
        _, invite = self.request('/api/links/invites', 'POST', token=doctor_token)
        self.assertEqual(self.request('/api/links/accept', 'POST', {'code': invite['code']}, patient_token, patient_client)[0], 200)
        status, saved = self.request(path, 'PUT', {'value': plan, 'version': 0}, doctor_token)
        self.assertEqual(status, 200)
        self.assertEqual(saved['version'], 1)
        self.assertEqual(self.request(path, 'PUT', {'value': plan, 'version': 0}, doctor_token)[0], 409)
        self.assertEqual(self.request('/api/links/plans', token=patient_token, client=patient_client)[1]['plans'][0]['value'], plan)
        self.assertEqual(self.request('/api/links/patients/' + patient['user']['id'], token=doctor_token)[1]['plan']['value'], plan)
        care = {'events': [{'id': 'signal-1', 'kind': 'safety', 'text': 'Прошу обсудить безопасность', 'createdAt': '2026-10-26T12:00:00Z'}], 'sessions': [], 'health': []}
        self.assertEqual(self.request('/api/data/care', 'PUT', {'value': care, 'version': 0}, patient_token, patient_client)[0], 200)
        self.assertEqual(self.request('/api/links/patients', token=doctor_token)[1]['patients'][0]['summary']['unreviewedSignals'], 1)
        plan['reviews'] = [{'signalId': 'signal-1', 'status': 'closed', 'action': 'Проведена клиническая беседа', 'updatedAt': '2026-10-26T12:05:00Z'}]
        self.assertEqual(self.request(path, 'PUT', {'value': plan, 'version': 1}, doctor_token)[0], 200)
        self.assertEqual(self.request('/api/links/patients', token=doctor_token)[1]['patients'][0]['summary']['activeSignals'], 0)
        self.assertEqual(self.request('/api/links/doctors/' + doctor['user']['id'], 'DELETE', token=patient_token, client=patient_client)[0], 200)
        self.assertEqual(self.request(path, 'PUT', {'value': plan, 'version': 2}, doctor_token)[0], 403)
        self.assertEqual(self.request('/api/links/plans', token=patient_token, client=patient_client)[1]['plans'], [])

    def test_role_and_questionnaire_access_require_real_assignment(self):
        _, patient = self.request('/api/auth/register','POST',{'email':'access-patient@example.test','password':'long-policy-password-2026'})
        token = patient['accessToken']
        self.assertEqual(patient['user']['role'], 'patient')
        self.assertEqual(self.request('/api/links/invites','POST',token=token)[0],403)
        self.assertEqual(self.request('/api/auth/profile','PATCH',{'role':'doctor'},token)[1]['role'],'doctor')
        self.assertEqual(self.request('/api/auth/me',token=token)[1]['role'],'doctor')
        self.assertEqual(self.request('/api/data/results','PUT',{'version':0,'value':[{'id':'blocked','testId':'who5'}]},token)[0],403)
        intro={'id':'intro','testId':'phq4','answerScores':[2,1,0,0],'createdAt':'2026-10-26T12:00:00Z'}
        anxiety={'id':'anxiety','testId':'gad7','createdAt':'2026-10-26T12:05:00Z'}
        self.assertEqual(self.request('/api/data/results','PUT',{'version':0,'value':[intro,anxiety]},token)[0],200)
        self.assertEqual(self.request('/api/data/results','PUT',{'version':1,'value':[intro,anxiety,{'id':'blocked-depression','testId':'phq9'}]},token)[0],403)
        _, doctor = self.request('/api/auth/register','POST',{'email':'access-doctor@example.test','password':'long-policy-password-2026','role':'doctor'})
        dt=doctor['accessToken']
        _, invite=self.request('/api/links/invites','POST',token=dt)
        self.assertEqual(self.request('/api/links/accept','POST',{'code':invite['code']},token)[0],200)
        path='/api/links/patients/'+patient['user']['id']+'/plan'
        plan={'assignments':[{'id':'assigned','testId':'who5','dueDate':'2026-11-01','intervalDays':14,'createdAt':'2026-10-26T12:00:00Z'}],'recommendation':'','medications':[],'reviews':[]}
        self.assertEqual(self.request(path,'PUT',{'version':0,'value':plan},dt)[0],200)
        who={'id':'wellbeing','testId':'who5'}
        self.assertEqual(self.request('/api/data/results','PUT',{'version':1,'value':[intro,anxiety,who]},token)[0],200)
        plan['assignments'][0]['testId']='hamd17'
        self.assertEqual(self.request(path,'PUT',{'version':1,'value':plan},dt)[0],400)
        self.assertEqual(self.request('/api/links/doctors/'+doctor['user']['id'],'DELETE',token=token)[0],200)
        self.assertEqual(self.request('/api/data/results','PUT',{'version':2,'value':[intro,anxiety,who,{'id':'new-who','testId':'who5'}]},token)[0],403)
        self.assertEqual(self.request('/api/data/results','PUT',{'version':2,'value':[who]},token)[0],200)


if __name__ == '__main__':
    unittest.main()
