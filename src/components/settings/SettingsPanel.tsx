import RestartAltIcon from '@mui/icons-material/RestartAlt'
import SaveIcon from '@mui/icons-material/Save'
import SyncIcon from '@mui/icons-material/Sync'
import { useCallback, useEffect, useState } from 'react'
import { Box, Button, Paper, Stack, TextField, Typography } from '@mui/material'
import { invoke } from '@tauri-apps/api/core'
import { DISPLAY_VISION, DISPLAY_VISION_API } from '../../brand'
import {
  CORE_ENGINE_DIR,
  formatContextFilesInput,
  parseContextFilesInput,
  type VisionConfig,
} from '../../ipc/config'
import { isTauriRuntime } from '../../ipc/isTauri'
import {
  applyLocalLlmToConfig,
  formatLocalLlmDirectoryHelper,
  formatLocalLlmEnvPanel,
  isOllamaVisionModel,
  type LocalLlmSnapshot,
  type OllamaModelsSnapshot,
  resolveLocalLlmForConfig,
} from '../../ipc/localLlm'
import { WorkspaceBar } from '../WorkspaceBar'
import type { AppearanceConfig } from '../../theme/appearance'
import { AppearanceSection } from './AppearanceSection'
import { ThinkingTimingSection } from './ThinkingTimingSection'
import { ResourceOverlaySection } from './ResourceOverlaySection'
import type { ResourceOverlayPrefs } from '../../theme/resourceOverlayPrefs'
import { LocalLlmActionButtons } from '../local-llm/LocalLlmActionButtons'
import { LocalLlmPanel } from '../local-llm/LocalLlmPanel'
import { useLocalLlmControls } from '../../hooks/useLocalLlmControls'
import type { ThinkingTimingPrefs } from '../../theme/thinkingTimingPrefs'
import type { SuggestedFilesPrefs } from '../../theme/suggestedFilesPrefs'
import { SuggestedFilesSection } from './SuggestedFilesSection'
import type { EditorLanguagePrefs } from '../../theme/editorLanguagePrefs'
import { EditorLanguagesSection } from './EditorLanguagesSection'
import { ModelRouterSection } from './ModelRouterSection'
import type { ModelRouterPrefs } from '../../theme/modelRouterPrefs'
import type { ThinkingStatsStore } from '../../utils/thinkingStats'
import { AppVersionSection } from './AppVersionSection'
import { SessionPersistenceSection } from './SessionPersistenceSection'
import { AgentsSection } from './AgentsSection'
import type { AppVersions } from '../../hooks/useAppVersions'
import type { SubAgentInfo } from '../../ipc/agentCommands'

interface SettingsPanelProps {
  config: VisionConfig
  appearance: AppearanceConfig
  apiPreview: string
  sessionFiles?: string[]
  onChange: (config: VisionConfig) => void
  onAppearanceChange: (appearance: AppearanceConfig) => void
  thinkingTimingPrefs: ThinkingTimingPrefs
  onThinkingTimingPrefsChange: (prefs: ThinkingTimingPrefs) => void
  thinkingStatsStore: ThinkingStatsStore
  onClearThinkingStatsForModel: () => void
  onClearAllThinkingStats: () => void
  onTimingStatsMessage?: (message: string, severity: 'info' | 'warning') => void
  resourceOverlayPrefs: ResourceOverlayPrefs
  onResourceOverlayPrefsChange: (prefs: ResourceOverlayPrefs) => void
  suggestedFilesPrefs: SuggestedFilesPrefs
  onSuggestedFilesPrefsChange: (prefs: SuggestedFilesPrefs) => void
  editorLanguagePrefs: EditorLanguagePrefs
  onEditorLanguagePrefsChange: (prefs: EditorLanguagePrefs) => void
  modelRouterPrefs: ModelRouterPrefs
  onModelRouterPrefsChange: (prefs: ModelRouterPrefs) => void
  sessionModel: string
  onSave: () => void
  onReset: () => void
  appVersions: AppVersions
  subagents: SubAgentInfo[]
  agentModeAvailable: boolean
  sessionActive: boolean
}

