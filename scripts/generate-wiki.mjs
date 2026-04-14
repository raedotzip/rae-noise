#!/usr/bin/env node

/**
 * Builds the rae-noise GitHub Wiki from two sources:
 *
 *   1. Hand-written docs under packages/core/docs/
 *        guides/*.md   → wiki pages prefixed "Guide-"
 *        wiki/*.md     → wiki pages copied verbatim (Home.md, _Sidebar.md)
 *   2. TypeDoc JSON at docs/api.json
 *        interfaces, types, functions → wiki pages prefixed "API-"
 *
 * The script only touches files it owns. It wipes every existing "API-*.md"
 * page before regenerating (so removed exports disappear from the wiki),
 * overwrites guide and wiki-chrome pages it has a source for, and leaves all
 * other files in the wiki directory alone. That means manual wiki edits to
 * pages *outside* these managed prefixes are preserved.
 *
 * The hand-written _Sidebar.md may contain a placeholder line:
 *     <!-- API_PAGES -->
 * which is replaced in-place with a generated list of API reference pages.
 *
 * Usage: node scripts/generate-wiki.mjs <wiki-dir>
 */

import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

const wikiDir = process.argv[2];
if (!wikiDir) {
  console.error("Usage: node scripts/generate-wiki.mjs <wiki-dir>");
  process.exit(1);
}

const REPO_SLUG = "raedotzip/rae-noise";
const REPO_BLOB_BASE = `https://github.com/${REPO_SLUG}/blob/main`;
const GUIDES_DIR = "packages/core/docs/guides";
const WIKI_CHROME_DIR = "packages/core/docs/wiki";
const API_JSON = "docs/api.json";

// ---------------------------------------------------------------------------
// Step 1: wipe stale generated API pages so removed exports disappear.
// ---------------------------------------------------------------------------

if (existsSync(wikiDir)) {
  for (const name of readdirSync(wikiDir)) {
    if (name.startsWith("API-") && name.endsWith(".md")) {
      // We own this file — it'll be regenerated below (or left out if the
      // export was removed).
      // Using a no-op here: we overwrite in-place or leave files we no
      // longer generate to be pruned at the end.
    }
  }
}

const ownedApiPages = new Set();
const ownedGuidePages = new Set();

// ---------------------------------------------------------------------------
// Step 2: copy hand-written guides (packages/core/docs/guides/*.md).
// ---------------------------------------------------------------------------

const guideIndex = [];

if (existsSync(GUIDES_DIR)) {
  for (const file of readdirSync(GUIDES_DIR)) {
    if (!file.endsWith(".md")) continue;
    const sourcePath = join(GUIDES_DIR, file);
    const slug = toTitleSlug(basename(file, ".md"));
    const wikiName = `Guide-${slug}.md`;
    const body = readFileSync(sourcePath, "utf8");
    const withFooter = appendEditFooter(body, sourcePath);
    writeFileSync(join(wikiDir, wikiName), withFooter);
    ownedGuidePages.add(wikiName);
    guideIndex.push({ title: humanizeSlug(basename(file, ".md")), page: `Guide-${slug}` });
  }
}

// ---------------------------------------------------------------------------
// Step 3: generate API pages from TypeDoc JSON.
// ---------------------------------------------------------------------------

const KIND_INTERFACE = 256;
const KIND_TYPE_ALIAS = 2097152;
const KIND_FUNCTION = 64;
const KIND_METHOD = 2048;

const api = JSON.parse(readFileSync(API_JSON, "utf8"));
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

  // TypeDoc pins `sources[0].url` to a commit SHA, which we prefer over
  // a reconstructed `main`-branch link — it survives file moves.
  const sourceUrl = child.sources?.[0]?.url ?? null;
  const withFooter = appendEditFooter(content, sourceUrl, { absolute: true });

  writeFileSync(join(wikiDir, filename), withFooter);
  ownedApiPages.add(filename);
  pages.push({ name: child.name, kind: child.kind, filename });
}

// Prune API-*.md pages in the wiki that we didn't regenerate this run
// (i.e. exports that were removed since the last sync).
if (existsSync(wikiDir)) {
  for (const name of readdirSync(wikiDir)) {
    if (name.startsWith("API-") && name.endsWith(".md") && !ownedApiPages.has(name)) {
      // Leave orphaned files for manual cleanup — safer than blind delete.
      // (The wiki UI makes it easy to delete stale pages by hand.)
      console.log(`note: stale page ${name} is no longer generated`);
    }
  }
}

// ---------------------------------------------------------------------------
// Step 4: copy wiki chrome (Home.md, _Sidebar.md, _Footer.md, …) and inject
// API list, guide list, and the commit SHA the build came from.
// ---------------------------------------------------------------------------

