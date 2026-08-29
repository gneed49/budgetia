import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const sourceRoot = fileURLToPath(new URL(".", import.meta.url));

function tsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return tsxFiles(absolutePath);
    return entry.isFile() && entry.name.endsWith(".tsx") ? [absolutePath] : [];
  });
}

function attribute(openingElement, name) {
  return openingElement.attributes.properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.text === name,
  );
}

function explicitlyHidden(openingElement) {
  const accessible = attribute(openingElement, "accessible");
  return Boolean(
    accessible
      && accessible.initializer
      && ts.isJsxExpression(accessible.initializer)
      && accessible.initializer.expression?.kind === ts.SyntaxKind.FalseKeyword,
  );
}

function hasTextDescendant(node, sourceFile, root) {
  let found = false;

  function visit(child) {
    if (found) return;
    if (ts.isJsxElement(child)) {
      const tag = child.openingElement.tagName.getText(sourceFile);
      if (child !== root && tag === "Pressable") return;
      if (tag === "Text") {
        found = true;
        return;
      }
    }
    ts.forEachChild(child, visit);
  }

  ts.forEachChild(node, visit);
  return found;
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

  it("names and identifies every icon-only pressable or hides decorative backdrops", () => {
    const missingSemantics = [];

    for (const file of tsxFiles(sourceRoot)) {
      const source = readFileSync(file, "utf8");
      const sourceFile = ts.createSourceFile(
        file,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );

      function visit(node) {
        if (ts.isJsxElement(node) && node.openingElement.tagName.getText(sourceFile) === "Pressable") {
          const openingElement = node.openingElement;
          const hasAccessibleName = Boolean(
            attribute(openingElement, "accessibilityLabel")
              || attribute(openingElement, "accessibilityLabelledBy"),
          );
          const hasAccessibleRole = Boolean(attribute(openingElement, "accessibilityRole"));
          if (
            !hasTextDescendant(node, sourceFile, node)
            && (!hasAccessibleName || !hasAccessibleRole)
            && !explicitlyHidden(openingElement)
          ) {
            const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            missingSemantics.push(`${path.relative(sourceRoot, file)}:${line}`);
          }
        }
        ts.forEachChild(node, visit);
      }

      visit(sourceFile);
    }

    expect(missingSemantics).toEqual([]);
  });
});
