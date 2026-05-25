# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: hello-llm.spec.ts >> Hello LLM (real Ollama + Vision core) >> hello turn completes with assistant text (no stall)
- Location: e2e/hello-llm.spec.ts:23:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByTestId('chat-message-assistant').first()
Expected: visible
Timeout: 240000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 240000ms
  - waiting for getByTestId('chat-message-assistant').first()

```

```yaml
- img "Bright Vision":
  - img
- button "Chat":
  - button
  - text: Chat
- button "Tasks":
  - button
  - text: Tasks
- button "Terminal":
  - button
  - text: Terminal
- button "Git":
  - button
  - text: Git
- button "Settings":
  - button
  - text: Settings
- img "Bright Vision":
  - img: BRIGHT VISION
- text: Session active — (repo map) 0 files
- status:
  - progressbar
  - text: Something went wrong Turn stalled — no events from core for 90s. Ollama may have unloaded the model (empty /api/ps). Use Stop, Ping LLM in Settings, then retry.
- button "Dismiss message"
- paragraph: "Reply with exactly: hello from e2e"
- text: Commands
- button "/help"
- button "/ps"
- button "/add"
- button "/drop"
- button "/diff"
- button "/commit"
- button "/undo"
- button "/ls"
- text: type
- code: /
- text: for all ·
- code: /add path
- text: Tab completes paths (desktop)
- button "Attach images"
- button "Attach last terminal output to message"
- button "Add folder to context"
- textbox "Message Bright Vision Core...": "Reply with exactly: hello from e2e"
- button "Send"
```

# Test source

```ts
  1  | import { expect, test } from '@playwright/test'
  2  | import { expectOptimisticSend } from './helpers/chatSend'
  3  | import {
  4  |   assertOllamaForLlmE2e,
  5  |   buildLlmE2eConfig,
  6  |   isLlmE2eEnabled,
  7  |   resolveOllamaTagWithFallback,
  8  |   resolveVisionModel,
  9  |   visionModelFromTag,
  10 | } from './helpers/llmEnv'
  11 | import { openChat } from './helpers/session'
  12 | import { E2E_CONFIG_STORAGE_KEY } from './helpers/testConfig'
  13 | 
  14 | test.describe.configure({ mode: 'serial' })
  15 | 
  16 | test.describe('Hello LLM (real Ollama + Vision core)', () => {
  17 |   test.skip(!isLlmE2eEnabled(), 'Set E2E_LLM=1 and run: yarn test:e2e:llm')
  18 | 
  19 |   test.beforeAll(async () => {
  20 |     await assertOllamaForLlmE2e()
  21 |   })
  22 | 
  23 |   test('hello turn completes with assistant text (no stall)', async ({ page }) => {
  24 |     const cfg = {
  25 |       ...buildLlmE2eConfig(),
  26 |       model: visionModelFromTag(await resolveOllamaTagWithFallback()),
  27 |     }
  28 |     await page.addInitScript(
  29 |       ([key, config]) => {
  30 |         localStorage.setItem('vision-welcome-dismissed', '1')
  31 |         localStorage.setItem(key, JSON.stringify(config))
  32 |       },
  33 |       [E2E_CONFIG_STORAGE_KEY, cfg] as const
  34 |     )
  35 | 
  36 |     await page.goto('/')
  37 |     await page.getByTestId('nav-terminal').click()
  38 |     await page.getByTestId('terminal-start').click()
  39 |     await expect(page.getByTestId('session-status')).toContainText('Session active', {
  40 |       timeout: 120_000,
  41 |     })
  42 | 
  43 |     await openChat(page)
  44 |     const prompt = 'Reply with exactly: hello from e2e'
  45 |     await page.getByTestId('chat-input').fill(prompt)
  46 |     await page.getByTestId('chat-send').click()
  47 |     await expectOptimisticSend(page, prompt)
  48 | 
  49 |     const assistant = page.getByTestId('chat-message-assistant').first()
> 50 |     await expect(assistant).toBeVisible({ timeout: 240_000 })
     |                             ^ Error: expect(locator).toBeVisible() failed
  51 |     const reply = (await assistant.innerText()).trim()
  52 |     expect(reply.length, 'assistant reply should not be empty').toBeGreaterThan(3)
  53 | 
  54 |     await expect(page.getByText(/Turn stalled/i)).toHaveCount(0)
  55 |     await expect(page.getByText(/likely stuck/i)).toHaveCount(0)
  56 | 
  57 |     await expect(page.getByTestId('vision-activity')).toHaveCount(0, { timeout: 60_000 })
  58 |     await expect(page.getByTestId('chat-send')).toBeEnabled({ timeout: 30_000 })
  59 |   })
  60 | })
  61 | 
  62 | test.describe('Hello LLM metadata', () => {
  63 |   test('documents resolved model for operators', () => {
  64 |     test.skip(!isLlmE2eEnabled())
  65 |     expect(resolveVisionModel() || 'ollama_chat/x').toMatch(/^ollama_chat\//)
  66 |   })
  67 | })
  68 | 
```