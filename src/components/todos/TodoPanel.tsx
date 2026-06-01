import AddIcon from '@mui/icons-material/Add'
import CheckIcon from '@mui/icons-material/Check'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import FileDownloadIcon from '@mui/icons-material/FileDownload'
import FileUploadIcon from '@mui/icons-material/FileUpload'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import FolderSharedIcon from '@mui/icons-material/FolderShared'
import HubIcon from '@mui/icons-material/Hub'
import LinkIcon from '@mui/icons-material/Link'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import { DISPLAY_VISION_API } from '../../brand'
import {
  Alert,
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
  FormControlLabel,
  IconButton,
  InputLabel,
  Switch,
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
import {
  earsIssueLabel,
  type EarsLintResult,
  type SpecIndexResult,
  type TraceabilityResult,
} from '../../todos/earsTypes'
import { TODO_TEMPLATES } from '../../todos/types'
import { SessionContextHint } from '../session/SessionContextHint'
import type { SessionContextUsage } from '../../utils/contextUsage'
import {
  gateSpecTabSwitch,
  specWizardNudges,
  wizardPromptForSection,
  type SpecLayerSection,
  type SpecWizardTab,
} from '../../utils/specWizard'

const STATUS_COLOR: Record<TodoStatus, 'default' | 'primary' | 'success' | 'warning'> = {
  open: 'default',
  in_progress: 'primary',
  done: 'success',
  cancelled: 'warning',
}

type SpecTab = SpecWizardTab

interface TodoPanelProps {
  loading: boolean
  todos: TodoItem[]
  activeId: string | null
  templates?: string[]
  onCreate: (title: string, spec: string, template?: string) => void | Promise<TodoItem | void>
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
  ) => void | Promise<void>
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
  contextPaths?: string[]
  contextUsage?: SessionContextUsage
  onOpenSpec?: () => void
  onAddContextPath?: (path: string) => void | Promise<void>
  onOpenContextInEditor?: (path: string) => void
  onGenerateSpec?: (
    todoId: string,
    prompt: string,
    mode: 'generate' | 'refine',
    options?: { section?: SpecLayerSection | 'all'; contextPaths?: string[] }
  ) => void | Promise<void>
  onExportMarkdown?: () => void | Promise<void>
  onImportMarkdown?: (markdown: string, merge: boolean) => void | Promise<void>
  onMoveTodo?: (id: string, direction: 'up' | 'down') => void
  onSyncSpecFromDisk?: (id: string) => void | Promise<void>
  onLintRequirements?: (id: string, draftRequirements: string) => Promise<EarsLintResult>
  onFetchSpecIndex?: () => Promise<SpecIndexResult>
  onRepairSpecFolders?: () => Promise<{ created_count: number; created_ids: string[] }>
  onPruneOrphanSpecFolders?: () => Promise<{ removed_count: number; removed_ids: string[] }>
  specFocusMode?: boolean
  onSpecFocusChange?: (enabled: boolean) => void
  onTraceSpec?: (
    id: string,
    draft: { requirements: string; design: string; tasks_md: string }
  ) => Promise<TraceabilityResult>
  onCancelSpecGenerate?: () => void
  /** Bumped after generate/refine saves layers — refreshes spec index panel. */
  specIndexRefreshToken?: number
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
  contextPaths = [],
  contextUsage,
  onOpenSpec,
  onAddContextPath,
  onOpenContextInEditor,
  onGenerateSpec,
  onExportMarkdown,
  onImportMarkdown,
  onMoveTodo,
  onSyncSpecFromDisk,
  onLintRequirements,
  onFetchSpecIndex,
  onRepairSpecFolders,
  onPruneOrphanSpecFolders,
  specFocusMode = false,
  onSpecFocusChange,
  onTraceSpec,
  onCancelSpecGenerate,
  specIndexRefreshToken,
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
  const [earsLint, setEarsLint] = useState<EarsLintResult | null>(null)
  const [earsLinting, setEarsLinting] = useState(false)
  const [specIndex, setSpecIndex] = useState<SpecIndexResult | null>(null)
  const [specIndexing, setSpecIndexing] = useState(false)
  const [specTrace, setSpecTrace] = useState<TraceabilityResult | null>(null)
  const [specTracing, setSpecTracing] = useState(false)
  const [generatePrompt, setGeneratePrompt] = useState('')
  const [generateMode, setGenerateMode] = useState<'generate' | 'refine'>('generate')
  const [generateSection, setGenerateSection] = useState<SpecLayerSection | 'all'>('all')
  const [tabGateAlert, setTabGateAlert] = useState<string | null>(null)

  const selected = todos.find((t) => t.id === selectedId) ?? null
  const layerDraft = useMemo(
    () => ({ requirements, design, tasks_md: tasksMd }),
    [requirements, design, tasksMd]
  )
  const wizardNudges = useMemo(
    () => (selected ? specWizardNudges(specTab, layerDraft) : []),
    [selected, specTab, layerDraft]
  )

  const depOptions = todos.filter((t) => t.id !== selected?.id)
  const implSteps = useMemo(
    () => (selected ? parseImplementationSteps(tasksMd) : []),
    [selected?.id, tasksMd]
  )

  const implementBlockedByEars = Boolean(earsLint && !earsLint.ok)

  useEffect(() => {
    setEarsLint(null)
    setSpecTrace(null)
  }, [selectedId])

  const runEarsLint = async () => {
    if (!selected || !onLintRequirements) return
    setEarsLinting(true)
    try {
      const result = await onLintRequirements(selected.id, requirements)
      setEarsLint(result)
    } finally {
      setEarsLinting(false)
    }
  }

  const runSpecIndex = async () => {
    if (!onFetchSpecIndex) return
    setSpecIndexing(true)
    try {
      setSpecIndex(await onFetchSpecIndex())
    } finally {
      setSpecIndexing(false)
    }
  }

  useEffect(() => {
    if (!specIndexRefreshToken || !onFetchSpecIndex) return
    void runSpecIndex()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when parent bumps token after generate-spec
  }, [specIndexRefreshToken])

  const runTraceSpec = async () => {
    if (!selected || !onTraceSpec) return
    setSpecTracing(true)
    try {
      const result = await onTraceSpec(selected.id, {
        requirements,
        design,
        tasks_md: tasksMd,
      })
      setSpecTrace(result)
    } finally {
      setSpecTracing(false)
    }
  }

  const hydrateEditorFromTodo = (todo: TodoItem) => {
    setTitle(todo.title)
    setRequirements(todo.requirements ?? '')
    setDesign(todo.design ?? '')
    setTasksMd(todo.tasks_md ?? '')
    setDependsOn(todo.depends_on ?? [])
    setBranch(todo.branch ?? '')
    setPrUrl(todo.pr_url ?? '')
    setChecklist(todo.checklist ?? [])
  }

  useEffect(() => {
    if (selected) hydrateEditorFromTodo(selected)
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

  useEffect(() => {
    if (!activeId) return
    if (!selectedId || !todos.some((t) => t.id === selectedId)) {
      setSelectedId(activeId)
    }
  }, [activeId, selectedId, todos])

  useEffect(() => {
    if (!specIndexRefreshToken) return
    const todo = selectedId ? todos.find((t) => t.id === selectedId) : null
    if (todo) hydrateEditorFromTodo(todo)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh layers after generate/refine without leaving spec sub-tabs
  }, [specIndexRefreshToken, todos, selectedId])

  const persistEditor = async () => {
    if (!selected) return
    await onUpdate(selected.id, {
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

  const handleReloadFromDisk = async () => {
    if (!selected || !onSyncSpecFromDisk) return
    await persistEditor()
    await onSyncSpecFromDisk(selected.id)
  }

  const openGenerateWizard = (
    section: SpecLayerSection | 'all',
    mode: 'generate' | 'refine' = 'generate'
  ) => {
    setGenerateMode(mode)
    setGenerateSection(section)
    if (section === 'all') {
      setGeneratePrompt(title ? `Feature: ${title}` : '')
    } else {
      const meta = wizardPromptForSection(section, title)
      setGeneratePrompt(meta.defaultPrompt)
    }
    setGenerateOpen(true)
  }

  const handleSpecTabChange = (_: unknown, next: SpecTab) => {
    const gate = gateSpecTabSwitch(specTab, next, layerDraft)
    if (!gate.allowed) {
      setTabGateAlert(gate.message ?? 'Complete the previous wizard step first.')
      return
    }
    setTabGateAlert(null)
    setSpecTab(next)
  }

  const renderWizardNudges = () =>
    wizardNudges.map((nudge) => (
      <Alert
        key={nudge.id}
        severity={nudge.severity}
        sx={{ mb: 1 }}
        data-testid={`spec-wizard-nudge-${nudge.id}`}
        action={
          nudge.actionSection && onGenerateSpec && sessionReady ? (
            <Button
              color="inherit"
              size="small"
              disabled={specGenerating}
              onClick={() => openGenerateWizard(nudge.actionSection!, 'generate')}
            >
              {nudge.actionLabel}
            </Button>
          ) : undefined
        }
      >
        {nudge.message}
      </Alert>
    ))

  const persistRequirements = () => {
    persistEditor()
    if (onLintRequirements && requirements.trim()) {
      void runEarsLint()
    }
  }

  const handleNew = () => {
    const t = `Task ${todos.length + 1}`
    const template = newTemplate || undefined
    setNewTemplate('')
    void (async () => {
      const created = await onCreate(t, '', template)
      if (created?.id) {
        setSelectedId(created.id)
        hydrateEditorFromTodo(created)
        setSpecTab('requirements')
        return
      }
      setSelectedId(null)
      setTitle(t)
      setRequirements('')
      setDesign('')
      setTasksMd('')
      setDependsOn([])
      setChecklist([])
      setSpecTab('requirements')
    })()
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
          {httpReady && onFetchSpecIndex && (
            <Button
              size="small"
              startIcon={
                specIndexing ? <CircularProgress size={16} /> : <FolderSharedIcon />
              }
              disabled={loading || specIndexing}
              onClick={() => void runSpecIndex()}
              data-testid="todo-spec-index"
            >
              Check spec index
            </Button>
          )}
          {(httpReady || tauriLocal) && onRepairSpecFolders && (
            <Button
              size="small"
              disabled={loading}
              onClick={() => {
                void onRepairSpecFolders().then(() => void runSpecIndex())
              }}
              data-testid="todo-repair-spec-folders"
            >
              Repair folders
            </Button>
          )}
          {(httpReady || tauriLocal) && onPruneOrphanSpecFolders && (
            <Button
              size="small"
              disabled={loading}
              onClick={() => {
                void onPruneOrphanSpecFolders().then(() => void runSpecIndex())
              }}
              data-testid="todo-prune-orphan-spec-folders"
            >
              Remove orphans
            </Button>
          )}
          {sessionReady && onSpecFocusChange && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={specFocusMode}
                  onChange={(e) => onSpecFocusChange(e.target.checked)}
                  data-testid="todo-spec-focus"
                />
              }
              label="Spec focus"
            />
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
        Stored in <Box component="code">.cecli/todos.json</Box>; three-layer specs also sync to{' '}
        <Box component="code">.cecli/specs/&lt;id&gt;/</Box>.
        {tauriLocal && !httpReady
          ? ` Desktop: tasks saved locally via Tauri (${DISPLAY_VISION_API} optional).`
          : httpReady
            ? ` Synced via ${DISPLAY_VISION_API} (no chat session required).`
            : ` Start ${DISPLAY_VISION_API} (Terminal → Start) or use the desktop app for file-backed tasks.`}{' '}
        Checking all checklist items marks a task done automatically. Cecli agent{' '}
        <Box component="code">UpdateTodoList</Box> syncs into Tasks when a chat turn finishes or when
        you open this tab.
      </Typography>
      {specGenerating && (
        <Alert
          severity="info"
          sx={{ mx: 1 }}
          data-testid="spec-generating-banner"
          action={
            onCancelSpecGenerate ? (
              <Button color="inherit" size="small" onClick={onCancelSpecGenerate}>
                Cancel
              </Button>
            ) : undefined
          }
        >
          Generating spec in the background — switch to Chat or other tabs while you wait.
        </Alert>
      )}
      {specIndex && (
        <Alert
          severity={specIndex.ok ? 'success' : 'warning'}
          sx={{ mx: 1 }}
          data-testid="spec-index-summary"
          onClose={() => setSpecIndex(null)}
        >
          {specIndex.ok
            ? `Spec index OK — ${specIndex.folders.length} folder(s), ${specIndex.task_ids.length} task(s)`
            : `${specIndex.error_count} error(s), ${specIndex.warning_count} warning(s) across spec folders`}
          {!specIndex.ok &&
            specIndex.issues.some((i) => i.code === 'SPEC_ORPHAN_FOLDER') && (
              <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                Orphan folders are from removed or older tasks (not your current task). Use{' '}
                <strong>Remove orphans</strong> to clean them up.
              </Typography>
            )}
        </Alert>
      )}
      {specIndex && specIndex.issues.length > 0 && (
        <Stack spacing={0.25} sx={{ mx: 1, maxHeight: 120, overflow: 'auto' }} data-testid="spec-index-issues">
          {specIndex.issues.map((issue, idx) => (
            <Typography
              key={`${issue.code}-${issue.todo_id ?? idx}`}
              variant="caption"
              component="div"
              color={
                issue.severity === 'error'
                  ? 'error.main'
                  : issue.severity === 'warning'
                    ? 'warning.main'
                    : 'text.secondary'
              }
            >
              {earsIssueLabel(issue)}
            </Typography>
          ))}
        </Stack>
      )}

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

              {onGenerateSpec && contextUsage && (
                <SessionContextHint
                  contextFiles={contextPaths}
                  contextUsage={contextUsage}
                  sessionReady={sessionReady}
                  onOpenSpec={onOpenSpec}
                  onAddPath={onAddContextPath}
                  onOpenInEditor={onOpenContextInEditor}
                />
              )}

              {tabGateAlert && (
                <Alert
                  severity="warning"
                  onClose={() => setTabGateAlert(null)}
                  sx={{ mb: 1 }}
                  data-testid="spec-tab-gate-alert"
                >
                  {tabGateAlert}
                </Alert>
              )}

              <Tabs
                value={specTab}
                onChange={handleSpecTabChange}
                variant="scrollable"
                allowScrollButtonsMobile
                data-testid="spec-layer-tabs"
              >
                <Tab
                  label={
                    earsLint && earsLint.error_count > 0
                      ? `Requirements (${earsLint.error_count})`
                      : 'Requirements'
                  }
                  value="requirements"
                />
                <Tab label="Design" value="design" />
                <Tab label="Tasks" value="tasks" />
                <Tab label="Checklist" value="checklist" />
              </Tabs>

              {specTab === 'requirements' && (
                <Stack spacing={1}>
                  {renderWizardNudges()}
                  <TextField
                    label="Requirements (EARS-style)"
                    size="small"
                    fullWidth
                    multiline
                    minRows={8}
                    maxRows={16}
                    value={requirements}
                    onChange={(e) => setRequirements(e.target.value)}
                    onBlur={persistRequirements}
                    placeholder="WHEN … THE system SHALL …"
                  />
                  {earsLint && (
                    <Alert
                      severity={earsLint.ok ? 'success' : 'error'}
                      data-testid="ears-lint-summary"
                    >
                      {earsLint.ok
                        ? `EARS OK (${earsLint.clauses.length} clause${earsLint.clauses.length === 1 ? '' : 's'})`
                        : `${earsLint.error_count} error(s), ${earsLint.warning_count} warning(s)`}
                    </Alert>
                  )}
                  {earsLint && earsLint.issues.length > 0 && (
                    <Stack spacing={0.5} data-testid="ears-lint-issues">
                      {earsLint.issues.map((issue, idx) => (
                        <Typography
                          key={`${issue.code}-${issue.line ?? idx}`}
                          variant="caption"
                          component="div"
                          color={
                            issue.severity === 'error'
                              ? 'error.main'
                              : issue.severity === 'warning'
                                ? 'warning.main'
                                : 'text.secondary'
                          }
                        >
                          {earsIssueLabel(issue)}
                        </Typography>
                      ))}
                    </Stack>
                  )}
                </Stack>
              )}
              {specTab === 'design' && (
                <Stack spacing={1}>
                  {renderWizardNudges()}
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
                </Stack>
              )}
              {specTab === 'tasks' && (
                <>
                  {renderWizardNudges()}
                  {specTrace && (
                    <Alert
                      severity={specTrace.ok ? 'success' : 'warning'}
                      data-testid="spec-trace-summary"
                      onClose={() => setSpecTrace(null)}
                    >
                      {specTrace.req_ids.length === 0
                        ? 'No REQ-### ids in requirements.'
                        : `${specTrace.req_ids.length} requirement id(s); ${specTrace.error_count} error(s), ${specTrace.warning_count} warning(s)`}
                    </Alert>
                  )}
                  {specTrace && specTrace.issues.length > 0 && (
                    <Stack spacing={0.5} data-testid="spec-trace-issues">
                      {specTrace.issues.map((issue, idx) => (
                        <Typography
                          key={`${issue.code}-${issue.req_id ?? idx}`}
                          variant="caption"
                          component="div"
                          color={
                            issue.severity === 'error'
                              ? 'error.main'
                              : issue.severity === 'warning'
                                ? 'warning.main'
                                : 'text.secondary'
                          }
                        >
                          {earsIssueLabel(issue)}
                        </Typography>
                      ))}
                    </Stack>
                  )}
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
                              disabled={
                                sessionBusy || !sessionReady || implementBlockedByEars
                              }
                              title={
                                implementBlockedByEars
                                  ? 'Fix EARS errors (Validate EARS) before implementing'
                                  : undefined
                              }
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
                      data-testid="todo-generate-spec-wizard"
                      onClick={() => {
                        const section: SpecLayerSection | 'all' =
                          specTab === 'requirements'
                            ? 'requirements'
                            : specTab === 'design'
                              ? 'design'
                              : specTab === 'tasks'
                                ? 'tasks_md'
                                : 'all'
                        openGenerateWizard(section, 'generate')
                      }}
                    >
                      {specTab === 'requirements'
                        ? 'Generate requirements'
                        : specTab === 'design'
                          ? 'Generate design'
                          : specTab === 'tasks'
                            ? 'Generate tasks'
                            : 'Generate spec'}
                    </Button>
                    {specTab !== 'checklist' && (
                      <Button
                        size="small"
                        disabled={!sessionReady || sessionBusy || specGenerating}
                        onClick={() => openGenerateWizard('all', 'generate')}
                        data-testid="todo-generate-spec-all"
                      >
                        All layers
                      </Button>
                    )}
                    <Button
                      size="small"
                      disabled={!sessionReady || sessionBusy || specGenerating}
                      onClick={() => openGenerateWizard('all', 'refine')}
                    >
                      Refine spec
                    </Button>
                    {onLintRequirements && (
                      <Button
                        size="small"
                        startIcon={
                          earsLinting ? <CircularProgress size={16} /> : <FactCheckIcon />
                        }
                        disabled={!sessionReady || earsLinting}
                        onClick={() => void runEarsLint()}
                        data-testid="todo-validate-ears"
                      >
                        Validate EARS
                      </Button>
                    )}
                    {onTraceSpec && selected && (
                      <Button
                        size="small"
                        startIcon={
                          specTracing ? <CircularProgress size={16} /> : <HubIcon />
                        }
                        disabled={!sessionReady || specTracing}
                        onClick={() => void runTraceSpec()}
                        data-testid="todo-trace-spec"
                      >
                        Trace coverage
                      </Button>
                    )}
                    {onSyncSpecFromDisk && selected && (
                      <Button
                        size="small"
                        disabled={loading}
                        onClick={() => void handleReloadFromDisk()}
                        data-testid="todo-reload-spec-from-disk"
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

      <Dialog open={generateOpen} onClose={() => setGenerateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {generateMode === 'refine'
            ? 'Refine spec with AI'
            : generateSection === 'all'
              ? 'Generate all spec layers'
              : wizardPromptForSection(generateSection as SpecLayerSection, title).title}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            {generateMode === 'refine'
              ? 'Runs in a separate background job. This dialog closes when you click Run — use Chat or other tabs while the spec generates.'
              : generateSection === 'all'
                ? 'Generates requirements, design, and tasks in one pass (legacy). For Kiro-style flow, use the per-layer buttons and wizard prompts on each tab.'
                : wizardPromptForSection(generateSection as SpecLayerSection, title).helper}
          </Typography>
          {contextPaths.length > 0 ? (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              Including {contextPaths.length} file(s): {contextPaths.slice(0, 4).join(', ')}
              {contextPaths.length > 4 ? '…' : ''}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
              No files in session context — add paths on the Tasks context bar or in Chat before Run.
            </Typography>
          )}
          <TextField
            label="Prompt"
            fullWidth
            multiline
            minRows={3}
            value={generatePrompt}
            onChange={(e) => setGeneratePrompt(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setGenerateOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            disabled={!generatePrompt.trim() || !selected || specGenerating}
            onClick={() => {
              if (!selected || !onGenerateSpec) return
              const todoId = selected.id
              const prompt = generatePrompt.trim()
              const mode = generateMode
              const section = generateSection
              setGenerateOpen(false)
              void Promise.resolve(
                onGenerateSpec(todoId, prompt, mode, {
                  section,
                  contextPaths,
                })
              ).catch(() => {
                /* parent snackbar */
              })
            }}
          >
            Run
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
