// Web Audio API setup
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
let isAudioInitialized = false;

async function initAudio() {
  if (isAudioInitialized) return;
  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }
  isAudioInitialized = true;
}

// Master Gain Node for overall volume control
const masterGainNode = audioContext.createGain();
masterGainNode.gain.value = 0.05; // Set initial volume
masterGainNode.connect(audioContext.destination);

const A4_FREQUENCY = 440;
const SEMITONES_IN_OCTAVE = 12;

const NOTE_TO_SEMITONE = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

const ORDERED_NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

function getFrequency(noteString) {
  const noteNameMatch = noteString.match(/([A-Ga-g]#?)/i);
  const octaveMatch = noteString.match(/(\d+)/);

  if (!noteNameMatch || !octaveMatch) {
    console.error("Invalid note string format:", noteString);
    return null;
  }

  const noteName = noteNameMatch[1].toUpperCase();
  const octave = parseInt(octaveMatch[1], 10);

  const semitoneOffset = NOTE_TO_SEMITONE[noteName];
  if (semitoneOffset === undefined) {
    console.error("Unknown note name:", noteName);
    return null;
  }

  // Calculate semitones from C0
  const semitonesFromC0 = semitoneOffset + octave * SEMITONES_IN_OCTAVE;

  // A4 is 57 semitones from C0 (C0=0, C1=12, C2=24, C3=36, C4=48, A4=48+9=57)
  const A4_SEMITONES_FROM_C0 = NOTE_TO_SEMITONE["A"] + 4 * SEMITONES_IN_OCTAVE;

  const semitonesFromA4 = semitonesFromC0 - A4_SEMITONES_FROM_C0;

  return A4_FREQUENCY * Math.pow(2, semitonesFromA4 / SEMITONES_IN_OCTAVE);
}

function generateNoteRange(startNote, endNote) {
  const generatedFrequencies = {};

  const startNoteNameMatch = startNote.match(/([A-Ga-g]#?)/i);
  const startOctaveMatch = startNote.match(/(\d+)/);
  if (!startNoteNameMatch || !startOctaveMatch) {
    console.error("Invalid startNote format:", startNote);
    return {};
  }
  const startNoteName = startNoteNameMatch[1].toUpperCase();
  const startOctave = parseInt(startOctaveMatch[1], 10);

  const endNoteNameMatch = endNote.match(/([A-Ga-g]#?)/i);
  const endOctaveMatch = endNote.match(/(\d+)/);
  if (!endNoteNameMatch || !endOctaveMatch) {
    console.error("Invalid endNote format:", endNote);
    return {};
  }
  const endNoteName = endNoteNameMatch[1].toUpperCase();
  const endOctave = parseInt(endOctaveMatch[1], 10);

  let currentOctave = startOctave;
  let startIndex = ORDERED_NOTE_NAMES.indexOf(startNoteName);
  let endIndex = ORDERED_NOTE_NAMES.indexOf(endNoteName);

  if (startIndex === -1) {
    console.error("Invalid start note name:", startNoteName);
    return {};
  }
  if (endIndex === -1) {
    console.error("Invalid end note name:", endNoteName);
    return {};
  }

  while (currentOctave <= endOctave) {
    for (let i = startIndex; i < ORDERED_NOTE_NAMES.length; i++) {
      const noteName = ORDERED_NOTE_NAMES[i];
      const fullNote = `${noteName}${currentOctave}`;

      const freq = getFrequency(fullNote);
      if (freq !== null) {
        generatedFrequencies[fullNote] = freq;
      }

      if (currentOctave === endOctave && i === endIndex) {
        return generatedFrequencies;
      }
    }
    currentOctave++;
    startIndex = 0; // After the first octave, start from C
  }
  return generatedFrequencies;
}

// Map note names to frequencies
let noteFrequencies = {};

// Cache for AudioBuffers
const cachedNoteBuffers = new Map();

// Function to calculate the Root Mean Square (RMS) of an audio buffer
function calculateRMS(audioBuffer) {
  const data = audioBuffer.getChannelData(0);
  let sumOfSquares = 0;
  for (let i = 0; i < data.length; i++) {
    sumOfSquares += data[i] * data[i];
  }
  const meanSquare = sumOfSquares / data.length;
  return Math.sqrt(meanSquare);
}

// Function to apply gain to an audio buffer
function applyGain(audioBuffer, gain) {
  const data = audioBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] *= gain;
  }
}

// Function to generate and cache audio for a single note
async function generateAndCacheNoteBuffer(note, frequency) {
  // Use a fixed duration for cached notes that covers the longest possible decay
  const offlineRenderDuration = 1.5; // seconds, to ensure full decay is captured

  const offlineAudioContext = new OfflineAudioContext(
    1,
    audioContext.sampleRate * offlineRenderDuration,
    audioContext.sampleRate,
  );

  const oscillator = offlineAudioContext.createOscillator();
  const gainNode = offlineAudioContext.createGain();

  // Same periodic wave as before
  const real = new Float32Array([0, 0.8, 0.6, 0.4, 0.2, 0.1, 0, 0, 0, 0, 0]);
  const imag = new Float32Array(real.length).fill(0);
  const wave = offlineAudioContext.createPeriodicWave(real, imag);

  oscillator.setPeriodicWave(wave);
  oscillator.frequency.value = frequency;

  // Smooth attack and decay
  gainNode.gain.setValueAtTime(0, offlineAudioContext.currentTime);
  gainNode.gain.linearRampToValueAtTime(
    1,
    offlineAudioContext.currentTime + 0.01,
  ); // Quick attack
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    offlineAudioContext.currentTime + offlineRenderDuration,
  );

  oscillator.connect(gainNode);
  gainNode.connect(offlineAudioContext.destination);

  oscillator.start(0);
  oscillator.stop(offlineAudioContext.currentTime + offlineRenderDuration);

  // Render the audio
  const renderedBuffer = await offlineAudioContext.startRendering();

  // Normalize loudness
  const rms = calculateRMS(renderedBuffer);
  const targetRMS = 0.1; // Target RMS amplitude, this may need tuning
  const gain = targetRMS / rms;

  applyGain(renderedBuffer, gain);

  cachedNoteBuffers.set(note, renderedBuffer);
}

// Function to cache all note sounds
async function cacheAllNoteSounds(dynamicNoteFrequencies = null) {
  console.log("Caching note sounds...");
  cachedNoteBuffers.clear(); // Clear existing cache

  if (dynamicNoteFrequencies) {
    noteFrequencies = dynamicNoteFrequencies;
  } else {
    // Default range if none provided
    noteFrequencies = generateNoteRange("F3", "E5");
  }

  const cachePromises = [];
  for (const note in noteFrequencies) {
    if (Object.prototype.hasOwnProperty.call(noteFrequencies, note)) {
      cachePromises.push(
        generateAndCacheNoteBuffer(note, noteFrequencies[note]),
      );
    }
  }
  await Promise.all(cachePromises);
  console.log("Note sounds cached!");
  return noteFrequencies;
}

function playNote(note) {
  const cachedBuffer = cachedNoteBuffers.get(note);

  if (!cachedBuffer) {
    console.warn(
      `Note buffer for ${note} not found in cache. This should not happen if caching is successful.`,
    );
    return;
  }

  const source = audioContext.createBufferSource();
  source.buffer = cachedBuffer;

  const noteGainNode = audioContext.createGain();
  noteGainNode.connect(masterGainNode);

  source.connect(noteGainNode);
  source.start(0);

  return noteGainNode;
}

function isAudioReady() {
  return isAudioInitialized;
}

function fadeOutAndDisconnect(gainNode, fadeOutDuration = 0.1) {
  if (!gainNode || !audioContext) return;

  gainNode.gain.cancelScheduledValues(audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.0001,
    audioContext.currentTime + fadeOutDuration,
  );

  // Disconnect the node after the fade is complete.
  // The timeout is slightly longer than the fade duration to ensure it has finished.
  const disconnectDelay = fadeOutDuration * 1000 + 50;
  setTimeout(() => gainNode.disconnect(), disconnectDelay);
}

export {
  initAudio,
  cacheAllNoteSounds,
  playNote,
  isAudioReady,
  fadeOutAndDisconnect,
};
