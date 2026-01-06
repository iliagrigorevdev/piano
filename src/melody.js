function parseMelodyFromURL() {
  const urlParams = new URLSearchParams(window.location.search);
  const melodyParam = urlParams.get("melody");
  if (!melodyParam) return [];

  const tempo = parseFloat(urlParams.get("tempo")) || 120;
  const beatDuration = 60 / tempo;

  const notes = melodyParam.split(",");
  let currentTime = 0; // in beats
  const parsedMelody = [];

  const noteRegex = /^([0-9\.]+)(.+)/; // Catches leading number and the rest.

  for (const noteString of notes) {
    if (!noteString) continue;

    const match = noteString.match(noteRegex);
    if (!match) continue;

    const durationInBeats = parseFloat(match[1]);
    let noteName = match[2];

    if (isNaN(durationInBeats)) continue;

    const firstChar = noteName.charAt(0);
    if (firstChar >= "a" && firstChar <= "g") {
      const rest = noteName.slice(1);
      noteName = `${firstChar.toUpperCase()}#${rest}`;
    } else if (noteName === "R" || noteName === "_") {
      noteName = "REST";
    }

    parsedMelody.push({
      note: noteName,
      duration: durationInBeats * beatDuration,
      start: currentTime * beatDuration,
    });

    currentTime += durationInBeats;
  }

  return parsedMelody;
}

function calculateTempoAndQuantize(notes) {
  // 1. Calculate Inter-Onset Intervals (IOIs)
  const iois = [];
  for (let i = 0; i < notes.length - 1; i++) {
    const ioi = (notes[i + 1].startTime - notes[i].startTime) / 1000;
    if (ioi > 0.05) {
      // Ignore very short IOIs
      iois.push(ioi);
    }
  }

  if (iois.length === 0) {
    return { melody: "", tempo: 120 }; // Fallback
  }

  // 2. Find the most common IOI using a histogram
  const histogram = {};
  const binSize = 0.02; // 20ms bins
  let maxCount = 0;
  let dominantIOI = iois[0];

  for (const ioi of iois) {
    const bin = Math.round(ioi / binSize) * binSize;
    histogram[bin] = (histogram[bin] || 0) + 1;
    if (histogram[bin] > maxCount) {
      maxCount = histogram[bin];
      dominantIOI = bin;
    }
  }

  // 3. Calculate tempo
  // Assume the dominant IOI is a quarter note, but constrain tempo
  let tempo = 60 / dominantIOI;
  if (tempo > 180) tempo /= 2; // Probably an 8th note
  if (tempo < 70) tempo *= 2; // Probably a half note
  tempo = Math.round(tempo);

  // 4. Quantize melody to this tempo
  const beatDuration = 60 / tempo;
  let quantizedMelody = "";
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    let durationInSeconds;

    if (i < notes.length - 1) {
      // For all notes except the last, duration is the time until the next note starts.
      durationInSeconds = (notes[i + 1].startTime - note.startTime) / 1000;
    } else {
      // For the last note, use its natural duration.
      durationInSeconds = (note.endTime - note.startTime) / 1000;
    }

    // Quantize to nearest 8th note (0.5 of a beat)
    let durationInBeats = durationInSeconds / beatDuration;
    durationInBeats = Math.max(0.25, Math.round(durationInBeats * 2) / 2);
    let formattedNoteName = note.note;
    // Check if the note is a sharp note (e.g., "C#4")
    if (formattedNoteName.length > 1 && formattedNoteName.charAt(1) === "#") {
      // Convert 'C#4' to 'c4', 'D#5' to 'd5', etc.
      // The first character (e.g., 'C') becomes lowercase (e.g., 'c')
      // The '#' is removed, and the rest of the string (e.g., '4') is appended.
      formattedNoteName =
        formattedNoteName.charAt(0).toLowerCase() + formattedNoteName.slice(2);
    }

    quantizedMelody += `${
      Number.isInteger(durationInBeats)
        ? String(durationInBeats)
        : durationInBeats.toFixed(2)
    }${formattedNoteName},`;
  }

  return { melody: quantizedMelody, tempo: tempo };
}

export { parseMelodyFromURL, calculateTempoAndQuantize };
