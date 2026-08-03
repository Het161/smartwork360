import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { supportConfig } from '../config/env';
import { asyncHandler, notFound } from '../middleware/errors';
import { currentUser, requireAuth, requireRole } from '../middleware/auth';
import { validateBody, body } from '../middleware/validate';
import { ask } from './support.service';
import { reindexKb } from './kb.indexer';
import { applyFix, undoFix } from './remediation/executor';
import { actionsForRole, REGISTRY } from './remediation/registry';

export const supportRouter = Router();
supportRouter.use(requireAuth);

const chatSchema = z.object({
  message: z.string().min(1, 'Type a question').max(2000),
  conversationId: z.string().optional(),
  lang: z.enum(['en', 'hi']).default('en'),
  currentRoute: z.string().max(200).default('/'),
  // .nullish(): the panel sends null when nothing is attached, which is the
  // common case. Accepting only `undefined` here made every question asked
  // without an attached error fail validation with a 422.
  correlationId: z.string().max(64).nullish(),
  pastedError: z.string().max(8000).nullish(),
});

/**
 * @openapi
 * /support/chat:
 *   post:
 *     tags: [Support]
 *     summary: Ask Saarthi Support a question about the system
 *     description: >
 *       Scope-locked assistant. The server builds the entire prompt — the client
 *       sends only a question, never instructions, and never receives the system
 *       prompt or knowledge base. Replies stream as Server-Sent Events; the final
 *       `done` event carries the validated object, including a proposed fix id
 *       when one is available. Falls back to a deterministic offline matcher when
 *       no model is configured, which still proposes the same remediation.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [message]
 *             properties:
 *               message: { type: string, example: "why can't I create a critical task?" }
 *               conversationId: { type: string }
 *               lang: { type: string, enum: [en, hi] }
 *               currentRoute: { type: string, example: "/m/board" }
 *               correlationId: { type: string, description: "id from a failed request; the server looks up its own record of it" }
 *               pastedError: { type: string, description: "treated strictly as untrusted data" }
 *     responses:
 *       200:
 *         description: Server-Sent Event stream ending in a `done` event
 */
supportRouter.post(
  '/chat',
  validateBody(chatSchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const input = body<z.infer<typeof chatSchema>>(req);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    // Keeps proxies from closing an idle connection while the model thinks.
    const heartbeat = setInterval(() => res.write(': keep-alive\n\n'), 10_000);
    send('thinking', { offline: supportConfig.mode === 'offline' });

    try {
      const reply = await ask({
        actor: me,
        message: input.message,
        lang: input.lang,
        currentRoute: input.currentRoute,
        conversationId: input.conversationId,
        pastedError: input.pastedError ?? null,
        correlationId: input.correlationId ?? null,
      });

      // The answer is streamed in small pieces so the UI can type it out. The
      // whole reply is already validated at this point — streaming is
      // presentation, never a way for unchecked text to escape the guard.
      const words = reply.answer.split(/(\s+)/);
      for (let i = 0; i < words.length; i += 3) {
        send('token', { text: words.slice(i, i + 3).join('') });
      }

      send('done', reply);
    } catch (err) {
      logger.error({ err }, 'saarthi support: chat failed');
      send('error', {
        message:
          input.lang === 'hi'
            ? 'क्षमा करें, अभी उत्तर नहीं दे सका। कृपया दोबारा प्रयास करें।'
            : "Sorry — I couldn't answer that just now. Please try again.",
      });
    } finally {
      clearInterval(heartbeat);
      res.end();
    }
  }),
);

/**
 * @openapi
 * /support/conversations/{id}:
 *   get:
 *     tags: [Support]
 *     summary: Read one of your own support conversations
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Messages, oldest first }
 *       404: { description: No such conversation for this user }
 */
