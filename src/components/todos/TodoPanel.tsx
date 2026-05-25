import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import LinkIcon from '@mui/icons-material/Link'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useRef, useState } from 'react'
import { isTodoBlocked } from '../../todos/layers'
import { parseImplementationSteps, type ImplementationStep } from '../../todos/tasksMd'
import type { ChecklistItem, TodoItem, TodoStatus } from '../../todos/types'
import { TODO_TEMPLATES } from '../../todos/types'

const STATUS_COLOR: Record<TodoStatus, 'default' | 'primary' | 'success' | 'warning'> = {
  open: 'default',
  in_progress: 'primary',
  done: 'success',
  cancelled: 'warning',
}

type SpecTab = 'requirements' | 'design' | 'tasks' | 'checklist'

interface TodoPanelProps {
  loading: boolean
  todos: TodoItem[]
  activeId: string | null
  templates?: string[]
  onCreate: (title: string, spec: string, template?: string) => void | Promise<void>
  onUpdate: (
    id: string,
    patch: Partial<
      Pick<
        TodoItem,
        | 'title'
        | 'spec'
        | 'requirements'
        | 'design'
        | 'tasks_md'
        | 'depends_on'
        | 'branch'
        | 'pr_url'
        | 'status'
        | 'links'
        | 'checklist'
      >
    >
  ) => void
  currentBranch?: string | null
  tauriLocal?: boolean
  onDelete: (id: string) => void
  onSetActive: (id: string | null) => void
  onMarkDone: (id: string) => void
  onStartWork: (todo: TodoItem) => void
  onImplementStep?: (todo: TodoItem, step: ImplementationStep) => void
  httpReady?: boolean
  sessionReady?: boolean
  sessionBusy?: boolean
  specGenerating?: boolean
  onGenerateSpec?: (
    todoId: string,
    prompt: string,
    mode: 'generate' | 'refine'
  ) => void | Promise<void>
  onExportMarkdown?: () => void | Promise<void>
  onImportMarkdown?: (markdown: string, merge: boolean) => void | Promise<void>
  onMoveTodo?: (id: string, direction: 'up' | 'down') => void
  onSyncSpecFromDisk?: (id: string) => void | Promise<void>
  onCancelSpecGenerate?: () => void
}

