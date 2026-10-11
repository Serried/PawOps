# PawOps

PawOps uses React + Vite with a Node/Express API and PostgreSQL.

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

## Jenkins CI/CD

The repository includes a declarative `Jenkinsfile`. It installs locked dependencies, runs lint and the production build in parallel, starts PostgreSQL, applies migrations, exercises the database health endpoint, and builds a production container image.

Configure a Linux Jenkins agent with:

- the label `node-docker`
- Node.js 22 and npm
- Docker Engine with the Compose plugin
- permission for the Jenkins user to access Docker

Create a Pipeline or Multibranch Pipeline pointed at this repository. Pull requests and branches run CI without publishing.

To enable container delivery from `main`:

1. Add a Jenkins username/password credential with ID `container-registry`.
2. Run the pipeline with `PUBLISH_IMAGE` enabled.
3. Set `IMAGE_NAME` to the fully qualified registry path, such as `ghcr.io/example/pawops`.

Publishing creates both `${BUILD_NUMBER}` and `latest` tags. Deployment to a server, Kubernetes cluster, or cloud platform can be added once the target environment is chosen.

## Frontend notes

The frontend uses the standard Vite React setup.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
