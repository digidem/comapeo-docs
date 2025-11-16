import { describe, it, expect } from "vitest";
import {
  normalizeEmojiName,
  escapeForRegExp,
  buildInlineEmoji,
  applyEmojiMappings,
} from "./emojiMapping.js";

describe("emojiMapping", () => {
  describe("normalizeEmojiName", () => {
    it("should remove colons from emoji names", () => {
      expect(normalizeEmojiName(":smile:")).toBe("smile");
      expect(normalizeEmojiName(":heart:")).toBe("heart");
    });

    it("should trim whitespace", () => {
      expect(normalizeEmojiName("  smile  ")).toBe("smile");
      expect(normalizeEmojiName(":smile:  ")).toBe("smile");
    });

    it("should handle multiple colons", () => {
      expect(normalizeEmojiName(":smile::heart:")).toBe("smileheart");
    });

    it("should handle empty strings", () => {
      expect(normalizeEmojiName("")).toBe("");
      expect(normalizeEmojiName(":::")).toBe("");
    });

    it("should preserve valid characters", () => {
      expect(normalizeEmojiName(":smile_face:")).toBe("smile_face");
      expect(normalizeEmojiName(":100:")).toBe("100");
    });
  });

  describe("escapeForRegExp", () => {
    it("should escape special regex characters", () => {
      expect(escapeForRegExp(".")).toBe("\\.");
      expect(escapeForRegExp("*")).toBe("\\*");
      expect(escapeForRegExp("+")).toBe("\\+");
      expect(escapeForRegExp("?")).toBe("\\?");
      expect(escapeForRegExp("^")).toBe("\\^");
      expect(escapeForRegExp("$")).toBe("\\$");
    });

    it("should escape brackets and braces", () => {
      expect(escapeForRegExp("{")).toBe("\\{");
      expect(escapeForRegExp("}")).toBe("\\}");
      expect(escapeForRegExp("[")).toBe("\\[");
      expect(escapeForRegExp("]")).toBe("\\]");
      expect(escapeForRegExp("(")).toBe("\\(");
      expect(escapeForRegExp(")")).toBe("\\)");
    });

    it("should escape pipe and backslash", () => {
      expect(escapeForRegExp("|")).toBe("\\|");
      expect(escapeForRegExp("\\")).toBe("\\\\");
    });

    it("should handle strings with multiple special characters", () => {
      expect(escapeForRegExp("test.file[0]")).toBe("test\\.file\\[0\\]");
      expect(escapeForRegExp("(smile|heart)*+")).toBe(
        "\\(smile\\|heart\\)\\*\\+"
      );
    });

    it("should handle empty strings", () => {
      expect(escapeForRegExp("")).toBe("");
    });

    it("should not escape regular characters", () => {
      expect(escapeForRegExp("abc123")).toBe("abc123");
      expect(escapeForRegExp("smile_face")).toBe("smile_face");
    });
  });

  describe("buildInlineEmoji", () => {
    it("should build inline emoji HTML with correct src and alt", () => {
      const result = buildInlineEmoji("/images/emojis/smile.png", "smile");
      expect(result).toContain('src="/images/emojis/smile.png"');
      expect(result).toContain('alt="smile"');
    });

    it("should include className and inline styles", () => {
      const result = buildInlineEmoji("/images/emojis/smile.png", "smile");
      expect(result).toContain('className="emoji"');
      expect(result).toContain('display: "inline"');
      expect(result).toContain('height: "1.2em"');
      expect(result).toContain('width: "auto"');
      expect(result).toContain('verticalAlign: "text-bottom"');
      expect(result).toContain('margin: "0 0.1em"');
    });

    it("should handle different file paths", () => {
      const result = buildInlineEmoji("/custom/path/emoji.svg", "custom");
      expect(result).toContain('src="/custom/path/emoji.svg"');
      expect(result).toContain('alt="custom"');
    });

    it("should handle emojis with special characters in alt", () => {
      const result = buildInlineEmoji("/images/emojis/heart.png", "heart_eyes");
      expect(result).toContain('alt="heart_eyes"');
    });
  });

  describe("applyEmojiMappings", () => {
    it("should replace plain text emoji references", () => {
      const content = "Hello :smile: world";
      const emojiMap = new Map([[":smile:", "/images/emojis/smile.png"]]);

      const result = applyEmojiMappings(content, emojiMap);
      expect(result).toContain("/images/emojis/smile.png");
      expect(result).toContain('alt="smile"');
      expect(result).not.toContain(":smile:");
    });

    it("should replace [img] markdown patterns", () => {
      const content = "[img](#img) [smile]";
      const emojiMap = new Map([[":smile:", "/images/emojis/smile.png"]]);

      const result = applyEmojiMappings(content, emojiMap);
      expect(result).toContain("/images/emojis/smile.png");
      expect(result).not.toContain("[img](#img)");
    });

    it("should handle [img] with whitespace variations", () => {
      const content1 = "[img](#img) [ smile ]";
      const content2 = "[img] [smile]";
      const content3 = "[img](#img)  [  smile  ]";
      const emojiMap = new Map([[":smile:", "/images/emojis/smile.png"]]);

      expect(applyEmojiMappings(content1, emojiMap)).toContain(
        "/images/emojis/smile.png"
      );
      expect(applyEmojiMappings(content2, emojiMap)).toContain(
        "/images/emojis/smile.png"
      );
      expect(applyEmojiMappings(content3, emojiMap)).toContain(
        "/images/emojis/smile.png"
      );
    });

    it("should handle multiple emojis", () => {
      const content = "Hello :smile: and :heart: world";
      const emojiMap = new Map([
        [":smile:", "/images/emojis/smile.png"],
        [":heart:", "/images/emojis/heart.png"],
      ]);

      const result = applyEmojiMappings(content, emojiMap);
      expect(result).toContain("/images/emojis/smile.png");
      expect(result).toContain("/images/emojis/heart.png");
      expect(result).not.toContain(":smile:");
      expect(result).not.toContain(":heart:");
    });

    it("should skip invalid emoji names", () => {
      const content = "Test content";
      const emojiMap = new Map([
        ["invalid emoji!", "/images/emojis/invalid.png"], // Contains invalid characters
        [":valid:", "/images/emojis/valid.png"],
      ]);

      const result = applyEmojiMappings(content, emojiMap);
      // Invalid emoji should be skipped (contains special characters)
      expect(result).not.toContain("/images/emojis/invalid.png");
    });

    it("should handle empty emoji map", () => {
      const content = "Hello :smile: world";
      const emojiMap = new Map();

      const result = applyEmojiMappings(content, emojiMap);
      expect(result).toBe(content);
    });

    it("should handle empty content", () => {
      const content = "";
      const emojiMap = new Map([[":smile:", "/images/emojis/smile.png"]]);

      const result = applyEmojiMappings(content, emojiMap);
      expect(result).toBe("");
    });

    it("should skip emojis with special regex characters (dots)", () => {
      const content = "Test :smile.face: content";
      const emojiMap = new Map([[":smile.face:", "/images/emojis/smile.png"]]);

      const result = applyEmojiMappings(content, emojiMap);
      // Emoji with dots gets filtered out due to special character validation
      expect(result).toBe("Test :smile.face: content");
    });

    it("should replace all occurrences of the same emoji", () => {
      const content = ":smile: Hello :smile: World :smile:";
      const emojiMap = new Map([[":smile:", "/images/emojis/smile.png"]]);

      const result = applyEmojiMappings(content, emojiMap);
      const matches = result.match(/\/images\/emojis\/smile\.png/g);
      expect(matches).toHaveLength(3);
    });

    it("should handle [img] patterns with different formats", () => {
      const patterns = [
        "[img](#img) [smile]",
        "[img](#img)[smile]",
        "[img] [smile]",
        "[img][smile]",
      ];
      const emojiMap = new Map([[":smile:", "/images/emojis/smile.png"]]);

      for (const pattern of patterns) {
        const result = applyEmojiMappings(pattern, emojiMap);
        expect(result).toContain("/images/emojis/smile.png");
        expect(result).not.toContain("[img]");
      }
    });

    it("should preserve content without emojis", () => {
      const content = "This is a normal paragraph with no emojis.";
      const emojiMap = new Map([[":smile:", "/images/emojis/smile.png"]]);

      const result = applyEmojiMappings(content, emojiMap);
      expect(result).toBe(content);
    });

    it("should handle emojis with numbers", () => {
      const content = ":100: percent complete";
      const emojiMap = new Map([[":100:", "/images/emojis/100.png"]]);

      const result = applyEmojiMappings(content, emojiMap);
      expect(result).toContain("/images/emojis/100.png");
      expect(result).not.toContain(":100:");
    });

    it("should handle emojis with hyphens and underscores", () => {
      const content = ":smile-face: and :heart_eyes:";
      const emojiMap = new Map([
        [":smile-face:", "/images/emojis/smile.png"],
        [":heart_eyes:", "/images/emojis/heart.png"],
      ]);

      const result = applyEmojiMappings(content, emojiMap);
      expect(result).toContain("/images/emojis/smile.png");
      expect(result).toContain("/images/emojis/heart.png");
    });
  });
});
