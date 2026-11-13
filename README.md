# PawOps

PawOps uses React + Vite with a Node/Express API and PostgreSQL.

## Complete system with Docker Compose

Requirements: Docker with the Compose plugin. No host Node.js installation is needed.

```powershell
Copy-Item .env.example .env
docker compose up --build -d --wait
```

Open `http://localhost:8080`. Compose starts PostgreSQL and RabbitMQ, runs migrations,
serves the built frontend/API, and starts independent alert scheduler/worker processes.
`docker compose ps -a` shows all service health; the migration service should exit with code 0.
`docker compose logs app alert-scheduler alert-worker migrate` shows application and job logs.

Data is kept in `postgres_data`, `rabbitmq_data`, and `uploads` named volumes. `docker compose down`
stops the stack without deleting them; `docker compose up -d --wait` starts it again.
`docker compose down --volumes` deletes the database and uploaded photos; use it
only for disposable data. Change `WEB_PORT`/`POSTGRES_PORT` in `.env` if needed.

For optional local demo data on a fresh database:

```powershell
docker compose run --rm -e NODE_ENV=development -e ALLOW_DEMO_SEED=true -e SEED_PASSWORD=PawOpsDemo123! app node server/seed-dev.js
```

Sign in as `tanakrit@pawops.dev`, `ryuu@pawops.dev`, `pim@pawops.dev`,
`nok@pawops.dev` (one household), or `olive@pawops.dev` (another household), with
the chosen `SEED_PASSWORD`. Seed requires at least 12 non-padding characters and
preserves existing passwords. The example password is for local demo data only.

Compose binds ports to loopback and defaults to HTTP sessions for local use.
For deployment, provide your own credentials, put the app behind HTTPS and set
`SESSION_COOKIE_SECURE=true`. The image itself defaults to secure cookies in
production unless explicitly configured otherwise. Compose uses `PGHOST`,
`PGPORT`, `PGDATABASE`, `PGUSER` and `PGPASSWORD`; host development uses `DATABASE_URL`.

## Local setup

Requirements: Node.js, npm, and Docker Desktop (or another Docker Compose provider).

```powershell
Copy-Item .env.example .env
npm install
npm run db:up
npm run db:migrate
npm run dev
```

The web app runs at `http://localhost:5173`, and Vite proxies `/api` requests to the API at `http://localhost:3001`.

Check the database connection at `http://localhost:5173/api/health`.

## Database commands

- `npm run db:up` starts PostgreSQL in Docker.
- `npm run db:migrate` applies pending SQL migrations in filename order.
- `npm run db:down` stops PostgreSQL without deleting its data volume.
- `npm start` runs only the API server.

Database credentials belong in `.env`, which is excluded from Git. Update both `DATABASE_URL` and the `POSTGRES_*` values when changing the local credentials.

## Production

Set `DATABASE_URL` in the deployment environment to the production PostgreSQL connection string. Run `npm run db:migrate` as a release step, and never commit production credentials.

The included `Dockerfile` builds the React frontend and runs it with the API on port `3001`.

## Jenkins CI

The repository includes a declarative, CI-only `Jenkinsfile` for a Windows Jenkins agent labelled `node-docker`. Every blocking stage must pass: exact-SHA checkout, environment validation, locked dependency installation, lint, PostgreSQL-backed automated tests, the Vite production build, and a local Docker image build.

Because the current Jenkins controller is not directly reachable from GitHub, a thin GitHub Actions bridge triggers the parameterized `pawops-ci` job and waits for its real result. Jenkins remains the CI engine; GitHub only exposes the required `Jenkins CI` check for pull-request gating. The configuration is defined in [Jenkinsfile](Jenkinsfile) and [.github/workflows/jenkins-ci.yml](.github/workflows/jenkins-ci.yml).

After every blocking verification stage succeeds, Jenkins deploys an isolated Compose staging
stack and verifies both `GET /api/health` and the built frontend. Declarative stage ordering means
deployment is not executed when lint, tests, application build, or Docker build fails.

## Project evidence

- [PBI-01..20 traceability matrix](docs/traceability.md)
- [Reproducible demo runbook](docs/demo-runbook.md)
- [Cross-review and Definition of Done checklist](docs/review-checklist.md)
- [Latest local verification report](docs/verification-report.md)
- `npm run test:ci` runs the complete PostgreSQL-backed automated suite.

## Frontend notes

The frontend uses the standard Vite React setup.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
