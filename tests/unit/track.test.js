import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failReason } from '../../track.js';

const err = (message, status) => Object.assign(Error(message), status ? { status } : {});

test('AI errors are sorted into reasons', () => {
  assert.equal(failReason(err('The free AI is busy right now.', 503)), 'fail_busy');
  assert.equal(failReason(err('Daily free limit reached (20/day).', 429)), 'fail_busy');
  assert.equal(failReason(err('This request is too long for the free AI.', 413)), 'fail_long');
  assert.equal(failReason(err('Your session has expired. Sign in again.', 401)), 'fail_auth');
  assert.equal(failReason(err('Failed to fetch')), 'fail_network');
  assert.equal(failReason(err('The model answered in an unexpected format')), 'fail_format');
  assert.equal(failReason(err('Invalid code')), 'fail_format');
  assert.equal(failReason(err('something odd')), 'fail_other');
});
