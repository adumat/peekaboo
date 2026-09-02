# Changelog

## [0.7.2](https://github.com/adumat/peekaboo/compare/v0.7.1...v0.7.2) (2026-09-02)


### Bug Fixes

* **video:** allow autoplay on the go2rtc iframe so iOS starts the video ([744a071](https://github.com/adumat/peekaboo/commit/744a0711277964fe5afd3b2dc7d48204ac9b457c))

## [0.7.1](https://github.com/adumat/peekaboo/compare/v0.7.0...v0.7.1) (2026-08-26)


### Bug Fixes

* **audio:** mix multiple cameras into one output so mobile plays them all ([ba831e1](https://github.com/adumat/peekaboo/commit/ba831e1849b3cb0262079b5601471f09d57b4a23))

## [0.7.0](https://github.com/adumat/peekaboo/compare/v0.6.0...v0.7.0) (2026-08-25)


### Features

* **audio:** realtime WebRTC audio backend with a WebRTC/MP3 toggle ([681d2bc](https://github.com/adumat/peekaboo/commit/681d2bcf5eaa530bd80206a89c0e17fbaa7eb520))

## [0.6.0](https://github.com/adumat/peekaboo/compare/v0.5.3...v0.6.0) (2026-07-30)


### Features

* **server:** per-camera gain in the audio mix with PEEKABOO_MAX_GAIN ([e7ee179](https://github.com/adumat/peekaboo/commit/e7ee179333733238ca5f39bb9f6b3e1849102cc2))
* **streams:** apply per-camera volume in the ffmpeg mix ([057caa2](https://github.com/adumat/peekaboo/commit/057caa27d55593250d3f8c34dcad64ba21bcb931))
* **streams:** gain-aware camera spec key (normalizeSpecs, specKey) ([50a4280](https://github.com/adumat/peekaboo/commit/50a428067aab4fdbefe3e71a27993abfb0f71da7))
* **ui:** per-camera volume with pop-out slider and &gt;100% boost ([ccd6fdf](https://github.com/adumat/peekaboo/commit/ccd6fdfe0175bcc31d2b84ce6fed3559e60f1da2))

## [0.5.3](https://github.com/adumat/peekaboo/compare/v0.5.2...v0.5.3) (2026-07-28)


### Bug Fixes

* **docker:** build multi-arch without emulating the JS build under QEMU ([2f41da5](https://github.com/adumat/peekaboo/commit/2f41da550f8ac6473f221e078d093a321198d3e5))

## [0.5.2](https://github.com/adumat/peekaboo/compare/v0.5.1...v0.5.2) (2026-07-28)


### Bug Fixes

* cut audio latency ~5s -&gt; ~1.5s ([c033741](https://github.com/adumat/peekaboo/commit/c0337415096d9fffb72180acf67776b11e2b6c6b))

## [0.5.1](https://github.com/adumat/peekaboo/compare/v0.5.0...v0.5.1) (2026-07-28)


### Bug Fixes

* make the PWA work behind OIDC (Authentik) auth ([b9bb9c0](https://github.com/adumat/peekaboo/commit/b9bb9c09dffe7d7184cf8a6392d9dd795cf3229b))

## [0.5.0](https://github.com/adumat/peekaboo/compare/v0.4.0...v0.5.0) (2026-07-28)


### Features

* dedicated /healthz endpoint for liveness/readiness probes ([edc1687](https://github.com/adumat/peekaboo/commit/edc1687e9163de0eaa8faf7b74dfc78f5cd740fd))

## [0.4.0](https://github.com/adumat/peekaboo/compare/v0.3.0...v0.4.0) (2026-07-28)


### Features

* tap-to-fullscreen, PWA update prompt, e2e tests, multi-arch image ([1bc9cef](https://github.com/adumat/peekaboo/commit/1bc9cef093cf94ec68d2a02bafe76c60118725ed))

## [0.3.0](https://github.com/adumat/peekaboo/compare/v0.2.2...v0.3.0) (2026-07-27)


### Features

* proper app icon (peeking eyes over a blanket) ([4e74b90](https://github.com/adumat/peekaboo/commit/4e74b9065ef0452d57e0f1e0dc8d93a1ab0d9867))

## [0.2.2](https://github.com/adumat/peekaboo/compare/v0.2.1...v0.2.2) (2026-07-27)


### Bug Fixes

* show all selected tiles at once and lock audio to live on start ([e4a943a](https://github.com/adumat/peekaboo/commit/e4a943ac35e33e92a7a960897a460ac2878b424c))

## [0.2.1](https://github.com/adumat/peekaboo/compare/v0.2.0...v0.2.1) (2026-07-27)


### Bug Fixes

* replace seek-to-live with gentle playbackRate catch-up ([252bfa2](https://github.com/adumat/peekaboo/commit/252bfa2fe237e3769eaccf89a39794ff7e5e6e7e))

## [0.2.0](https://github.com/adumat/peekaboo/compare/v0.1.1...v0.2.0) (2026-07-27)


### Features

* per-camera zoom/pan, layout toggle, persisted selection, redesigned UI ([65477ac](https://github.com/adumat/peekaboo/commit/65477ac646e00caad1ab513cc6b9693dd7d6d2e3))

## [0.1.1](https://github.com/adumat/peekaboo/compare/v0.1.0...v0.1.1) (2026-07-27)


### Bug Fixes

* publish versioned GHCR image tag and use plain git tags ([d44f41a](https://github.com/adumat/peekaboo/commit/d44f41a5d5748604bf2b97ed41daa2ccb05b352a))

## [0.1.0](https://github.com/adumat/peekaboo/compare/peekaboo-v0.0.1...peekaboo-v0.1.0) (2026-07-27)


### Features

* initial Peekaboo — self-hosted go2rtc baby monitor ([6988c6d](https://github.com/adumat/peekaboo/commit/6988c6dad5193c68e31db39098c206ea90b1d975))
