"use strict";

const mediaPort = "8890";
const retryDelay = 1000;
const freezeAfter = 5000;
const watchdogEvery = 1000;

const video = document.getElementById("video");
const statusLabel = document.getElementById("status-label");
const stateTitle = document.getElementById("state-title");
const stateDetail = document.getElementById("state-detail");

const stateCopy = {
  connecting: ["Connecting", "Waiting for the camera stream"],
  offline: ["Camera offline", "Retrying automatically…"],
};

const mediaBase = new URL(window.location.href);
mediaBase.port = mediaPort;
mediaBase.pathname = "/crib/";
mediaBase.search = "";
mediaBase.hash = "";

let reader = null;
let reconnectTimer = null;
let frameCallback = null;
let lastFrameAt = 0;
let stopped = false;

function setState(next) {
  const copy = stateCopy[next];
  document.body.dataset.state = next;
  video.controls = next === "live";
  statusLabel.textContent = next;
  if (copy) {
    [stateTitle.textContent, stateDetail.textContent] = copy;
  }
}

function clearVideo() {
  video.pause();
  video.srcObject = null;
}

function scheduleReconnect(reason) {
  if (stopped) {
    return;
  }

  console.warn(`[cribd] ${reason}`);
  reader?.close();
  reader = null;
  clearVideo();
  setState("offline");
  clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(connect, retryDelay);
}

function loadReader() {
  if (window.MediaMTXWebRTCReader !== undefined) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = new URL("reader.js", mediaBase).toString();
    script.onload = () => {
      if (window.MediaMTXWebRTCReader === undefined) {
        reject(new Error("MediaMTX reader did not load"));
        return;
      }
      resolve();
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("MediaMTX reader is unavailable"));
    };
    document.head.append(script);
  });
}

async function connect() {
  reconnectTimer = null;

  try {
    await loadReader();
    if (stopped) {
      return;
    }

    reader = new window.MediaMTXWebRTCReader({
      url: new URL("whep", mediaBase).toString(),
      onError: scheduleReconnect,
      onTrack: (event) => {
        if (stopped || event.streams.length === 0) {
          return;
        }

        video.srcObject = event.streams[0];
        lastFrameAt = performance.now();
        video.play().catch(() => undefined);
      },
    });
  } catch (error) {
    scheduleReconnect(error);
  }
}

function markFrame() {
  if (video.srcObject === null) {
    return;
  }
  lastFrameAt = performance.now();
  if (document.body.dataset.state !== "live") {
    setState("live");
  }
}

if (typeof video.requestVideoFrameCallback === "function") {
  const onFrame = () => {
    markFrame();
    frameCallback = video.requestVideoFrameCallback(onFrame);
  };
  frameCallback = video.requestVideoFrameCallback(onFrame);
} else {
  video.addEventListener("timeupdate", markFrame);
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    lastFrameAt = performance.now();
  }
});

const watchdog = window.setInterval(() => {
  if (
    !document.hidden &&
    video.srcObject !== null &&
    !video.paused &&
    performance.now() - lastFrameAt >= freezeAfter
  ) {
    scheduleReconnect("video stopped producing frames");
  }
}, watchdogEvery);

window.addEventListener("beforeunload", () => {
  stopped = true;
  clearTimeout(reconnectTimer);
  clearInterval(watchdog);
  if (
    frameCallback !== null &&
    typeof video.cancelVideoFrameCallback === "function"
  ) {
    video.cancelVideoFrameCallback(frameCallback);
  }
  reader?.close();
});

connect();
