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
- **v0.4.0** — tap a tile for fullscreen/solo, a "new version available" update
  prompt, a Playwright e2e smoke in CI, and a multi-arch image (amd64 + arm64).
- **v0.5.0** — dedicated `/healthz` liveness/readiness endpoint.

## Next — UX polish

- [ ] Make the target latency configurable (currently a fixed ~1.5–2s).

## Next — audio

- [ ] Configurable audio bitrate.

> Auth is intentionally out of scope: Peekaboo ships no built-in auth — put it
> behind your own ingress / reverse-proxy / OIDC (e.g. Authentik via the gateway).