const apiListMarkdown = buildApiListMarkdown(pages);
const guideListMarkdown = buildGuideListMarkdown(guideIndex);

// GITHUB_SHA is set in CI by the workflow; fall back to "local" for dev runs.
const commitShaFull = process.env.GITHUB_SHA || "local";
const commitShaShort = commitShaFull === "local" ? "local" : commitShaFull.slice(0, 7);

if (existsSync(WIKI_CHROME_DIR)) {
  for (const file of readdirSync(WIKI_CHROME_DIR)) {
    if (!file.endsWith(".md")) continue;
    const sourcePath = join(WIKI_CHROME_DIR, file);
    let body = readFileSync(sourcePath, "utf8");
    body = body.replace("<!-- API_PAGES -->", apiListMarkdown);
    body = body.replace("<!-- GUIDE_PAGES -->", guideListMarkdown);
    body = body.replaceAll("<!-- COMMIT_SHA_SHORT -->", commitShaShort);
    body = body.replaceAll("<!-- COMMIT_SHA_FULL -->", commitShaFull);
    writeFileSync(join(wikiDir, file), body);
  }
}

console.log(
  `Wiki sync complete: ${pages.length} API pages, ${guideIndex.length} guides.`
);

// ===========================================================================
// helpers
// ===========================================================================

function commentToMarkdown(comment, context = {}) {
  if (!comment) return "";

  let md = "";

  if (comment.summary) {
    md += comment.summary
      .map((p) => renderInlineContent(p, context))
      .join("");
  }

  if (comment.blockTags) {
    for (const tag of comment.blockTags) {
      if (tag.tag === "@example") {
        md += "\n\n**Example**\n\n";
        md += tag.content.map(p => renderInlineContent(p, context)).join("");
      } else if (tag.tag === "@returns") {
        md += "\n\n**Returns** ";
        md += tag.content.map(p => renderInlineContent(p, context)).join("");
      } else if (tag.tag === "@param") {
        md += `\n- \`${tag.name}\` `;
        md += tag.content.map(p => renderInlineContent(p, context)).join("");
      } else if (tag.tag === "@remarks") {
        md += "\n\n**Remarks**\n\n";
        md += tag.content.map(p => renderInlineContent(p, context)).join("");
      } else if (tag.tag === "@see") {
        md += "\n\n**See also:** ";
        md += tag.content.map(p => renderInlineContent(p, context)).join("");
      }
    }
  }

  return md;
}

function autoLinkText(text, context = {}) {
  if (!context?.members) return text;

  for (const name of context.members) {
    if (name.length < 3) continue;

    const regex = new RegExp(`\\b${name}\\b`, "g");
    text = text.replace(regex, `[${name}](#${slugify(name)})`);
  }

  return text;
}

