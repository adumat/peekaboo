# Roadmap

What's shipped and what's next. Not commitments — priorities can shift.

## Shipped

- **v0.1** — self-hosted go2rtc baby monitor: screen-off audio with MediaSession
  lockscreen controls, on-demand ffmpeg mixing of any camera combination,
  foreground WebRTC video, installable PWA, semver releases → GHCR.
- **v0.2.0** — per-camera zoom & pan (persisted), stacked/side layout toggle,
  remembered camera selection, redesigned UI (camera toggles + controls top bar,
  status bar with live delay and buffer/reconnect stats).
- **v0.2.1–0.2.2** — low-latency playback (jump to the live edge once, then gentle
  `playbackRate`), and a fix so every selected tile stays on-screen (an
  off-viewport iframe gets its video auto-paused → the second camera was black).
- **v0.3.0** — proper app icon (peeking eyes).

## Next — robustness & project quality

- [ ] End-to-end test in CI (Playwright): page loads, tiles play, audio starts and
      stays near live. Would have caught the v0.2.0 video regression.
- [ ] Multi-arch image (`linux/arm64`) for Pi/arm hosts.
- [ ] Auth story: document a reverse-proxy / OIDC setup (there is no built-in auth).

## Next — UX polish

- [ ] Tap a tile to solo / fullscreen it (and back).
- [ ] "New version available — tap to refresh" prompt when the service worker updates.
- [ ] Make the target latency configurable (currently a fixed ~1.5–2s).

## Next — audio & ops

- [ ] Configurable audio bitrate.
- [ ] Dedicated health/readiness endpoint (instead of probing `/`).
