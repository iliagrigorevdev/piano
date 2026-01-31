import { registerSW } from "virtual:pwa-register";
import "./style.css";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  initAudio,
  cacheAllNoteSounds,
  playNote,
  isAudioReady,
  fadeOutAndDisconnect,
  midiToNoteName,
} from "./audio.js";
import { Midi } from "@tonejs/midi";
import { showCongratsEffect } from "./congrats.js";

registerSW();

const scene = new THREE.Scene();
const pianoGroup = new THREE.Group();
scene.add(pianoGroup);

const CAMERA_FOV = 25; // degrees
const MIN_ASPECT = 0.35;

function calculateVerticalFOV(horizontalFOV, aspect) {
  const horizontalFOVrad = (horizontalFOV * Math.PI) / 180;
  const verticalFOVrad = 2 * Math.atan(Math.tan(horizontalFOVrad / 2) / aspect);
  return (verticalFOVrad * 180) / Math.PI;
}

const camera = new THREE.PerspectiveCamera(
  CAMERA_FOV,
  window.innerWidth / window.innerHeight,
  1,
  100,
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

let melody = [];
let currentNoteIndex = 0;
let noteMap;
let hitboxMap;
let noteToHitboxMap;
const originalMaterials = new Map();
const highlightMaterials = [
  new THREE.MeshStandardMaterial({
    color: 0x7777ff,
    roughness: 0.2,
    metalness: 0.1,
  }),
  new THREE.MeshStandardMaterial({
    color: 0xbb77ff,
    roughness: 0.2,
    metalness: 0.1,
  }),
];
const pressedHighlightMaterial = new THREE.MeshStandardMaterial({
  color: 0xffae5e,
  roughness: 0.2,
  metalness: 0.1,
});
let playbackState = "DEMO"; // "DEMO" or "PLAY"
let isDemoPlaying = false;
let selectedMelodyFile = null;
let currentTranspose = 0; // State for current transposition
let isMelodyFinishing = false;
let demoPlayingNotes = new Map();

// --- State variables to be initialized in buildAndInitScene ---
let keyState,
  activePointers,
  activeNoteGainNodes,
  hitboxKeys,
  raycaster,
  unhighlightKey;

let touchStartX = 0;
let touchStartY = 0;
const swipeThreshold = 50; // Minimum distance for a swipe

let cameraWaypoints = [];
let currentWaypointIndex = 0;
let targetCameraPosition = new THREE.Vector3();
const cameraLookAt = new THREE.Vector3();
let chunkYPositions = [];
let allNotes;
let currentLayout = "1";

function updateCamera() {
  const maxDimension = Math.max(window.innerWidth, window.innerHeight);
  const aspectRatioX = window.innerWidth / maxDimension;
  const aspectRatioY = window.innerHeight / maxDimension;
  const fovCorrection =
    MIN_ASPECT / Math.min(Math.min(aspectRatioX, aspectRatioY), MIN_ASPECT);
  const fov = CAMERA_FOV * fovCorrection;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov =
    camera.aspect < 1 ? fov : calculateVerticalFOV(fov, camera.aspect);
  camera.updateProjectionMatrix();
}

function updateTargetHandles() {
  const isPortrait = window.innerHeight > window.innerWidth;
  const z = cameraWaypoints[currentWaypointIndex];
  const lowerChunkY = chunkYPositions[currentWaypointIndex + 1];
  const cameraHeight = 30 + lowerChunkY;
  if (isPortrait) {
    targetCameraPosition.set(-z - 15, cameraHeight, 0);
    cameraLookAt.set(-z, lowerChunkY, 0);
  } else {
    targetCameraPosition.set(0, cameraHeight, z + 15);
    cameraLookAt.set(0, lowerChunkY, z);
  }
}

// Initial camera setup
updateCamera();

// --- Overlay Setup ---
const overlay = document.querySelector("#overlay");
const playButton = document.querySelector("#play-button");
const melodiesContainer = document.querySelector("#melodies-container");

// -- Controls Container --
const controlsRow = document.createElement("div");
controlsRow.id = "controls-row";
// Insert before melodies container
melodiesContainer.parentNode.insertBefore(controlsRow, melodiesContainer);

// -- Layout Selector UI --
const layoutControls = document.createElement("div");
layoutControls.id = "layout-controls";
layoutControls.innerHTML = `
  <span>Layout:</span>
  <label class="radio-label">
    <input type="radio" name="layout" value="1" checked>
    Type 1
  </label>
  <label class="radio-label">
    <input type="radio" name="layout" value="2">
    Type 2
  </label>
`;
controlsRow.appendChild(layoutControls);

// -- Transpose Controls UI --
const transposeControls = document.createElement("div");
transposeControls.id = "transpose-controls";
transposeControls.innerHTML = `
  <span>Transpose:</span>
  <button id="transpose-down" class="control-btn" disabled>-</button>
  <span id="transpose-value">0</span>
  <button id="transpose-up" class="control-btn" disabled>+</button>
`;
controlsRow.appendChild(transposeControls);

const btnTransposeDown = transposeControls.querySelector("#transpose-down");
const btnTransposeUp = transposeControls.querySelector("#transpose-up");
const displayTranspose = transposeControls.querySelector("#transpose-value");

async function updateTranspose(change) {
  if (!selectedMelodyFile) return;

  currentTranspose += change;
  displayTranspose.textContent =
    currentTranspose > 0 ? `+${currentTranspose}` : currentTranspose;

  // Reload the melody with the new transpose value
  await loadMelody(selectedMelodyFile, currentTranspose);

  // If we are currently previewing (Demo Mode), restart the demo to hear changes
  if (isDemoPlaying) {
    playMelodyDemo();
  }
}

btnTransposeDown.addEventListener("click", () => updateTranspose(-1));
btnTransposeUp.addEventListener("click", () => updateTranspose(1));

// Handle Layout Change
layoutControls.addEventListener("change", (e) => {
  if (e.target.name === "layout") {
    const newLayout = e.target.value;
    if (newLayout !== currentLayout && allNotes) {
      currentLayout = newLayout;
      clearPiano();
      buildPiano(allNotes, currentLayout);

      // If a demo is currently playing, we need to restart it
      // so highlights attach to the new 3D meshes
      if (isDemoPlaying && selectedMelodyFile) {
        playMelodyDemo();
      }
    }
  }
});

// -- File Loading Logic --

// 1. Hidden Input for Folders
const loadFolderInput = document.createElement("input");
loadFolderInput.type = "file";
loadFolderInput.webkitdirectory = true;
loadFolderInput.multiple = true;
loadFolderInput.style.display = "none";
document.body.appendChild(loadFolderInput);

// 2. Hidden Input for Files
const loadFileInput = document.createElement("input");
loadFileInput.type = "file";
loadFileInput.multiple = true;
loadFileInput.accept = ".mid,.midi";
loadFileInput.style.display = "none";
document.body.appendChild(loadFileInput);

// 3. UI: Single Load Button Container
const loadContainer = document.createElement("div");
loadContainer.style.display = "flex";
loadContainer.style.alignItems = "center";
loadContainer.style.justifyContent = "center";

// The main "Load" button
const mainLoadBtn = document.createElement("button");
mainLoadBtn.textContent = "Load";
mainLoadBtn.id = "main-load-button";

// The container for options (File | Folder) - initially hidden
const loadOptionsDiv = document.createElement("div");
loadOptionsDiv.style.display = "none";

// Sub-button: Files
const btnLoadFiles = document.createElement("button");
btnLoadFiles.textContent = "Files";
btnLoadFiles.style.fontSize = "1.5rem"; // Slightly smaller than main
btnLoadFiles.style.padding = "0.8rem 1.5rem";

// Sub-button: Folder
const btnLoadFolder = document.createElement("button");
btnLoadFolder.textContent = "Folder";
btnLoadFolder.style.fontSize = "1.5rem";
btnLoadFolder.style.padding = "0.8rem 1.5rem";

loadOptionsDiv.appendChild(btnLoadFiles);
loadOptionsDiv.appendChild(btnLoadFolder);

loadContainer.appendChild(mainLoadBtn);
loadContainer.appendChild(loadOptionsDiv);

// Insert the load container next to the Play button
playButton.insertAdjacentElement("afterend", loadContainer);

// 4. UI Interaction Logic
mainLoadBtn.addEventListener("click", () => {
  mainLoadBtn.style.display = "none";
  loadOptionsDiv.style.display = "flex";
});

btnLoadFiles.addEventListener("click", () => loadFileInput.click());
btnLoadFolder.addEventListener("click", () => loadFolderInput.click());

// 5. Shared File Processing
const handleFileSelect = (e) => {
  const files = Array.from(e.target.files).filter(
    (f) =>
      f.name.toLowerCase().endsWith(".mid") ||
      f.name.toLowerCase().endsWith(".midi"),
  );

  if (files.length > 0) {
    const melodyObjects = files.map((file) => ({
      file: file, // Store the File object directly
      description: file.name.replace(/\.midi?$/i, ""),
      transpose: 0,
      layout: null,
    }));

    renderMelodyList(melodyObjects);
    // Hide the entire load container once files are loaded
    loadContainer.style.display = "none";
  } else {
    // If user cancelled or selected nothing valid, reset UI
    loadOptionsDiv.style.display = "none";
    mainLoadBtn.style.display = "block";
  }
};

loadFolderInput.addEventListener("change", handleFileSelect);
loadFileInput.addEventListener("change", handleFileSelect);

async function createMelodyList() {
  let melodies = [];
  try {
    const response = await fetch("melodies/melodies.txt");
    if (response.ok) {
      const text = await response.text();
      melodies = text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => {
          const [file, description, transpose, layout] = line.split("|");
          return {
            file,
            description,
            transpose: parseInt(transpose, 10) || 0,
            layout: layout ? layout.trim() : null,
          };
        });
    }
  } catch (e) {
    console.warn("Could not load default melodies list.");
  }

  if (melodies.length === 0) {
    melodiesContainer.style.display = "none";
    // If no default melodies, ensure main load button is visible
    loadContainer.style.display = "flex";
    mainLoadBtn.style.display = "block";
    loadOptionsDiv.style.display = "none";
    return;
  } else {
    // If default melodies exist, hide the manual load button
    loadContainer.style.display = "none";
  }

  renderMelodyList(melodies);
}