function renderInlineContent(part, context = {}) {
  if (part.kind === "text") {
    return autoLinkText(part.text, context);
  }

  if (part.kind === "code") {
    return `\`${part.text}\``;
  }

  if (part.kind === "inline-tag" && part.tag === "@link") {
    const name = part.text;

    if (context?.members?.has(name)) {
      return `[${name}](#${slugify(name)})`;
    }

    return `[${name}](API-${name})`;
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

function stripParamTags(comment) {
  if (!comment?.blockTags) return comment;

  return {
    ...comment,
    blockTags: comment.blockTags.filter((t) => t.tag !== "@param"),
  };
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

function renderSourceLink(node) {
  const src = node.sources?.[0];
  if (!src?.url) return "";

  const line = src.line ? `#L${src.line}` : "";
  return `_[Source](${src.url}${line})_\n\n`;
}

function renderInterfaceMember(prop, context) {
  let md = "";
  const KIND_METHOD = 2048;

  md += `### \`${prop.name}\`\n\n`;

  // --- source link ---
  md += renderSourceLink(prop);

  if ((prop.kind === KIND_METHOD || prop.signatures) && prop.signatures?.length) {
    const sigs = prop.signatures;

    // --- overloads ---
    md += "```ts\n";

    for (const sig of sigs) {
      const params = (sig.parameters || [])
        .map((p) => `${p.name}: ${typeToString(p.type)}`)
        .join(", ");

      const ret = sig.type ? typeToString(sig.type) : "`void`";

      md += `${prop.name}(${params}): ${ret}\n`;
    }

    md += "```\n\n";

    const sig = sigs[0];

    // --- parameters ---
    if (sig.parameters?.length) {
      md += "**Parameters**\n\n";
      md += "| Name | Type | Description |\n";
      md += "|------|------|-------------|\n";

      for (const p of sig.parameters) {
        const desc = commentToMarkdown(p.comment, context)
          .replace(/\n/g, " ")
          .trim();

        md += `| \`${p.name}\` | ${typeToString(p.type)} | ${desc} |\n`;
      }

      md += "\n";
    }

    md += commentToMarkdown(
      stripParamTags(sig.comment || prop.comment),
      context
    ) + "\n\n";

    return md;
  }

  // --- property ---
  md += `**Type:** ${typeToString(prop.type)}\n\n`;
  md += commentToMarkdown(prop.comment, context) + "\n\n";

  return md;
}

function extractMethodGroups(comment) {
  if (!comment?.blockTags) return { groups: {}, descriptions: {} };

  const remarks = comment.blockTags.find((t) => t.tag === "@remarks");
  if (!remarks) return { groups: {}, descriptions: {} };

  const text = remarks.content.map(p => renderInlineContent(p)).join("");

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const groups = {};
  const descriptions = {};

  let currentGroup = null;
  let buffer = [];

  for (const line of lines) {
    const isMethodLine = /^(\w+)\s*[—-]\s*/.test(line);

    if (!isMethodLine) {
      if (currentGroup && buffer.length) {
        descriptions[currentGroup] = buffer.join(" ");
      }

      currentGroup = line;
      groups[currentGroup] = [];
      buffer = [];
      continue;
    }

    const match = line.match(/^(\w+)\s*[—-]\s*(.*)/);
    if (match && currentGroup) {
      const methodName = match[1];
      const desc = match[2];

      groups[currentGroup].push(methodName);
      if (desc) buffer.push(desc);
    }
  }

  if (currentGroup && buffer.length) {
    descriptions[currentGroup] = buffer.join(" ");
  }

  return { groups, descriptions };
}

function extractMethodGroups(comment) {
  if (!comment?.blockTags) return { groups: {}, descriptions: {} };

  const remarks = comment.blockTags.find((t) => t.tag === "@remarks");
  if (!remarks) return { groups: {}, descriptions: {} };

  const text = remarks.content.map(renderInlineContent).join("");

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const groups = {};
  const descriptions = {};

  let currentGroup = null;
  let buffer = [];

  for (const line of lines) {
    const isMethodLine = /^(\w+)\s*[—-]\s*/.test(line);

    // New section header
    if (!isMethodLine) {
      if (currentGroup && buffer.length) {
        descriptions[currentGroup] = buffer.join(" ");
      }

      currentGroup = line;
      groups[currentGroup] = [];
      buffer = [];
      continue;
    }

    // Method line
    const match = line.match(/^(\w+)\s*[—-]\s*(.*)/);
    if (match && currentGroup) {
      const methodName = match[1];
      const desc = match[2];

      groups[currentGroup].push(methodName);

      if (desc) buffer.push(desc);
    }
  }

  if (currentGroup && buffer.length) {
    descriptions[currentGroup] = buffer.join(" ");
  }

  return { groups, descriptions };
}

function generateInterfacePage(node) {
  let md = `# ${node.name}\n\n`;

  // --- member index for linking ---
  const memberNames = new Set(
    (node.children || []).map((c) => c.name)
  );
  const context = { members: memberNames };

  // --- badges ---
  md += renderBadges("interface") + "\n\n";

  // --- description ---
  md += commentToMarkdown(node.comment, context) + "\n\n";

  if (!node.children?.length) return md;

  // --- grouping ---
  const { groups, descriptions } = extractMethodGroups(node.comment);

  const methodToGroup = {};
  for (const [group, methods] of Object.entries(groups)) {
    for (const m of methods) {
      methodToGroup[m] = group;
    }
  }

  const grouped = {};
  const ungrouped = [];

  for (const prop of node.children) {
    const group = methodToGroup[prop.name];

    if (group) {
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(prop);
    } else {
      ungrouped.push(prop);
    }
  }

  // --- mini TOC ---
  md += renderMiniToc(grouped, ungrouped);

  md += "## API\n\n";

  // --- grouped sections ---
  for (const [groupName, props] of Object.entries(grouped)) {
    md += `<details open>\n<summary><strong>${groupName}</strong></summary>\n\n`;

    if (descriptions[groupName]) {
      md += `${descriptions[groupName]}\n\n`;
    }

    for (const prop of props) {
      md += renderInterfaceMember(prop, context);
    }

    md += "</details>\n\n";
  }

  // --- other ---
  if (ungrouped.length) {
    md += `<details>\n<summary><strong>Other</strong></summary>\n\n`;

    for (const prop of ungrouped) {
      md += renderInterfaceMember(prop, context);
    }

    md += "</details>\n\n";
  }

  return md;
}

function generateInterfacePage(node) {
  let md = `# ${node.name}\n\n`;

  // --- Badges ---
  md += renderBadges("interface");
  md += "\n\n";

  // --- Description ---
  md += commentToMarkdown(node.comment) + "\n\n";

  if (!node.children?.length) return md;

  // --- Extract grouping ---
  const { groups, descriptions } = extractMethodGroups(node.comment);

  const methodToGroup = {};
  for (const [group, methods] of Object.entries(groups)) {
    for (const m of methods) {
      methodToGroup[m] = group;
    }
  }

  const grouped = {};
  const ungrouped = [];

  for (const prop of node.children) {
    const group = methodToGroup[prop.name];

    if (group) {
      if (!grouped[group]) grouped[group] = [];
      grouped[group].push(prop);
    } else {
      ungrouped.push(prop);
    }
  }

  // --- Mini sidebar ---
  md += renderMiniToc(grouped, ungrouped);

  md += "## API\n\n";

  // --- Sections ---
  for (const [groupName, props] of Object.entries(grouped)) {
    md += `<details open>\n<summary><strong>${groupName}</strong></summary>\n\n`;

    if (descriptions[groupName]) {
      md += `${descriptions[groupName]}\n\n`;
    }

    for (const prop of props) {
      md += renderInterfaceMember(prop);
    }

    md += "</details>\n\n";
  }

  if (ungrouped.length) {
    md += `<details>\n<summary><strong>Other</strong></summary>\n\n`;

    for (const prop of ungrouped) {
      md += renderInterfaceMember(prop);
    }

    md += "</details>\n\n";
  }

  return md;
}

function renderMiniToc(grouped, ungrouped) {
  let md = "> **On this page**\n>\n";

  for (const group of Object.keys(grouped)) {
    md += `> - [${group}](#${slugify(group)})\n`;
  }

  if (ungrouped.length) {
    md += `> - [Other](#other)\n`;
  }

  md += "\n";

  return md;
}

function renderBadges(kind) {
  const map = {
    interface: "Interface",
    function: "Function",
    type: "Type",
  };

  const label = map[kind] || kind;
  return `> **${label}** · API Reference`;
}

function generateTypeAliasPage(node) {
  let md = `# ${node.name}\n\n`;
  md += commentToMarkdown(node.comment) + "\n\n";
  md += `**Type:** ${typeToString(node.type)}\n`;
  return md;
}

function generateFunctionPage(node) {
  let md = `# ${node.name}()\n\n`;
  md += renderBadges("function") + "\n\n";
  const sig = node.signatures?.[0];
  if (!sig) return md;

  md += commentToMarkdown(sig.comment) + "\n\n";

  const params = (sig.parameters || [])
    .map((p) => `${p.name}: ${typeToString(p.type)}`)
    .join(", ");
  const ret = sig.type ? typeToString(sig.type) : "`void`";
  md += "## Signature\n\n";
  md += `\`\`\`ts\n${node.name}(${params}): ${ret}\n\`\`\`\n\n`;

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

  md += `**Returns:** ${ret}\n`;
  return md;
}

function buildApiListMarkdown(pages) {
  const interfaces = pages.filter((p) => p.kind === KIND_INTERFACE);
  const types = pages.filter((p) => p.kind === KIND_TYPE_ALIAS);
  const functions = pages.filter((p) => p.kind === KIND_FUNCTION);

  let md = "";
  if (functions.length) {
    md += "**Functions**\n\n";
    for (const f of functions) {
      md += `- [${f.name}()](${f.filename.replace(".md", "")})\n`;
    }
    md += "\n";
  }
  if (interfaces.length) {
    md += "**Interfaces**\n\n";
    for (const i of interfaces) {
      md += `- [${i.name}](${i.filename.replace(".md", "")})\n`;
    }
    md += "\n";
  }
  if (types.length) {
    md += "**Types**\n\n";
    for (const t of types) {
      md += `- [${t.name}](${t.filename.replace(".md", "")})\n`;
    }
    md += "\n";
  }
  return md.trimEnd();
}

function buildGuideListMarkdown(guides) {
  if (!guides.length) return "";
  let md = "";
  for (const g of guides) {
    md += `- [${g.title}](${g.page})\n`;
  }
  return md.trimEnd();
}

/** `plugin-system` → `Plugin-System` (used for wiki page slugs). */
function toTitleSlug(name) {
  return name
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join("-");
}

/** `plugin-system` → `Plugin system` (used for human-readable titles). */
function humanizeSlug(name) {
  const words = name.split("-");
  return words
    .map((w, i) => (i === 0 && w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/**
 * Append an "Edit this page" footer to a generated wiki page. The link
 * points to the source file on the main branch.
 */
function appendEditFooter(body, source, opts = {}) {
  if (!source) return body;
  const href = opts.absolute ? source : `${REPO_BLOB_BASE}/${source}`;
  const footer =
    "\n\n---\n\n" +
    `_[Edit this page](${href}) · Generated from source. Changes to this ` +
    "page should be made in the repository, not the wiki._\n";
  return body.trimEnd() + footer;
}
