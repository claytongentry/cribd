# Audio Activity Meter

Date: **AUG.18.2026**

`cribd` shows a compact five-segment sound activity meter below a live camera stream when the stream includes audio.

The viewer measures the incoming WebRTC audio track locally in the browser and maps it across five visual activity levels. In Chrome it reads decoded audio samples directly because Chrome reports zero receiver energy while muted; other browsers use the receiver’s inbound audio statistics or synchronization-source level. Neither path starts a Web Audio context, so the meter begins automatically without a click or keyboard interaction. It remains independent of playback volume, disappears when the stream is offline or has no audio track, and does not send audio or measurements to a server.

The borderless, softly toned surface is labeled “Room sound” to keep the feature human and contextual. Activity appears immediately, holds its peak for 280ms, then releases one capsule at a time so short sounds remain readable without turning the display into an audio visualizer. Active capsules use a softer green while the current peak stays fully illuminated; warning colors remain reserved for future sustained-sound alerts with meaningful thresholds.

The meter reports relative digital signal activity. It is not a calibrated decibel meter, cry detector, medical monitor, or alerting system.
