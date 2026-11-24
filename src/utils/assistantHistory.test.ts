import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAssistantHistory,
  normalizeGraphicsQuality,
  sanitizeGroundingSources,
} from './assistantHistory';
import { ChatMessage } from '../types/ghad';

test('buildAssistantHistory slices strictly before activeUserMessageId', () => {
  const messages: ChatMessage[] = [
    { id: 'u1', role: 'user', text: 'What is CBC?', timestamp: '2026-01-01T10:00:00Z' },
    { id: 'b1', role: 'bot', text: 'Competence-Based Curriculum.', timestamp: '2026-01-01T10:00:05Z' },
    { id: 'u2', role: 'user', text: 'Give 3 stages.', timestamp: '2026-01-01T10:01:00Z' },
    { id: 'b2', role: 'bot', text: 'Intro, Development, Conclusion.', timestamp: '2026-01-01T10:01:05Z' },
    { id: 'u3', role: 'user', text: 'Tell me ten importance of food.', timestamp: '2026-01-01T10:02:00Z' },
  ];

  const historyForU3 = buildAssistantHistory(messages, 'u3');
  assert.deepEqual(historyForU3, [
    { role: 'user', text: 'What is CBC?' },
    { role: 'model', text: 'Competence-Based Curriculum.' },
    { role: 'user', text: 'Give 3 stages.' },
    { role: 'model', text: 'Intro, Development, Conclusion.' },
  ]);

  // Retrying an earlier turn (u2) excludes later turns and stops at model b1
  const historyForU2 = buildAssistantHistory(messages, 'u2');
  assert.deepEqual(historyForU2, [
    { role: 'user', text: 'What is CBC?' },
    { role: 'model', text: 'Competence-Based Curriculum.' },
  ]);
});

test('buildAssistantHistory merges consecutive same-role messages and skips _err / trailing user', () => {
  const messages: ChatMessage[] = [
    { id: 'u1', role: 'user', text: 'First question', timestamp: '2026-01-01T10:00:00Z' },
    { id: 'u1_err', role: 'bot', text: 'Temporary network failure', timestamp: '2026-01-01T10:00:01Z' },
    { id: 'u1b', role: 'user', text: 'Clarification', timestamp: '2026-01-01T10:00:02Z' },
    { id: 'b1', role: 'bot', text: 'Combined answer.', timestamp: '2026-01-01T10:00:10Z' },
    { id: 'u2', role: 'user', text: 'Next question', timestamp: '2026-01-01T10:01:00Z' },
  ];

  const history = buildAssistantHistory(messages, 'u2');
  assert.deepEqual(history, [
    { role: 'user', text: 'First question\n\nClarification' },
    { role: 'model', text: 'Combined answer.' },
  ]);

  // If last turn before target was an unanswered user message, it drops trailing user so alternation holds
  const unanswered: ChatMessage[] = [
    { id: 'u1', role: 'user', text: 'Question 1', timestamp: '2026-01-01T10:00:00Z' },
    { id: 'b1', role: 'bot', text: 'Answer 1', timestamp: '2026-01-01T10:00:05Z' },
    { id: 'u2', role: 'user', text: 'Orphan user message', timestamp: '2026-01-01T10:01:00Z' },
    { id: 'u3', role: 'user', text: 'Active question', timestamp: '2026-01-01T10:02:00Z' },
  ];
  assert.deepEqual(buildAssistantHistory(unanswered, 'u3'), [
    { role: 'user', text: 'Question 1' },
    { role: 'model', text: 'Answer 1' },
  ]);
});

test('sanitizeGroundingSources filters unsafe URLs and deduplicates', () => {
  const sources = sanitizeGroundingSources([
    { title: 'REB Official', uri: 'https://www.reb.gov.rw/curriculum' },
    { title: 'Duplicate', uri: 'https://www.reb.gov.rw/curriculum' },
    { title: 'Evil', uri: 'javascript:alert(1)' },
    { title: '', uri: 'https://elearning.reb.rw/course' },
  ]);

  assert.deepEqual(sources, [
    { title: 'REB Official', uri: 'https://www.reb.gov.rw/curriculum' },
    { title: 'elearning.reb.rw', uri: 'https://elearning.reb.rw/course' },
  ]);
});

test('normalizeGraphicsQuality defaults safely to ultra unless low', () => {
  assert.equal(normalizeGraphicsQuality('low'), 'low');
  assert.equal(normalizeGraphicsQuality('ultra'), 'ultra');
  assert.equal(normalizeGraphicsQuality(undefined), 'ultra');
  assert.equal(normalizeGraphicsQuality('invalid'), 'ultra');
});
