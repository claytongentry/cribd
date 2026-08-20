import { SoundMeter } from "./sound-meter.js?v=20260818";

const MEDIA_PORT = "8890";
const RETRY_DELAY_MS = 1000;
const FREEZE_TIMEOUT_MS = 5000;
const WATCHDOG_INTERVAL_MS = 1000;
const THEME_COOKIE = "cribd_theme";

const root = document.documentElement;
const body = document.body;
const video = document.getElementById("video");
const statusElement = document.getElementById("status-label");
const themeToggle = document.getElementById("theme-toggle");
const themeColor = document.getElementById("theme-color");
const soundMeter = new SoundMeter(document.getElementById("sound-meter"));

const STATUS_LABELS = {
  connecting: "Connecting",
  live: "Live",
  offline: "Offline",
};

const mediaBase = new URL(window.location.href);
mediaBase.port = MEDIA_PORT;
mediaBase.pathname = "/crib/";
mediaBase.search = "";
mediaBase.hash = "";

let reader = null;
let reconnectTimer = null;
let frameCallback = null;
let lastFrameAt = 0;
let stopped = false;

function applyTheme(theme) {
  root.dataset.theme = theme;
  themeToggle.setAttribute("aria-pressed", String(theme === "dark"));
  themeColor.content = getComputedStyle(root)
    .getPropertyValue("--canvas")
    .trim();
}

function toggleTheme() {
  const theme = root.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(theme);
  document.cookie = `${THEME_COOKIE}=${theme}; Max-Age=31536000; Path=/; SameSite=Lax`;
}

function setViewerState(state) {
  const live = state === "live";

  body.dataset.state = state;
  video.controls = live;
  soundMeter.setLive(live);
  statusElement.textContent = STATUS_LABELS[state];
}

function disconnect() {
  const activeReader = reader;
  reader = null;
  activeReader?.close();
  soundMeter.stop();
  video.pause();
  video.srcObject = null;
}

function scheduleReconnect(reason) {
  if (stopped) {
    return;
  }

  console.warn(`[cribd] ${reason}`);
  disconnect();
  setViewerState("offline");
  clearTimeout(reconnectTimer);
  reconnectTimer = window.setTimeout(connect, RETRY_DELAY_MS);
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

    let nextReader;
    nextReader = new window.MediaMTXWebRTCReader({
      url: new URL("whep", mediaBase).toString(),
      onError: (reason) => {
        if (reader === nextReader) {
          scheduleReconnect(reason);
        }
      },
      onTrack: (event) => {
        if (stopped || reader !== nextReader || event.streams.length === 0) {
          return;
        }

        const [stream] = event.streams;
        video.srcObject = stream;
        soundMeter.start(event.receiver, event.track);
        lastFrameAt = performance.now();
        video.play().catch(() => undefined);
      },
    });
    reader = nextReader;
  } catch (error) {
    scheduleReconnect(error);
  }
}

function markFrame() {
  if (video.srcObject === null) {
    return;
  }
  lastFrameAt = performance.now();
  if (body.dataset.state !== "live") {
    setViewerState("live");
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

const freezeWatchdog = window.setInterval(() => {
  const frozen = performance.now() - lastFrameAt >= FREEZE_TIMEOUT_MS;
  if (!document.hidden && video.srcObject !== null && !video.paused && frozen) {
    scheduleReconnect("video stopped producing frames");
  }
}, WATCHDOG_INTERVAL_MS);

window.addEventListener("beforeunload", () => {
  stopped = true;
  clearTimeout(reconnectTimer);
  clearInterval(freezeWatchdog);
  if (
    frameCallback !== null &&
    typeof video.cancelVideoFrameCallback === "function"
  ) {
    video.cancelVideoFrameCallback(frameCallback);
  }
  disconnect();
});

applyTheme(root.dataset.theme);
themeToggle.addEventListener("click", toggleTheme);
connect();
