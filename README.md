# cribd

`cribd` turns one RTSP camera stream into browser-friendly WebRTC for a local, private baby monitor. [MediaMTX](https://github.com/bluenviron/mediamtx) handles the media path; optional hardware adapters can provide camera-specific events without putting vendor logic in the server.

> [!WARNING]
> This project is not a medical device or a substitute for safe-sleep practices, direct supervision, or any medically indicated monitor.

## Status

The current prototype runs on an Apple silicon Mac, serves one loopback-only stream, and uses MediaMTX's built-in viewer. Custom viewers, event adapters, remote access, persistence, and Raspberry Pi deployment come later.

## Run locally

Requires macOS 26 on Apple silicon, Apple's [`container`](https://github.com/apple/container) CLI 1.0 or later, and an RTSP camera.

```sh
cp .env.example .env
# Set CRIBD_RTSP_URL in .env.
./bin/cribd
```

Open `http://localhost:8889/crib`. Use H.264 video with Opus, G722, PCMA, or PCMU audio for WebRTC playback.

The launcher runs MediaMTX 1.20.0 and binds its WebRTC ports to loopback. Docker and Docker Compose are not required; `docker.io` is only the OCI image registry.

## Architecture

```text
camera -> RTSP -> cribd/MediaMTX -> WebRTC -> viewer
camera -> vendor event API -> optional adapter -> generic events -> cribd
```

The media path is required and independent of adapters. Adapter failures must never interrupt video or audio.

### Core

- Configure the camera as MediaMTX path `/crib`.
- Route RTSP media to WebRTC and reconnect after interruptions.
- Report camera, stream, and server health.
- Accept generic events when an adapter is configured.

### Optional hardware adapter

- Authenticate with the camera's event API.
- Subscribe and reconnect independently of the media path.
- Discover capabilities such as motion or crying.
- Translate vendor data into generic events.

The core does not know how Reolink or another vendor delivers events. Without an adapter, event features are unavailable.

## Constraints

- Local viewing must work without public internet access.
- Stream failures and frozen frames must become obvious within seconds.
- The stack must recover after camera, process, or power interruptions.
- Camera and adapter credentials remain on the home server.
- Nothing is exposed directly to the public internet.
- Remote access will use Tailscale identity and device authorization.

## Roadmap

1. Prove RTSP to MediaMTX to browser WebRTC on a Mac.
2. Add the viewer, health reporting, and explicit offline states.
3. Test a dedicated camera, night vision, audio, and restart recovery.
4. Move the stack to a Raspberry Pi and add automatic startup.
5. Add Tailscale, define the event interface, and build a Reolink adapter.

## License

Licensed under the [MIT License](LICENSE).
