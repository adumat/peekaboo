# Peekaboo

A tiny self-hosted **baby monitor** for cameras you already stream through
[go2rtc](https://github.com/AlexxIT/go2rtc). Listen to the room with your phone
screen **off**, glance at the video when you open the app, and pick **any
combination** of cameras to hear at once — mixed on demand.

It's a small SvelteKit app: audio is transcoded on the server with ffmpeg and
played through a plain `<audio>` element (so it keeps going with the screen
locked, with lockscreen controls via the MediaSession API); video is embedded
straight from go2rtc's own WebRTC page.

## Features

- 🔊 **Screen-off audio** with lockscreen play/pause (MediaSession).
- 🎛️ **Mix on demand** — listen to any subset of your cameras; the ffmpeg mix
  is spawned on the first listener and stopped shortly after the last one leaves.
- 📹 **Video on foreground** — live WebRTC tiles for whatever you're listening to.
- ⏱️ **Low latency** — playback is continuously nudged back to the live edge, so
  it doesn't drift behind over the night.
- 📱 **Installable PWA** — add to home screen, works fullscreen with safe-area
  insets on iOS.

## How it works

```
cameras ──RTSP──▶ go2rtc ──┬── RTSP ──▶ peekaboo (ffmpeg → MP3) ──▶ <audio>   (sound)
                           └── WebRTC ─────────────────────────────▶ <iframe> (video)
```

Peekaboo never talks to the cameras directly — go2rtc does. Peekaboo only needs
to reach go2rtc's RTSP port (for audio) and the browser needs to reach go2rtc's
web UI (for video).

> **Note on Tapo / 8 kHz cameras:** many cameras emit 8 kHz audio (MPEG-2.5) that
> browsers silently refuse to decode. Peekaboo always resamples to 44.1 kHz, so
> this just works.

## Configuration

Mount a `config.yaml` at `/config/config.yaml` (or set `PEEKABOO_CONFIG`):

```yaml
go2rtc:
  url: "http://go2rtc.example.lan:1984" # go2rtc web UI, reachable from the browser
  rtsp: "go2rtc:8554"                   # go2rtc RTSP, reachable from peekaboo
idleTimeout: 15                          # seconds to keep ffmpeg alive after the last listener
cameras:
  - name: living-room                    # go2rtc stream id
    label: "Living room"                 # shown in the UI
  - name: bedroom
    label: "Bedroom"
```

A few knobs also read from the environment: `GO2RTC_URL`, `GO2RTC_RTSP`,
`PEEKABOO_IDLE_TIMEOUT`, `PEEKABOO_CONFIG`. Cameras must come from the config file.

See [`config.example.yaml`](config.example.yaml) and
[`examples/go2rtc.yaml`](examples/go2rtc.yaml) for a matching pair.

## Running

### Docker

```bash
docker run -d --name peekaboo -p 3000:3000 \
  -v "$PWD/config.yaml:/config/config.yaml:ro" \
  ghcr.io/adumat/peekaboo:latest
```

### docker compose

See [`docker-compose.yaml`](docker-compose.yaml), then `docker compose up -d`.

### Kubernetes (Helm)

```bash
helm install peekaboo ./charts/peekaboo \
  --set config.go2rtc.rtsp=go2rtc.default.svc.cluster.local:8554 \
  --set config.go2rtc.url=https://go2rtc.example.lan
```

Configure cameras, ingress and resources in
[`charts/peekaboo/values.yaml`](charts/peekaboo/values.yaml). There is no
built-in authentication — put it behind your own ingress / auth.

## Development

```bash
corepack enable        # uses yarn 4 (pinned via packageManager)
yarn install
yarn dev               # needs a reachable go2rtc + ffmpeg on PATH
yarn check             # type-check
yarn build             # production build (adapter-node)
```

## Prior art

[`kvmonitor`](https://github.com/krasi-georgiev/kvmonitor) solves the same
screen-off audio problem and was a useful reference. Peekaboo differs in being
go2rtc-native, config-driven, and adding on-demand multi-camera mixing, video,
and a PWA.

## License

[MIT](LICENSE)
