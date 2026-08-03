/**
 * Orchestrates one support turn: gather context → retrieve → ask the model →
 * validate → guard → persist. Every path ends in `guardReply`, so there is no
 * route by which an unchecked reply reaches the user.
 */
import { prisma } from '../db/prisma';
import { logger } from '../config/logger';
import { supportConfig } from '../config/env';
import type { AccessTokenPayload } from '../auth/jwt';
import { taskScope } from '../middleware/scope';
import { retrieve } from './retriever';
import { buildMessages, trimHistory, sanitizeUntrusted, type LiveContext } from './prompt';
import { complete, injectionScore, llmAvailable, LlmUnavailableError } from './llm.client';
import { REPLY_JSON_SCHEMA, parseModelReply, type SupportReply } from './schema';
import { guardReply } from './scope.guard';
import { answerOffline } from './offline.fallback';
import { actionsForRole, KNOWN_ACTIONS, REGISTRY } from './remediation/registry';

export interface AskInput {
  actor: AccessTokenPayload;
  message: string;
  lang: 'en' | 'hi';
  currentRoute: string;
  conversationId?: string;
  pastedError?: string | null;
  correlationId?: string | null;
}

export interface AskOutput extends SupportReply {
  conversationId: string;
  /** Set when the reply proposes a fix that is now ready to apply. */
  fixId: string | null;
  fixRisk: 'low' | 'medium' | null;
  fixTitle: string | null;
  model: string | null;
  injectionDetected: boolean;
}

