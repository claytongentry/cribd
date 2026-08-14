# RTSP to WebRTC

Date: **AUG.13.2026**

`cribd` serves a single RTSP camera stream to browsers over WebRTC.

```sh
cp .env.example .env
./bin/cribd
```

Open `http://localhost:8889/crib`.

The launcher starts Apple's container service, maps the camera to `/crib`, and forwards MediaMTX's WebRTC HTTP and UDP ports to macOS. MediaMTX reconnects to the RTSP source after interruptions. This version supports one loopback-only stream on the development Mac; hardware events and remote access are not included.
