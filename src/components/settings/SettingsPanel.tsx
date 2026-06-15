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
import type { AppearanceConfig } from '../../theme/appearance'
import { AppearanceSection } from './AppearanceSection'
import { ThinkingTimingSection } from './ThinkingTimingSection'
import { ResourceOverlaySection } from './ResourceOverlaySection'
import type { ResourceOverlayPrefs } from '../../theme/resourceOverlayPrefs'
import type { NtfyAlertsPrefs } from '../../theme/ntfyAlertsPrefs'
import { LocalLlmActionButtons } from '../local-llm/LocalLlmActionButtons'
import { LocalLlmPanel } from '../local-llm/LocalLlmPanel'
import { useLocalLlmControls } from '../../hooks/useLocalLlmControls'
import { useVisionApiControls } from '../../hooks/useVisionApiControls'
import { VisionApiActionButtons } from './VisionApiActionButtons'
import type { ThinkingTimingPrefs } from '../../theme/thinkingTimingPrefs'
import type { SuggestedFilesPrefs } from '../../theme/suggestedFilesPrefs'
import { SuggestedFilesSection } from './SuggestedFilesSection'
import type { EditorLanguagePrefs } from '../../theme/editorLanguagePrefs'
import { EditorLanguagesSection } from './EditorLanguagesSection'
import { ModelRouterSection } from './ModelRouterSection'
import { applyLocalLlmHopperFromEnv, type ModelRouterPrefs } from '../../theme/modelRouterPrefs'
import type { ThinkingStatsStore } from '../../utils/thinkingStats'
import { AppVersionSection } from './AppVersionSection'
import { SessionPersistenceSection } from './SessionPersistenceSection'
import { NtfyAlertsSection } from './NtfyAlertsSection'
import { MobileRemoteSection } from './MobileRemoteSection'
import { AgentsSection } from './AgentsSection'
import { AgentGuardSection } from './AgentGuardSection'
import type { AgentGuardPrefs } from '../../theme/agentGuardPrefs'
import type { AppVersions } from '../../hooks/useAppVersions'
import type { GithubReleaseInfo } from '../../utils/appUpdateCheck'
import type { SubAgentInfo } from '../../ipc/agentCommands'
import { SpecGenerationSection } from './SpecGenerationSection'
import type { SpecGenTimeoutPrefs } from '../../theme/specGenTimeoutPrefs'
import {
  SessionModeToggle,
  type SessionMode,
} from '../session/SessionModeToggle'
import type { CecliWorkspaceInfo } from '../../ipc/httpClient'
import { CecliWorkspaceSection } from './CecliWorkspaceSection'

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
  onTimingStatsMessage?: (message: string, severity: 'info' | 'warning' | 'error') => void
  resourceOverlayPrefs: ResourceOverlayPrefs
  onResourceOverlayPrefsChange: (prefs: ResourceOverlayPrefs) => void
  ntfyAlertsPrefs: NtfyAlertsPrefs
  onNtfyAlertsPrefsChange: (prefs: NtfyAlertsPrefs) => void
  suggestedFilesPrefs: SuggestedFilesPrefs
  onSuggestedFilesPrefsChange: (prefs: SuggestedFilesPrefs) => void
  editorLanguagePrefs: EditorLanguagePrefs
  onEditorLanguagePrefsChange: (prefs: EditorLanguagePrefs) => void
  modelRouterPrefs: ModelRouterPrefs
  onModelRouterPrefsChange: (prefs: ModelRouterPrefs) => void
  agentGuardPrefs: AgentGuardPrefs
  onAgentGuardPrefsChange: (prefs: AgentGuardPrefs) => void
  specGenTimeoutPrefs: SpecGenTimeoutPrefs
  onSpecGenTimeoutPrefsChange: (prefs: SpecGenTimeoutPrefs) => void
  sessionModel: string
  onSessionModeChange: (mode: SessionMode) => void
  liveSessionMode?: SessionMode | null
  onSave: () => void
  onReset: () => void
  appVersions: AppVersions
  updateRelease?: GithubReleaseInfo | null
  subagents: SubAgentInfo[]
  agentModeAvailable: boolean
  sessionActive: boolean
  sessionId?: string | null
  onExportSessionDebug?: () => void | Promise<void>
  cecliWorkspace?: CecliWorkspaceInfo
  cecliWorkspaceLoading?: boolean
  cecliWorkspaceError?: string | null
  onCecliWorkspaceRefresh?: () => void | Promise<void>
  onOpenWorkspaceFileInEditor?: (relativePath: string) => void
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
  ntfyAlertsPrefs,
  onNtfyAlertsPrefsChange,
  suggestedFilesPrefs,
  onSuggestedFilesPrefsChange,
  editorLanguagePrefs,
  onEditorLanguagePrefsChange,
  modelRouterPrefs,
  onModelRouterPrefsChange,
  agentGuardPrefs,
  onAgentGuardPrefsChange,
  specGenTimeoutPrefs,
  onSpecGenTimeoutPrefsChange,
  sessionModel,
  onSessionModeChange,
  liveSessionMode = null,
  onSave,
  onReset,
  appVersions,
  updateRelease = null,
  subagents,
  agentModeAvailable,
  sessionActive,
  sessionId,
  onExportSessionDebug,
  cecliWorkspace,
  cecliWorkspaceLoading,
  cecliWorkspaceError,
  onCecliWorkspaceRefresh,
  onOpenWorkspaceFileInEditor,
}: SettingsPanelProps) {
  const [bundledEnginePath, setBundledEnginePath] = useState<string>('')
  const [localLlmSnap, setLocalLlmSnap] = useState<LocalLlmSnapshot | null>(null)
  const [ollamaTagsSnap, setOllamaTagsSnap] = useState<OllamaModelsSnapshot | null>(null)
  const localLlmControls = useLocalLlmControls(config)
  const visionApiControls = useVisionApiControls(config, {
    sessionActive,
    onApiUrl: (url) => onChange({ ...config, coreApiUrl: url }),
  })

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
        Open or switch the active <strong>project</strong> from the header folder control (not here).
        Cecli + Vision API are bundled with the app — no per-repo engine install.
      </Typography>

      {cecliWorkspace != null && onCecliWorkspaceRefresh && (
        <CecliWorkspaceSection
          workingDir={config.workingDir}
          info={cecliWorkspace}
          loading={cecliWorkspaceLoading ?? false}
          error={cecliWorkspaceError ?? null}
          onRefresh={onCecliWorkspaceRefresh}
          onOpenInEditor={onOpenWorkspaceFileInEditor}
          onMessage={onTimingStatsMessage}
        />
      )}

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
                    const nextCfg = applyLocalLlmToConfig(config, localLlmSnap, false)
                    onChange(nextCfg)
                    onModelRouterPrefsChange(
                      applyLocalLlmHopperFromEnv(
                        modelRouterPrefs,
                        localLlmSnap,
                        nextCfg.model,
                        false
                      )
                    )
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
                <strong>Terminal → Local LLM</strong>.
              </Typography>
              {isOllamaVisionModel(config.model) ? (
                <LocalLlmActionButtons
                  controls={localLlmControls}
                  showSecondary={false}
                  showPull={localLlmControls.capabilities.supportsModelPull}
                />
              ) : (
                <Typography variant="caption" color="warning.main" display="block">
                  Set <strong>LLM model</strong> to <code>ollama_chat/&lt;tag&gt;</code> or click{' '}
                  <strong>Sync from env files</strong> to enable Start and Ping.
                </Typography>
              )}
              {isTauriRuntime() && (
                <>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 2, mb: 1 }}>
                    <strong>Step 3 — Start {DISPLAY_VISION_API}:</strong> spawns{' '}
                    <code>bright-vision-core-serve</code> on :8741 (tasks API, health, chat when you
                    open a session). Use <strong>Terminal → Start</strong> for a full coding session
                    (Ollama if enabled + API + Cecli workspace).
                  </Typography>
                  <VisionApiActionButtons
                    controls={visionApiControls}
                    sessionActive={sessionActive}
                  />
                </>
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
            helperText="LiteLLM defaults for every model (desktop → LITELLM_EXTRA_PARAMS). With the model router on, set per-hopper params in the hopper editor; omit think here."
          />
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            The git project you edit is chosen when {DISPLAY_VISION} opens (or via the project name in
            the header), not here. Model, API, and session options below apply to whichever project is
            open.
          </Typography>
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
          <Box>
            <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
              Session mode (primary control on the Spec tab)
            </Typography>
            <SessionModeToggle
              value={config.sessionMode}
              onChange={onSessionModeChange}
              liveMode={liveSessionMode}
              sessionRunning={sessionActive}
              size="medium"
            />
            <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.75 }}>
              ● active in this session · * pending (Stop and Start) · ○ applies on next Start
            </Typography>
          </Box>
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

      <AgentGuardSection
        prefs={agentGuardPrefs}
        brightDateMode={thinkingTimingPrefs.brightDateMode}
        onChange={onAgentGuardPrefsChange}
      />

      <SpecGenerationSection
        prefs={specGenTimeoutPrefs}
        onChange={onSpecGenTimeoutPrefsChange}
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
        modelRouterEnv={localLlmSnap?.modelRouter}
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

      <MobileRemoteSection
        config={config}
        onChange={onChange}
        visionApiRunning={visionApiControls.apiReachable === true}
        onMessage={onTimingStatsMessage}
      />

      <NtfyAlertsSection
        prefs={ntfyAlertsPrefs}
        onChange={onNtfyAlertsPrefsChange}
        onMessage={onTimingStatsMessage}
      />

      <SessionPersistenceSection
        config={config}
        onChange={onChange}
        sessionId={sessionId}
        onExportSessionDebug={onExportSessionDebug}
      />

      <AppVersionSection versions={appVersions} updateRelease={updateRelease} />

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