export function TodoPanel({
  loading,
  todos,
  activeId,
  templates = [...TODO_TEMPLATES],
  onCreate,
  onUpdate,
  onDelete,
  onSetActive,
  onMarkDone,
  onStartWork,
  onImplementStep,
  httpReady,
  sessionReady,
  sessionBusy,
  specGenerating,
  onGenerateSpec,
  onExportMarkdown,
  onImportMarkdown,
  onMoveTodo,
  onSyncSpecFromDisk,
  onCancelSpecGenerate,
  currentBranch,
  tauriLocal,
}: TodoPanelProps) {
  const importInputRef = useRef<HTMLInputElement>(null)
  const importMergeRef = useRef(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [requirements, setRequirements] = useState('')
  const [design, setDesign] = useState('')
  const [tasksMd, setTasksMd] = useState('')
  const [dependsOn, setDependsOn] = useState<string[]>([])
  const [branch, setBranch] = useState('')
  const [prUrl, setPrUrl] = useState('')
  const [checklist, setChecklist] = useState<ChecklistItem[]>([])
  const [specTab, setSpecTab] = useState<SpecTab>('requirements')
  const [newTemplate, setNewTemplate] = useState<string>('')
  const [generateOpen, setGenerateOpen] = useState(false)
  const [generatePrompt, setGeneratePrompt] = useState('')
  const [generateMode, setGenerateMode] = useState<'generate' | 'refine'>('generate')

  const selected = todos.find((t) => t.id === selectedId) ?? null
  const depOptions = todos.filter((t) => t.id !== selected?.id)
  const implSteps = useMemo(
    () => (selected ? parseImplementationSteps(tasksMd) : []),
    [selected?.id, tasksMd]
  )

  useEffect(() => {
    if (selected) {
      setTitle(selected.title)
      setRequirements(selected.requirements ?? '')
      setDesign(selected.design ?? '')
      setTasksMd(selected.tasks_md ?? '')
      setDependsOn(selected.depends_on ?? [])
      setBranch(selected.branch ?? '')
      setPrUrl(selected.pr_url ?? '')
      setChecklist(selected.checklist ?? [])
    }
  }, [
    selected?.id,
    selected?.title,
    selected?.requirements,
    selected?.design,
    selected?.tasks_md,
    selected?.depends_on,
    selected?.branch,
    selected?.pr_url,
    selected?.checklist,
  ])

  const persistEditor = () => {
    if (!selected) return
    onUpdate(selected.id, {
      title: title.trim() || 'Untitled',
      requirements,
      design,
      tasks_md: tasksMd,
      depends_on: dependsOn,
      branch,
      pr_url: prUrl,
      checklist,
    })
  }

  const handleNew = () => {
    const t = `Task ${todos.length + 1}`
    void onCreate(t, '', newTemplate || undefined)
    setNewTemplate('')
    setSelectedId(null)
    setTitle(t)
    setRequirements('')
    setDesign('')
    setTasksMd('')
    setDependsOn([])
    setChecklist([])
    setSpecTab('requirements')
  }

  const addChecklistItem = () => {
    const next = [
      ...checklist,
      { id: crypto.randomUUID().replace(/-/g, '').slice(0, 8), text: '', done: false },
    ]
    setChecklist(next)
    if (selected) onUpdate(selected.id, { checklist: next })
  }

  const updateChecklistItem = (id: string, patch: Partial<ChecklistItem>) => {
    const next = checklist.map((c) => (c.id === id ? { ...c, ...patch } : c))
    setChecklist(next)
    if (selected) onUpdate(selected.id, { checklist: next })
  }

  const removeChecklistItem = (id: string) => {
    const next = checklist.filter((c) => c.id !== id)
    setChecklist(next)
    if (selected) onUpdate(selected.id, { checklist: next })
  }

  const blocked = selected ? isTodoBlocked(selected, todos) : false

  return (
    <Box
      data-testid="todo-panel"
      sx={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 1, p: 1 }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1 }} flexWrap="wrap" useFlexGap>
        <Typography variant="subtitle1" fontWeight={600}>
          Tasks
        </Typography>
        <Stack direction="row" spacing={1} alignItems="center">
          <FormControl size="small" sx={{ minWidth: 140 }}>
            <InputLabel id="todo-template-label">Template</InputLabel>
            <Select
              labelId="todo-template-label"
              label="Template"
              value={newTemplate}
              onChange={(e) => setNewTemplate(e.target.value)}
            >
              <MenuItem value="">None</MenuItem>
              {templates.map((t) => (
                <MenuItem key={t} value={t}>
                  {t}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Button
            data-testid="todo-new"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleNew}
            disabled={loading}
          >
            New
          </Button>
          {onExportMarkdown && (
            <Button
              size="small"
              startIcon={<FileDownloadIcon />}
              disabled={loading}
              onClick={() => void onExportMarkdown()}
            >
              Export
            </Button>
          )}
          {onImportMarkdown && (
            <>
              <input
                ref={importInputRef}
                type="file"
                accept=".md,text/markdown,text/plain"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  void file.text().then((text) => onImportMarkdown(text, importMergeRef.current))
                  e.target.value = ''
                }}
              />
              <Button
                size="small"
                startIcon={<FileUploadIcon />}
                disabled={loading}
                onClick={() => {
                  importMergeRef.current = false
                  importInputRef.current?.click()
                }}
              >
                Import
              </Button>
              <Button
                size="small"
                disabled={loading}
                onClick={() => {
                  importMergeRef.current = true
                  importInputRef.current?.click()
                }}
              >
                Merge
              </Button>
            </>
          )}
        </Stack>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ px: 1 }}>
        Stored in <Box component="code">.aider-vision/todos.json</Box>; three-layer specs also sync to{' '}
        <Box component="code">.aider-vision/specs/&lt;id&gt;/</Box>.
        {tauriLocal && !httpReady
          ? ' Desktop: tasks saved locally via Tauri (core API optional).'
          : httpReady
            ? ' Synced via core API (no chat session required).'
            : ' Start the core API or use the desktop app for file-backed tasks.'}{' '}
        Checking all checklist items marks a task done automatically.
      </Typography>

      <Stack direction="row" sx={{ flex: 1, minHeight: 0, gap: 1 }}>
        <Paper
          variant="outlined"
          sx={{ width: 280, flexShrink: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}
        >
          {loading && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              Loading…
            </Typography>
          )}
          {!loading && todos.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
              No tasks yet. Pick a template (try <Box component="code">spec-driven</Box>) and create one.
            </Typography>
          )}
          <List dense disablePadding>
            {todos.map((todo, index) => (
              <ListItem
                key={todo.id}
                disablePadding
                secondaryAction={
                  onMoveTodo ? (
                    <Stack direction="row" spacing={0}>
                      <IconButton
                        size="small"
                        aria-label="Move up"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          onMoveTodo(todo.id, 'up')
                        }}
                      >
                        <ArrowUpwardIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        aria-label="Move down"
                        disabled={index === todos.length - 1}
                        onClick={(e) => {
                          e.stopPropagation()
                          onMoveTodo(todo.id, 'down')
                        }}
                      >
                        <ArrowDownwardIcon fontSize="small" />
                      </IconButton>
                    </Stack>
                  ) : undefined
                }
              >
              <ListItemButton
                selected={selectedId === todo.id}
                onClick={() => setSelectedId(todo.id)}
                sx={{ pr: onMoveTodo ? 7 : undefined }}
              >
                <ListItemText
                  primary={todo.title}
                  secondary={
                    <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                      <Chip label={todo.status.replace('_', ' ')} size="small" color={STATUS_COLOR[todo.status]} />
                      {activeId === todo.id && (
                        <Chip label="active" size="small" color="info" variant="outlined" />
                      )}
                      {isTodoBlocked(todo, todos) && (
                        <Chip label="blocked" size="small" color="warning" variant="outlined" />
                      )}
                      {todo.branch?.trim() && (
                        <Chip label={todo.branch.trim()} size="small" variant="outlined" />
                      )}
                    </Stack>
                  }
                  primaryTypographyProps={{ noWrap: true, fontSize: '0.85rem' }}
                />
              </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Paper>

        <Paper
          variant="outlined"
          sx={{ flex: 1, p: 2, display: 'flex', flexDirection: 'column', gap: 1.5, minWidth: 0, overflow: 'auto' }}
        >
          {!selected ? (
            <Typography color="text.secondary">Select a task or create a new one.</Typography>
          ) : (
            <>
              <TextField
                label="Title"
                size="small"
                fullWidth
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={persistEditor}
              />

              <FormControl size="small" fullWidth>
                <InputLabel id="todo-deps-label">Depends on</InputLabel>
                <Select
                  labelId="todo-deps-label"
                  label="Depends on"
                  multiple
                  value={dependsOn}
                  onChange={(e) => {
                    const v = e.target.value
                    const next = typeof v === 'string' ? v.split(',') : v
                    setDependsOn(next)
                    onUpdate(selected.id, { depends_on: next })
                  }}
                  renderValue={(ids) =>
                    ids
                      .map((id) => todos.find((t) => t.id === id)?.title ?? id.slice(0, 8))
                      .join(', ') || 'None'
                  }
                >
                  {depOptions.length === 0 && (
                    <MenuItem disabled value="">
                      No other tasks
                    </MenuItem>
                  )}
                  {depOptions.map((t) => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.title} ({t.id.slice(0, 8)})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {blocked && (
                <Typography variant="caption" color="warning.main">
                  One or more dependencies are not done — agent context will note blockers on send.
                </Typography>
              )}

              <Stack direction="row" spacing={1} alignItems="flex-start" useFlexGap flexWrap="wrap">
                <TextField
                  label="Git branch"
                  size="small"
                  sx={{ flex: 1, minWidth: 160 }}
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  onBlur={persistEditor}
                  placeholder="feature/my-task"
                />
                {currentBranch && (
                  <Button
                    size="small"
                    sx={{ mt: 0.5 }}
                    onClick={() => {
                      setBranch(currentBranch)
                      onUpdate(selected.id, { branch: currentBranch })
                    }}
                  >
                    Use {currentBranch}
                  </Button>
                )}
              </Stack>
              <TextField
                label="Pull request URL"
                size="small"
                fullWidth
                value={prUrl}
                onChange={(e) => setPrUrl(e.target.value)}
                onBlur={persistEditor}
                placeholder="https://github.com/org/repo/pull/123"
              />
              {prUrl.trim() && (
                <Button
                  size="small"
                  startIcon={<LinkIcon />}
                  href={prUrl.trim()}
                  target="_blank"
                  rel="noopener noreferrer"
                  component="a"
                >
                  Open PR
                </Button>
              )}

              <Tabs
                value={specTab}
                onChange={(_, v: SpecTab) => setSpecTab(v)}
                variant="scrollable"
                allowScrollButtonsMobile
              >
                <Tab label="Requirements" value="requirements" />
                <Tab label="Design" value="design" />
                <Tab label="Tasks" value="tasks" />
                <Tab label="Checklist" value="checklist" />
              </Tabs>

              {specTab === 'requirements' && (
                <TextField
                  label="Requirements (EARS-style)"
                  size="small"
                  fullWidth
                  multiline
                  minRows={8}
                  maxRows={16}
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  onBlur={persistEditor}
                  placeholder="WHEN … THE system SHALL …"
                />
              )}
              {specTab === 'design' && (
                <TextField
                  label="Design"
                  size="small"
                  fullWidth
                  multiline
                  minRows={8}
                  maxRows={16}
                  value={design}
                  onChange={(e) => setDesign(e.target.value)}
                  onBlur={persistEditor}
                  placeholder="Overview, architecture, components…"
                />
              )}
              {specTab === 'tasks' && (
                <>
                  <TextField
                    label="Implementation tasks"
                    size="small"
                    fullWidth
                    multiline
                    minRows={6}
                    maxRows={12}
                    value={tasksMd}
                    onChange={(e) => setTasksMd(e.target.value)}
                    onBlur={persistEditor}
                    placeholder="- [ ] 1. … (depends: none)"
                  />
                  {implSteps.length > 0 && onImplementStep && (
                    <Box>
                      <Typography variant="subtitle2" gutterBottom>
                        Steered implementation
                      </Typography>
                      <Stack spacing={0.5}>
                        {implSteps.map((step) => (
                          <Stack
                            key={step.number}
                            direction="row"
                            alignItems="center"
                            spacing={1}
                            useFlexGap
                          >
                            <Typography
                              variant="body2"
                              sx={{ flex: 1, opacity: step.done ? 0.6 : 1 }}
                            >
                              {step.number}. {step.text}
                              {step.done ? ' ✓' : ''}
                            </Typography>
                            <Button
                              size="small"
                              variant="outlined"
                              disabled={sessionBusy || !sessionReady}
                              onClick={() => {
                                persistEditor()
                                onImplementStep(
                                  {
                                    ...selected,
                                    title,
                                    requirements,
                                    design,
                                    tasks_md: tasksMd,
                                    depends_on: dependsOn,
                                    branch,
                                    pr_url: prUrl,
                                    checklist,
                                  },
                                  step
                                )
                              }}
                            >
                              Implement
                            </Button>
                          </Stack>
                        ))}
                      </Stack>
                    </Box>
                  )}
                </>
              )}
              {specTab === 'checklist' && (
                <Box>
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                    <Typography variant="subtitle2">Acceptance checklist</Typography>
                    <Button size="small" onClick={addChecklistItem}>
                      Add item
                    </Button>
                  </Stack>
                  <List dense disablePadding>
                    {checklist.map((item) => (
                      <ListItem
                        key={item.id}
                        disablePadding
                        secondaryAction={
                          <IconButton
                            edge="end"
                            size="small"
                            aria-label="Remove"
                            onClick={() => removeChecklistItem(item.id)}
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        }
                      >
                        <ListItemIcon sx={{ minWidth: 36 }}>
                          <Checkbox
                            edge="start"
                            checked={item.done}
                            onChange={(e) => updateChecklistItem(item.id, { done: e.target.checked })}
                          />
                        </ListItemIcon>
                        <TextField
                          size="small"
                          fullWidth
                          value={item.text}
                          placeholder="Acceptance item…"
                          onChange={(e) => updateChecklistItem(item.id, { text: e.target.value })}
                          onBlur={persistEditor}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}

              {selected.links.length > 0 && (
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                    Links from agent turns
                  </Typography>
                  <Stack spacing={0.5}>
                    {selected.links.map((link) => (
                      <Typography key={link} variant="caption" component="div" fontFamily="monospace">
                        {link}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              )}

              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {onGenerateSpec && (
                  <>
                    <Button
                      size="small"
                      startIcon={
                        specGenerating ? <CircularProgress size={16} /> : <AutoAwesomeIcon />
                      }
                      disabled={!sessionReady || sessionBusy || specGenerating}
                      onClick={() => {
                        setGenerateMode('generate')
                        setGeneratePrompt(title ? `Feature: ${title}` : '')
                        setGenerateOpen(true)
                      }}
                    >
                      Generate spec
                    </Button>
                    <Button
                      size="small"
                      disabled={!sessionReady || sessionBusy || specGenerating}
                      onClick={() => {
                        setGenerateMode('refine')
                        setGeneratePrompt('Review for consistency across requirements, design, and tasks.')
                        setGenerateOpen(true)
                      }}
                    >
                      Refine spec
                    </Button>
                    {onSyncSpecFromDisk && selected && (
                      <Button
                        size="small"
                        disabled={loading}
                        onClick={() => void onSyncSpecFromDisk(selected.id)}
                      >
                        Reload from disk
                      </Button>
                    )}
                  </>
                )}
                <Button
                  variant="contained"
                  size="small"
                  startIcon={<PlayArrowIcon />}
                  onClick={() => {
                    persistEditor()
                    onStartWork({
                      ...selected,
                      title,
                      requirements,
                      design,
                      tasks_md: tasksMd,
                      depends_on: dependsOn,
                      branch,
                      pr_url: prUrl,
                      checklist,
                    })
                  }}
                >
                  Start work
                </Button>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<CheckIcon />}
                  onClick={() => onMarkDone(selected.id)}
                  disabled={selected.status === 'done'}
                >
                  Mark done
                </Button>
                {activeId === selected.id ? (
                  <Button size="small" onClick={() => onSetActive(null)}>
                    Clear active
                  </Button>
                ) : (
                  <Button size="small" onClick={() => onSetActive(selected.id)}>
                    Set active
                  </Button>
                )}
                <IconButton
                  size="small"
                  aria-label="Delete task"
                  color="error"
                  onClick={() => {
                    onDelete(selected.id)
                    setSelectedId(null)
                  }}
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </Stack>
            </>
          )}
        </Paper>
      </Stack>

      <Dialog open={generateOpen} onClose={() => !specGenerating && setGenerateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {generateMode === 'generate' ? 'Generate spec with AI' : 'Refine spec with AI'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Runs in a separate background job (same model as your session). You can keep using chat
            while the spec generates.
          </Typography>
          <TextField
            label="Prompt"
            fullWidth
            multiline
            minRows={3}
            value={generatePrompt}
            onChange={(e) => setGeneratePrompt(e.target.value)}
            disabled={specGenerating}
          />
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (specGenerating) onCancelSpecGenerate?.()
              else setGenerateOpen(false)
            }}
          >
            {specGenerating ? 'Cancel generation' : 'Close'}
          </Button>
          <Button
            variant="contained"
            disabled={!generatePrompt.trim() || specGenerating || !selected}
            onClick={() => {
              if (!selected || !onGenerateSpec) return
              void (async () => {
                try {
                  await onGenerateSpec(selected.id, generatePrompt.trim(), generateMode)
                  setGenerateOpen(false)
                } catch {
                  /* parent shows snackbar */
                }
              })()
            }}
          >
            {specGenerating ? 'Generating…' : 'Run'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
