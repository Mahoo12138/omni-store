#!/usr/bin/env node
// Run browser acceptance against a fresh instance, never a developer's server.
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createWriteStream } from 'node:fs'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = await realpath(await mkdtemp(join(tmpdir(), 'omnistore-browser-')))
// Inherited production settings must not redirect a destructive test seed.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('OMNISTORE_')))
let activeCommand
let server
let serverExit
let interrupted = false
let passed = false
const processGroups = process.platform !== 'win32'
const interruptionCleanup = []
const log = createWriteStream(join(root, 'server.log'))

async function run(command, args, options = {}) {
  if (interrupted) throw new Error('Browser acceptance interrupted')
  const child = spawn(command, args, { cwd: projectDir, env, stdio: 'inherit', detached: processGroups, ...options })
  activeCommand = child
  try {
    const [code, signal] = await once(child, 'exit')
    if (code !== 0) throw new Error(`${command} failed (${signal ?? code})`)
  } finally {
    activeCommand = undefined
  }
}

async function stop(child) {
  if (!child?.pid) return
  const signal = (value) => {
    try {
      if (processGroups) process.kill(-child.pid, value)
      else child.kill(value)
    } catch (error) {
      if (error.code !== 'ESRCH') throw error
    }
  }
  const running = () => {
    if (!processGroups) return child.exitCode === null && child.signalCode === null
    try { process.kill(-child.pid, 0); return true } catch (error) {
      if (error.code === 'ESRCH') return false
      throw error
    }
  }
  signal('SIGTERM')
  const deadline = Date.now() + 5_000
  while (running() && Date.now() < deadline) await delay(50)
  if (running()) signal('SIGKILL')
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true
    // Escalation starts here, even if a command ignores SIGTERM and run()
    // cannot return. Include pnpm/Playwright descendants in the same group.
    interruptionCleanup.push(stop(activeCommand), stop(server))
  })
}

// Hold both reservations until both ports have been chosen so they differ.
const reservations = []
try {
  for (let i = 0; i < 2; i++) {
    const listener = createServer()
    listener.listen(0, '127.0.0.1')
    await once(listener, 'listening')
    reservations.push(listener)
  }
  const [httpPort, s3Port] = reservations.map(listener => listener.address().port)
  const baseURL = `http://127.0.0.1:${httpPort}`
  const configPath = join(root, 'config.yaml')
  const config = (await readFile(join(projectDir, 'config.test.yaml'), 'utf8'))
    .replaceAll('127.0.0.1:18080', `127.0.0.1:${httpPort}`)
    .replaceAll('127.0.0.1:18081', `127.0.0.1:${s3Port}`)
    .replace('"./.testdata/data"', JSON.stringify(join(root, 'data')))
  await writeFile(configPath, config, { mode: 0o600 })
  const serverBin = join(root, 'omnistore')
  const seedBin = join(root, 'testenv')
  await run('go', ['build', '-o', serverBin, './cmd/omnistore'])
  await run('go', ['build', '-o', seedBin, './cmd/testenv'])
  await run(seedBin, ['seed', '--config', configPath, '--fixtures', join(root, 'sources')], { stdio: ['ignore', log, log] })
  if (interrupted) throw new Error('Browser acceptance interrupted')
  await Promise.all(reservations.map(listener => new Promise(resolve => listener.close(resolve))))
  server = spawn(serverBin, ['server', '--config', configPath], { cwd: projectDir, env, detached: processGroups, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.pipe(log, { end: false })
  server.stderr.pipe(log, { end: false })
  server.on('error', error => { serverExit = error.message })
  server.on('exit', (code, signal) => { serverExit = signal ?? `exit ${code}` })
  let healthy = false
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline && !interrupted) {
    if (serverExit) throw new Error(`Test server stopped: ${serverExit}`)
    try {
      const response = await fetch(`${baseURL}/api/v1/health`, { signal: AbortSignal.timeout(1_000) })
      if (response.ok) { healthy = true; break }
    } catch { /* Wait only while the child is starting. */ }
    await delay(100)
  }
  if (!healthy) throw new Error('Test server did not become healthy')
  console.log(`Fresh browser acceptance instance: ${baseURL}`)
  await run('pnpm', ['exec', 'playwright', 'test', '--output', join(root, 'playwright-results'), ...process.argv.slice(2)], {
    cwd: join(projectDir, 'web'),
    env: {
      ...env,
      OMNISTORE_E2E_BASE_URL: baseURL,
      OMNISTORE_E2E_PROTOCOL_CREDENTIALS: join(root, 'protocol-credentials.json'),
    },
  })
  passed = !interrupted
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
} finally {
  for (const listener of reservations) if (listener.listening) listener.close()
  await stop(activeCommand)
  await stop(server)
  await Promise.all(interruptionCleanup)
  await new Promise(resolve => log.end(resolve))
  if (passed) {
    await rm(root, { recursive: true, force: true })
  } else {
    process.exitCode = 1
    console.error(`Browser acceptance evidence retained at ${root}`)
  }
}
