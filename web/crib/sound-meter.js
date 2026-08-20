const LEVEL_THRESHOLDS_DB = [-55, -45, -36, -27, -18];
const LEVEL_LABELS = ["Quiet", "Quiet", "Sound", "Sound", "Loud", "Loud"];
const READ_INTERVAL_MS = 100;
const PEAK_HOLD_MS = 280;
const RELEASE_INTERVAL_MS = 120;
const MIN_SIGNAL = 0.0001;
const SAMPLE_FORMAT = "f32-planar";

function levelForSignal(signal) {
  const decibels = 20 * Math.log10(Math.max(signal, MIN_SIGNAL));
  let level = 0;

  while (
    level < LEVEL_THRESHOLDS_DB.length &&
    decibels >= LEVEL_THRESHOLDS_DB[level]
  ) {
    level += 1;
  }

  return level;
}

function readAudioEnergy(audioData) {
  let energy = 0;
  let sampleCount = 0;

  try {
    for (let channel = 0; channel < audioData.numberOfChannels; channel += 1) {
      const copyOptions = { format: SAMPLE_FORMAT, planeIndex: channel };
      const samples = new Float32Array(
        audioData.allocationSize(copyOptions) / Float32Array.BYTES_PER_ELEMENT,
      );
      audioData.copyTo(samples, copyOptions);

      for (const sample of samples) {
        energy += sample * sample;
      }
      sampleCount += samples.length;
    }
  } finally {
    audioData.close();
  }

  return [energy, sampleCount];
}

function readReceiverSignal(receiver, report) {
  let signal = 0;

  for (const stat of report.values()) {
    const isAudio = stat.kind === "audio" || stat.mediaType === "audio";
    if (
      stat.type === "inbound-rtp" &&
      isAudio &&
      Number.isFinite(stat.audioLevel)
    ) {
      signal = Math.max(signal, stat.audioLevel);
    }
  }

  for (const source of receiver.getSynchronizationSources?.() ?? []) {
    if (Number.isFinite(source.audioLevel)) {
      signal = Math.max(signal, source.audioLevel);
    }
  }

  return signal;
}

function warnSampleFallback(error) {
  console.warn(
    "[cribd] raw audio activity is unavailable; using receiver levels",
    error,
  );
}

export class SoundMeter {
  #element;
  #source = null;
  #sample = null;
  #pollTimer = null;
  #pendingRead = null;
  #live = false;
  #level = 0;
  #peakUntil = 0;
  #lastReleaseAt = 0;
  #lastSampleAt = 0;

  constructor(element) {
    this.#element = element;
  }

  setLive(live) {
    this.#live = live;
    this.#syncVisibility();
  }

  start(receiver, track) {
    if (track.kind !== "audio" || this.#source?.track === track) {
      return;
    }

    this.stop();
    this.#source = { receiver, track };
    this.#syncVisibility();

    track.addEventListener(
      "ended",
      () => {
        if (this.#source?.track === track) {
          this.stop();
        }
      },
      { once: true },
    );

    if (!this.#startSampleReader(track)) {
      this.#startReceiverPolling();
    }
  }

  stop() {
    const sample = this.#sample;

    if (this.#pollTimer !== null) {
      window.clearInterval(this.#pollTimer);
    }

    this.#source = null;
    this.#sample = null;
    this.#pollTimer = null;
    this.#pendingRead = null;
    this.#peakUntil = 0;
    this.#lastReleaseAt = 0;
    this.#lastSampleAt = 0;
    this.#syncVisibility();
    if (this.#level !== 0) {
      this.#level = 0;
      this.#render();
    }

    sample?.reader.cancel().catch(() => undefined);
    sample?.track.stop();
  }

  #syncVisibility() {
    this.#element.hidden = !this.#live || this.#source === null;
  }

  #startSampleReader(track) {
    if (typeof window.MediaStreamTrackProcessor !== "function") {
      return false;
    }

    let sampleTrack = null;

    try {
      sampleTrack = track.clone();
      const processor = new window.MediaStreamTrackProcessor({
        track: sampleTrack,
      });
      const reader = processor.readable.getReader();
      this.#sample = { reader, track: sampleTrack };
      void this.#readSamples(reader, track);
      return true;
    } catch (error) {
      sampleTrack?.stop();
      warnSampleFallback(error);
      return false;
    }
  }

  async #readSamples(reader, track) {
    let energy = 0;
    let sampleCount = 0;

    try {
      while (this.#isCurrentSample(reader, track)) {
        const { done, value: audioData } = await reader.read();
        if (done) {
          break;
        }

        const [frameEnergy, frameSampleCount] = readAudioEnergy(audioData);
        energy += frameEnergy;
        sampleCount += frameSampleCount;

        const now = performance.now();
        if (now - this.#lastSampleAt < READ_INTERVAL_MS) {
          continue;
        }

        const rms = sampleCount === 0 ? 0 : Math.sqrt(energy / sampleCount);
        this.#updateSignal(rms, now);
        energy = 0;
        sampleCount = 0;
        this.#lastSampleAt = now;
      }
    } catch (error) {
      if (this.#isCurrentSample(reader, track)) {
        warnSampleFallback(error);
      }
    }

    if (this.#isCurrentSample(reader, track)) {
      this.#sample.track.stop();
      this.#sample = null;
      this.#startReceiverPolling();
    }
  }

  #isCurrentSample(reader, track) {
    return this.#sample?.reader === reader && this.#source?.track === track;
  }

  #startReceiverPolling() {
    if (this.#pollTimer !== null || this.#source === null) {
      return;
    }

    void this.#readReceiver();
    this.#pollTimer = window.setInterval(
      () => void this.#readReceiver(),
      READ_INTERVAL_MS,
    );
  }

  async #readReceiver() {
    const receiver = this.#source?.receiver;
    if (receiver === undefined || this.#pendingRead !== null) {
      return;
    }

    const request = {};
    this.#pendingRead = request;

    try {
      const report = await receiver.getStats();
      if (this.#source?.receiver === receiver) {
        this.#updateSignal(
          readReceiverSignal(receiver, report),
          performance.now(),
        );
      }
    } catch {
      if (this.#source?.receiver === receiver) {
        this.#updateLevel(0, performance.now());
      }
    } finally {
      if (this.#pendingRead === request) {
        this.#pendingRead = null;
      }
    }
  }

  #updateSignal(signal, now) {
    this.#updateLevel(levelForSignal(signal), now);
  }

  #updateLevel(targetLevel, now) {
    const previousLevel = this.#level;

    if (targetLevel > this.#level) {
      this.#level = targetLevel;
      this.#peakUntil = now + PEAK_HOLD_MS;
      this.#lastReleaseAt = now;
    } else if (targetLevel === this.#level && targetLevel > 0) {
      this.#peakUntil = now + PEAK_HOLD_MS;
    } else if (
      targetLevel < this.#level &&
      now >= this.#peakUntil &&
      now - this.#lastReleaseAt >= RELEASE_INTERVAL_MS
    ) {
      this.#level = Math.max(targetLevel, this.#level - 1);
      this.#lastReleaseAt = now;
    }

    if (this.#level !== previousLevel) {
      this.#render();
    }
  }

  #render() {
    const level = String(this.#level);
    this.#element.dataset.level = level;
    this.#element.setAttribute("aria-valuenow", level);
    this.#element.setAttribute("aria-valuetext", LEVEL_LABELS[this.#level]);
  }
}
