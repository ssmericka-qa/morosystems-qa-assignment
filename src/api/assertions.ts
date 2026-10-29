import { expect } from '@playwright/test';
import type { Task } from './TodoApi';

/** Runtime check that mirrors the Task schema of the OpenAPI spec (types alone are erased at runtime). */
export function expectTaskShape(task: unknown): asserts task is Task {
  expect(task).toEqual(
    expect.objectContaining({
      id: expect.any(String),
      text: expect.any(String),
      completed: expect.any(Boolean),
      createdDate: expect.any(Number),
    }),
  );
  const { id, createdDate, completedDate } = task as Task;
  expect(id.length, 'id must not be empty').toBeGreaterThan(0);
  expect(createdDate, 'createdDate must be a ms timestamp').toBeGreaterThan(1_000_000_000_000);
  if (completedDate !== undefined && completedDate !== null) {
    expect(completedDate).toBeGreaterThanOrEqual(createdDate);
  }
}
