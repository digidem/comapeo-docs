import { describe, it, expect } from "vitest";
import { splitLeadingEmoji } from "./admonitionEmoji";

describe("splitLeadingEmoji (Issue #119)", () => {
  it("splits simple emoji followed by title", () => {
    expect(splitLeadingEmoji("💡 Tip")).toEqual({
      emoji: "💡",
      remainder: "Tip",
    });
  });

  it("handles emoji-only titles", () => {
    expect(splitLeadingEmoji("👣")).toEqual({
      emoji: "👣",
      remainder: "",
    });
    expect(splitLeadingEmoji("✅")).toEqual({
      emoji: "✅",
      remainder: "",
    });
  });

  it("handles emoji with variation selector (\\uFE0F)", () => {
    expect(splitLeadingEmoji("⚠️ Warning")).toEqual({
      emoji: "⚠️",
      remainder: "Warning",
    });
    expect(splitLeadingEmoji("✔️ Done")).toEqual({
      emoji: "✔️",
      remainder: "Done",
    });
  });

  it("handles emoji with skin tone modifiers", () => {
    expect(splitLeadingEmoji("👉🏽 More")).toEqual({
      emoji: "👉🏽",
      remainder: "More",
    });
  });

  it("handles multi-character emojis (flags, ZWJ sequences)", () => {
    expect(splitLeadingEmoji("🇧🇷 Brazil")).toEqual({
      emoji: "🇧🇷",
      remainder: "Brazil",
    });
    expect(splitLeadingEmoji("👩‍💻 Dev setup")).toEqual({
      emoji: "👩‍💻",
      remainder: "Dev setup",
    });
    expect(splitLeadingEmoji("🏳️‍🌈 Rainbow")).toEqual({
      emoji: "🏳️‍🌈",
      remainder: "Rainbow",
    });
  });

  it("handles keycap emoji sequences", () => {
    expect(splitLeadingEmoji("1️⃣ Step one")).toEqual({
      emoji: "1️⃣",
      remainder: "Step one",
    });
    expect(splitLeadingEmoji("#️⃣ Hash tag")).toEqual({
      emoji: "#️⃣",
      remainder: "Hash tag",
    });
  });

  it("handles leading whitespace before emoji", () => {
    expect(splitLeadingEmoji(" 💡 Tip")).toEqual({
      emoji: "💡",
      remainder: "Tip",
    });
    expect(splitLeadingEmoji("  ⚠️ Warning")).toEqual({
      emoji: "⚠️",
      remainder: "Warning",
    });
  });

  it("handles consecutive leading emojis", () => {
    expect(splitLeadingEmoji("⚠️⚠️ Double warning")).toEqual({
      emoji: "⚠️⚠️",
      remainder: "Double warning",
    });
  });

  it("handles emoji immediately preceding text without space", () => {
    expect(splitLeadingEmoji("👉🏽More")).toEqual({
      emoji: "👉🏽",
      remainder: "More",
    });
  });

  it("handles common callouts found in docs", () => {
    expect(splitLeadingEmoji("🚧 Work in progress")).toEqual({
      emoji: "🚧",
      remainder: "Work in progress",
    });
    expect(splitLeadingEmoji("🔗 Go to Exchanging Observations")).toEqual({
      emoji: "🔗",
      remainder: "Go to Exchanging Observations",
    });
  });

  it("handles empty or blank titles gracefully", () => {
    expect(splitLeadingEmoji("")).toEqual({
      emoji: "",
      remainder: "",
    });
  });

  it("does NOT falsely match numbers, punctuation, copyright or trademark", () => {
    expect(splitLeadingEmoji("Warning")).toEqual({
      emoji: "",
      remainder: "Warning",
    });
    expect(splitLeadingEmoji("3 Steps")).toEqual({
      emoji: "",
      remainder: "3 Steps",
    });
    expect(splitLeadingEmoji("# Tag")).toEqual({
      emoji: "",
      remainder: "# Tag",
    });
    expect(splitLeadingEmoji("* Bullet")).toEqual({
      emoji: "",
      remainder: "* Bullet",
    });
    expect(splitLeadingEmoji("© 2026")).toEqual({
      emoji: "",
      remainder: "© 2026",
    });
    expect(splitLeadingEmoji("™ Trademark")).toEqual({
      emoji: "",
      remainder: "™ Trademark",
    });
    expect(splitLeadingEmoji("2026 Roadmap")).toEqual({
      emoji: "",
      remainder: "2026 Roadmap",
    });
  });
});