function renderMelodyList(melodies) {
  melodiesContainer.style.display = "block";
  melodiesContainer.innerHTML = ""; // Clear existing

  const ul = document.createElement("ul");

  melodies.forEach((melodyItem) => {
    const li = document.createElement("li");
    li.textContent = melodyItem.description;

    // Store metadata on the element for easy access
    li.dataset.transpose = melodyItem.transpose;
    if (melodyItem.layout) {
      li.dataset.layout = melodyItem.layout;
    }

    // For file objects, we can't use dataset for the file itself,
    // so we attach it to the DOM property.
    li._melodyFile = melodyItem.file;

    li.addEventListener("click", async () => {
      if (selectedMelodyFile === melodyItem.file) {
        // If the same melody is clicked again, deselect it
        selectedMelodyFile = null;
        melody = [];
        currentNoteIndex = 0;
        li.classList.remove("selected");
        stopMelodyDemo();

        // Disable transpose controls
        btnTransposeDown.disabled = true;
        btnTransposeUp.disabled = true;
        displayTranspose.textContent = "0";
        return;
      }

      selectedMelodyFile = melodyItem.file;

      // Enable transpose controls
      btnTransposeDown.disabled = false;
      btnTransposeUp.disabled = false;

      // Update selection visuals
      ul.querySelectorAll("li").forEach((item) =>
        item.classList.remove("selected"),
      );
      li.classList.add("selected");

      const layout = melodyItem.layout;

      // Only change layout if the melody explicitly defines one
      if (layout) {
        // Update the Radio Button UI to match the song's default
        const layoutRadio = document.querySelector(
          `input[name="layout"][value="${layout}"]`,
        );
        if (layoutRadio) layoutRadio.checked = true;

        // Rebuild piano if layout changed
        if (layout !== currentLayout) {
          clearPiano();
          buildPiano(allNotes, layout);
        }
      }

      // Initialize transpose from the song's default
      currentTranspose = melodyItem.transpose;
      displayTranspose.textContent =
        currentTranspose > 0 ? `+${currentTranspose}` : currentTranspose;

      await loadMelody(melodyItem.file, currentTranspose);
      playMelodyDemo();
    });
    ul.appendChild(li);
  });

  melodiesContainer.appendChild(ul);
}

