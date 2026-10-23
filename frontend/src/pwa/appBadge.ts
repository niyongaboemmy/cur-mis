type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

/**
 * Shows the unread count on the installed app's icon (the taskbar or home
 * screen badge). Browsers without the Badging API simply skip it.
 */
export function setAppBadge(count: number): void {
  const nav = navigator as BadgeNavigator
  if (!nav.setAppBadge || !nav.clearAppBadge) return

  const update = count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge()
  update.catch(() => {
    // Badging can be refused (e.g. the app is not installed). Not worth surfacing.
  })
}
