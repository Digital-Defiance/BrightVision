import { useMemo } from 'react'
import {
  capabilitiesForBackend,
  type BackendCapabilities,
  type LocalLlmSnapshot,
} from '../ipc/localLlm'

/** Derive backend UI capabilities from a local LLM config snapshot (REQ-004). */
export function useBackendCapabilities(
  snapshot: LocalLlmSnapshot | null | undefined
): BackendCapabilities {
  return useMemo(
    () => capabilitiesForBackend(snapshot?.backend),
    [snapshot?.backend]
  )
}
