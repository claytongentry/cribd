# cribd

`cribd` turns one camera stream into browser-friendly WebRTC for a local, private baby monitor. Camera adapters normalize media for [MediaMTX](https://github.com/bluenviron/mediamtx); future event adapters can add hardware-specific events without putting vendor logic in the server.

> [!WARNING]
> This project is not a medical device or a substitute for safe-sleep practices, direct supervision, or any medically indicated monitor.

## Status

The current prototype runs on an Apple silicon Mac and serves one stream through a status-aware WebRTC viewer. Direct and Reolink stream adapters are available. Viewing is loopback-only by default and can be enabled for devices on the same local network. Event adapters, remote access, persistence, and Raspberry Pi deployment come later.

## Run locally

Requires macOS 26 on Apple silicon, Apple's [`container`](https://github.com/apple/container) CLI 1.0 or later, and an RTSP camera.

```sh
cp .env.example .env
# Set the camera URL in .env.
./bin/cribd
```

`CRIBD_ADAPTER` defaults to `direct`. Use it when the camera already supplies H.264 video with browser-compatible audio such as Opus, G722, PCMA, or PCMU.

For a Reolink H.264 stream with AAC audio, use:

```sh
CRIBD_ADAPTER=reolink
CRIBD_RTSP_URL=rtsp://user:pass@camera/stream
```

The Reolink adapter copies video without decoding it and converts audio to 48 kHz Opus. H.265 streams are not supported.

Open `http://localhost:8889/crib`. The viewer reports when the camera is connecting, live, or offline, and reconnects after interruptions or frozen video.

To view from another device, use the Mac's LAN IPv4 address—not the camera's:

```sh
CRIBD_HOST=192.168.1.10 ./bin/cribd
```

Then open `http://192.168.1.10:8889/crib` from a device on the same network.

The launcher runs MediaMTX 1.20.0 and a BusyBox 1.37.0 static viewer, with both services bound to the selected address. Docker and Docker Compose are not required; `docker.io` is only the OCI image registry.

## Architecture

```text
camera -> stream adapter -> RTSP -> MediaMTX -> WebRTC -> viewer
camera -> vendor event API -> event adapter -> generic events -> cribd
```

The selected stream adapter supplies MediaMTX with browser-compatible media. Event support is separate; event adapter failures must never interrupt video or audio.

### Core

- Configure the camera as MediaMTX path `/crib`.
- Route RTSP media to WebRTC and reconnect after interruptions.
- Report camera, stream, and server health.
- Accept generic events when an adapter is configured.

### Stream adapters

- `direct` passes a compatible RTSP stream to MediaMTX unchanged.
- `reolink` copies H.264 video and converts AAC audio to Opus inside MediaMTX's FFmpeg image.

## Constraints

- Local viewing must work without public internet access.
- Stream failures and frozen frames must become obvious within seconds.
- The stack must recover after camera, process, or power interruptions.
- Camera and adapter credentials remain on the home server.
- Nothing is exposed directly to the public internet.
- Remote access will use Tailscale identity and device authorization.

## Roadmap

1. Test a dedicated camera, night vision, audio, and restart recovery.
2. Move the stack to a Raspberry Pi and add automatic startup.
3. Add Tailscale and define the event interface.

## License

Licensed under the [MIT License](LICENSE).
