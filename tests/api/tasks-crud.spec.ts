import { expectTaskShape } from '../../src/api/assertions';
import { uniqueText } from '../../src/api/testData';
import type { Task } from '../../src/api/TodoApi';
import { expect, test } from '../../src/fixtures';

/** Assignment API steps 2–5. Every change is verified twice: in the response and by reading it back. */
test.describe('Todo API – task lifecycle', () => {
  test('step 2: GET /tasks returns the list of tasks', async ({ api, task }) => {
    const response = await api.listTasks();

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    const tasks: Task[] = await response.json();
    expect(Array.isArray(tasks)).toBe(true);
    // Only our own task is checked – the db is shared with tests running in parallel.
    const ours = tasks.find((t) => t.id === task.id);
    expectTaskShape(ours);
    expect(ours).toEqual(task);
  });

  test('step 3: POST /tasks creates a new task', async ({ api }) => {
    const text = uniqueText('create');
    const before = Date.now();

    const response = await api.createTask({ text });

    expect(response.status()).toBe(200);
    const created = await response.json();
    try {
      expectTaskShape(created);
      expect(created).toMatchObject({ text, completed: false });
      expect(created).not.toHaveProperty('completedDate');
      expect(created.createdDate).toBeGreaterThanOrEqual(before - 1_000);
      expect(await api.findTask(created.id)).toEqual(created);
    } finally {
      await api.deleteTask(created.id);
    }
  });

  test('step 4: update the task text – POST /tasks/{id} (the API has no PUT)', async ({ api, task }) => {
    const newText = uniqueText('updated');

    const response = await api.updateTask(task.id, { text: newText });

    expect(response.status()).toBe(200);
    const updated = await response.json();
    expect(updated).toEqual({ ...task, text: newText });
    expect(await api.findTask(task.id), 'the change is persisted').toEqual(updated);
  });

  test('step 4: PUT /tasks/{id} as written in the assignment is not offered (FINDINGS B1)', async ({ request, api, task }) => {
    test.info().annotations.push({
      type: 'finding',
      description: 'B1: the backend has no PUT; updates use POST /tasks/{id}. CORS also allows only GET, POST, DELETE.',
    });

    // Sent directly, not through the connector – the connector describes only endpoints that exist.
    const response = await request.put(`/tasks/${task.id}`, { data: { text: 'via PUT' } });

    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('Cannot PUT');
    expect(await api.findTask(task.id), 'the task stays untouched').toEqual(task);
  });

  test('step 5: DELETE /tasks/{id} removes the task', async ({ api, task }) => {
    const response = await api.deleteTask(task.id);

    expect(response.status()).toBe(200);
    expect(await api.findTask(task.id)).toBeUndefined();
    // Deleting again reports "not found" instead of pretending success.
    expect((await api.deleteTask(task.id)).status()).toBe(404);
  });

  test('POST /tasks/{id}/complete and /incomplete toggle the status', async ({ api, task }) => {
    const completeResponse = await api.completeTask(task.id);
    expect(completeResponse.status()).toBe(200);
    const completed = await completeResponse.json();
    expectTaskShape(completed);
    expect(completed.completed).toBe(true);
    expect(completed.completedDate).toBeGreaterThanOrEqual(task.createdDate);

    const completedIds = async () => ((await (await api.listCompleted()).json()) as Task[]).map((t) => t.id);
    expect(await completedIds()).toContain(task.id);

    const incompleteResponse = await api.incompleteTask(task.id);
    expect(incompleteResponse.status()).toBe(200);
    const reopened = await incompleteResponse.json();
    expect(reopened.completed).toBe(false);
    expect(reopened).not.toHaveProperty('completedDate');
    expect(await completedIds(), 'a reopened task leaves the completed list').not.toContain(task.id);
  });
});
