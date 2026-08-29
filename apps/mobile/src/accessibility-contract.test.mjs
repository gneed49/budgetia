import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL(".", import.meta.url));

function tsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [absolutePath] : [];
  });
}

describe("accessibility contracts", () => {
  it("gives every text input an explicit accessible name", () => {
    const missingLabels = [];

    for (const file of tsxFiles(sourceRoot)) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/<TextInput\b[\s\S]*?\/>/g)) {
        if (!match[0].includes("accessibilityLabel=")) {
          const line = source.slice(0, match.index).split("\n").length;
          missingLabels.push(`${path.relative(sourceRoot, file)}:${line}`);
        }
      }
    }

    expect(missingLabels).toEqual([]);
  });

  it("announces shared error banners immediately", () => {
    const feedbackSource = readFileSync(
      path.join(sourceRoot, "components", "Feedback.tsx"),
      "utf8",
    );

    expect(feedbackSource).toContain('accessibilityRole="alert"');
    expect(feedbackSource).toContain('accessibilityLiveRegion="assertive"');
  });
});
