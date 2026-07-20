import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Button,
  FlatList,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import {
  fmtDuration,
  formatSubstepProgressLabel,
  parseLabLanPairingQr,
  substepDisplayLines,
  substepProgressFraction,
  type LabLanPairingPayload,
  type RunStepState,
} from '@brightvision/test-suite-client'
import {
  clearPairing,
  loadSavedPairing,
  savePairing,
  useLabRunProgress,
} from './useLabRunProgress'
import { PairingQrScanButton } from './PairingQrScanButton'

function stepStatusIcon(status: RunStepState['status']): string {
  switch (status) {
    case 'ok':
      return '✓'
    case 'fail':
      return '✗'
    case 'running':
      return '▶'
    case 'skipped':
      return '–'
    default:
      return '○'
  }
}

function StepRow({ step, active }: { step: RunStepState; active: boolean }) {
  return (
    <View style={[styles.stepRow, active && styles.stepRowActive]}>
      <Text style={[styles.stepIcon, step.status === 'fail' && styles.stepFail]}>
        {stepStatusIcon(step.status)}
      </Text>
      <View style={styles.stepBody}>
        <Text style={styles.stepLabel} numberOfLines={2}>
          {step.label}
        </Text>
        <Text style={styles.stepId}>{step.id}</Text>
        {step.seconds != null ? (
          <Text style={styles.stepMeta}>{fmtDuration(step.seconds)}</Text>
        ) : null}
      </View>
    </View>
  )
}

