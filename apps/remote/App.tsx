import { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import {
  CoreHttpClient,
  parseLanPairingQr,
  type LanPairingPayload,
} from '@brightvision/vision-client'

/** R0 dogfood: manual URL + token, health check. R1: QR scan + mDNS list (native module later). */
export default function App() {
  const [baseUrl, setBaseUrl] = useState('http://192.168.1.1:8742')
  const [token, setToken] = useState('')
  const [qrPaste, setQrPaste] = useState('')
  const [health, setHealth] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const client = useMemo(
    () => new CoreHttpClient(baseUrl.replace(/\/$/, ''), token.trim() || undefined),
    [baseUrl, token]
  )

  const applyPairing = useCallback((payload: LanPairingPayload) => {
    setBaseUrl(payload.lanUrl)
    setToken(payload.token)
    setQrPaste('')
  }, [])

  const onPasteQr = useCallback(() => {
    const parsed = parseLanPairingQr(qrPaste)
    if (!parsed) {
      setHealth('Invalid pairing JSON')
      return
    }
    applyPairing(parsed)
  }, [qrPaste, applyPairing])

  const pingHealth = useCallback(async () => {
    setBusy(true)
    setHealth(null)
    try {
      const h = await client.health()
      setHealth(`OK — auth_required=${h.auth_required}`)
    } catch (e) {
      setHealth(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }, [client])

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar style="auto" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>BrightVision Remote</Text>
        <Text style={styles.sub}>
          R0: enter LAN URL from desktop Settings → BrightVision Remote (LAN Link), or paste QR
          JSON.
        </Text>
        <Text style={styles.label}>Vision API URL</Text>
        <TextInput
          style={styles.input}
          value={baseUrl}
          onChangeText={setBaseUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://192.168.x.x:8742"
        />
        <Text style={styles.label}>Bearer token</Text>
        <TextInput
          style={styles.input}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          secureTextEntry
          placeholder="from desktop QR"
        />
        <Text style={styles.label}>Paste QR / pairing JSON</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={qrPaste}
          onChangeText={setQrPaste}
          multiline
          placeholder='{"v":1,"lanUrl":"http://...","token":"...","deviceName":"..."}'
        />
        <View style={styles.row}>
          <Button title="Apply pairing" onPress={onPasteQr} />
          <Button title="Ping /health" onPress={() => void pingHealth()} disabled={busy} />
        </View>
        {busy ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
        {health ? <Text style={styles.health}>{health}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f1419' },
  scroll: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: '700', color: '#e6edf3', marginBottom: 4 },
  sub: { fontSize: 14, color: '#8b949e', marginBottom: 12 },
  label: { fontSize: 12, color: '#8b949e', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 8,
    padding: 10,
    color: '#e6edf3',
    backgroundColor: '#161b22',
  },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row', gap: 12, marginTop: 12, justifyContent: 'space-between' },
  health: { marginTop: 12, color: '#7ee787', fontFamily: 'monospace', fontSize: 13 },
})
