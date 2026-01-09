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

function noteNameToMidi(note) {
  const noteNameMatch = note.match(/([A-Ga-g]#?)/i);
  const octaveMatch = note.match(/(\d+)/);
  if (!noteNameMatch || !octaveMatch) {
    return null;
  }
  const noteName = noteNameMatch[1].toUpperCase();
  const octave = parseInt(octaveMatch[1], 10);
  const noteIndex = ORDERED_NOTE_NAMES.indexOf(noteName);

  if (noteIndex === -1) {
    return null;
  }

  // MIDI note number: C0 = 12, C4 = 60
  // ORDERED_NOTE_NAMES starts with C, so C is index 0
  // C-1 (octave -1) is MIDI 0
  // So, MIDI note = 12 * (octave + 1) + noteIndex
  return 12 * (octave + 1) + noteIndex;
}

// SFZ data
let regions = [];
const cachedNoteBuffers = new Map();

async function loadSfz(path) {
  const response = await fetch(path);
  const sfzText = await response.text();
  const lines = sfzText.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith("<region>")) continue;
    const parts = line.replace("<region>", "").trim().split(/\s+/);
    const region = {};
    for (const part of parts) {
      const [key, value] = part.split("=");
      // @ts-ignore
      region[key] = isNaN(Number(value)) ? value : Number(value);
    }
    regions.push(region);
  }
}

async function cacheAllNoteSounds() {
  console.log("Caching note sounds...");
  cachedNoteBuffers.clear();
  await loadSfz("piano.sfz");

  const samplePaths = [...new Set(regions.map((region) => region.sample))];

  const cachePromises = samplePaths.map(async (path) => {
    try {
      const response = await fetch(path);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      cachedNoteBuffers.set(path, audioBuffer);
    } catch (e) {
      console.warn(`Could not load sound for ${path}`);
    }
  });

  await Promise.all(cachePromises);
  console.log("Note sounds cached!");

  return generateNoteRange("F1", "E5");
}

function playNote(note) {
  const midiNote = noteNameToMidi(note);
  if (!midiNote) {
    return;
  }

  const region = regions.find(
    (r) => midiNote >= r.lokey && midiNote <= r.hikey,
  );

  if (!region) {
    console.warn(`No region found for MIDI note ${midiNote}`);
    return;
  }

  const cachedBuffer = cachedNoteBuffers.get(region.sample);
  if (!cachedBuffer) {
    console.warn(
      `Note buffer for ${region.sample} not found in cache. This should not happen if caching is successful.`,
    );
    return;
  }

  const source = audioContext.createBufferSource();
  source.buffer = cachedBuffer;

  const pitchKeyCenter = region.pitch_keycenter || region.lokey;
  const noteDifference = midiNote - pitchKeyCenter;
  source.playbackRate.value = 2 ** (noteDifference / 12);

  const noteGainNode = audioContext.createGain();
  noteGainNode.connect(masterGainNode);

  source.connect(noteGainNode);
  source.start(0);

  return noteGainNode;
}

function isAudioReady() {
  return isAudioInitialized;
}

function fadeOutAndDisconnect(gainNode, fadeOutDuration) {
  if (!gainNode || !audioContext) return;

  gainNode.gain.cancelScheduledValues(audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(
    0.001,
    audioContext.currentTime + fadeOutDuration,
  );

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
