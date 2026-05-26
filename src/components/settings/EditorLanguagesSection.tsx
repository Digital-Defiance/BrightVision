import {
  FormControlLabel,
  Paper,
  Stack,
  Switch,
  Typography,
} from '@mui/material'
import {
  BUILTIN_EDITOR_LANGUAGE_SUMMARY,
  OPTIONAL_EDITOR_LANGUAGE_PLUGINS,
} from '../../editor/languageRegistry'
import {
  toggleOptionalPlugin,
  type EditorLanguagePrefs,
} from '../../theme/editorLanguagePrefs'
import type { OptionalEditorLanguagePluginId } from '../../editor/languageRegistry'

interface EditorLanguagesSectionProps {
  prefs: EditorLanguagePrefs
  onChange: (prefs: EditorLanguagePrefs) => void
}

export function EditorLanguagesSection({ prefs, onChange }: EditorLanguagesSectionProps) {
  const enabled = new Set(prefs.enabledOptionalPluginIds)

  return (
    <Paper variant="outlined" sx={{ p: 2 }} data-testid="editor-languages-settings">
      <Typography variant="subtitle2" gutterBottom>
        Editor languages
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Built-in syntax (always on): {BUILTIN_EDITOR_LANGUAGE_SUMMARY}. Optional packs load only
        when enabled — allowlisted CodeMirror packages bundled with the app, never downloaded at
        runtime.
      </Typography>
      <Stack spacing={0.75}>
        {OPTIONAL_EDITOR_LANGUAGE_PLUGINS.map((plugin) => (
          <FormControlLabel
            key={plugin.id}
            sx={{ alignItems: 'flex-start', ml: 0 }}
            control={
              <Switch
                checked={enabled.has(plugin.id)}
                onChange={(_, checked) =>
                  onChange(
                    toggleOptionalPlugin(
                      prefs,
                      plugin.id as OptionalEditorLanguagePluginId,
                      checked
                    )
                  )
                }
                data-testid={`editor-lang-plugin-${plugin.id}`}
              />
            }
            label={
              <Stack spacing={0.25}>
                <Typography variant="body2">{plugin.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {plugin.description} · .{plugin.extensions.join(', .')} · {plugin.packageName} (
                  {plugin.license})
                </Typography>
              </Stack>
            }
          />
        ))}
      </Stack>
    </Paper>
  )
}
