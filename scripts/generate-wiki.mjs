#!/usr/bin/env node

/**
 * Converts docs/api.json (TypeDoc output) into GitHub Wiki markdown pages.
 *
 * Usage: node scripts/generate-wiki.mjs <wiki-dir>
 *
 * Generated files are written into <wiki-dir>/api/. Any files outside that
 * directory are left untouched, so manual wiki pages are preserved.
 */

import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

const wikiDir = process.argv[2];
if (!wikiDir) {
  console.error("Usage: node scripts/generate-wiki.mjs <wiki-dir>");
  process.exit(1);
}

const api = JSON.parse(readFileSync("docs/api.json", "utf8"));

// --- helpers ----------------------------------------------------------------

function commentToMarkdown(comment) {
  if (!comment) return "";
  let md = "";
  if (comment.summary) {
    md += comment.summary.map(renderInlineContent).join("");
  }
  if (comment.blockTags) {
    for (const tag of comment.blockTags) {
      if (tag.tag === "@example") {
        md += "\n\n**Example**\n\n";
        md += tag.content.map(renderInlineContent).join("");
      } else if (tag.tag === "@returns") {
        md += "\n\n**Returns** ";
        md += tag.content.map(renderInlineContent).join("");
      } else if (tag.tag === "@param") {
        md += `\n- \`${tag.name}\` `;
        md += tag.content.map(renderInlineContent).join("");
      }
    }
  }
  return md;
}

function renderInlineContent(part) {
  if (part.kind === "text") return part.text;
  if (part.kind === "code") return part.text;
  if (part.kind === "inline-tag" && part.tag === "@link") {
    return `[${part.text}](API-${part.text})`;
  }
  return part.text || "";
}

function typeToString(type) {
  if (!type) return "unknown";
  switch (type.type) {
    case "intrinsic":
      return `\`${type.name}\``;
    case "literal":
      return `\`${JSON.stringify(type.value)}\``;
    case "union":
      return type.types.map(typeToString).join(" | ");
    case "array":
      return `${typeToString(type.elementType)}[]`;
    case "tuple":
      return `[${type.elements.map(typeToString).join(", ")}]`;
    case "reference":
      if (type.name) return `[${type.name}](API-${type.name})`;
      return "`unknown`";
    case "reflection": {
      const sig = type.declaration?.signatures?.[0];
      if (sig) return formatSignatureInline(sig);
      return "`object`";
    }
    default:
      return `\`${type.type}\``;
  }
}

function formatSignatureInline(sig) {
  const params = (sig.parameters || [])
    .map((p) => `${p.name}: ${typeToString(p.type)}`)
    .join(", ");
  const ret = sig.type ? typeToString(sig.type) : "`void`";
  return `\`(${params}) => ${ret}\``;
}

// --- page generators --------------------------------------------------------

function generateInterfacePage(node) {
  let md = `# ${node.name}\n\n`;
  md += commentToMarkdown(node.comment) + "\n\n";

  if (node.children?.length) {
    md += "## Properties\n\n";
    for (const prop of node.children) {
      md += `### \`${prop.name}\`\n\n`;
      md += `**Type:** ${typeToString(prop.type)}\n\n`;
      md += commentToMarkdown(prop.comment) + "\n\n";
    }
  }

  return md;
}

function generateTypeAliasPage(node) {
  let md = `# ${node.name}\n\n`;
  md += commentToMarkdown(node.comment) + "\n\n";
  md += `**Type:** ${typeToString(node.type)}\n`;
  return md;
}

function generateFunctionPage(node) {
  let md = `# ${node.name}()\n\n`;
  const sig = node.signatures?.[0];
  if (!sig) return md;

  md += commentToMarkdown(sig.comment) + "\n\n";

  // Signature
  const params = (sig.parameters || [])
    .map((p) => `${p.name}: ${typeToString(p.type)}`)
    .join(", ");
  const ret = sig.type ? typeToString(sig.type) : "`void`";
  md += "## Signature\n\n";
  md += `\`\`\`ts\n${node.name}(${params}): ${ret}\n\`\`\`\n\n`;

  // Parameters
  if (sig.parameters?.length) {
    md += "## Parameters\n\n";
    md += "| Name | Type | Description |\n";
    md += "|------|------|-------------|\n";
    for (const p of sig.parameters) {
      const desc = commentToMarkdown(p.comment).replace(/\n/g, " ").trim();
      md += `| \`${p.name}\` | ${typeToString(p.type)} | ${desc} |\n`;
    }
    md += "\n";
  }

  // Return type
  md += `**Returns:** ${ret}\n`;
  return md;
}

// --- main -------------------------------------------------------------------

const KIND_INTERFACE = 256;
const KIND_TYPE_ALIAS = 2097152;
const KIND_FUNCTION = 64;

const pages = [];

for (const child of api.children || []) {
  let content;
  let filename;

  switch (child.kind) {
    case KIND_INTERFACE:
      content = generateInterfacePage(child);
      filename = `API-${child.name}.md`;
      break;
    case KIND_TYPE_ALIAS:
      content = generateTypeAliasPage(child);
      filename = `API-${child.name}.md`;
      break;
    case KIND_FUNCTION:
      content = generateFunctionPage(child);
      filename = `API-${child.name}.md`;
      break;
    default:
      continue;
  }

  writeFileSync(join(wikiDir, filename), content);
  pages.push({ name: child.name, kind: child.kind, filename });
}

// Generate the _Sidebar.md for navigation
const interfaces = pages.filter((p) => p.kind === KIND_INTERFACE);
const types = pages.filter((p) => p.kind === KIND_TYPE_ALIAS);
const functions = pages.filter((p) => p.kind === KIND_FUNCTION);

let sidebar = "## Navigation\n\n";
sidebar += "- [Home](Home)\n\n";
sidebar += "## API Reference\n\n";

if (functions.length) {
  sidebar += "**Functions**\n\n";
  for (const f of functions) {
    sidebar += `- [${f.name}()](${f.filename.replace(".md", "")})\n`;
  }
  sidebar += "\n";
}

if (interfaces.length) {
  sidebar += "**Interfaces**\n\n";
  for (const i of interfaces) {
    sidebar += `- [${i.name}](${i.filename.replace(".md", "")})\n`;
  }
  sidebar += "\n";
}

if (types.length) {
  sidebar += "**Types**\n\n";
  for (const t of types) {
    sidebar += `- [${t.name}](${t.filename.replace(".md", "")})\n`;
  }
  sidebar += "\n";
}

writeFileSync(join(wikiDir, "_Sidebar.md"), sidebar);

// Generate Home.md only if it doesn't already exist (preserve manual edits)
const homePath = join(wikiDir, "Home.md");
if (!existsSync(homePath)) {
  let home = "# rae-noise\n\n";
  home += "WebGL-powered procedural noise library for real-time visual effects.\n\n";
  home += "## Quick Start\n\n";
  home += "```ts\n";
  home += 'import { createRenderer, defaultLayer } from "rae-noise";\n\n';
  home += 'const renderer = createRenderer(document.querySelector("canvas")!);\n';
  home += 'renderer.addLayer({ ...defaultLayer(), noiseType: "fbm", scale: 4 });\n';
  home += "```\n\n";
  home += "## API Reference\n\n";
  home += "See the sidebar for the full API documentation.\n";
  writeFileSync(homePath, home);
}

console.log(`Generated ${pages.length} API wiki pages + sidebar`);
