import { Box, Stack, Tooltip } from '@mui/material'
import chipAi from './assets/chip-ai.svg'
import chipCpu from './assets/chip-cpu.svg'
import visionApi from './assets/vision-api.svg'
import type { SuiteStepPlan } from './testSuiteClient'

const iconSx = {
  width: 18,
  height: 18,
  display: 'block',
  opacity: 0.78,
  // Font Awesome SVGs are black; invert for dark Test Lab theme (matches MUI chevrons).
  filter: 'brightness(0) saturate(100%) invert(1)',
} as const

export function StepChipIcons({ planStep }: { planStep?: SuiteStepPlan }) {
  if (!planStep) return null

  const showAi = planStep.requiresOllama || Boolean(planStep.requiresCloudConfig)
  const showVisionApi = planStep.touchesCorePort
  const showCpu = !showAi && !showVisionApi
  if (!showAi && !showCpu && !showVisionApi) return null

  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{ flexShrink: 0, ml: 'auto', alignItems: 'center' }}
    >
      {showCpu && (
        <Tooltip title="CPU">
          <Box component="img" src={chipCpu} alt="" sx={iconSx} />
        </Tooltip>
      )}
      {showVisionApi && (
        <Tooltip title="Vision API (:8741)">
          <Box component="img" src={visionApi} alt="" sx={iconSx} />
        </Tooltip>
      )}
      {showAi && (
        <Tooltip title={planStep.requiresCloudConfig ? 'Cloud LLM' : 'Ollama / LLM'}>
          <Box component="img" src={chipAi} alt="" sx={iconSx} />
        </Tooltip>
      )}
    </Stack>
  )
}
