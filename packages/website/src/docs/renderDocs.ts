interface DocItem {
  name: string;
  comment?: { summary?: string };
  children?: DocItem[];
}

export async function loadDocs() {
  const res = await fetch("/docs/api.json");
  const docs: DocItem = await res.json();

  renderDocs(docs);
}

function renderDocs(api: DocItem) {
  const nav = document.getElementById("docs-nav");
  if (!nav) return;

  for (const item of api.children ?? []) {
    const link = document.createElement("a");
    link.textContent = item.name;
    link.onclick = () => showDoc(item);
    nav.appendChild(link);
  }
}

function showDoc(item: DocItem) {
  const content = document.getElementById("docs-content");
  if (!content) return;

  content.innerHTML = `
    <h1>${item.name}</h1>
    <p>${item.comment?.summary ?? ""}</p>
  `;
}
