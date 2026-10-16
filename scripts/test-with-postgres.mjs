import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const projectName = process.env.COMPOSE_PROJECT_NAME
  || `pawops-ci-${process.pid}-${Date.now()}`

const composeEnvironment = {
  ...process.env,
  COMPOSE_PROJECT_NAME: projectName,
  POSTGRES_DB: process.env.POSTGRES_DB || 'pawops_ci',
  POSTGRES_USER: process.env.POSTGRES_USER || 'pawops_ci',
  POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
  POSTGRES_PORT: '0',
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: composeEnvironment,
    stdio: 'inherit',
    ...options,
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }

  return result
}

let composeStarted = false

try {
  run('docker', ['compose', 'config', '--quiet'])
  composeStarted = true
  run('docker', ['compose', 'up', '-d', '--wait', 'db'])

  const portResult = run(
    'docker',
    ['compose', 'port', 'db', '5432'],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] },
  )
  const portLine = portResult.stdout.trim().split(/\r?\n/, 1)[0]
  const dbPort = portLine.split(':').at(-1)

  if (!/^\d+$/.test(dbPort)) {
    throw new Error('Docker Compose did not return a valid PostgreSQL host port.')
  }

  const user = encodeURIComponent(composeEnvironment.POSTGRES_USER)
  const password = encodeURIComponent(composeEnvironment.POSTGRES_PASSWORD)
  const database = encodeURIComponent(composeEnvironment.POSTGRES_DB)
  const testEnvironment = {
    ...composeEnvironment,
    TEST_DATABASE_URL: `postgresql://${user}:${password}@127.0.0.1:${dbPort}/${database}`,
  }

  console.log(`PostgreSQL test dependency is ready on host port ${dbPort}.`)
  const testResult = spawnSync(npmCommand, ['test'], {
    cwd: process.cwd(),
    env: testEnvironment,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  })

  if (testResult.error) {
    throw testResult.error
  }

  if (testResult.status !== 0) {
    throw new Error(`npm test failed with exit code ${testResult.status}`)
  }
} finally {
  if (composeStarted) {
    const cleanup = spawnSync(
      'docker',
      ['compose', 'down', '--volumes', '--remove-orphans'],
      {
        cwd: process.cwd(),
        env: composeEnvironment,
        stdio: 'inherit',
      },
    )

    if (cleanup.error) {
      console.error(`PostgreSQL cleanup failed: ${cleanup.error.message}`)
      process.exitCode = 1
    } else if (cleanup.status !== 0) {
      console.error(`PostgreSQL cleanup exited with code ${cleanup.status}`)
      process.exitCode = 1
    }
  }
}
