#!/usr/bin/env bash
#
# One-shot remote database setup.
#
#   ./scripts/setup-remote-db.sh "postgresql://user:pass@host/db?sslmode=require"
#
# Takes a Postgres connection string and does everything else:
#   1. stores it as DATABASE_URL on the Vercel API project
#   2. creates the schema
#   3. seeds the demo data
#   4. redeploys the API so the new variable is picked up
#   5. verifies the live health endpoint and a real sign-in
#
# Vercel no longer exposes database creation over its API (the endpoint returns
# "gone"), so the connection string has to come from you. Everything after that
# is automated.

set -euo pipefail

DB_URL="${1:-}"
if [ -z "$DB_URL" ]; then
  cat <<'USAGE'
Usage: ./scripts/setup-remote-db.sh "<postgres-connection-string>"

Where to get one (any of these work, all have a free tier):

  Vercel dashboard → Storage → Create → Neon          (auto-links to the project)
  https://neon.tech                                    (sign in with GitHub)
  https://supabase.com/dashboard                       (Project settings → Database)

Use the POOLED connection string when the provider offers one — serverless
functions open many short-lived connections and will exhaust a direct pool.
USAGE
  exit 1
fi

case "$DB_URL" in
  postgres://*|postgresql://*) ;;
  *) echo "✖ That does not look like a Postgres URL (expected postgres:// or postgresql://)"; exit 1 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

API_HOST="${API_HOST:-https://smartwork360-api.vercel.app}"

echo
echo "▸ 1/5  Checking the database is reachable"
DATABASE_URL="$DB_URL" npx --yes prisma@5.22.0 db execute \
  --schema apps/api/prisma/schema.prisma --stdin <<< "SELECT 1;" \
  && echo "       connected"

echo
echo "▸ 2/5  Creating the schema"
DATABASE_URL="$DB_URL" npm run db:push --silent

echo
echo "▸ 3/5  Seeding demo data"
DATABASE_URL="$DB_URL" npm run seed --silent

echo
echo "▸ 4/5  Storing DATABASE_URL on Vercel and redeploying"
printf "%s" "$DB_URL" | npx --yes vercel env add DATABASE_URL production --force >/dev/null 2>&1 || true
npx --yes vercel deploy --prod --yes --archive=tgz >/dev/null 2>&1
echo "       redeployed"

echo
echo "▸ 5/5  Verifying the live API"
sleep 5
HEALTH=$(curl -s -m 30 "$API_HOST/health" || true)
echo "       $HEALTH" | head -c 300; echo

LOGIN=$(curl -s -m 30 -X POST "$API_HOST/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -d '{"email":"rajesh.iyer@gov.in","password":"Demo@123"}' || true)

if printf '%s' "$LOGIN" | grep -q accessToken; then
  echo
  echo "✔ Live sign-in works. Open https://smartwork360.vercel.app and use a demo chip."
else
  echo
  echo "✖ Sign-in still failing. Response:"
  printf '   %s\n' "$(printf '%s' "$LOGIN" | head -c 400)"
  exit 1
fi