export function SettingsPanel({
  config,
  appearance,
  apiPreview,
  sessionFiles,
  onChange,
  onAppearanceChange,
  thinkingTimingPrefs,
  onThinkingTimingPrefsChange,
  thinkingStatsStore,
  onClearThinkingStatsForModel,
  onClearAllThinkingStats,
  onTimingStatsMessage,
  resourceOverlayPrefs,
  onResourceOverlayPrefsChange,
  suggestedFilesPrefs,
  onSuggestedFilesPrefsChange,
  editorLanguagePrefs,
  onEditorLanguagePrefsChange,
  modelRouterPrefs,
  onModelRouterPrefsChange,
  sessionModel,
  onSave,
  onReset,
  appVersions,
  subagents,
  agentModeAvailable,
  sessionActive,
}: SettingsPanelProps) {
  const [bundledEnginePath, setBundledEnginePath] = useState<string>('')
  const [localLlmSnap, setLocalLlmSnap] = useState<LocalLlmSnapshot | null>(null)
  const [ollamaTagsSnap, setOllamaTagsSnap] = useState<OllamaModelsSnapshot | null>(null)
  const localLlmControls = useLocalLlmControls(config)

  const refreshLocalLlm = useCallback(() => {
    if (!isTauriRuntime()) return
    invoke<LocalLlmSnapshot>('read_local_llm_config', {
      localLlmRoot: config.localLlmRoot.trim() || null,
    })
      .then(setLocalLlmSnap)
      .catch(() => setLocalLlmSnap(null))
    const { ollamaHost, modelTag } = resolveLocalLlmForConfig(config)
    invoke<OllamaModelsSnapshot>('ollama_models_snapshot', {
      ollamaHost,
      modelTag: modelTag ?? '',
    })
      .then(setOllamaTagsSnap)
      .catch(() => setOllamaTagsSnap(null))
  }, [config.localLlmRoot, config.ollamaApiBase, config.model])

  useEffect(() => {
    if (!isTauriRuntime()) return
    invoke<string>('engine_install_path', { coreEnginePath: config.coreEnginePath })
      .then(setBundledEnginePath)
      .catch(() => setBundledEnginePath(''))
  }, [config.coreEnginePath])

  useEffect(() => {
    refreshLocalLlm()
  }, [refreshLocalLlm])

  return (
    <Stack spacing={3} sx={{ width: '100%', maxWidth: '100%' }}>
      <Typography variant="h5" fontWeight={600}>
        Model & system
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Choose a <strong>project</strong> for git edits. Cecli + Vision API are bundled with
        the app — you only set the project path, not a separate engine install per repo.
      </Typography>

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <TextField
            label="LLM model"
            fullWidth
            size="small"
            value={config.model}
            onChange={(e) => onChange({ ...config, model: e.target.value })}
            helperText="Local Ollama: ollama_chat/<tag> (see docs/LOCAL_LLM.md). Cloud: openai/…, anthropic/… + API keys in your environment."
          />
          <TextField
            label="Ollama API base (optional)"
            fullWidth
            size="small"
            value={config.ollamaApiBase}
            onChange={(e) => onChange({ ...config, ollamaApiBase: e.target.value })}
            placeholder={
              localLlmSnap?.ollamaHost?.trim() || 'http://127.0.0.1:11434'
            }
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: '0.85rem' } } }}
            helperText={
              localLlmSnap?.ollamaHost
                ? `local-llm OLLAMA_HOST: ${localLlmSnap.ollamaHost} — saved here as OLLAMA_API_BASE on Start.`
                : 'Sets OLLAMA_API_BASE when spawning the engine (desktop). Leave empty for default Ollama.'
            }
          />
          {isTauriRuntime() && (
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: 'action.hover' }}>
              <Typography variant="subtitle2" fontWeight={600} gutterBottom>
                Ollama env files
              </Typography>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                BrightVision reads <code>local-llm.env</code> or the XDG file{' '}
                <code>~/.config/local-llm/env</code> (literally named <code>env</code>). Same
                variables; different paths.
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                component="pre"
                sx={{ m: 0, mb: 1, fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}
              >
                {localLlmSnap ? formatLocalLlmEnvPanel(localLlmSnap) : 'Loading…'}
              </Typography>
              <TextField
                label="Extra config directory (optional)"
                fullWidth
                size="small"
                value={config.localLlmRoot}
                onChange={(e) => onChange({ ...config, localLlmRoot: e.target.value })}
                placeholder="directory that contains local-llm.env"
                slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: '0.8rem' } } }}
                helperText={formatLocalLlmDirectoryHelper(localLlmSnap, config.localLlmRoot)}
                onBlur={refreshLocalLlm}
              />
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1, mb: 0.5 }}>
                <strong>Step 1 — Load disk into Settings:</strong> sync after editing an env file.
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<SyncIcon />}
                  disabled={!localLlmSnap?.sources.length}
                  onClick={() => {
                    if (!localLlmSnap) return
                    onChange(applyLocalLlmToConfig(config, localLlmSnap, false))
                  }}
                >
                  Sync from env files
                </Button>
                <Button size="small" onClick={refreshLocalLlm}>
                  Refresh paths
                </Button>
              </Stack>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
                <strong>Step 2 — Start Ollama:</strong> after step 1 (or setting{' '}
                <code>ollama_chat/…</code> above), use Start then Ping. Same controls as{' '}
                <strong>Terminal → Local LLM</strong>. Ping checks inference; use{' '}
                <strong>Terminal → Start</strong> for the coding session ({DISPLAY_VISION_API}).
              </Typography>
              {isOllamaVisionModel(config.model) ? (
                <LocalLlmActionButtons controls={localLlmControls} showSecondary={false} />
              ) : (
                <Typography variant="caption" color="warning.main" display="block">
                  Set <strong>LLM model</strong> to <code>ollama_chat/&lt;tag&gt;</code> or click{' '}
                  <strong>Sync from env files</strong> to enable Start and Ping.
                </Typography>
              )}
            </Paper>
          )}
          <LocalLlmPanel
            config={config}
            controls={localLlmControls}
            hideActions={isTauriRuntime()}
            onManageChange={(manageLocalLlm) => onChange({ ...config, manageLocalLlm })}
          />
          <TextField
            label="LiteLLM extra params (JSON)"
            fullWidth
            size="small"
            multiline
            rows={3}
            value={config.extraParams}
            onChange={(e) => onChange({ ...config, extraParams: e.target.value })}
            slotProps={{ input: { sx: { fontFamily: 'monospace', fontSize: '0.85rem' } } }}
            helperText="Passed as LITELLM_EXTRA_PARAMS when spawning the API on desktop."
          />
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Project (git repository)
            </Typography>
            <WorkspaceBar
              workingDir={config.workingDir}
              onChange={(workingDir) => onChange({ ...config, workingDir })}
            />
          </Box>
          <TextField
            label="Context files (one per line, relative to workspace)"
            fullWidth
            size="small"
            multiline
            rows={4}
            value={formatContextFilesInput(config.contextFiles)}
            onChange={(e) =>
              onChange({ ...config, contextFiles: parseContextFilesInput(e.target.value) })
            }
            helperText="Sent as files[] when creating a session."
          />
          {sessionFiles && sessionFiles.length > 0 && (
            <Typography variant="caption" color="success.light">
              Active session: {sessionFiles.join(', ')}
            </Typography>
          )}
          {!isTauriRuntime() && (
            <TextField
              label="Vision API URL"
              fullWidth
              size="small"
              value={config.coreApiUrl}
              onChange={(e) => onChange({ ...config, coreApiUrl: e.target.value })}
              placeholder="/api/core"
              slotProps={{ input: { sx: { fontFamily: 'monospace' } } }}
            />
          )}
          {isTauriRuntime() && bundledEnginePath && (
            <TextField
              label="Engine (bundled with app)"
              fullWidth
              size="small"
              value={bundledEnginePath}
              slotProps={{ input: { readOnly: true, sx: { fontFamily: 'monospace', fontSize: '0.8rem' } } }}
              helperText="Advanced: override folder name below only if you relocated the submodule."
            />
          )}
          <TextField
            label="Engine folder name (advanced)"
            fullWidth
            size="small"
            value={config.coreEnginePath}
            onChange={(e) => onChange({ ...config, coreEnginePath: e.target.value })}
            helperText={`Relative to the ${CORE_ENGINE_DIR} install inside the ${DISPLAY_VISION} app.`}
          />
          <TextField
            label="Python (spawn API on desktop)"
            fullWidth
            size="small"
            value={config.pythonPath}
            onChange={(e) => onChange({ ...config, pythonPath: e.target.value })}
            placeholder=".venv/bin/python3"
            helperText="Leave empty to use the repo .venv (run source activate.sh once)."
          />
          <TextField
            label="Vision API token (optional)"
            fullWidth
            size="small"
            type="password"
            value={config.coreApiToken}
            onChange={(e) => onChange({ ...config, coreApiToken: e.target.value })}
          />
          <TextField
            label="Auto-approve countdown"
            fullWidth
            size="small"
            type="number"
            value={config.autoApproveLimit}
            onChange={(e) =>
              onChange({ ...config, autoApproveLimit: parseInt(e.target.value, 10) || 0 })
            }
            helperText="Automatically answer Yes on the next N confirmation prompts (0 = always ask)."
          />
          <TextField
            label="Prompt before commit"
            fullWidth
            size="small"
            select
            SelectProps={{ native: true }}
            value={config.promptBeforeCommit ? 'yes' : 'no'}
            onChange={(e) => {
              const manual = e.target.value === 'yes'
              onChange({
                ...config,
                promptBeforeCommit: manual,
                autoStageOnDone: manual ? true : config.autoStageOnDone,
              })
            }}
            helperText="When enabled, the engine will not auto-commit; use the Git tab to commit."
          >
            <option value="no">Auto-commit (default)</option>
            <option value="yes">Manual commit only</option>
          </TextField>
          <TextField
            label="Auto-stage edits after turn"
            fullWidth
            size="small"
            select
            SelectProps={{ native: true }}
            value={config.autoStageOnDone ? 'yes' : 'no'}
            onChange={(e) =>
              onChange({ ...config, autoStageOnDone: e.target.value === 'yes' })
            }
            helperText="When the engine does not commit, stage edited files so the Git tab shows staged diffs (desktop)."
          >
            <option value="yes">Yes (recommended with manual commit)</option>
            <option value="no">No</option>
          </TextField>
        </Stack>
      </Paper>

      <AppearanceSection appearance={appearance} onChange={onAppearanceChange} />

      <AgentsSection
        subagents={subagents}
        agentModeAvailable={agentModeAvailable}
        sessionActive={sessionActive}
      />

      <SuggestedFilesSection
        prefs={suggestedFilesPrefs}
        onChange={onSuggestedFilesPrefsChange}
      />

      <EditorLanguagesSection
        prefs={editorLanguagePrefs}
        onChange={onEditorLanguagePrefsChange}
      />

      <ModelRouterSection
        prefs={modelRouterPrefs}
        sessionModel={sessionModel}
        ollamaSnapshot={ollamaTagsSnap}
        onChange={onModelRouterPrefsChange}
      />

      <ThinkingTimingSection
        prefs={thinkingTimingPrefs}
        statsStore={thinkingStatsStore}
        currentModel={config.model}
        workingDir={config.workingDir}
        onChange={onThinkingTimingPrefsChange}
        onClearModelStats={onClearThinkingStatsForModel}
        onClearAllStats={onClearAllThinkingStats}
        onCsvMessage={onTimingStatsMessage}
      />

      <ResourceOverlaySection
        prefs={resourceOverlayPrefs}
        onChange={onResourceOverlayPrefsChange}
      />

      <SessionPersistenceSection config={config} onChange={onChange} />

      <AppVersionSection versions={appVersions} />

      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="subtitle2" color="text.secondary" gutterBottom>
          API flow
        </Typography>
        <Typography
          component="pre"
          variant="body2"
          sx={{
            m: 0,
            fontFamily: 'monospace',
            color: 'success.light',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
          }}
        >
          {apiPreview}
        </Typography>
      </Paper>

      <Stack direction="row" spacing={1}>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={onSave}>
          Save
        </Button>
        <Button variant="outlined" startIcon={<RestartAltIcon />} onClick={onReset}>
          Reset defaults
        </Button>
      </Stack>
    </Stack>
  )
}
