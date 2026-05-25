import { useEffect, useState } from 'react'
import {
  fetchResourceSnapshot,
  type ResourceSnapshot,
} from '../ipc/resourceSnapshot'
import type { ResourceOverlayPrefs } from '../theme/resourceOverlayPrefs'
import { isTauriRuntime } from '../ipc/isTauri'

export function useResourceOverlay(prefs: ResourceOverlayPrefs) {
  const [snapshot, setSnapshot] = useState<ResourceSnapshot | null>(null)
  const [ready, setReady] = useState(false)
  const enabled = isTauriRuntime() && prefs.showOverlay

  useEffect(() => {
    if (!enabled) {
      setSnapshot(null)
      setReady(false)
      return
    }

    let cancelled = false
    const poll = async () => {
      const s = await fetchResourceSnapshot()
      if (cancelled) return
      setReady(true)
      if (s) setSnapshot(s)
    }

    void poll()
    const ms = prefs.pollIntervalSec * 1000
    const id = window.setInterval(() => void poll(), ms)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [enabled, prefs.pollIntervalSec])

  return { snapshot, enabled, ready }
}
