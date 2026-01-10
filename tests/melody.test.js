import { describe, it, expect } from "vitest";
import { calculateTempoAndQuantize } from "../src/melody.js";

describe("calculateTempoAndQuantize", () => {
  it("should return a fallback for an empty notes array", () => {
    const { melody, tempo } = calculateTempoAndQuantize([]);
    expect(melody).toBe("");
    expect(tempo).toBe(120);
  });

  it("should correctly quantize a simple melody at 120bpm", () => {
    const notes = [
      { note: "C4", startTime: 0, endTime: 500 },
      { note: "D4", startTime: 500, endTime: 1000 },
      { note: "E4", startTime: 1000, endTime: 1500 },
      { note: "F4", startTime: 1500, endTime: 2000 },
    ];
    const { melody, tempo } = calculateTempoAndQuantize(notes);
    expect(tempo).toBe(120);
    expect(melody).toBe("1C4,1D4,1E4,1F4,");
  });

  it("should handle a slightly faster melody", () => {
    const notes = [
      { note: "C4", startTime: 0, endTime: 400 },
      { note: "D4", startTime: 400, endTime: 800 },
      { note: "E4", startTime: 800, endTime: 1200 },
      { note: "F4", startTime: 1200, endTime: 1600 },
    ];
    const { melody, tempo } = calculateTempoAndQuantize(notes);
    expect(tempo).toBe(150);
    expect(melody).toBe("1C4,1D4,1E4,1F4,");
  });

  it("should handle a melody with mixed durations", () => {
    const notes = [
      { note: "C4", startTime: 0, endTime: 500 }, // half note
      { note: "D4", startTime: 500, endTime: 750 }, // quarter note
      { note: "E4", startTime: 750, endTime: 1000 }, // quarter note
      { note: "F4", startTime: 1000, endTime: 1500 }, // half note
    ];
    const { melody, tempo } = calculateTempoAndQuantize(notes);
    expect(tempo).toBe(120);
    expect(melody).toBe("1C4,0.50D4,0.50E4,1F4,");
  });

  it("should handle sharp notes", () => {
    const notes = [
      { note: "C#4", startTime: 0, endTime: 500 },
      { note: "D#4", startTime: 500, endTime: 1000 },
    ];
    const { melody, tempo } = calculateTempoAndQuantize(notes);
    expect(tempo).toBe(120);
    expect(melody).toBe("1c4,1d4,");
  });
});