async function loadMelody(melodySource, transpose = 0) {
  let midiData;

  if (typeof melodySource === "string") {
    // It's a path from melodies.txt
    const response = await fetch(`melodies/${melodySource}`);
    midiData = await response.arrayBuffer();
  } else if (melodySource instanceof File) {
    // It's a user-uploaded File object
    midiData = await melodySource.arrayBuffer();
  } else {
    console.error("Invalid melody source");
    return;
  }

  const midi = new Midi(midiData);

  midi.tracks.forEach((track) => {
    track.notes.forEach((note) => {
      const transposedMidi = note.midi + transpose;
      note.midi = transposedMidi;
      note.name = midiToNoteName(transposedMidi);
    });
  });

  const tracks = midi.tracks
    .filter((track) => track.notes.length > 0)
    .slice(0, 2);

  melody = tracks.flatMap((track, trackIndex) =>
    track.notes.map((note) => ({
      note: note.name,
      start: note.time,
      duration: note.duration,
      track: trackIndex,
    })),
  );
  melody.sort((a, b) => a.start - b.start);
}

function showMelodySelection() {
  overlay.style.display = "flex";
  selectedMelodyFile = null;
  melody = [];
  currentNoteIndex = 0;
  playbackState = "DEMO";

  // Deselect melody in UI
  melodiesContainer
    .querySelectorAll("li")
    .forEach((item) => item.classList.remove("selected"));

  // Reset controls
  btnTransposeDown.disabled = true;
  btnTransposeUp.disabled = true;
  displayTranspose.textContent = "0";
}

