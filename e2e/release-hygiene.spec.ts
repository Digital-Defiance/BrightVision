import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

test.describe('Release & submodule hygiene (#19, #31)', () => {
  test('RELEASE.md documents verify and local full test', () => {
    const md = readFileSync(join(ROOT, 'docs/RELEASE.md'), 'utf8')
    expect(md).toContain('yarn verify:submodule')
    expect(md).toMatch(/yarn test:(full|all)/)
  })

  test('.gitmodules references aider-vision-core', () => {
    const modules = readFileSync(join(ROOT, '.gitmodules'), 'utf8')
    expect(modules).toContain('aider-vision-core')
  })

  test('core submodule directory is present', () => {
    expect(existsSync(join(ROOT, 'aider-vision-core'))).toBe(true)
  })

  test('verify_submodule script exists and is executable', () => {
    expect(existsSync(join(ROOT, 'scripts/verify_submodule.sh'))).toBe(true)
  })

  test('yarn verify:submodule passes when project venv exists', ({}, testInfo) => {
    const venvPython = join(ROOT, '.venv/bin/python')
    if (!existsSync(venvPython)) {
      testInfo.skip(true, 'requires .venv (see activate.sh)')
    }
    execSync('yarn verify:submodule', {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 180_000,
      env: { ...process.env, PATH: process.env.PATH },
    })
  })
})
