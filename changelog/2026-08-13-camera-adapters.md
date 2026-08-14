# Camera Adapters

Date: **AUG.13.2026**

`cribd` accepts browser-compatible streams from camera adapters.

The Reolink adapter copies H.264 video and converts AAC audio to Opus before publishing a local RTSP stream to `cribd`. Cameras that already provide H.264 and Opus pass through unchanged.

Stream and event support are separate adapter capabilities. `cribd` remains responsible for delivering normalized media over WebRTC.