playButton.addEventListener("click", async () => {
  await initAudio();
  overlay.style.display = "none";
  stopMelodyDemo();
  if (selectedMelodyFile) {
    playbackState = "PLAY";
    // Reload one last time with current state to ensure audio context readiness didn't miss anything,
    // though loadMelody mostly handles data. Using currentTranspose from state.
    await loadMelody(selectedMelodyFile, currentTranspose);
    startPlayMode();
  } else {
    // No melody selected (Free play).
    playbackState = "PLAY";
    melody = [];
    currentNoteIndex = 0;
  }
});

createMelodyList();

// Pre-cache sounds and then build the scene
cacheAllNoteSounds().then((notes) => {
  allNotes = notes;
  initScene(notes);
});
// --- End of Overlay Setup ---

function getNoteFromObject(object) {
  return noteMap.get(object);
}

function pressKey(hitbox, pointerId, playAudio = true) {
  const renderKey = hitboxMap.get(hitbox);
  if (!keyState.has(hitbox) || keyState.get(hitbox).size === 0) {
    renderKey.position.y -= 0.2;
    keyState.set(hitbox, new Set());
  }
  keyState.get(hitbox).add(pointerId);
  activePointers.set(pointerId, hitbox);

  const note = getNoteFromObject(hitbox);
  if (note) {
    if (
      playbackState === "PLAY" &&
      melody.length > 0 &&
      currentNoteIndex < melody.length &&
      note === melody[currentNoteIndex].note
    ) {
      const playedNoteInfo = melody[currentNoteIndex];
      const renderKey = hitboxMap.get(hitbox);
      if (renderKey) {
        renderKey.material = pressedHighlightMaterial;
      }

      currentNoteIndex++;
      setTimeout(() => {
        unhighlightKey(note);
        advancePlayMode();
      }, playedNoteInfo.duration * 1000);
    }

    if (playAudio) {
      // If a note is already playing for this key, stop it to allow re-triggering.
      const oldGainNode = activeNoteGainNodes.get(hitbox);
      if (oldGainNode) {
        fadeOutAndDisconnect(oldGainNode, 0.05);
      }

      // Play the new note
      const noteGainNode = playNote(note);
      if (noteGainNode) {
        activeNoteGainNodes.set(hitbox, noteGainNode);
      }
    }
  }
}

