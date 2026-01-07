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
  // 1. Calculate Inter-Onset Intervals (IOIs) in milliseconds
  const iois = [];
  for (let i = 0; i < notes.length - 1; i++) {
    const ioi = notes[i + 1].startTime - notes[i].startTime;
    if (ioi > 50) {
      // Ignore very short IOIs
      iois.push(ioi);
    }
  }

  if (iois.length === 0) {
    return { melody: "", tempo: 120 }; // Fallback
  }

  // 2. Find clusters of IOIs
  const clusters = findIOIClusters(iois);

  // 3. Find the quantum interval (greatest common divisor of cluster means)
  const quantum = findQuantum(
    clusters.map((c) => c.mean),
    25,
  ); // 25ms tolerance

  if (quantum <= 0) {
    return { melody: "", tempo: 120 }; // Fallback
  }

  // 4. Calculate tempo
  const possibleTempos = [
    60000 / (quantum * 4), // quantum is 16th note
    60000 / (quantum * 2), // quantum is 8th note
    60000 / quantum, // quantum is quarter note
  ];

  let tempo = possibleTempos.sort(
    (a, b) => Math.abs(a - 120) - Math.abs(b - 120),
  )[0];
  tempo = Math.round(tempo);

  // 5. Quantize melody
  const beatDuration = 60000 / tempo;
  let quantizedMelody = "";
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    let duration;

    if (i < notes.length - 1) {
      duration = notes[i + 1].startTime - note.startTime;
    } else {
      duration = note.endTime - note.startTime;
    }

    // Quantize to nearest 16th note (0.25 of a beat)
    let durationInBeats = duration / beatDuration;
    durationInBeats = Math.max(0.25, Math.round(durationInBeats * 4) / 4);
    let formattedNoteName = note.note;
    if (formattedNoteName.length > 1 && formattedNoteName.charAt(1) === "#") {
      formattedNoteName =
        formattedNoteName.charAt(0).toLowerCase() + formattedNoteName.slice(2);
    }

    quantizedMelody += `${durationInBeats.toFixed(2)}${formattedNoteName},`;
  }

  return { melody: quantizedMelody, tempo: tempo };
}

function findIOIClusters(iois, tolerance = 0.2) {
  iois.sort((a, b) => a - b);
  const clusters = [];
  if (iois.length === 0) return clusters;

  let currentCluster = { mean: iois[0], values: [iois[0]] };

  for (let i = 1; i < iois.length; i++) {
    if (iois[i] <= currentCluster.mean * (1 + tolerance)) {
      currentCluster.values.push(iois[i]);
      // Update mean
      currentCluster.mean =
        currentCluster.values.reduce((a, b) => a + b, 0) /
        currentCluster.values.length;
    } else {
      clusters.push(currentCluster);
      currentCluster = { mean: iois[i], values: [iois[i]] };
    }
  }
  clusters.push(currentCluster);
  return clusters;
}

function findQuantum(numbers, tolerance) {
  if (numbers.length === 0) return 0;
  let result = numbers[0];
  for (let i = 1; i < numbers.length; i++) {
    result = pairGcd(numbers[i], result, tolerance);
  }
  return result;
}

function pairGcd(a, b, tolerance) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b > tolerance) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

export { parseMelodyFromURL, calculateTempoAndQuantize };
