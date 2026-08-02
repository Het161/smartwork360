import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { auditRouter } from './modules/audit/audit.routes';
import { userRouter } from './modules/users/user.routes';
import { departmentRouter } from './modules/departments/department.routes';
import { taskRouter } from './modules/tasks/task.routes';
import { analyticsRouter } from './modules/analytics/analytics.routes';
import { sentimentRouter } from './modules/sentiment/sentiment.routes';
import { burnoutRouter } from './modules/burnout/burnout.routes';
import { fraudRouter } from './modules/fraud/fraud.routes';
import { chatRouter } from './modules/chat/chat.routes';
import { notificationRouter } from './modules/notifications/notification.routes';
import { reportRouter } from './modules/reports/report.routes';
import { jobsRouter } from './modules/jobs/jobs.routes';

/** Everything is mounted under /api/v1. */
export function buildApiRouter(): Router {
  const api = Router();

  api.use('/auth', authRouter);
  api.use('/users', userRouter);
  api.use('/departments', departmentRouter);
  api.use('/tasks', taskRouter);
  api.use('/analytics', analyticsRouter);
  api.use('/sentiment', sentimentRouter);
  api.use('/burnout', burnoutRouter);
  api.use('/fraud', fraudRouter);
  api.use('/audit', auditRouter);
  api.use('/chat', chatRouter);
  api.use('/notifications', notificationRouter);
  api.use('/reports', reportRouter);
  api.use('/jobs', jobsRouter);

  return api;
}