function releaseKey(hitbox, pointerId, stopAudio = true) {
  const renderKey = hitboxMap.get(hitbox);
  if (keyState.has(hitbox)) {
    const pointers = keyState.get(hitbox);
    pointers.delete(pointerId);
    // Only release the key if it's the last pointer on it
    if (pointers.size === 0) {
      renderKey.position.y += 0.2;
      keyState.delete(hitbox);

      if (stopAudio) {
        const noteGainNode = activeNoteGainNodes.get(hitbox);
        if (noteGainNode) {
          activeNoteGainNodes.delete(hitbox);
          fadeOutAndDisconnect(noteGainNode, 1);
        }
      }
    }
  }
  activePointers.delete(pointerId);
}

function handlePointerDown(pointerId, clientX, clientY) {
  if (!isAudioReady()) return;

  const vec = new THREE.Vector2(
    (clientX / window.innerWidth) * 2 - 1,
    -(clientY / window.innerHeight) * 2 + 1,
  );
  raycaster.setFromCamera(vec, camera);
  const intersects = raycaster.intersectObjects(hitboxKeys);

  if (intersects.length > 0) {
    const hitbox = intersects[0].object;
    pressKey(hitbox, pointerId);
  }
}

function handlePointerUp(pointerId) {
  const key = activePointers.get(pointerId);
  if (key) {
    releaseKey(key, pointerId);
  }
}

function clearPiano() {
  while (pianoGroup.children.length > 0) {
    const child = pianoGroup.children[0];
    pianoGroup.remove(child);
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material.dispose();
      }
    }
  }

  hitboxMap.clear();
  noteMap.clear();
  noteToHitboxMap.clear();
  keyState.clear();
  activePointers.clear();
  activeNoteGainNodes.clear();
  originalMaterials.clear();
  hitboxKeys = [];
  cameraWaypoints = [];
  chunkYPositions = [];
}

function onWindowResize() {
  updateCamera();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updatePianoOrientation();
}

function updatePianoOrientation() {
  if (window.innerHeight > window.innerWidth) {
    // Portrait mode
    pianoGroup.position.x = -0.25;
    pianoGroup.position.z = 0;
    pianoGroup.rotation.y = -Math.PI / 2;
    camera.up.set(0, 0, -1);
  } else {
    // Landscape mode
    pianoGroup.position.x = 0;
    pianoGroup.position.z = 0.25;
    pianoGroup.rotation.y = 0;
    camera.up.set(0, 1, 0);
  }
  updateTargetHandles();
  camera.position.copy(targetCameraPosition);
  camera.lookAt(cameraLookAt);
}

function onPointerDown(event) {
  if (event.type === "mousedown") {
    handlePointerDown("mouse", event.clientX, event.clientY);
    touchStartX = event.clientX;
    touchStartY = event.clientY;
  } else {
    // Touch events
    event.preventDefault();
    for (const touch of event.changedTouches) {
      handlePointerDown(touch.identifier, touch.clientX, touch.clientY);
    }
    if (event.touches.length === 1) {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
    }
  }
}

function onPointerMove(event) {
  let clientX, clientY;
  if (event.type === "mousemove" && event.buttons === 1) {
    clientX = event.clientX;
    clientY = event.clientY;
  } else if (event.type === "touchmove") {
    if (event.touches.length > 1) {
      return;
    }
    event.preventDefault();
    clientX = event.changedTouches[0].clientX;
    clientY = event.changedTouches[0].clientY;
  } else {
    return;
  }

  const deltaX = clientX - touchStartX;
  const deltaY = clientY - touchStartY;
  const isPortrait = window.innerHeight > window.innerWidth;
  const previousWaypointIndex = currentWaypointIndex;

  if (isPortrait) {
    if (
      Math.abs(deltaX) > swipeThreshold &&
      Math.abs(deltaX) > Math.abs(deltaY)
    ) {
      if (deltaX < 0) {
        currentWaypointIndex = Math.max(0, currentWaypointIndex - 1);
      } else {
        currentWaypointIndex = Math.min(
          cameraWaypoints.length - 1,
          currentWaypointIndex + 1,
        );
      }
    }
  } else {
    if (
      Math.abs(deltaY) > swipeThreshold &&
      Math.abs(deltaY) > Math.abs(deltaX)
    ) {
      if (deltaY > 0) {
        currentWaypointIndex = Math.max(0, currentWaypointIndex - 1);
      } else {
        currentWaypointIndex = Math.min(
          cameraWaypoints.length - 1,
          currentWaypointIndex + 1,
        );
      }
    }
  }

  if (previousWaypointIndex != currentWaypointIndex) {
    touchStartX = clientX;
    touchStartY = clientY;
    updateTargetHandles();
  }
}

