import { Router } from 'express';
import { prisma } from '../../db/prisma';
import { asyncHandler, notFound } from '../../middleware/errors';
import { currentUser, requireAuth } from '../../middleware/auth';

export const notificationRouter = Router();
notificationRouter.use(requireAuth);

/**
 * @openapi
 * /notifications:
 *   get:
 *     tags: [Notifications]
 *     summary: The signed-in user's notifications, newest first
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: unreadOnly, schema: { type: boolean, default: false } }
 *       - { in: query, name: limit, schema: { type: integer, default: 30 } }
 *     responses:
 *       200: { description: Notifications plus the unread count for the bell badge }
 */
notificationRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const unreadOnly = req.query.unreadOnly === 'true';
    const limit = Math.min(Number(req.query.limit ?? 30), 100);

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: me.sub, ...(unreadOnly ? { read: false } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({ where: { userId: me.sub, read: false } }),
    ]);

    res.json({
      items: items.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt.toISOString(),
      })),
      unreadCount,
      total: items.length,
    });
  }),
);

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark one notification as read
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Updated notification }
 *       404: { description: Not found }
 */
notificationRouter.patch(
  '/:id/read',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    // Scoped by userId so one user cannot mark another's notification read.
    const result = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: me.sub },
      data: { read: true },
    });
    if (result.count === 0) throw notFound('Notification not found');
    res.json({ id: req.params.id, read: true });
  }),
);

/**
 * @openapi
 * /notifications/read-all:
 *   patch:
 *     tags: [Notifications]
 *     summary: Mark every notification as read
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: How many were marked }
 */
notificationRouter.patch(
  '/read-all',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const result = await prisma.notification.updateMany({
      where: { userId: me.sub, read: false },
      data: { read: true },
    });
    res.json({ marked: result.count });
  }),
);
