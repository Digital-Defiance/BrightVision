import { expect, test } from '@playwright/test'
import { gotoVision } from './helpers/testConfig'

test.describe('About dialog', () => {
  test('logo opens about with publisher and Cecli credit', async ({ page }) => {
    await gotoVision(page)
    await page.getByTestId('brand-logo-header').click()
    const dialog = page.getByTestId('about-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('link', { name: 'Digital Defiance' })).toHaveAttribute(
      'href',
      /digitaldefiance\.org/
    )
    await expect(dialog.getByRole('link', { name: 'Cecli', exact: true })).toHaveAttribute(
      'href',
      /cecli\.dev/
    )
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).not.toBeVisible()
  })
})