function onPointerUp(event) {
  if (event.type === "mouseup") {
    handlePointerUp("mouse");
  } else {
    // Touch events
    event.preventDefault();
    for (const touch of event.changedTouches) {
      handlePointerUp(touch.identifier);
    }
    if (event.touches.length === 1) {
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
    }
  }
}

function initScene(notes) {
  buildPiano(notes, "1");

  window.addEventListener("resize", onWindowResize, false);
  renderer.domElement.addEventListener("mousedown", onPointerDown, false);
  renderer.domElement.addEventListener("mouseup", onPointerUp, false);
  renderer.domElement.addEventListener("mousemove", onPointerMove, false);
  renderer.domElement.addEventListener("touchstart", onPointerDown, false);
  renderer.domElement.addEventListener("touchend", onPointerUp, false);
  renderer.domElement.addEventListener("touchmove", onPointerMove, false);
  renderer.domElement.addEventListener("touchcancel", onPointerUp, false);

  raycaster = new THREE.Raycaster();

  animate();
}

function buildPiano(notes, layout = "1") {
  currentLayout = layout;
  const whiteKeyLength = 2.5;
  const blackKeyLength = 1.25;
  const whiteKeyRenderGeometry = new RoundedBoxGeometry(
    1,
    1,
    whiteKeyLength,
    8,
    0.08,
  );
  const blackKeyRenderGeometry = new RoundedBoxGeometry(
    0.6,
    0.8,
    blackKeyLength,
    8,
    0.05,
  );
  const whiteKeyHitboxGeometry = new THREE.BoxGeometry(1, 1, whiteKeyLength);
  const blackKeyHitboxGeometry = new THREE.BoxGeometry(
    0.7,
    0.8,
    blackKeyLength,
  );

  hitboxMap = new Map(); // Maps hitbox to visible key
  noteMap = new Map(); // Maps hitbox to note
  noteToHitboxMap = new Map();
  keyState = new Map(); // Maps a hitbox mesh to a Set of pointerIds pressing it
  activePointers = new Map(); // Maps pointerId to the key it's pressing
  activeNoteGainNodes = new Map(); // Maps hitbox to its active GainNode
  hitboxKeys = [];

  const allNoteNames = Object.keys(notes);
  const whiteKeyXPositions = new Map();

  const chunkStartNotes1 = ["A0", "F1", "F3", "F5", "F7"];
  const chunkStartNotes2 = ["A0", "F2", "F4", "F6"];
  const chunkStartNotes = layout === "2" ? chunkStartNotes2 : chunkStartNotes1;
  const noteChunks = [];

  for (let i = 0; i < chunkStartNotes.length; i++) {
    const startNote = chunkStartNotes[i];
    const endNote =
      i + 1 < chunkStartNotes.length ? chunkStartNotes[i + 1] : "C8";
    const startIndex = allNoteNames.indexOf(startNote);
    let endIndex = allNoteNames.indexOf(endNote);

    if (i + 1 < chunkStartNotes.length) {
      endIndex--; // to not include the start of the next chunk
    }

    const noteChunk = allNoteNames.slice(startIndex, endIndex + 1);
    noteChunks.push(noteChunk);
  }

  cameraWaypoints = [];
  chunkYPositions = [];
  const numWaypoints = noteChunks.length - 1;
  for (let i = 0; i < numWaypoints; i++) {
    const waypointZ = (i + 0.5 - numWaypoints / 2) * whiteKeyLength;
    cameraWaypoints.push(waypointZ);
  }
  currentWaypointIndex = Math.floor((numWaypoints - 1) / 2);

  const maxWhiteKeys = Math.max(
    ...noteChunks.map((c) => c.filter((n) => !n.includes("#")).length),
  );

  noteChunks.forEach((chunk, chunkIndex) => {
    let whiteKeyRenderedCount = 0;
    const whiteKeysInChunk = chunk.filter((note) => !note.includes("#")).length;
    const baseZ = (chunkIndex - (noteChunks.length - 1) / 2) * whiteKeyLength;
    const baseY = (Math.ceil((noteChunks.length - 1) / 2) - chunkIndex) * 0.5;
    chunkYPositions.push(baseY);

    chunk.forEach((note) => {
      const isWhiteKey = !note.includes("#");
      const noteNameWithoutOctave = isWhiteKey
        ? note.slice(0, -1)
        : note.slice(0, -2);
      const octave = note.slice(-1);

      let renderKey, hitboxKey;

      if (isWhiteKey) {
        const renderMaterial = new THREE.MeshStandardMaterial({
          color: 0xfafafa,
          roughness: 0.2,
          metalness: 0.1,
        });
        renderKey = new THREE.Mesh(whiteKeyRenderGeometry, renderMaterial);

        const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
        hitboxKey = new THREE.Mesh(whiteKeyHitboxGeometry, hitboxMaterial);

        let xPos;
        if (chunkIndex === 0) {
          // First chunk, right-align
          const offset = maxWhiteKeys - whiteKeysInChunk;
          xPos = whiteKeyRenderedCount + offset - (maxWhiteKeys - 1) / 2;
        } else if (chunkIndex === noteChunks.length - 1) {
          // Last chunk, left-align
          const offset = 0;
          xPos = whiteKeyRenderedCount + offset - (maxWhiteKeys - 1) / 2;
        } else {
          // Center-align
          const offset = (maxWhiteKeys - whiteKeysInChunk) / 2;
          xPos = whiteKeyRenderedCount + offset - (maxWhiteKeys - 1) / 2;
        }
        renderKey.position.x = xPos;
        renderKey.position.y = baseY;
        renderKey.position.z = baseZ;

        hitboxKey.position.copy(renderKey.position);
        whiteKeyXPositions.set(note, xPos);
        whiteKeyRenderedCount++;
      } else {
        const rootNoteLetter = noteNameWithoutOctave.charAt(0);
        const precedingWhiteNoteName = rootNoteLetter + octave;

        const renderMaterial = new THREE.MeshStandardMaterial({
          color: 0x222222,
          roughness: 0.3,
          metalness: 0.1,
        });
        renderKey = new THREE.Mesh(blackKeyRenderGeometry, renderMaterial);

        const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
        hitboxKey = new THREE.Mesh(blackKeyHitboxGeometry, hitboxMaterial);

        const precedingWhiteKeyX = whiteKeyXPositions.get(
          precedingWhiteNoteName,
        );
        renderKey.position.x = precedingWhiteKeyX + 0.5;
        renderKey.position.y = baseY + 0.5;
        renderKey.position.z = baseZ - (whiteKeyLength - blackKeyLength) / 2;
        hitboxKey.position.copy(renderKey.position);
      }

      pianoGroup.add(renderKey);
      pianoGroup.add(hitboxKey);
      hitboxKeys.push(hitboxKey);
      hitboxMap.set(hitboxKey, renderKey);
      noteMap.set(hitboxKey, note);
      noteToHitboxMap.set(note, hitboxKey);
      originalMaterials.set(note, renderKey.material);
    });
  });

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  pianoGroup.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(3, 6, -3);
  pianoGroup.add(directionalLight);

  // Initial call to set correct orientation on load
  updatePianoOrientation();
}

