"""Run the unchanged Python API assertions against the real Go/PostgreSQL server."""
import http.cookiejar
import os
import subprocess
import sys
import unittest
from pathlib import Path
from urllib.request import HTTPCookieProcessor, ProxyHandler, build_opener

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'server'))
import test_app

class GoContractTests(test_app.ApiTests):
    def setUp(self):
        dsn = os.environ['TEST_DATABASE_URL']
        if '/ui_psy_test' not in dsn:
            raise RuntimeError('Refusing to reset a database other than ui_psy_test')
        result = subprocess.run(['psql', '-d', dsn, '-X', '-v', 'ON_ERROR_STOP=1', '-qc', 'TRUNCATE users,login_attempts RESTART IDENTITY CASCADE'], capture_output=True)
        if result.returncode:
            raise RuntimeError('Could not reset test database')
        self.base = os.environ.get('TEST_API_URL', 'http://127.0.0.1:8518')
        self.client = build_opener(ProxyHandler({}), HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def tearDown(self):
        pass

if __name__ == '__main__':
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(GoContractTests)
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    sys.exit(not result.wasSuccessful())
