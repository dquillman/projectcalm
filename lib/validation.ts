import { z } from 'zod';

/**
 * Zod validation schemas for ProjectCalm data types
 * Provides runtime type validation and error messages
 */

// Base schemas
export const statusSchema = z.enum(['todo', 'in_progress', 'waiting', 'done']);
export const prioritySchema = z.number().int().min(1).max(5);
export const difficultySchema = z.number().int().min(1).max(5);

// Step schema with validation
export const stepSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  title: z.string().min(1, 'Title is required').max(500, 'Title must be less than 500 characters'),
  notes: z.string().max(5000, 'Notes must be less than 5000 characters').optional(),
  done: z.boolean(),
  today: z.boolean(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  difficulty: difficultySchema.optional(),
  dueDate: z.string().datetime().optional(), // ISO 8601 date
  estimatedMinutes: z.number().int().min(0).max(10000, 'Estimated time must be less than 10000 minutes').optional(),
  deletedAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
});

// Project schema
export const projectSchema = z.object({
  id: z.string().min(1, 'ID is required'),
  name: z.string().min(1, 'Project name is required').max(200, 'Project name must be less than 200 characters'),
  steps: z.array(stepSchema),
  deletedAt: z.string().datetime().optional(),
});

// Task schema (extends Step)
export const taskSchema = stepSchema.extend({
  kind: z.literal('task').optional(),
});

// App settings schema
export const appSettingsSchema = z.object({
  breathe: z.object({
    inhale: z.number().int().min(1).max(30),
    hold1: z.number().int().min(0).max(30),
    exhale: z.number().int().min(1).max(30),
    hold2: z.number().int().min(0).max(30),
  }),
  ui: z.object({
    showPriority: z.boolean(),
    showDifficulty: z.boolean(),
    showDueDate: z.boolean(),
    showStatus: z.boolean(),
    showEta: z.boolean(),
  }),
  defaults: z.object({
    step: z.object({
      priority: prioritySchema.optional(),
      difficulty: difficultySchema.optional(),
      status: statusSchema.optional(),
      todayDefault: z.boolean().optional(),
    }),
    task: z.object({
      priority: prioritySchema.optional(),
      difficulty: difficultySchema.optional(),
      status: statusSchema.optional(),
      todayDefault: z.boolean().optional(),
    }),
  }),
});

// Form validation schemas (for user input)
export const stepFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(500, 'Title is too long'),
  notes: z.string().max(5000, 'Notes are too long').optional(),
  status: statusSchema.optional(),
  priority: prioritySchema.optional(),
  difficulty: difficultySchema.optional(),
  dueDate: z.string().optional(),
  estimatedMinutes: z.coerce.number().int().min(0).max(10000).optional(),
});

export const taskFormSchema = stepFormSchema;

export const projectFormSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200, 'Project name is too long'),
});

// Export validation helper functions
export function validateStep(data: unknown) {
  return stepSchema.safeParse(data);
}

export function validateProject(data: unknown) {
  return projectSchema.safeParse(data);
}

export function validateTask(data: unknown) {
  return taskSchema.safeParse(data);
}

export function validateAppSettings(data: unknown) {
  return appSettingsSchema.safeParse(data);
}

export function validateStepForm(data: unknown) {
  return stepFormSchema.safeParse(data);
}

export function validateProjectForm(data: unknown) {
  return projectFormSchema.safeParse(data);
}

// Type inference from schemas
export type StepForm = z.infer<typeof stepFormSchema>;
export type TaskForm = z.infer<typeof taskFormSchema>;
export type ProjectForm = z.infer<typeof projectFormSchema>;
