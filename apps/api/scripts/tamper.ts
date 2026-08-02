/**
 * `npm run demo:tamper`
 *
 * Simulates a malicious insider editing the database directly — the exact threat a
 * tamper-evident ledger exists to catch.
 *
 * It uses a raw SQL UPDATE that BYPASSES audit.service entirely, so no new block is
 * appended and no hash is recomputed. The row still looks perfectly normal in
 * Prisma Studio or psql; only `GET /audit/verify` can tell.
 *
 * Recover with `npm run demo:reset`.
 */

import { PrismaClient } from '@prisma/client';
import { verifyChain } from '../src/audit/audit.service';

const prisma = new PrismaClient();

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

async function main() {
  const total = await prisma.auditEvent.count();
  if (total === 0) {
    console.error(`${RED}No audit events found. Run 'npm run seed' first.${RESET}`);
    process.exit(1);
  }

  const before = await verifyChain();
  console.log(`\n  ${BOLD}Before${RESET}  chain of ${before.checkedCount} blocks — ${before.intact ? `${GREEN}INTACT${RESET}` : `${RED}ALREADY BROKEN at #${before.firstBrokenIndex}${RESET}`}`);

  if (!before.intact) {
    console.log(`\n  ${YELLOW}The chain is already tampered. Run 'npm run demo:reset' to restore it.${RESET}\n`);
    await prisma.$disconnect();
    return;
  }

  // Target a TASK_STATUS_CHANGED block near the middle — visually obvious in the
  // Audit Explorer, and a realistic thing for someone to want to rewrite.
  const target =
    (await prisma.auditEvent.findFirst({
      where: { action: 'TASK_STATUS_CHANGED', chainIndex: { gt: Math.floor(total * 0.4) } },
      orderBy: { chainIndex: 'asc' },
    })) ?? (await prisma.auditEvent.findFirst({ where: { chainIndex: Math.floor(total / 2) } }));

  if (!target) {
    console.error(`${RED}Could not find a block to tamper with.${RESET}`);
    process.exit(1);
  }

  const originalPayload = target.payload as Record<string, unknown>;
  const forged = {
    ...originalPayload,
    to: 'COMPLETED',
    tamperedBy: 'direct SQL UPDATE — bypassed the audit service',
  };

  // Raw SQL: no Prisma middleware, no hash recomputation, no new block.
  await prisma.$executeRaw`
    UPDATE smartwork.audit_events
    SET payload = ${forged}::jsonb
    WHERE id = ${target.id}
  `;

  const after = await verifyChain();

  console.log(`\n  ${YELLOW}${BOLD}TAMPERED${RESET}  block ${BOLD}#${target.chainIndex}${RESET}  ${DIM}(${target.action} on ${target.entityType} ${target.entityId})${RESET}`);
  console.log(`  ${DIM}payload.to:${RESET}  ${JSON.stringify(originalPayload.to ?? null)}  ${DIM}→${RESET}  ${RED}"COMPLETED"${RESET}`);
  console.log(`  ${DIM}stored hash still reads ${target.hash.slice(0, 16)}… — unchanged, because nothing recomputed it.${RESET}`);

  console.log(`\n  ${BOLD}After${RESET}   ${after.intact ? `${GREEN}INTACT${RESET}` : `${RED}${BOLD}TAMPER DETECTED at block #${after.firstBrokenIndex}${RESET}`}`);
  if (after.brokenReason) console.log(`  ${DIM}${after.brokenReason}${RESET}`);
  console.log(`  ${DIM}verified ${after.checkedCount} blocks in ${after.durationMs}ms${RESET}`);

  console.log(`\n  Now open ${BOLD}Admin → Blockchain Audit Explorer${RESET} and press ${BOLD}Verify Chain${RESET}.`);
  console.log(`  Restore with ${BOLD}npm run demo:reset${RESET}\n`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
