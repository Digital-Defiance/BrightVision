import { useRef } from 'react'
import ImageOutlinedIcon from '@mui/icons-material/ImageOutlined'
import { IconButton, Tooltip } from '@mui/material'
interface ChatImageAttachProps {
  disabled?: boolean
  /** Desktop: open native file picker via Tauri. */
  useNativePicker?: boolean
  onNativePick?: () => void
  onPickFiles: (files: FileList) => void
}

export function ChatImageAttach({
  disabled,
  useNativePicker,
  onNativePick,
  onPickFiles,
}: ChatImageAttachProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        multiple
        hidden
        onChange={(e) => {
          const files = e.target.files
          if (files?.length) onPickFiles(files)
          e.target.value = ''
        }}
      />
      <Tooltip title="Attach images or PDF (vision models). Opens a file picker — not /add path entry.">
        <span>
          <IconButton
            size="small"
            aria-label="Attach images"
            data-testid={useNativePicker ? 'chat-attach-native' : 'chat-attach-web'}
            disabled={disabled}
            onClick={() => {
              if (useNativePicker && onNativePick) {
                onNativePick()
              } else {
                inputRef.current?.click()
              }
            }}
            sx={{ alignSelf: 'flex-end', mb: 0.5 }}
          >
            <ImageOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </Tooltip>
    </>
  )
}
