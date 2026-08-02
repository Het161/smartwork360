import { PrismaClient } from '@prisma/client';
import { env, isProd } from '../config/env';

/**
 * Single PrismaClient for the process. `tsx watch` re-evaluates modules on every
 * save, so the instance is cached on globalThis to avoid exhausting the pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['error'] : ['warn', 'error'],
  });

if (!isProd) globalForPrisma.prisma = prisma;

export type PrismaTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export { env };
