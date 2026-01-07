import { describe, it, expect } from "vitest";
import { calculateTempoAndQuantize } from "../src/melody.js";

describe("calculateTempoAndQuantize", () => {
  it("should return a fallback for an empty notes array", () => {
    const { melody, tempo } = calculateTempoAndQuantize([]);
    expect(melody).toBe("");
    expect(tempo).toBe(120);
  });

  it("should correctly quantize a simple melody", () => {
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

  it("should handle rests in the melody", () => {
    const notes = [
      { note: "C4", startTime: 0, endTime: 500 },
      { note: "_", startTime: 500, endTime: 1000 },
      { note: "E4", startTime: 1000, endTime: 1500 },
    ];
    const { melody, tempo } = calculateTempoAndQuantize(notes);
    expect(tempo).toBe(120);
    expect(melody).toBe("1C4,1_,1E4,");
  });
});
