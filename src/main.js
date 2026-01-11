import "./style.css";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import {
  initAudio,
  cacheAllNoteSounds,
  playNote,
  isAudioReady,
  fadeOutAndDisconnect,
} from "./audio.js";
import { Midi } from "@tonejs/midi";

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
const highlightMaterial = new THREE.MeshStandardMaterial({
  color: 0x7777ff,
  roughness: 0.2,
  metalness: 0.1,
});
const pressedHighlightMaterial = new THREE.MeshStandardMaterial({
  color: 0xffae5e,
  roughness: 0.2,
  metalness: 0.1,
});
let playbackState = "DEMO"; // "DEMO" or "PLAY"
let isDemoPlaying = false;

// --- State variables to be initialized in buildAndInitScene ---
let keyState,
  activePointers,
  activeNoteGainNodes,
  hitboxKeys,
  raycaster,
  unhighlightKey;

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

// Initial camera setup
updateCamera();

// --- Overlay Setup ---
const overlay = document.querySelector("#overlay");
const playButton = document.querySelector("#play-button");
const loadButton = document.querySelector("#load-button");
const midiFileInput = document.querySelector("#midi-file-input");

playButton.addEventListener("click", async () => {
  await initAudio();
  overlay.style.display = "none";
  playbackState = "PLAY";
});

loadButton.addEventListener("click", () => {
  midiFileInput.click();
});

midiFileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  await initAudio();
  overlay.style.display = "none";

  const reader = new FileReader();
  reader.onload = (e) => {
    const midi = new Midi(e.target.result);
    const allNotes = midi.tracks.flatMap((track) => track.notes);
    allNotes.sort((a, b) => a.time - b.time);
    melody = allNotes.map((note) => ({
      note: note.name,
      start: note.time,
      duration: note.duration,
    }));
    playMelody();
  };
  reader.readAsArrayBuffer(file);
});

// Pre-cache sounds and then build the scene
cacheAllNoteSounds().then((notes) => {
  buildAndInitScene(notes);
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

function buildAndInitScene(notes) {
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
  const middleIndex = Math.floor(allNoteNames.length / 2);

  let whiteKeysInFirstHalf = 0;
  for (let i = 0; i < middleIndex; i++) {
    if (!allNoteNames[i].includes("#")) {
      whiteKeysInFirstHalf++;
    }
  }

  const totalWhiteKeys = allNoteNames.filter(
    (note) => !note.includes("#"),
  ).length;
  const whiteKeysInSecondHalf = totalWhiteKeys - whiteKeysInFirstHalf;

  let whiteKeyRenderedCountFirstHalf = 0;
  let whiteKeyRenderedCountSecondHalf = 0;
  const whiteKeyXPositions = new Map(); // Store the x-position of white keys to help with black key placement

  for (let i = 0; i < allNoteNames.length; i++) {
    const note = allNoteNames[i];
    const isWhiteKey = !note.includes("#");
    const noteNameWithoutOctave = isWhiteKey
      ? note.slice(0, -1)
      : note.slice(0, -2); // e.g., "C" from "C4", "C#" from "C#4"
    const octave = note.slice(-1);

    let renderKey, hitboxKey;

    if (isWhiteKey) {
      const renderMaterial = new THREE.MeshStandardMaterial({
        color: 0xfafafa,
        roughness: 0.2,
        metalness: 0.1,
      }); // White key
      renderKey = new THREE.Mesh(whiteKeyRenderGeometry, renderMaterial);

      const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
      hitboxKey = new THREE.Mesh(whiteKeyHitboxGeometry, hitboxMaterial);

      let xPos;
      if (i < middleIndex) {
        xPos = whiteKeyRenderedCountFirstHalf - (whiteKeysInFirstHalf - 1) / 2;
        renderKey.position.z = -whiteKeyLength / 2;
        renderKey.position.y = 0.5;
        whiteKeyRenderedCountFirstHalf++;
      } else {
        xPos =
          whiteKeyRenderedCountSecondHalf - (whiteKeysInSecondHalf - 1) / 2;
        renderKey.position.z = whiteKeyLength / 2;
        whiteKeyRenderedCountSecondHalf++;
      }
      renderKey.position.x = xPos;

      hitboxKey.position.copy(renderKey.position);

      whiteKeyXPositions.set(note, xPos); // Store x-position for this white key
    } else {
      // Black key
      const rootNoteLetter = noteNameWithoutOctave.charAt(0); // e.g., 'C' from 'C#'
      const precedingWhiteNoteName = rootNoteLetter + octave; // e.g., "F3" for "F#3"

      const renderMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.3,
        metalness: 0.1,
      }); // Black key
      renderKey = new THREE.Mesh(blackKeyRenderGeometry, renderMaterial);

      const hitboxMaterial = new THREE.MeshBasicMaterial({ visible: false });
      hitboxKey = new THREE.Mesh(blackKeyHitboxGeometry, hitboxMaterial);

      // Calculate black key position relative to its preceding white key
      const precedingWhiteKeyX = whiteKeyXPositions.get(precedingWhiteNoteName);
      renderKey.position.x = precedingWhiteKeyX + 0.5;

      if (i < middleIndex) {
        renderKey.position.y = 1;
        renderKey.position.z =
          -whiteKeyLength / 2 - (whiteKeyLength - blackKeyLength) / 2;
      } else {
        renderKey.position.y = 0.5;
        renderKey.position.z =
          whiteKeyLength / 2 - (whiteKeyLength - blackKeyLength) / 2;
      }

      hitboxKey.position.copy(renderKey.position);
    }
    pianoGroup.add(renderKey);
    pianoGroup.add(hitboxKey);
    hitboxKeys.push(hitboxKey);
    hitboxMap.set(hitboxKey, renderKey);
    noteMap.set(hitboxKey, note);
    noteToHitboxMap.set(note, hitboxKey);
    originalMaterials.set(note, renderKey.material);
  }

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  pianoGroup.add(ambientLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(3, 6, -3);
  pianoGroup.add(directionalLight);

  window.addEventListener("resize", onWindowResize, false);

  function onWindowResize() {
    updateCamera();
    renderer.setSize(window.innerWidth, window.innerHeight);
    updatePianoOrientation();
  }

  function updatePianoOrientation() {
    if (window.innerHeight > window.innerWidth) {
      // Portrait mode
      pianoGroup.position.x = -0.2;
      pianoGroup.position.z = 0;
      pianoGroup.rotation.y = -Math.PI / 2;
      camera.up.set(0, 0, -1);
      camera.position.set(-15, 30, 0);
      camera.lookAt(0, 0, 0);
    } else {
      // Landscape mode
      pianoGroup.position.x = 0;
      pianoGroup.position.z = 0.2;
      pianoGroup.rotation.y = 0;
      camera.up.set(0, 1, 0);
      camera.position.set(0, 30, 15);
      camera.lookAt(0, 0, 0);
    }
  }

  // Initial call to set correct orientation on load
  updatePianoOrientation();

  raycaster = new THREE.Raycaster();

  function onPointerDown(event) {
    if (event.type === "mousedown") {
      handlePointerDown("mouse", event.clientX, event.clientY);
    } else {
      // Touch events
      event.preventDefault();
      for (const touch of event.changedTouches) {
        handlePointerDown(touch.identifier, touch.clientX, touch.clientY);
      }
    }
  }

  function onPointerMove(event) {
    if (event.type === "touchmove") {
      event.preventDefault();
    }
    // All other move events are ignored to prevent dragging from playing notes.
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
    }
  }

  renderer.domElement.addEventListener("mousedown", onPointerDown, false);
  renderer.domElement.addEventListener("mouseup", onPointerUp, false);
  renderer.domElement.addEventListener("mousemove", onPointerMove, false);
  renderer.domElement.addEventListener("touchstart", onPointerDown, false);
  renderer.domElement.addEventListener("touchend", onPointerUp, false);
  renderer.domElement.addEventListener("touchmove", onPointerMove, false);
  renderer.domElement.addEventListener("touchcancel", onPointerUp, false);

  animate();
}

