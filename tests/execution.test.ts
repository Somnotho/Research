import test from 'node:test';
import assert from 'node:assert/strict';
import { execute_python } from '../backend/services/execution_service/runner.ts';

test('disposable implementation sandbox runs real Python unit tests and reports failures', async () => {
  const source = 'def improve(value):\n    return value * 2';
  const pass = await execute_python({
    operation: 'python_test',
    source,
    tests:
      'import unittest\nclass ResearchTest(unittest.TestCase):\n def test_double(self): self.assertEqual(improve(3),6)',
    timeout_seconds: 10,
  });
  assert.equal(pass.passed, true);
  assert.equal(pass.tests_run, 1);
  const fail = await execute_python({
    operation: 'python_test',
    source,
    tests:
      'import unittest\nclass ResearchTest(unittest.TestCase):\n def test_double(self): self.assertEqual(improve(3),7)',
    timeout_seconds: 10,
  });
  assert.equal(fail.passed, false);
  assert.equal(fail.failures, 1);
});
test('implementation sandbox has no host workspace, injected Azure keys or external network', async () => {
  const result = await execute_python({
    operation: 'python_test',
    source: 'import os, socket',
    tests:
      'import unittest\nclass IsolationTest(unittest.TestCase):\n def test_no_workspace(self): self.assertFalse(os.path.exists("/workspace/Research/.env.local"))\n def test_no_key(self): self.assertIsNone(os.environ.get("RESEARCH_AZURE_KEY"))\n def test_no_network(self):\n  with self.assertRaises(OSError): socket.create_connection(("1.1.1.1",80),timeout=0.2)',
    timeout_seconds: 10,
  });
  assert.equal(result.passed, true);
  assert.equal(result.tests_run, 3);
});
test('implementation sandbox rejects a zero-test success and stops unbounded programs', async () => {
  const empty = await execute_python({
    operation: 'python_test',
    source: 'value=1',
    tests: 'value=2',
    timeout_seconds: 3,
  });
  assert.equal(empty.passed, false);
  assert.equal(empty.tests_run, 0);
  const loop = await execute_python({
    operation: 'python_test',
    source: 'while True: pass',
    tests: 'import unittest',
    timeout_seconds: 2,
  });
  assert.equal(loop.passed, false);
  assert.match(String(loop.error), /time limit/);
});
