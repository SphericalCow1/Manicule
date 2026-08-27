let audioContext: AudioContext | null = null;
let lastPlayedAt = 0;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const audioWindow = window as Window &
    typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
  if (!AudioContextConstructor) {
    return null;
  }

  audioContext ??= new AudioContextConstructor();
  return audioContext;
}

export function isDoneTaskState(status: string, taskStates: string[]) {
  const doneState = taskStates[taskStates.length - 1] ?? "DONE";
  return status === doneState || status.toUpperCase() === "DONE";
}

export function playTaskDoneSound(
  nextStatus: string,
  taskStates: string[],
  enabled = true,
) {
  if (!enabled) {
    return;
  }

  if (!isDoneTaskState(nextStatus, taskStates)) {
    return;
  }

  const now = Date.now();
  if (now - lastPlayedAt < 180) {
    return;
  }
  lastPlayedAt = now;

  const context = getAudioContext();
  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume();
  }

  const start = context.currentTime;
  const masterGain = context.createGain();
  masterGain.gain.setValueAtTime(0.0001, start);
  masterGain.gain.exponentialRampToValueAtTime(0.18, start + 0.015);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);
  masterGain.connect(context.destination);

  playTone(context, masterGain, 523.25, start, 0.1, "triangle", 0.5);
  playTone(context, masterGain, 659.25, start + 0.07, 0.1, "triangle", 0.5);
  playTone(context, masterGain, 783.99, start + 0.14, 0.1, "triangle", 0.48);
  playTone(context, masterGain, 1046.5, start + 0.22, 0.24, "sine", 0.4);
}

function playTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  type: OscillatorType,
  volume: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
}
