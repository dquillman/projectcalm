import { describe, it, expect } from 'vitest';
import { classNames, clamp, daysUntilDue, priorityLabel, difficultyLabel, statusLabel } from '../lib/utils';

describe('utils', () => {
  it('classNames joins truthy tokens', () => {
    expect(classNames('a', false as any, 'b', null as any, undefined as any, 'c')).toBe('a b c');
  });

  it('clamp bounds values', () => {
    expect(clamp(5, 1, 10)).toBe(5);
    expect(clamp(-1, 0, 3)).toBe(0);
    expect(clamp(9, 0, 3)).toBe(3);
  });

  it('daysUntilDue returns undefined for bad input', () => {
    // @ts-expect-no-error
    expect(daysUntilDue(undefined)).toBeUndefined();
    expect(daysUntilDue('not-a-date')).toBeUndefined();
  });

  it('priorityLabel maps numbers to labels (1..5)', () => {
    expect(priorityLabel(1)).toBe('Critical');
    expect(priorityLabel(5)).toBe('Lowest');
    expect(priorityLabel(undefined as any)).toBeUndefined();
  });

  it('difficultyLabel maps numbers to labels (1..5)', () => {
    expect(difficultyLabel(1)).toBe('Very Hard');
    expect(difficultyLabel(5)).toBe('Trivial');
    expect(difficultyLabel(undefined as any)).toBeUndefined();
  });

  it('statusLabel humanizes values', () => {
    expect(statusLabel('in_progress')).toBe('In Progress');
    expect(statusLabel('todo')).toBe('Todo');
    expect(statusLabel(undefined as any)).toBeUndefined();
  });
});