let demoNoteTimeouts = [];

function stopMelodyDemo() {
  if (!isDemoPlaying) return;

  console.log("Stopping melody demo...");
  demoNoteTimeouts.forEach(clearTimeout);
  demoNoteTimeouts = [];
  isDemoPlaying = false;

  // Clear any active highlights and sound
  demoPlayingNotes.forEach((gainNode, note) => {
    const hitbox = noteToHitboxMap.get(note);
    unhighlightKey(note);
    if (hitbox) {
      releaseKey(hitbox, "demo", false);
    }
    fadeOutAndDisconnect(gainNode, 0.1);
  });
  demoPlayingNotes.clear();
}

function playMelodyDemo() {
  stopMelodyDemo();
  isDemoPlaying = true;

  // This is the DEMO player
  if (melody.length === 0) {
    isDemoPlaying = false;
    return;
  }

  playbackState = "DEMO";
  currentNoteIndex = 0;
  console.log("Starting melody demo...");

  function playNoteAtIndex(index) {
    const noteInfo = melody[index];

    // Play sound and highlight
    if (noteInfo.note !== "_") {
      const hitbox = noteToHitboxMap.get(noteInfo.note);
      if (hitbox) {
        pressKey(hitbox, "demo", false);
      }
      highlightKey(noteInfo.note, noteInfo.track);
      const gainNode = playNote(noteInfo.note);
      if (gainNode) {
        demoPlayingNotes.set(noteInfo.note, gainNode);
      }
      const releaseDelay = Math.max(0, noteInfo.duration * 1000 - 100); // Release key 100ms earlier

      const timeoutId = setTimeout(() => {
        unhighlightKey(noteInfo.note);
        if (gainNode) {
          fadeOutAndDisconnect(gainNode, 1);
          demoPlayingNotes.delete(noteInfo.note);
        }
        if (hitbox) {
          releaseKey(hitbox, "demo", false);
        }
      }, releaseDelay);
      demoNoteTimeouts.push(timeoutId);
    }

    // Schedule next note
    if (index + 1 < melody.length) {
      const nextNoteInfo = melody[index + 1];
      const delay = (nextNoteInfo.start - noteInfo.start) * 1000;

      const timeoutId = setTimeout(() => playNoteAtIndex(index + 1), delay);
      demoNoteTimeouts.push(timeoutId);
    } else {
      const timeoutId = setTimeout(() => {
        isDemoPlaying = false;

        demoNoteTimeouts = [];
      }, noteInfo.duration * 1000);

      demoNoteTimeouts.push(timeoutId);
    }
  }

  playNoteAtIndex(0);
}