/** Aggregate counts only — never another person's details. */
async function liveContext(actor: AccessTokenPayload): Promise<LiveContext> {
  const scope = taskScope(actor);
  const isAdmin = actor.role === 'ADMIN';
  const [me, openTasks, overdueTasks, openAlerts, pendingApprovals, departments, awaiting, unassigned] =
    await Promise.all([
    prisma.user.findUnique({
      where: { id: actor.sub },
      select: { name: true, department: { select: { name: true } } },
    }),
    prisma.task.count({ where: { ...scope, status: { not: 'COMPLETED' } } }),
    prisma.task.count({
      where: { ...scope, status: { not: 'COMPLETED' }, dueDate: { lt: new Date() } },
    }),
    actor.role === 'EMPLOYEE'
      ? Promise.resolve(0)
      : prisma.fraudAlert.count({
          where: {
            status: 'OPEN',
            ...(actor.role === 'MANAGER' && actor.departmentId
              ? { user: { departmentId: actor.departmentId } }
              : {}),
          },
        }),
    isAdmin ? prisma.user.count({ where: { status: 'PENDING_APPROVAL' } }) : Promise.resolve(null),
    // Scoped exactly as the directory is: everything for an admin, own
    // department for a manager, nothing for an employee.
    actor.role === 'EMPLOYEE'
      ? Promise.resolve([])
      : prisma.department.findMany({
          where: isAdmin ? {} : { id: actor.departmentId ?? '__none__' },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
    isAdmin
      ? prisma.user.findMany({
          where: { status: 'PENDING_APPROVAL' },
          select: { id: true, name: true },
          take: 15,
        })
      : Promise.resolve([]),
    isAdmin
      ? prisma.user.findMany({
          where: { departmentId: null },
          select: { id: true, name: true },
          take: 15,
        })
      : Promise.resolve([]),
  ]);

  return {
    name: me?.name ?? 'there',
    role: actor.role,
    departmentName: me?.department?.name ?? null,
    openTasks,
    overdueTasks,
    openAlerts,
    pendingApprovals,
    departments,
    awaitingApproval: awaiting,
    unassignedUsers: unassigned,
  };
}

/**
 * Looks up the server's own record of a failed request.
 *
 * Preferring this over the client's description is both more accurate and
 * safer: the browser's copy of an error can be edited by whoever is sitting in
 * front of it, and it is the thing we are about to feed to a model.
 */
async function serverSideError(correlationId: string): Promise<string | null> {
  const { getErrorRecord } = await import('../middleware/errors');
  const rec = getErrorRecord(correlationId);
  if (!rec) return null;
  return [
    `method: ${rec.method}`,
    `path: ${rec.path}`,
    `status: ${rec.status}`,
    `code: ${rec.code}`,
    `message: ${rec.message}`,
    rec.details ? `details: ${JSON.stringify(rec.details).slice(0, 600)}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Extracts an ERROR_CODE from text, used to pin retrieval to the right doc. */
function extractErrorCode(text: string): string | null {
  return /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+){1,4})\b/.exec(text)?.[1] ?? null;
}

export async function ask(input: AskInput): Promise<AskOutput> {
  const { actor, lang } = input;

  const conversation = input.conversationId
    ? await prisma.supportConversation.findFirst({
        // Own conversations only — an id from the client is never trusted to
        // identify whose conversation it is.
        where: { id: input.conversationId, userId: actor.sub },
      })
    : null;

  const convo =
    conversation ??
    (await prisma.supportConversation.create({
      data: { userId: actor.sub, lang, title: input.message.slice(0, 80) },
    }));

  // ---- untrusted inputs -----------------------------------------------
  const serverError = input.correlationId ? await serverSideError(input.correlationId) : null;
  const untrusted = serverError ?? (input.pastedError ? sanitizeUntrusted(input.pastedError) : null);
  const offlineCtx = {
    errorDetails: untrusted,
    departmentId: actor.departmentId,
    role: actor.role,
  };

  // The guard classifier runs on untrusted text only, never on our own prompt.
  const guardTarget = [untrusted, input.message].filter(Boolean).join('\n');
  const injection = await injectionScore(guardTarget);
  const injectionDetected = injection >= supportConfig.guardThreshold;
  if (injectionDetected) {
    logger.warn(
      { userId: actor.sub, score: injection },
      'saarthi support: prompt-injection signature in untrusted text',
    );
  }

  const errorCode = extractErrorCode(`${untrusted ?? ''} ${input.message}`);
  const chunks = await retrieve(input.message, { errorCode, limit: 6 });

  const history = trimHistory(
    (
      await prisma.supportMessage.findMany({
        where: { conversationId: convo.id },
        orderBy: { createdAt: 'asc' },
        take: 20,
        select: { role: true, content: true },
      })
    ).map((m) => ({ role: m.role === 'USER' ? ('user' as const) : ('assistant' as const), content: m.content })),
  );

  await prisma.supportMessage.create({
    data: { conversationId: convo.id, role: 'USER', content: input.message.slice(0, 4000) },
  });

  // ---- answer ----------------------------------------------------------
  let reply: SupportReply;
  let model: string | null = null;

  if (!llmAvailable()) {
    reply = await answerOffline({ message: input.message, lang, errorCode, ...offlineCtx });
  } else {
    try {
      const live = await liveContext(actor);
      const messages = buildMessages({
        lang,
        question: input.message,
        chunks,
        live,
        currentRoute: input.currentRoute,
        untrustedError: untrusted,
        availableActions: actionsForRole(actor.role),
        history,
      });

      let res = await complete({ messages, jsonSchema: REPLY_JSON_SCHEMA });
      model = res.model;
      try {
        reply = parseModelReply(res.text);
      } catch {
        // One repair attempt before giving up on the model entirely.
        res = await complete({
          messages: [
            ...messages,
            { role: 'assistant', content: res.text },
            {
              role: 'user',
              content: 'That was not valid JSON matching the schema. Reply again, JSON only.',
            },
          ],
          jsonSchema: REPLY_JSON_SCHEMA,
        });
        reply = parseModelReply(res.text);
      }
    } catch (err) {
      if (!(err instanceof LlmUnavailableError)) {
        logger.warn({ err }, 'saarthi support: model call failed, falling back offline');
      }
      reply = await answerOffline({ message: input.message, lang, errorCode, ...offlineCtx });
    }
  }

  // ---- layer 3: server post-check -------------------------------------
  const guarded = guardReply(reply, `${input.message} ${untrusted ?? ''}`, {
    lang,
    knownActions: KNOWN_ACTIONS,
    autofixEnabled: supportConfig.autofixEnabled,
  });
  let final = guarded.reply;

  // A fix proposed for a role that cannot run it becomes a helpful sentence
  // rather than a button that would fail on click.
  if (final.suggestedFix) {
    const action = REGISTRY.get(final.suggestedFix.action);
    if (action && !action.allowedRoles.includes(actor.role)) {
      const who = action.allowedRoles.join(' or ').toLowerCase();
      guarded.notes.push(`role-not-allowed:${final.suggestedFix.action}`);
      final = {
        ...final,
        suggestedFix: null,
        answer:
          final.answer +
          (lang === 'hi'
            ? ` यह बदलाव केवल ${who === 'admin' ? 'प्रशासक' : who} कर सकते हैं — कृपया उनसे संपर्क करें।`
            : ` Only ${who === 'admin' ? 'an administrator' : `a ${who}`} can make that change — please ask one of them.`),
      };
    }
  }

  if (guarded.notes.length) {
    logger.info({ notes: guarded.notes, userId: actor.sub }, 'saarthi support: reply adjusted');
  }

  // ---- persist ---------------------------------------------------------
  let fixId: string | null = null;
  let fixRisk: 'low' | 'medium' | null = null;
  let fixTitle: string | null = null;

  if (final.suggestedFix) {
    const action = REGISTRY.get(final.suggestedFix.action);
    if (action) {
      // Validate the model's arguments now so a broken proposal never becomes a
      // button. Arguments are re-validated again at apply time.
      const parsedArgs = action.argsSchema.safeParse(final.suggestedFix.args);
      if (parsedArgs.success) {
        const fix = await prisma.supportFix.create({
          data: {
            conversationId: convo.id,
            action: action.name,
            args: parsedArgs.data as object,
            risk: action.risk,
            actorId: actor.sub,
            status: 'PROPOSED',
          },
        });
        fixId = fix.id;
        fixRisk = action.risk;
        fixTitle = action.description.split('.')[0];
      } else {
        logger.info(
          { action: action.name, issues: parsedArgs.error.issues.map((i) => i.path.join('.')) },
          'saarthi support: proposed fix had unusable arguments, dropped',
        );
        final = { ...final, suggestedFix: null };
      }
    }
  }

  await prisma.supportMessage.create({
    data: {
      conversationId: convo.id,
      role: 'ASSISTANT',
      content: final.answer,
      meta: {
        citations: final.citations,
        confidence: final.confidence,
        offline: final.offline,
        model,
        fixId,
        notes: guarded.notes,
      },
    },
  });

  return {
    ...final,
    conversationId: convo.id,
    fixId,
    fixRisk,
    fixTitle,
    model,
    injectionDetected,
  };
}
