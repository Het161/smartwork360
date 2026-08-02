import bcrypt from 'bcryptjs';

// 10 rounds: bcrypt's cost is paid 25× during seeding; 10 keeps `npm run seed`
// under a couple of seconds while remaining a sane default for a prototype.
const SALT_ROUNDS = 10;

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}
