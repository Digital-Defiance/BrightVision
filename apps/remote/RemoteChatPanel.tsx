import { useState } from 'react'
import {
  ActivityIndicator,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { CoreHttpClient } from '@brightvision/vision-client'
import { useRemoteSession } from './useRemoteSession'

interface RemoteChatPanelProps {
  client: CoreHttpClient
  defaultWorkspace: string
  defaultModel: string
}

export function RemoteChatPanel({
  client,
  defaultWorkspace,
  defaultModel,
}: RemoteChatPanelProps) {
  const [workspace, setWorkspace] = useState(defaultWorkspace)
  const [model, setModel] = useState(defaultModel)
  const [draft, setDraft] = useState('')
  const remote = useRemoteSession(client)

  return (
    <View style={styles.panel}>
      {!remote.session ? (
        <>
          <Text style={styles.label}>Project workspace (absolute path on laptop)</Text>
          <TextInput
            style={styles.input}
            value={workspace}
            onChangeText={setWorkspace}
            autoCapitalize="none"
            placeholder="/Users/you/project"
          />
          <Text style={styles.label}>Model</Text>
          <TextInput
            style={styles.input}
            value={model}
            onChangeText={setModel}
            autoCapitalize="none"
            placeholder="ollama_chat/…"
          />
          <Button
            title="Start session"
            disabled={remote.busy || !workspace.trim()}
            onPress={() => void remote.startSession(workspace, model)}
          />
        </>
      ) : (
        <>
          <Text style={styles.status}>{remote.status}</Text>
          <FlatList
            style={styles.list}
            data={remote.lines}
            keyExtractor={(item) => String(item.id)}
            renderItem={({ item }) => (
              <Text
                style={[
                  styles.line,
                  item.role === 'user' ? styles.user : item.role === 'assistant' ? styles.assistant : styles.system,
                ]}
              >
                {item.role === 'user' ? '› ' : item.role === 'assistant' ? '‹ ' : '• '}
                {item.text}
              </Text>
            )}
          />
          <TextInput
            style={[styles.input, styles.multiline]}
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="Message or /agent …"
            editable={!remote.busy}
          />
          <View style={styles.row}>
            <Button
              title="Send"
              disabled={remote.busy || !draft.trim()}
              onPress={() => {
                const t = draft
                setDraft('')
                void remote.sendUserMessage(t)
              }}
            />
            <Button title="Stop" disabled={!remote.busy} onPress={() => void remote.stopTurn()} />
            <Button title="End" onPress={() => void remote.endSession()} />
          </View>
        </>
      )}
      {remote.busy ? <ActivityIndicator style={{ marginTop: 8 }} /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  panel: { flex: 1, minHeight: 320 },
  label: { fontSize: 12, color: '#8b949e', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 10,
    color: '#e6edf3',
    backgroundColor: '#161b22',
  },
  multiline: { minHeight: 64, textAlignVertical: 'top', marginTop: 8 },
  status: { color: '#79c0ff', fontSize: 12, marginBottom: 8, fontFamily: 'monospace' },
  list: { flex: 1, marginVertical: 8 },
  line: { fontSize: 14, marginBottom: 8, color: '#e6edf3' },
  user: { color: '#a5d6ff' },
  assistant: { color: '#d2a8ff' },
  system: { color: '#8b949e', fontSize: 12 },
  row: { flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginTop: 8 },
})
