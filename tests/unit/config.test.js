import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

describe('alert configuration', () => {
  it('loads the .env grace period before any database import', () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'pawops-config-'))
    const envFile = path.join(directory, '.env')
    writeFileSync(envFile, 'OVERDUE_GRACE_MINUTES=1\nAPP_TIMEZONE=Asia/Bangkok\n')
    const env = { ...process.env, DOTENV_CONFIG_PATH: envFile, DOTENV_CONFIG_QUIET: 'true' }
    delete env.OVERDUE_GRACE_MINUTES
    delete env.APP_TIMEZONE
    try {
      const result = execFileSync(process.execPath, ['--input-type=module', '-e',
        `import { OVERDUE_GRACE_MINUTES, APP_TIMEZONE } from './server/config.js';
         console.log(JSON.stringify({ grace: OVERDUE_GRACE_MINUTES, zone: APP_TIMEZONE }));`,
      ], { cwd: process.cwd(), env, encoding: 'utf8' })
      expect(JSON.parse(result.trim())).toEqual({ grace: 1, zone: 'Asia/Bangkok' })
    } finally {
      unlinkSync(envFile)
      rmdirSync(directory)
    }
  })
})
