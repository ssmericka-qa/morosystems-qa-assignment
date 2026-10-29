import type { APIRequestContext, APIResponse } from '@playwright/test';
import type { components } from './generated/schema';

/** Types generated from the backend OpenAPI spec (npm run api:codegen). */
export type Task = components['schemas']['Task'];
export type CreateTask = components['schemas']['CreateTask'];
export type UpdateTask = components['schemas']['UpdateTask'];

/**
 * Thin connector for the todo backend, typed by the generated OpenAPI types. Methods return the
 * raw APIResponse, so tests stay in control of status and body assertions.
 * The `*Raw` variants accept any body on purpose – negative tests send invalid payloads.
 */
export class TodoApi {
  constructor(private readonly request: APIRequestContext) {}

  /** GET /tasks – slow by design (~3 s); the timeout leaves room for load from parallel tests (FINDINGS B7). */
  listTasks(): Promise<APIResponse> {
    return this.request.get('/tasks', { timeout: 15_000 });
  }

  listCompleted(): Promise<APIResponse> {
    return this.request.get('/tasks/completed');
  }

  createTask(body: CreateTask): Promise<APIResponse> {
    return this.createTaskRaw(body);
  }

  createTaskRaw(body: unknown): Promise<APIResponse> {
    return this.request.post('/tasks', { data: body });
  }

  /** Updates the task text. The backend uses POST /tasks/{id} – there is no PUT (FINDINGS B1). */
  updateTask(id: string, body: UpdateTask): Promise<APIResponse> {
    return this.updateTaskRaw(id, body);
  }

  updateTaskRaw(id: string, body: unknown): Promise<APIResponse> {
    return this.request.post(`/tasks/${encodeURIComponent(id)}`, { data: body });
  }

  completeTask(id: string): Promise<APIResponse> {
    return this.request.post(`/tasks/${encodeURIComponent(id)}/complete`);
  }

  incompleteTask(id: string): Promise<APIResponse> {
    return this.request.post(`/tasks/${encodeURIComponent(id)}/incomplete`);
  }

  deleteTask(id: string): Promise<APIResponse> {
    return this.request.delete(`/tasks/${encodeURIComponent(id)}`);
  }

  /** Reads one task back from the list – used to prove that a change was persisted. */
  async findTask(id: string): Promise<Task | undefined> {
    const tasks: Task[] = await (await this.listTasks()).json();
    return tasks.find((task) => task.id === id);
  }
}