supportRouter.get(
  '/conversations/:id',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    // Scoped by userId, so an id belonging to somebody else is simply not found.
    const convo = await prisma.supportConversation.findFirst({
      where: { id: req.params.id, userId: me.sub },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    if (!convo) throw notFound('Conversation not found');

    res.json({
      id: convo.id,
      lang: convo.lang,
      messages: convo.messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        meta: m.meta,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  }),
);

/**
 * @openapi
 * /support/kb/reindex:
 *   post:
 *     tags: [Support]
 *     summary: Rebuild the support knowledge-base index (Admin)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Number of chunks indexed }
 *       403: { description: Administrators only }
 */
supportRouter.post(
  '/kb/reindex',
  requireRole('ADMIN'),
  asyncHandler(async (_req, res) => {
    res.json(await reindexKb());
  }),
);

const applySchema = z.object({ reason: z.string().max(500).optional() });

/**
 * @openapi
 * /support/fixes/{id}/apply:
 *   post:
 *     tags: [Support]
 *     summary: Apply a fix the assistant proposed
 *     description: >
 *       Executes one whitelisted remediation. The model never reaches this code —
 *       it only named an action and supplied arguments, both of which are
 *       re-validated here, along with the caller's role and department taken from
 *       their token rather than from the conversation. The change and its audit
 *       event share a single transaction. Medium-risk actions require a reason.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, description: "required for medium-risk actions" }
 *     responses:
 *       200: { description: Applied, with an undo window and the audit block index }
 *       400: { description: Already applied, invalid arguments, or rate limited }
 *       403: { description: Your role or department does not permit it }
 */
supportRouter.post(
  '/fixes/:id/apply',
  validateBody(applySchema),
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    const { reason } = body<z.infer<typeof applySchema>>(req);
    res.json(await applyFix({ fixId: req.params.id, actor: me, reason }));
  }),
);

/**
 * @openapi
 * /support/fixes/{id}/undo:
 *   post:
 *     tags: [Support]
 *     summary: Reverse a fix within its undo window
 *     description: The undo is itself written to the audit chain — the ledger keeps both events.
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: path, name: id, required: true, schema: { type: string } }
 *     responses:
 *       200: { description: Reversed }
 *       400: { description: Not undoable, or the window has passed }
 */
supportRouter.post(
  '/fixes/:id/undo',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    res.json(await undoFix({ fixId: req.params.id, actor: me }));
  }),
);

/**
 * @openapi
 * /support/fixes:
 *   get:
 *     tags: [Support]
 *     summary: Every AI-applied fix (Admin audit view)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [PROPOSED, APPLIED, FAILED, UNDONE] } }
 *       - { in: query, name: action, schema: { type: string } }
 *     responses:
 *       200: { description: Fixes, newest first }
 *       403: { description: Administrators only }
 */
supportRouter.get(
  '/fixes',
  requireRole('ADMIN'),
  asyncHandler(async (req, res) => {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const action = typeof req.query.action === 'string' ? req.query.action : undefined;

    const items = await prisma.supportFix.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(action ? { action } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: { actor: { select: { id: true, name: true, role: true } } },
    });

    res.json({
      items: items.map((f) => ({
        id: f.id,
        action: f.action,
        args: f.args,
        risk: f.risk,
        status: f.status,
        actor: f.actor,
        result: f.result,
        reason: f.reason,
        createdAt: f.createdAt.toISOString(),
        appliedAt: f.appliedAt?.toISOString() ?? null,
        undoneAt: f.undoneAt?.toISOString() ?? null,
      })),
    });
  }),
);

/**
 * @openapi
 * /support/actions:
 *   get:
 *     tags: [Support]
 *     summary: The remediation actions available to your role
 *     description: The complete, closed set. Anything not listed here does not exist.
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Actions with their risk tier }
 */
supportRouter.get(
  '/actions',
  asyncHandler(async (req, res) => {
    const me = currentUser(req);
    res.json({
      items: actionsForRole(me.role).map((a) => ({
        ...a,
        risk: REGISTRY.get(a.name)?.risk ?? 'low',
      })),
    });
  }),
);