function playMelody() {
  if (isDemoPlaying) return;
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
      highlightKey(noteInfo.note);
      const gainNode = playNote(noteInfo.note);
      const releaseDelay = Math.max(0, noteInfo.duration * 1000 - 100); // Release key 100ms earlier
      setTimeout(() => {
        unhighlightKey(noteInfo.note);
        if (gainNode) fadeOutAndDisconnect(gainNode, 1);
        if (hitbox) {
          releaseKey(hitbox, "demo", false);
        }
      }, releaseDelay);
    }

    // Schedule next note
    if (index + 1 < melody.length) {
      const nextNoteInfo = melody[index + 1];
      const delay = (nextNoteInfo.start - noteInfo.start) * 1000;
      setTimeout(() => playNoteAtIndex(index + 1), delay);
    } else {
      // This is the last note, schedule transition to PLAY mode
      const pauseBeforePlayMode = 500; // ms
      setTimeout(
        () => {
          console.log("Demo finished. Starting play mode.");
          playbackState = "PLAY";
          isDemoPlaying = false;
          startPlayMode();
        },
        noteInfo.duration * 1000 + pauseBeforePlayMode,
      );
    }
  }

  playNoteAtIndex(0);
}

function startPlayMode() {
  console.log("Starting play mode");
  currentNoteIndex = 0;
  if (melody.length > 0) {
    advancePlayMode();
  }
}

function advancePlayMode() {
  if (currentNoteIndex >= melody.length) {
    console.log("Melody finished! Restarting demo.");
    playbackState = "DEMO";
    setTimeout(playMelody, 1000);
    return;
  }

  const noteInfo = melody[currentNoteIndex];
  if (noteInfo.note === "_") {
    // Automatically skip rests
    currentNoteIndex++;
    setTimeout(advancePlayMode, noteInfo.duration * 1000);
  } else {
    highlightKey(noteInfo.note);
  }
}

function highlightKey(noteToHighlight) {
  for (const [hitbox, noteName] of noteMap.entries()) {
    if (noteName === noteToHighlight) {
      const renderKey = hitboxMap.get(hitbox);
      renderKey.material = highlightMaterial;
      break;
    }
  }
}

unhighlightKey = function (noteToUnhighlight) {
  for (const [hitbox, noteName] of noteMap.entries()) {
    if (noteName === noteToUnhighlight) {
      const renderKey = hitboxMap.get(hitbox);
      renderKey.material = originalMaterials.get(noteName);
      break;
    }
  }
};

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
