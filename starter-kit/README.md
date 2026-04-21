# DentalScan AI

Next.js 14 dental scan application with a guided camera capture flow, Prisma ORM, PostgreSQL-backed notifications, and patient-clinic messaging.

## Stack

- Next.js 14 App Router
- React 18
- Tailwind CSS
- Prisma ORM
- PostgreSQL

## Features

- Guided multi-angle dental scan capture flow
- Mouth guide overlay with stability and framing feedback
- Capture validation with retake support
- Results summary screen
- Async clinic notification creation after scan upload
- Notification read APIs
- Scan-linked patient-clinic messaging sidebar

## Prerequisites

Install these before starting:

- Node.js 20+
- npm
- Docker Desktop
- Git

Official docs:

- Docker Desktop for Windows: https://docs.docker.com/desktop/setup/install/windows-install/
- PostgreSQL Docker image: https://hub.docker.com/_/postgres/

## Quick Start

### 1. Clone the repo

```powershell
git clone <your-repo-url>
cd dentalscan-assessment\starter-kit
```

### 2. Install dependencies

```powershell
npm install
```

### 3. Start PostgreSQL with Docker

Open Docker Desktop and wait until it is running.

Then run:

```powershell
docker run --name dentalscan-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=dentalscan `
  -p 5432:5432 `
  -d postgres:16
```

If the container already exists, start it instead:

```powershell
docker start dentalscan-postgres
```

Verify it is running:

```powershell
docker ps
```

You should see a container exposing `5432->5432`.

### 4. Create your local environment file

Create a file named `.env` in the `starter-kit` root:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dentalscan"
```

There is also an `.env.example` template in the repo.

### 5. Initialize Prisma

Use the repo-local Prisma CLI:

```powershell
npx prisma generate
npx prisma migrate dev
```

If you only want to verify the schema first:

```powershell
npx prisma validate
```

### 6. Start the development server

```powershell
npm run dev
```

Open:

```text
http://localhost:3000
```

## Daily Development Workflow

When returning to the project later:

```powershell
docker start dentalscan-postgres
cd dentalscan-assessment\starter-kit
npm run dev
```

If Prisma schema changes were added:

```powershell
npx prisma migrate dev
```

## Available Commands

### App

```powershell
npm run dev
npm run build
npm run start
```

### Prisma

```powershell
npx prisma generate
npx prisma validate
npx prisma migrate dev
npx prisma migrate status
npx prisma studio
```

### Type Checking

```powershell
npx tsc --noEmit
```

## Database Inspection

### Prisma Studio

```powershell
npx prisma studio
```

### PostgreSQL shell inside Docker

```powershell
docker exec -it dentalscan-postgres psql -U postgres -d dentalscan
```

Useful commands inside `psql`:

```sql
\dt
SELECT * FROM "Clinic";
SELECT * FROM "Scan";
SELECT * FROM "Notification" ORDER BY "createdAt" DESC;
SELECT * FROM "Thread";
SELECT * FROM "Message" ORDER BY "sentAt" ASC;
```

Exit with:

```sql
\q
```

## Project Structure

```text
starter-kit/
├── prisma/
│   ├── migrations/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   └── api/
│   ├── components/
│   └── lib/
├── .env.example
└── README.md
```

## Key App Areas

### Frontend

- `src/components/ScanningFlow.tsx`
  Main scan capture flow and results UI
- `src/components/MouthGuideOverlay.tsx`
  Camera overlay for guidance, stability, and framing feedback
- `src/components/QuickMessageSidebar.tsx`
  Patient-clinic messaging panel

### Backend

- `src/app/api/scans/route.ts`
  Creates scans and triggers async notification creation
- `src/app/api/notifications/route.ts`
  Lists notifications with pagination and unread count
- `src/app/api/notifications/[id]/read/route.ts`
  Marks one notification as read
- `src/app/api/threads/[scanId]/messages/route.ts`
  Reads and creates scan-linked messages

### Shared server utilities

- `src/lib/prisma.ts`
  Shared Prisma client
- `src/lib/notifications.ts`
  Notification creation helper

## Notification Flow

1. A scan is submitted to `POST /api/scans`
2. The scan record is created in the database
3. An unread notification is created asynchronously for the clinic
4. The HTTP response returns without waiting for notification work
5. The clinic can fetch notifications later through the notifications API

## Messaging Flow

1. The results view opens the quick message sidebar
2. `GET /api/threads/[scanId]/messages` fetches existing messages
3. `POST /api/threads/[scanId]/messages` creates the thread on first use if needed
4. The UI uses optimistic updates so new messages appear immediately

## Troubleshooting

### Docker command fails in PowerShell

Use PowerShell backticks `` ` `` for multiline commands, not `^`.

Correct:

```powershell
docker run --name dentalscan-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=dentalscan `
  -p 5432:5432 `
  -d postgres:16
```

### `P1001: Can't reach database server at localhost:5432`

PostgreSQL is not running.

Run:

```powershell
docker ps -a
docker start dentalscan-postgres
docker ps
```

### Prisma says `Environment variable not found: DATABASE_URL`

You have not created `.env` in the `starter-kit` root.

Create:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/dentalscan"
```

### Prisma 7 schema error about datasource `url`

This repo is intended to run with the repo-local Prisma version installed from `package.json`.

Run:

```powershell
npm install
npx prisma -v
```

If you see a different global Prisma version causing issues, use the local binary explicitly:

```powershell
.\node_modules\.bin\prisma.cmd validate
.\node_modules\.bin\prisma.cmd migrate dev
```

### Docker says the container name already exists

Either start the existing container:

```powershell
docker start dentalscan-postgres
```

Or remove and recreate it:

```powershell
docker rm -f dentalscan-postgres
```

### View container logs

```powershell
docker logs dentalscan-postgres
```

## Submission Notes

For challenge submission, commit source code, Prisma schema, and migration files. Do not commit:

- `node_modules/`
- `.next/`
- local `.env`
- local database artifacts
- temporary build files

## License

Challenge project for evaluation purposes.
