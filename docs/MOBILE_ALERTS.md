# Mobile alerts (ntfy)

Get **Android** (and **Wear OS**) notifications when a long BrightVision chat turn finishes — without building a Wear app or Android companion.

## How it works

```text
BrightVision (Mac, Tauri)  →  POST ntfy topic  →  ntfy app (phone)  →  Wear OS mirror
```

1. **Settings → Mobile alerts (ntfy)** — enable, scan the **QR code** (or copy subscribe URL), optional self-hosted server.
2. On your phone: install [ntfy](https://ntfy.sh/) (Play Store or F-Droid). Scan the QR in Settings — it encodes an `ntfy://…` deep link that opens the app and subscribes to your **private topic** (treat it like a password).
3. When a turn or spec job completes (and meets your duration / background filters), BrightVision sends a short push.

## Privacy

Notifications are **metadata only**:

- Turn duration or spec job duration
- Spec layer (requirements / design / tasks / refine) and task title (no prompt text)
- Queue count (if any) on chat turns
- File edit count (number only) on chat turns

They **never** include prompt text, file paths, or code diffs.

## Settings

| Option | Default | Meaning |
|--------|---------|---------|
| **Notify when work completes** | off | Master switch (chat turns + spec jobs) |
| **ntfy server** | `https://ntfy.sh` | Public tier or your self-hosted base URL |
| **Private topic** | auto `bv_…` | Regenerate if leaked; re-subscribe on phone |
| **Minimum turn duration** | 60s | Skip quick replies |
| **Only when in background** | on | No ping while the window is focused |

Use **Send test notification** after subscribing on your phone.

## Self-hosted ntfy

Point **ntfy server** at your instance (e.g. `https://ntfy.example.com`). Subscribe URL becomes `{server}/{topic}`.

See [ntfy documentation](https://docs.ntfy.sh/) for Docker and TLS setup.

## Troubleshooting

| Issue | Check |
|-------|--------|
| No phone alert | ntfy app subscribed to exact topic; **Test notification** from Settings |
| Never fires | Turn/job shorter than minimum duration; window still focused (background-only on) |
| Wear OS silent | Phone received notification? Wear mirrors Android alerts when paired |

Desktop app only — web dev mode shows Settings copy but cannot send pushes.
