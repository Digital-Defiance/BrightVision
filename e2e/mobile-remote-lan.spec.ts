import { test, expect } from '@playwright/test'
import { openSettings, startMockSession } from './helpers/session'

test.describe('Mobile Remote LAN settings', () => {
  test('shows LAN Link section on desktop', async ({ page }) => {
    await startMockSession(page, {
      tauri: {
        handlers: {
          generate_vision_api_token: async () => 'test-token-abc',
          get_lan_host_addresses: async () => ['192.168.1.42'],
          lan_remote_proxy_status: async () => ({
            running: false,
            proxyPort: 8742,
            corePort: 8741,
            addresses: ['192.168.1.42'],
          }),
        },
      },
    })
    await openSettings(page)
    const section = page.getByTestId('settings-mobile-remote')
    await expect(section).toBeVisible()
    await expect(section.getByText(/BrightVision Remote \(LAN Link\)/i)).toBeVisible()
    await expect(page.getByTestId('lan-remote-toggle')).toBeVisible()
  })
})