function startPlayMode() {
  console.log("Starting play mode");
  isMelodyFinishing = false;
  currentNoteIndex = 0;
  if (melody.length > 0) {
    advancePlayMode();
  }
}

async function advancePlayMode() {
  if (currentNoteIndex >= melody.length) {
    if (isMelodyFinishing) {
      return;
    }
    isMelodyFinishing = true;
    console.log("Melody finished!");
    playbackState = "DEMO"; // Go to a neutral state
    await showCongratsEffect(scene);
    showMelodySelection();
    return;
  }

  const noteInfo = melody[currentNoteIndex];
  if (noteInfo.note === "_") {
    // Automatically skip rests
    currentNoteIndex++;
    setTimeout(advancePlayMode, noteInfo.duration * 1000);
  } else {
    highlightKey(noteInfo.note, noteInfo.track);
  }
}

function highlightKey(noteToHighlight, trackIndex) {
  for (const [hitbox, noteName] of noteMap.entries()) {
    if (noteName === noteToHighlight) {
      const renderKey = hitboxMap.get(hitbox);
      renderKey.material = highlightMaterials[trackIndex];
      break;
    }
  }
}

unhighlightKey = function (noteToUnhighlight) {
  const hitbox = noteToHitboxMap.get(noteToUnhighlight);
  if (hitbox) {
    const renderKey = hitboxMap.get(hitbox);
    if (renderKey) {
      renderKey.material = originalMaterials.get(noteToUnhighlight);
    }
  }
};

function animateToTarget() {
  camera.position.lerp(targetCameraPosition, 0.1);
}

function animate() {
  requestAnimationFrame(animate);
  animateToTarget();
  renderer.render(scene, camera);
}
