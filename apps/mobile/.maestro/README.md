# Maestro flows

End-to-end flows against a **dev build** on a real device or emulator. Maestro
drives the actual app, so these cover the things a unit test cannot: the camera
permission dialog, the offline banner appearing when the radio is off, and an
inspection surviving an app restart.

## Prerequisites

```bash
# 1. The stack, seeded
docker compose up -d
pnpm --filter api prisma migrate deploy
pnpm --filter api db:seed
pnpm --filter api dev

# 2. A dev build installed on the device
pnpm --filter mobile android      # or: ios
pnpm --filter mobile start

# 3. Maestro
curl -fsSL "https://get.maestro.mobile.dev" | bash
```

## Running

```bash
maestro test .maestro/login.yaml
maestro test .maestro/inspection-submit.yaml
maestro test .maestro/offline-sync.yaml

# or the whole suite
maestro test .maestro
```

The flows sign in as `inspector1@ahlan.local` / `Stadium2026!`, which the seed
creates. They assume the seeded demo data is present; re-run `db:seed` after a
`prisma migrate reset`.
