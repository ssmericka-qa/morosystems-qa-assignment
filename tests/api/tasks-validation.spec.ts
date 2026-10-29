import type { APIResponse } from '@playwright/test';
import { uniqueText } from '../../src/api/testData';
import type { TodoApi } from '../../src/api/TodoApi';
import { expect, test } from '../../src/fixtures';

const UNKNOWN_ID = 'does-not-exist-123';

test.describe('Todo API – validation and error handling', () => {
  test('POST /tasks without text is rejected with 422', async ({ api }) => {
    const response = await api.createTaskRaw({});

    expect(response.status()).toBe(422);
    expect(await response.text()).toContain("'text' field must be present");
  });

  test('POST /tasks with empty text is rejected with 422', async ({ api }) => {
    expect((await api.createTaskRaw({ text: '' })).status()).toBe(422);
  });

  test('POST /tasks/{id} without text is rejected with 422', async ({ api, task }) => {
    expect((await api.updateTaskRaw(task.id, {})).status()).toBe(422);
  });

  test('text with unicode and 500+ characters is stored unchanged', async ({ api }) => {
    const text = `${uniqueText('unicode')} – ěščřžýáíé 🚀 ${'x'.repeat(500)}`;

    const response = await api.createTask({ text });

    expect(response.status()).toBe(200);
    const created = await response.json();
    try {
      expect(created.text).toBe(text);
    } finally {
      await api.deleteTask(created.id);
    }
  });

  test('unknown id returns 404 for update, delete, complete and incomplete (FINDINGS B2)', async ({ api }) => {
    test.info().annotations.push({
      type: 'finding',
      description:
        'B2: Swagger documents 400 for an unknown id on delete/complete/incomplete and no not-found response on update; the backend returns 404.',
    });

    const responses = {
      update: await api.updateTask(UNKNOWN_ID, { text: 'x' }),
      delete: await api.deleteTask(UNKNOWN_ID),
      complete: await api.completeTask(UNKNOWN_ID),
      incomplete: await api.incompleteTask(UNKNOWN_ID),
    };
    for (const [operation, response] of Object.entries(responses)) {
      expect(response.status(), operation).toBe(404);
      expect(await response.text(), operation).toContain('id not found');
    }
  });

  test('server-owned fields cannot be set by the client', async ({ api, task }) => {
    const before = Date.now();

    const response = await api.createTaskRaw({
      text: uniqueText('tamper'),
      id: 'client-chosen-id',
      completed: true,
      createdDate: 0,
      completedDate: 1,
    });

    expect(response.status()).toBe(200);
    const created = await response.json();
    try {
      expect(created.id).not.toBe('client-chosen-id');
      expect(created.completed).toBe(false);
      expect(created).not.toHaveProperty('completedDate');
      expect(created.createdDate).toBeGreaterThanOrEqual(before - 1_000);
    } finally {
      await api.deleteTask(created.id);
    }

    // An update changes the text only – the status cannot be switched through it.
    const updated = await (await api.updateTaskRaw(task.id, { text: uniqueText('tamper'), completed: true })).json();
    expect(updated.completed).toBe(false);
    expect((await api.findTask(task.id))?.completed).toBe(false);
  });

  test('a repeated identical POST creates a second task – no idempotency (FINDINGS B8)', async ({ api }) => {
    test.info().annotations.push({
      type: 'finding',
      description: 'B8: a retried POST creates a duplicate; there is no idempotency key.',
    });
    const body = { text: uniqueText('retry') };

    const first = await (await api.createTask(body)).json();
    const second = await (await api.createTask(body)).json();
    try {
      expect(second.id).not.toBe(first.id);
      expect(await api.findTask(first.id)).toBeDefined();
      expect(await api.findTask(second.id)).toBeDefined();
    } finally {
      await api.deleteTask(first.id);
      await api.deleteTask(second.id);
    }
  });

  /**
   * Known defects are pinned by characterization tests: they assert today's (wrong) behaviour
   * precisely, so a crash or a 500 still fails them, and once the backend is fixed they fail too –
   * then the expectation is flipped to the correct response.
   */
  test.describe('KNOWN BUG – invalid input handling', () => {
    test('B3: whitespace-only text is accepted (should be 422)', async ({ api }) => {
      const response = await api.createTaskRaw({ text: '   ' });
      await deleteIfCreated(api, response);

      expect(response.status()).toBe(200);
    });

    test('B4: a number is accepted as task text (should be 422)', async ({ api }) => {
      const response = await api.createTaskRaw({ text: 12345 });
      await deleteIfCreated(api, response);

      expect(response.status()).toBe(200);
    });

    test('B9: malformed JSON is rejected with 400, but the response leaks a stack trace', async ({ request }) => {
      const response = await request.post('/tasks', {
        headers: { 'Content-Type': 'application/json' },
        data: '{"text": ',
      });

      expect(response.status()).toBe(400);
      // Should be a short error message; today it is an HTML page with server file paths.
      expect(await response.text()).toMatch(/node_modules\/body-parser/);
    });
  });
});

/** Removes a task a negative test created, so invalid data never stays in the shared db. */
async function deleteIfCreated(api: TodoApi, response: APIResponse): Promise<void> {
  if (response.ok()) {
    const body = await response.json();
    if (body?.id) await api.deleteTask(body.id);
  }
}
