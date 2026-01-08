# 3D Piano

This is a web-based 3D piano application built with [Three.js](https://threejs.org/) and [Vite](https://vitejs.dev/). You can play it like a regular piano, or load a custom melody to follow along with.

## Live Demo

[**Play the piano here!**](https://iliagrigorevdev.github.io/piano/)

## Features

- **3D Piano Model**: A fully interactive piano with 3D keys.
- **Realistic Audio**: Uses the Web Audio API to generate realistic piano sounds.
- **Custom Melodies**: Load your own melodies via URL parameters.
- **Demo Mode**: The application can demonstrate a melody before you play.
- **Responsive Design**: The piano layout adapts to both landscape and portrait orientations.
- **Touch and Mouse Support**: Play the piano with your mouse or on a touch-screen device.

## How to Play

### Free Play

Click or tap on the keys to play the piano freely.

### Melody Mode

You can load a custom melody by providing it as a URL parameter. The format is as follows:

`?melody=[duration][note],[duration][note],...&tempo=[bpm]`

- `melody`: A comma-separated list of notes.
  - `duration`: The duration of the note in beats (e.g., `4`, `1`, `0.5`).
  - `note`: The note name (e.g., `C4`, `d5`). Lowercase letters (e.g., `a`, `c`, `d`) denote sharp notes (e.g., `A#`, `C#`, `D#`). Use `_` for rests. The available note range is from F3 to E5.
- `tempo`: The tempo of the melody in beats per minute (BPM). Defaults to 120.

**Example:**

`?melody=1C4,1D4,1E4,1F4,1G4,1A4,1B4,1C5&tempo=180`

This will play a C major scale at 180 BPM.

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
