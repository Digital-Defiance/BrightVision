import { CameraView, useCameraPermissions } from 'expo-camera'
import { useCallback, useState } from 'react'
import { Button, StyleSheet, Text, View } from 'react-native'

type Props = {
  onScan: (raw: string) => void
  onError: (message: string) => void
}

export function PairingQrScanButton({ onScan, onError }: Props) {
  const [permission, requestPermission] = useCameraPermissions()
  const [busy, setBusy] = useState(false)

  const scan = useCallback(async () => {
    if (busy) return
    setBusy(true)
    let sub: { remove: () => void } | null = null
    try {
      if (!permission?.granted) {
        const next = await requestPermission()
        if (!next.granted) {
          onError('Camera permission is required to scan the Test Lab QR code.')
          return
        }
      }

      if (!CameraView.isModernBarcodeScannerAvailable) {
        onError('System QR scanner is unavailable on this device. Paste the pairing JSON instead.')
        return
      }

      sub = CameraView.onModernBarcodeScanned(({ data }) => {
        sub?.remove()
        sub = null
        setBusy(false)
        void CameraView.dismissScanner().catch(() => {})
        onScan(data)
      })

      await CameraView.launchScanner({ barcodeTypes: ['qr'] })
      // Scanner closed without a scan (e.g. user cancelled on iOS).
      sub?.remove()
      sub = null
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }, [busy, onError, onScan, permission?.granted, requestPermission])

  return (
    <View style={styles.wrap}>
      <Button
        title={busy ? 'Opening scanner…' : 'Scan Test Lab QR'}
        onPress={() => void scan()}
        disabled={busy}
      />
      <Text style={styles.hint}>Point at the QR in Test Lab → Lab Remote settings.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginVertical: 8 },
  hint: { fontSize: 12, color: '#8b949e' },
})