export default function App() {
  const [pairing, setPairing] = useState<LabLanPairingPayload | null>(null)
  const [qrPaste, setQrPaste] = useState('')
  const [baseUrl, setBaseUrl] = useState('http://192.168.1.1:8744')
  const [token, setToken] = useState('')
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [tab, setTab] = useState<'connect' | 'progress'>('connect')
  const [connectError, setConnectError] = useState<string | null>(null)

  const { snapshot, plan, connected, runId, error, refreshing, refresh } = useLabRunProgress(
    pairing,
    { autoRefreshOnFocus: true }
  )

  useEffect(() => {
    void loadSavedPairing().then((saved) => {
      if (saved) {
        setPairing(saved)
        setBaseUrl(saved.lanUrl)
        setToken(saved.token)
        setTab('progress')
      }
      setLoadingSaved(false)
    })
  }, [])

  const applyPairing = useCallback(async (payload: LabLanPairingPayload) => {
    await savePairing(payload)
    setPairing(payload)
    setBaseUrl(payload.lanUrl)
    setToken(payload.token)
    setQrPaste('')
    setTab('progress')
  }, [])

  const onPasteQr = useCallback(() => {
    const parsed = parseLabLanPairingQr(qrPaste)
    if (!parsed) {
      setConnectError('Invalid pairing JSON')
      return
    }
    setConnectError(null)
    void applyPairing(parsed)
  }, [qrPaste, applyPairing])

  const onQrScan = useCallback(
    (raw: string) => {
      const parsed = parseLabLanPairingQr(raw)
      if (!parsed) {
        setConnectError('QR is not a valid Test Lab pairing code')
        return
      }
      setConnectError(null)
      void applyPairing(parsed)
    },
    [applyPairing]
  )

  const onManualConnect = useCallback(() => {
    const payload = parseLabLanPairingQr(
      JSON.stringify({
        v: 1,
        kind: 'test-lab',
        lanUrl: baseUrl.trim(),
        token: token.trim(),
        deviceName: 'Manual',
      })
    )
    if (payload) void applyPairing(payload)
  }, [baseUrl, token, applyPairing])

  const onDisconnect = useCallback(() => {
    void clearPairing()
    setPairing(null)
    setTab('connect')
  }, [])

  const substep = snapshot?.substep ?? null
  const substepUi = substepDisplayLines(substep, false)
  const substepFrac = substepProgressFraction(substep)
  const progressLabel = formatSubstepProgressLabel(substep)
  const currentId = snapshot?.currentStepId
  const running = snapshot?.running ?? false

  if (loadingSaved) {
    return (
      <SafeAreaView style={styles.root}>
        <ActivityIndicator style={{ marginTop: 48 }} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>Lab Remote</Text>
        <Text style={styles.sub}>Test suite step & sub-step progress</Text>
        <View style={styles.tabs}>
          <Button title="Connect" onPress={() => setTab('connect')} />
          <Button
            title="Progress"
            onPress={() => {
              setTab('progress')
              if (pairing) void refresh()
            }}
          />
        </View>
      </View>

      {tab === 'connect' ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <PairingQrScanButton onScan={onQrScan} onError={setConnectError} />
          {connectError ? <Text style={styles.errorText}>{connectError}</Text> : null}
          <Text style={styles.label}>Orchestrator URL (LAN proxy)</Text>
          <TextInput
            style={styles.input}
            value={baseUrl}
            onChangeText={setBaseUrl}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="http://192.168.x.x:8744"
          />
          <Text style={styles.label}>Bearer token</Text>
          <TextInput
            style={styles.input}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            secureTextEntry
            placeholder="from Test Lab QR"
          />
          <Text style={styles.label}>Paste QR / pairing JSON</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={qrPaste}
            onChangeText={setQrPaste}
            multiline
            placeholder='{"v":1,"kind":"test-lab",...}'
          />
          <View style={styles.row}>
            <Button title="Apply QR" onPress={onPasteQr} />
            <Button title="Connect" onPress={onManualConnect} />
          </View>
          {pairing ? (
            <Button title="Disconnect" color="#f85149" onPress={onDisconnect} />
          ) : null}
          <Text style={styles.hint}>
            In Test Lab: expand <Text style={styles.mono}>Lab Remote</Text>, enable LAN proxy, then
            tap <Text style={styles.mono}>Scan Test Lab QR</Text> above. Phone and laptop must be on
            the same Wi‑Fi.
          </Text>
        </ScrollView>
      ) : (
        <View style={styles.progressPane}>
          <View style={styles.statusBar}>
            <View style={styles.statusRow}>
              <Text style={styles.statusText}>
                {connected ? '● Connected' : '○ Offline'}
                {runId ? ` · run ${runId.slice(0, 8)}…` : ''}
              </Text>
              <Button
                title={refreshing ? '…' : 'Refresh'}
                onPress={() => void refresh()}
                disabled={refreshing || !pairing}
              />
            </View>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {!running && snapshot?.runOk != null ? (
              <Text style={snapshot.runOk ? styles.okText : styles.failText}>
                {snapshot.runOk ? 'Suite passed' : 'Suite failed'}
              </Text>
            ) : running ? (
              <Text style={styles.runningText}>
                Step {snapshot?.progress.index ?? 0}/{snapshot?.progress.total ?? plan.length} ·{' '}
                {fmtDuration(snapshot?.progress.elapsed ?? 0)} elapsed
              </Text>
            ) : connected && !runId ? (
              <Text style={styles.hint}>Waiting for a suite run on Test Lab…</Text>
            ) : null}
          </View>

          {substepUi ? (
            <View style={styles.substepCard}>
              <Text style={styles.substepTitle}>Sub-step</Text>
              {progressLabel ? (
                <Text style={styles.substepProgress}>{progressLabel}</Text>
              ) : null}
              {substepFrac != null ? (
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${Math.round(substepFrac * 100)}%` }]} />
                </View>
              ) : null}
              {substepUi.running ? (
                <Text style={styles.substepLine}>
                  ▶ {substepUi.running.label}
                  {' · '}
                  {substepUi.running.elapsed}
                </Text>
              ) : null}
              {substepUi.lastDone ? (
                <Text style={styles.substepMuted}>
                  ✓ {substepUi.lastDone.label} @ {substepUi.lastDone.endedAt}
                </Text>
              ) : null}
            </View>
          ) : null}

          <FlatList
            data={snapshot?.steps ?? plan.map((p) => ({ ...p, status: 'pending' as const }))}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.stepList}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                tintColor="#7ee787"
              />
            }
            renderItem={({ item }) => (
              <StepRow step={item} active={item.id === currentId || item.status === 'running'} />
            )}
          />
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0d1117' },
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#e6edf3' },
  sub: { fontSize: 13, color: '#8b949e', marginBottom: 8 },
  tabs: { flexDirection: 'row', gap: 8, justifyContent: 'flex-start' },
  scroll: { padding: 16, gap: 8 },
  label: { fontSize: 12, color: '#8b949e', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 10,
    color: '#e6edf3',
    backgroundColor: '#161b22',
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12, marginTop: 12, justifyContent: 'space-between' },
  hint: { marginTop: 16, fontSize: 13, color: '#8b949e', lineHeight: 20 },
  mono: { fontFamily: 'monospace', color: '#c9d1d9' },
  progressPane: { flex: 1, paddingHorizontal: 12 },
  statusBar: { paddingVertical: 8, gap: 4 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statusText: { color: '#7ee787', fontSize: 13, fontFamily: 'monospace', flex: 1 },
  errorText: { color: '#f85149', fontSize: 13 },
  okText: { color: '#7ee787', fontSize: 15, fontWeight: '600' },
  failText: { color: '#f85149', fontSize: 15, fontWeight: '600' },
  runningText: { color: '#e6edf3', fontSize: 14 },
  substepCard: {
    backgroundColor: '#161b22',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
    padding: 12,
    marginBottom: 8,
  },
  substepTitle: { color: '#8b949e', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 },
  substepProgress: { color: '#e6edf3', fontSize: 16, fontWeight: '600' },
  substepLine: { color: '#e6edf3', fontSize: 14, marginTop: 6 },
  substepMuted: { color: '#8b949e', fontSize: 12, marginTop: 4 },
  barTrack: {
    height: 4,
    backgroundColor: '#21262d',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: { height: 4, backgroundColor: '#238636' },
  stepList: { paddingBottom: 24 },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#21262d',
    gap: 10,
  },
  stepRowActive: { backgroundColor: '#161b22' },
  stepIcon: { color: '#8b949e', fontSize: 16, width: 20, marginTop: 2 },
  stepFail: { color: '#f85149' },
  stepBody: { flex: 1 },
  stepLabel: { color: '#e6edf3', fontSize: 14, fontWeight: '500' },
  stepId: { color: '#6e7681', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  stepMeta: { color: '#8b949e', fontSize: 12, marginTop: 2 },
})
