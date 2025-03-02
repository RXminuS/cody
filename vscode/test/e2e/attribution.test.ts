import { expect, type Frame, type FrameLocator, type Locator, type Page } from '@playwright/test'

import * as mockServer from '../fixtures/mock-server'

import { sidebarSignin } from './common'
import { test as baseTest, type DotcomUrlOverride, type ExtraWorkspaceSettings } from './helpers'

const test = baseTest
    .extend<DotcomUrlOverride>({ dotcomUrl: mockServer.SERVER_URL })
    .extend<ExtraWorkspaceSettings>({
        extraWorkspaceSettings: {
            // TODO(#59720): Remove experimental setting.
            'cody.experimental.guardrails': true,
        },
    })

test('attribution search enabled in chat', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/attribution/enable`, { method: 'POST' })
    const [chatFrame, chatInput] = await prepareChat2(page, sidebar)
    await chatInput.fill('show me a code snippet')
    await chatInput.press('Enter')
    await expect(chatFrame.getByTestId('attribution-indicator')).toBeVisible()
})

test('attribution search disabled in chat', async ({ page, sidebar }) => {
    await fetch(`${mockServer.SERVER_URL}/.test/attribution/disable`, { method: 'POST' })
    const [chatFrame, chatInput] = await prepareChat2(page, sidebar)
    await chatInput.fill('show me a code snippet')
    await chatInput.press('Enter')
    await expect(chatFrame.getByTestId('attribution-indicator')).toBeHidden()
})

async function prepareChat2(page: Page, sidebar: Frame): Promise<[FrameLocator, Locator]> {
    await sidebarSignin(page, sidebar)
    await page.getByRole('button', { name: 'New Chat', exact: true }).click()
    // Chat webview iframe is the second and last frame (search is the first)
    const chatFrame = page.frameLocator('iframe.webview').last().frameLocator('iframe')
    const chatInput = chatFrame.getByRole('textbox', { name: 'Chat message' })
    return [chatFrame, chatInput]
}
