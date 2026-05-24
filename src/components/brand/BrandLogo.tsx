import { Box } from '@mui/material'
import headerSvg from '../../assets/brand/aider-vision.svg?raw'
import railSvg from '../../assets/brand/aider-vision-square-logo.svg?raw'
import {
  BRAND_HEADER_LOGO_PNG,
  BRAND_LOGO_MODE,
  BRAND_RAIL_LOGO_PNG,
  DISPLAY_VISION,
} from '../../brand'

type BrandLogoVariant = 'header' | 'rail'

interface BrandLogoProps {
  variant: BrandLogoVariant
}

/**
 * Vector logos use live SVG text + @font-face (woff2 in src/assets/fonts/).
 * PNG mode uses raster exports — reliable when &lt;img&gt; cannot load fonts.
 */
export function BrandLogo({ variant }: BrandLogoProps) {
  const isHeader = variant === 'header'
  const className = isHeader ? 'vision-brand-logo vision-brand-logo--header' : 'vision-brand-logo vision-brand-logo--rail'
  const png = isHeader ? BRAND_HEADER_LOGO_PNG : BRAND_RAIL_LOGO_PNG
  const svg = isHeader ? headerSvg : railSvg

  if (BRAND_LOGO_MODE === 'png') {
    return (
      <Box
        component="img"
        src={png}
        alt={DISPLAY_VISION}
        className={className}
        sx={
          isHeader
            ? {
                height: 28,
                width: 'auto',
                maxWidth: 240,
                objectFit: 'contain',
                objectPosition: 'left',
              }
            : {
                width: 52,
                height: 52,
                objectFit: 'contain',
                alignSelf: 'center',
                mb: 1,
              }
        }
      />
    )
  }

  return (
    <Box
      className={className}
      role="img"
      aria-label={DISPLAY_VISION}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
