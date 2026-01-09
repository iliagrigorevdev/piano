# 3D Piano

This is a web-based 3D piano application built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). You can play it like a regular piano, or load a custom melody to follow along with.

## Live Demo

[**Play the piano here!**](https://iliagrigorevdev.github.io/piano/)

## Features

- **3D Piano Model**: A fully interactive piano with 3D keys.
- **Realistic Audio**: Uses the Web Audio API to generate realistic piano sounds.
- **Multiple Play Modes**:
  - **Free Play**: Play the piano without any constraints.
  - **Melody Mode**: Load a melody via URL and play along with visual cues.
  - **Recording Mode**: Record your own creations and share them with a unique link.
- **Responsive Design**: The piano layout adapts to both landscape and portrait orientations.
- **Touch and Mouse Support**: Play the piano with your mouse or on a touch-screen device.

## How to Play

### Mode Switching

To switch between **Free Play**, **Melody Mode**, and **Recording Mode**, press the following keys simultaneously: `F1`, `E3`, `F3`, and `E5`.

### Free Play

Click or tap on the keys to play the piano freely.

### Melody Mode

You can load a custom melody by providing it as a URL parameter. The format is as follows:

`?melody=[duration][note],[duration][note],...&tempo=[bpm]`

- `melody`: A comma-separated list of notes.
  - `duration`: The duration of the note in beats (e.g., `4`, `1`, `0.5`).
  - `note`: The note name (e.g., `C4`, `d5`). Lowercase letters (e.g., `a`, `c`, `d`) denote sharp notes (e.g., `A#`, `C#`, `D#`). Use `_` for rests. The available note range is from F1 to E5.
- `tempo`: The tempo of the melody in beats per minute (BPM). Defaults to 120.

**Example:**

`?melody=1C4,1D4,1E4,1F4,1G4,1A4,1B4,1C5&tempo=180`

This will play a C major scale at 180 BPM.

### Recording Mode

1.  Switch to Recording Mode using the key combination mentioned above.
2.  Start playing. The recording will begin automatically.
3.  To stop, wait for 2 seconds of silence.
4.  A share button will appear, allowing you to get a unique URL for your recorded melody.

## Development

To run the project locally, you'll need to have [Node.js](https://nodejs.org/) installed.

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/iliagrigorevdev.github.io/piano.git
    cd piano
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Start the development server:**

    ```bash
    npm run dev
    ```

4.  **Open the project in your browser:**
    [http://localhost:5173/piano/](http://localhost:5173/piano/) (or whatever address the development server provides).

### Building for Production

To create a production build, run:

```bash
npm run build
```

This will create a `dist` folder with the bundled files, ready for deployment.

## Sounds

The piano sounds are from the Salamander Grand Piano V3 sample library by Alexander Holm, licensed under Creative Commons Attribution 3.0.

You can find more information here: [https://archive.org/details/SalamanderGrandPianoV3](https://archive.org/details/SalamanderGrandPianoV3)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
