import { Box } from '@mui/material'
import chipAi from '../../assets/icons/chip-ai.svg'
import chipCpu from '../../assets/icons/chip-cpu.svg'
import visionApi from '../../assets/icons/vision-api.svg'

const iconSx = {
  width: 16,
  height: 16,
  display: 'block',
} as const

export function ChipAiStartIcon() {
  return <Box component="img" src={chipAi} alt="" sx={iconSx} aria-hidden />
}

export function ChipCpuStartIcon() {
  return <Box component="img" src={chipCpu} alt="" sx={iconSx} aria-hidden />
}

export function VisionApiStartIcon() {
  return <Box component="img" src={visionApi} alt="" sx={iconSx} aria-hidden />
}
