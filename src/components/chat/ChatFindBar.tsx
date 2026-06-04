import CloseIcon from '@mui/icons-material/Close'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp'
import SearchIcon from '@mui/icons-material/Search'
import { Box, IconButton, InputAdornment, TextField, Typography } from '@mui/material'

interface ChatFindBarProps {
  query: string
  matchIndex: number
  matchCount: number
  inputRef: React.RefObject<HTMLInputElement | null>
  onQueryChange: (value: string) => void
  onClose: () => void
  onNext: () => void
  onPrev: () => void
}

export function ChatFindBar({
  query,
  matchIndex,
  matchCount,
  inputRef,
  onQueryChange,
  onClose,
  onNext,
  onPrev,
}: ChatFindBarProps) {
  const label =
    matchCount === 0
      ? query.trim()
        ? 'No matches'
        : ''
      : `${matchIndex + 1} of ${matchCount}`

  return (
    <Box
      data-chat-find-skip
      data-testid="chat-find-bar"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 2,
        display: 'flex',
        alignItems: 'center',
        gap: 0.5,
        px: 1,
        py: 0.5,
        mb: 1,
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        borderRadius: 1,
        boxShadow: 1,
      }}
    >
      <TextField
        inputRef={inputRef}
        size="small"
        placeholder="Find in chat…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            if (e.shiftKey) onPrev()
            else onNext()
          }
        }}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          },
        }}
        sx={{ flex: 1, minWidth: 0 }}
      />
      <Typography variant="caption" color="text.secondary" sx={{ minWidth: '4.5rem', textAlign: 'center' }}>
        {label}
      </Typography>
      <IconButton size="small" aria-label="Previous match" onClick={onPrev} disabled={matchCount === 0}>
        <KeyboardArrowUpIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" aria-label="Next match" onClick={onNext} disabled={matchCount === 0}>
        <KeyboardArrowDownIcon fontSize="small" />
      </IconButton>
      <IconButton size="small" aria-label="Close find" onClick={onClose}>
        <CloseIcon fontSize="small" />
      </IconButton>
    </Box>
  )
}
