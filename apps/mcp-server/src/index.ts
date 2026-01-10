#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';

import { openMindwtrDb, closeDb } from './db.js';
import { addTask, completeTask, deleteTask, getTask, listProjects, listTasks, parseQuickAdd, restoreTask, updateTask } from './queries.js';
import { runCoreService } from './core-service.js';

const args = process.argv.slice(2);

const parseArgs = (argv: string[]) => {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg || !arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      i += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
};

const flags = parseArgs(args);

const dbPath = typeof flags.db === 'string' ? flags.db : undefined;
const allowWrite = Boolean(flags.write || flags.allowWrite || flags.allowWrites);
const readonly = Boolean(flags.readonly) || !allowWrite;
const keepAlive = !(flags.nowait || flags.noWait);
const useCoreWrites = typeof (globalThis as any).Bun !== 'undefined';

const server = new McpServer({
  name: 'mindwtr-mcp-server',
  version: '0.1.0',
});

const listTasksSchema = z.object({
  status: z.string().optional(),
  projectId: z.string().optional(),
  includeDeleted: z.boolean().optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
  search: z.string().optional(),
  dueDateFrom: z.string().optional(),
  dueDateTo: z.string().optional(),
  sortBy: z.enum(['updatedAt', 'createdAt', 'dueDate', 'title', 'priority']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const addTaskSchema = z.object({
  title: z.string().optional(),
  quickAdd: z.string().optional(),
  status: z.string().optional(),
  projectId: z.string().optional(),
  dueDate: z.string().optional(),
  startTime: z.string().optional(),
  contexts: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  description: z.string().optional(),
  priority: z.string().optional(),
  timeEstimate: z.string().optional(),
}).refine((data) => data.title || data.quickAdd, {
  message: 'Either title or quickAdd is required',
});

const completeTaskSchema = z.object({
  id: z.string(),
});
const updateTaskSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  status: z.string().optional(),
  projectId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  startTime: z.string().nullable().optional(),
  contexts: z.array(z.string()).nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  description: z.string().nullable().optional(),
  priority: z.string().nullable().optional(),
  timeEstimate: z.string().nullable().optional(),
  reviewAt: z.string().nullable().optional(),
  isFocusedToday: z.boolean().optional(),
});

const deleteTaskSchema = z.object({
  id: z.string(),
});

const getTaskSchema = z.object({
  id: z.string(),
  includeDeleted: z.boolean().optional(),
});

const restoreTaskSchema = z.object({
  id: z.string(),
});

const listProjectsSchema = z.object({});

const withDb = async <T>(fn: (db: Awaited<ReturnType<typeof openMindwtrDb>>['db']) => T): Promise<T> => {
  const { db } = await openMindwtrDb({ dbPath, readonly });
  try {
    return fn(db);
  } finally {
    closeDb(db);
  }
};

server.registerTool(
  'mindwtr.list_tasks',
  {
    description: 'List tasks from the local Mindwtr SQLite database. Supports filtering by status, project, date range, and search. Supports sorting by various fields.',
    inputSchema: listTasksSchema,
  },
  async (input) => {
    const tasks = await withDb((db) => listTasks(db, {
      ...input,
      status: input.status as any,
      sortBy: input.sortBy as any,
      sortOrder: input.sortOrder as any,
    }));
    return {
      content: [{ type: 'text', text: JSON.stringify({ tasks }, null, 2) }],
    };
  },
);

server.registerTool(
  'mindwtr.list_projects',
  {
    description: 'List projects from the local Mindwtr SQLite database.',
    inputSchema: listProjectsSchema,
  },
  async () => {
    const projects = await withDb((db) => listProjects(db));
    return {
      content: [{ type: 'text', text: JSON.stringify({ projects }, null, 2) }],
    };
  },
);

server.registerTool(
  'mindwtr.add_task',
  {
    description: 'Add a task to the local Mindwtr SQLite database.',
    inputSchema: addTaskSchema,
  },
  async (input) => {
    if (readonly) throw new Error('Database opened read-only. Start the server with --write to enable edits.');
    const task = useCoreWrites
      ? await runCoreService({ dbPath, readonly }, async (core) => {
          if (input.quickAdd) {
            const projects = await withDb((db) => listProjects(db));
            const quick = parseQuickAdd(input.quickAdd, projects);
            const title = input.title ?? quick.title ?? input.quickAdd;
            const props = {
              ...quick.props,
              status: (input.status as any) ?? quick.props.status,
              projectId: input.projectId ?? quick.props.projectId,
              dueDate: input.dueDate ?? quick.props.dueDate,
              startTime: input.startTime ?? quick.props.startTime,
              contexts: input.contexts ?? quick.props.contexts,
              tags: input.tags ?? quick.props.tags,
              description: input.description ?? quick.props.description,
              priority: input.priority ?? quick.props.priority,
              timeEstimate: input.timeEstimate ?? quick.props.timeEstimate,
            };
            return core.addTask({ title, props });
          }
          return core.addTask({
            title: input.title ?? '',
            props: {
              status: input.status as any,
              projectId: input.projectId,
              dueDate: input.dueDate,
              startTime: input.startTime,
              contexts: input.contexts,
              tags: input.tags,
              description: input.description,
              priority: input.priority,
              timeEstimate: input.timeEstimate,
            },
          });
        })
      : await withDb((db) => addTask(db, { ...input, status: input.status as any }));
    return {
      content: [{ type: 'text', text: JSON.stringify({ task }, null, 2) }],
    };
  },
);

server.registerTool(
  'mindwtr.update_task',
  {
    description: 'Update a task in the local Mindwtr SQLite database.',
    inputSchema: updateTaskSchema,
  },
  async (input) => {
    if (readonly) throw new Error('Database opened read-only. Start the server with --write to enable edits.');
    const task = useCoreWrites
      ? await runCoreService({ dbPath, readonly }, async (core) => {
          return core.updateTask({
            id: input.id,
            updates: {
              title: input.title,
              status: input.status as any,
              projectId: input.projectId ?? undefined,
              dueDate: input.dueDate ?? undefined,
              startTime: input.startTime ?? undefined,
              contexts: input.contexts ?? undefined,
              tags: input.tags ?? undefined,
              description: input.description ?? undefined,
              priority: input.priority ?? undefined,
              timeEstimate: input.timeEstimate ?? undefined,
              reviewAt: input.reviewAt ?? undefined,
              isFocusedToday: input.isFocusedToday,
            },
          });
        })
      : await withDb((db) =>
          updateTask(db, {
            id: input.id,
            title: input.title,
            status: input.status as any,
            projectId: input.projectId,
            dueDate: input.dueDate,
            startTime: input.startTime,
            contexts: input.contexts,
            tags: input.tags,
            description: input.description,
            priority: input.priority,
            timeEstimate: input.timeEstimate,
            reviewAt: input.reviewAt,
            isFocusedToday: input.isFocusedToday,
          }),
        );
    return {
      content: [{ type: 'text', text: JSON.stringify({ task }, null, 2) }],
    };
  },
);

server.registerTool(
  'mindwtr.complete_task',
  {
    description: 'Mark a task as done in the local Mindwtr SQLite database.',
    inputSchema: completeTaskSchema,
  },
  async (input) => {
    if (readonly) throw new Error('Database opened read-only. Start the server with --write to enable edits.');
    const task = useCoreWrites
      ? await runCoreService({ dbPath, readonly }, async (core) => core.completeTask(input.id))
      : await withDb((db) => completeTask(db, { id: input.id }));
    return {
      content: [{ type: 'text', text: JSON.stringify({ task }, null, 2) }],
    };
  },
);

server.registerTool(
  'mindwtr.delete_task',
  {
    description: 'Soft-delete a task in the local Mindwtr SQLite database.',
    inputSchema: deleteTaskSchema,
  },
  async (input) => {
    if (readonly) throw new Error('Database opened read-only. Start the server with --write to enable edits.');
    const task = useCoreWrites
      ? await runCoreService({ dbPath, readonly }, async (core) => core.deleteTask(input.id))
      : await withDb((db) => deleteTask(db, { id: input.id }));
    return {
      content: [{ type: 'text', text: JSON.stringify({ task }, null, 2) }],
    };
  },
);

server.registerTool(
  'mindwtr.get_task',
  {
    description: 'Get a single task by ID from the local Mindwtr SQLite database.',
    inputSchema: getTaskSchema,
  },
  async (input) => {
    const task = await withDb((db) => getTask(db, { id: input.id, includeDeleted: input.includeDeleted }));
    return {
      content: [{ type: 'text', text: JSON.stringify({ task }, null, 2) }],
    };
  },
);

server.registerTool(
  'mindwtr.restore_task',
  {
    description: 'Restore a soft-deleted task in the local Mindwtr SQLite database.',
    inputSchema: restoreTaskSchema,
  },
  async (input) => {
    if (readonly) throw new Error('Database opened read-only. Start the server with --write to enable edits.');
    const task = useCoreWrites
      ? await runCoreService({ dbPath, readonly }, async (core) => core.restoreTask(input.id))
      : await withDb((db) => restoreTask(db, { id: input.id }));
    return {
      content: [{ type: 'text', text: JSON.stringify({ task }, null, 2) }],
    };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (keepAlive) {
    process.stdin.resume();
    process.stdin.on('end', () => process.exit(0));
    setInterval(() => {}, 1 << 30);
  }
}

main().catch((error) => {
  console.error('[mindwtr-mcp] Failed to start server:');
  console.error(error instanceof Error ? error.message : String(error));
  if (error instanceof Error && error.stack) {
    console.error('\nStack trace:', error.stack);
  }
  process.exit(1);
});
