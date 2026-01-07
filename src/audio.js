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
masterGainNode.gain.value = 0.5; // Set initial volume
masterGainNode.connect(audioContext.destination);

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

function generateNoteRange(startNote, endNote) {
  const generatedNotes = {};

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
      generatedNotes[fullNote] = fullNote;

      if (currentOctave === endOctave && i === endIndex) {
        return generatedNotes;
      }
    }
    currentOctave++;
    startIndex = 0; // After the first octave, start from C
  }
  return generatedNotes;
}

// Map note names to frequencies
let notes = {};

// Cache for AudioBuffers
const cachedNoteBuffers = new Map();

// Function to load and cache audio for a single note
async function loadAndCacheNoteBuffer(note) {
  const encodedNote = note.replace("#", "s");
  const path = `samples/${encodedNote}.mp3`;
  try {
    const response = await fetch(path);
    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    cachedNoteBuffers.set(note, audioBuffer);
  } catch (e) {
    console.warn(`Could not load sound for ${note} at ${path}`);
  }
}

// Function to cache all note sounds
async function cacheAllNoteSounds(dynamicNotes = null) {
  console.log("Caching note sounds...");
  cachedNoteBuffers.clear(); // Clear existing cache

  if (dynamicNotes) {
    notes = dynamicNotes;
  } else {
    // Default range if none provided
    notes = generateNoteRange("F3", "E5");
  }

  const cachePromises = [];
  for (const note in notes) {
    if (Object.prototype.hasOwnProperty.call(notes, note)) {
      cachePromises.push(loadAndCacheNoteBuffer(note));
    }
  }
  await Promise.all(cachePromises);
  console.log("Note sounds cached!");
  return notes;
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
