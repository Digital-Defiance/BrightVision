export type SuiteStepPlan = {
  id: string
  label: string
  requiresOllama: boolean
  requiresCloudConfig?: boolean
  touchesCorePort: boolean
}

/** Optional diagnostic lanes (must match orchestrator query/body). */
export type SuiteLaneOptions = {
  specGenPhased?: boolean
  llmRouter?: boolean
  cloudLlm?: boolean
  verifyEars?: boolean
  shippedScenarios?: boolean
  strictPhasedPytest?: boolean
  implementAutoAdvanceLlm?: boolean
}

export type TestSuiteEvent = {
  type: string
  stepId?: string
  label?: string
  stream?: string
  line?: string
  ok?: boolean
  seconds?: number
  gpuAvg?: number
  gpuPeak?: number
  memAvg?: number
  memPeak?: number
  memPressureAvg?: number
  memPressurePeak?: number
  swapPeakGb?: number
  cpuAvg?: number
  cpuPeak?: number
  cpuPct?: number
  gpuPct?: number
  gpuWarn?: boolean
  gpuExpectedPeak?: number
  stepIndex?: number
  totalSteps?: number
  elapsedSeconds?: number
  totalSeconds?: number
  stepElapsedSeconds?: number
  text?: string
  stepIds?: string[]
  repoRoot?: string
  path?: string
  captureMode?: 'off' | 'bgpucap' | 'btime_only'
  captureNote?: string
  useBrightDate?: boolean
  startBd?: number
  endBd?: number
  failFast?: boolean
  skippedStepIds?: string[]
  shortCircuit?: boolean
  cancelled?: boolean
  reason?: string
}

export type StepStatus = 'pending' | 'running' | 'ok' | 'fail' | 'skipped'

export type RunStepState = {
  id: string
  label: string
  status: StepStatus
  seconds?: number
}
