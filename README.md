# 3D Piano

This is a web-based 3D piano application. It features a responsive design, realistic audio sampling, and an interactive "follow-along" mode that helps users learn melodies loaded from MIDI files.

## Live Demo

[**Play the piano here!**](https://iliagrigorevdev.github.io/piano/)

## Features

- **3D Piano Model**: A fully interactive piano with 3D keys, rendered using Three.js.
- **Realistic Audio**: Uses the Web Audio API with SFZ-based sampling (Salamander Grand Piano) for high-quality sound.
- **MIDI Integration**: Loads melodies directly from MIDI files using `@tonejs/midi`.
- **Custom MIDI Support**: Ability to load a local folder of MIDI files directly in the browser if no default configuration is found.
- **Interactive Modes**:
  - **Demo Mode**: Preview melodies automatically with visual key highlights.
  - **Play Mode**: Learn a song by playing along. The game waits for you to hit the correct highlighted note before advancing.
- **Responsive Camera System**:
  - Automatically adjusts Field of View (FOV) for portrait and landscape orientations.
  - **Swipe Navigation**: The keyboard is divided into viewable "chunks." Swipe or drag to move the camera up and down the octaves.
  - **Layout Switching**: Manually toggle between different key layouts (Type 1 / Type 2) via the main menu to adjust camera focus points.
- **Transposition**: Adjust the pitch of any selected melody up or down by semitones directly from the UI.
- **Visual Effects**: Particle celebration effects upon completing a melody.
- **PWA Support**: Installable as a Progressive Web App.

## How to Play

### Basic Controls

- **Play Note**: Click or tap on a key.
- **Move Camera**: Click and drag (desktop) or swipe (mobile) horizontally (in portrait) or vertically (in landscape) to access different octaves of the piano.
- **Change Layout**: Use the "Layout" radio buttons in the main menu to switch between key grouping types.

### Selecting a Melody

1. Upon loading, you will see an overlay menu.
2. Click on a song title from the list to preview it in **Demo Mode**. The piano will play the song automatically, highlighting the keys.
3. **Transpose**: If a song is too high or low, use the **+** and **-** buttons above the song list to shift the pitch. The preview will update instantly.
4. Click the song again to stop the preview.

### Learning a Song (Play Mode)

1. Select a melody from the list.
2. Adjust the transposition if desired.
3. Click the **"Play"** button at the top of the overlay.
4. The overlay will disappear. The first note of the melody will light up (Blue for Right Hand, Purple for Left Hand).
5. Press the highlighted key to play the note. The system will wait for you.
6. Once the correct key is pressed, the guide advances to the next note.
7. Complete the song to trigger the victory effect!

### Loading Local MIDI Files

If the application cannot find the default melody list (or if you are running it locally without setting one up), a **"Load"** button will appear next to the Play button.

1. Click **"Load"**.
2. Select a local folder containing `.mid` or `.midi` files.
3. The application will generate a playlist from your files.

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
    Access the URL provided by the terminal (usually `http://localhost:5173/piano/`).

### Building for Production

To create a production build, run:

```bash
npm run build
```

This will create a `dist` folder with the bundled files, ready for deployment.

## Adding New Melodies

### Method 1: Configuration File (Default)

1. Place your `.mid` file in the `public/melodies/` directory.
2. Update `public/melodies/melodies.txt`.
3. Add a new line in the following format:
   `filename.mid|Display Title|TransposeValue|LayoutID`
   - **filename.mid**: The name of your MIDI file.
   - **Display Title**: The name shown in the UI.
   - **TransposeValue**: Integer to shift pitch (e.g., `0`, `12`, `-12`). This sets the _default_ transposition, but the user can still adjust it in the UI.
   - **LayoutID**: Usually `"1"` or `"2"` (defines how keys are grouped for the camera view).

### Method 2: Local Loading

If you delete or rename `melodies.txt`, the application will default to the "Load" button state, allowing you to drag and drop or select a folder of MIDI files from your computer to play instantly.

## Credits & Licenses

- **Audio Samples**: [Salamander Grand Piano V3](https://archive.org/details/SalamanderGrandPianoV3) by Alexander Holm, licensed under Creative Commons Attribution 3.0.
- **MIDI Parsing**: Powered by [@tonejs/midi](https://github.com/Tonejs/Midi).

## License

This project is licensed under the GPL-3.0 licence - see the [LICENSE](LICENSE) file for details.
