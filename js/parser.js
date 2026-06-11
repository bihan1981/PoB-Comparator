/**
 * PoBParser — decodes a Path of Building export code into a structured object.
 * Supports PoE1 and PoE2. Export format: base64url → zlib → XML.
 */
const PoBParser = (() => {

  async function fromInput(input) {
    const trimmed = input.trim();
    if (/^https?:\/\//.test(trimmed)) return fromUrl(trimmed);
    return fromCode(trimmed);
  }

  async function fromUrl(url) {
    // pastebin.com/XXXX → pastebin.com/raw/XXXX
    const rawUrl = url.replace(/pastebin\.com\/(?!raw\/)([A-Za-z0-9]+)$/, 'pastebin.com/raw/$1');
    const resp = await fetch(rawUrl);
    if (!resp.ok) throw new Error(`Fetch failed: ${resp.status} ${resp.statusText}`);
    const code = await resp.text();
    return fromCode(code.trim());
  }

  function fromCode(code) {
    const xmlStr = decodeExport(code);
    return parseXML(xmlStr);
  }

  function decodeExport(code) {
    const b64 = code.replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const bytes = Uint8Array.from(raw, c => c.charCodeAt(0));
    return pako.inflate(bytes, { to: 'string' });
  }

  function parseXML(xmlStr) {
    const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');
    if (doc.querySelector('parsererror')) {
      throw new Error('XML parse failed — is this a valid PoB code?');
    }
    return {
      build: parseBuild(doc),
      skills: parseSkills(doc),
      items: parseItems(doc),
      tree: parseTree(doc),
    };
  }

  // ── Build metadata ─────────────────────────────────────────────────────────

  function parseBuild(doc) {
    const el = doc.querySelector('Build');
    return {
      targetVersion: el?.getAttribute('targetVersion') || '3_26',
      className: el?.getAttribute('className') || '',
      ascendClassName: el?.getAttribute('ascendClassName') || '',
      level: parseInt(el?.getAttribute('level') || '0'),
    };
  }

  // ── Skills ─────────────────────────────────────────────────────────────────

  function parseSkills(doc) {
    const groups = [];
    doc.querySelectorAll('Skills > Skill').forEach(el => {
      const gems = Array.from(el.querySelectorAll('Gem')).map(g => ({
        skillId: g.getAttribute('skillId') || '',
        name: g.getAttribute('nameSpec') || '',
        level: parseInt(g.getAttribute('level') || '1'),
        quality: parseInt(g.getAttribute('quality') || '0'),
        enabled: g.getAttribute('enabled') !== 'false',
        isSupport: gemIsSupport(g),
      }));
      if (!gems.length) return;

      const mainIdx = Math.max(0, parseInt(el.getAttribute('mainActiveSkill') || '1') - 1);
      const activeGems = gems.filter(g => !g.isSupport);
      const mainGem = activeGems[mainIdx] ?? activeGems[0] ?? gems[0];

      groups.push({
        slot: el.getAttribute('slot') || '',
        label: el.getAttribute('label') || '',
        enabled: el.getAttribute('enabled') !== 'false',
        gems,
        mainGem,
        linkCount: gems.length,
      });
    });
    return groups;
  }

  function gemIsSupport(el) {
    const id = el.getAttribute('skillId') || '';
    const name = el.getAttribute('nameSpec') || '';
    return id.toLowerCase().includes('support') ||
      name.toLowerCase().endsWith(' support');
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  function parseItems(doc) {
    const itemMap = {};
    doc.querySelectorAll('Items > Item').forEach(el => {
      const id = el.getAttribute('id');
      if (id) itemMap[id] = parseItemText(el.textContent.trim());
    });

    const slots = {};
    doc.querySelectorAll('Items > Slot').forEach(el => {
      const name = el.getAttribute('name');
      const itemId = el.getAttribute('itemId');
      if (name && itemId && itemId !== '0' && itemMap[itemId]) {
        slots[name] = { ...itemMap[itemId], slot: name };
      }
    });
    return slots;
  }

  function parseItemText(text) {
    // Strip PoB annotation tags like {crafted}, {range:0.5}, etc.
    const clean = text.replace(/\{[^}]*\}/g, '').trim();
    const sections = clean.split(/\r?\n--------\r?\n/);
    const headerLines = (sections[0] || '').split('\n').map(l => l.trim()).filter(Boolean);

    let i = 0;
    let rarity = 'NORMAL';
    if (headerLines[i]?.startsWith('Rarity:')) {
      rarity = headerLines[i].replace('Rarity:', '').trim().toUpperCase();
      i++;
    }
    const name = headerLines[i++] ?? '';
    const base = (rarity === 'RARE' || rarity === 'MAGIC' || rarity === 'UNIQUE')
      ? (headerLines[i++] ?? '') : '';

    // Collect stat affixes from all sections (skip header-like lines)
    const skipPat = /^(Requirements|Sockets|Item Level|Quality|Implicits|Place into|Right click|Corrupted|Mirrored):/i;
    const affixes = [];
    for (let s = 1; s < sections.length; s++) {
      for (const line of sections[s].split('\n').map(l => l.trim()).filter(Boolean)) {
        if (skipPat.test(line)) continue;
        if (/[+\-]?\d/.test(line)) affixes.push(line);
      }
    }

    return { rarity, name, base, affixes, rawText: text };
  }

  // ── Passive Tree ───────────────────────────────────────────────────────────

  function parseTree(doc) {
    const spec = doc.querySelector('Tree > Spec') ?? doc.querySelector('Spec');
    const raw = spec?.getAttribute('nodes') || '';
    const nodes = new Set(
      raw.split(',').map(n => parseInt(n.trim())).filter(n => Number.isFinite(n) && n > 0)
    );
    return { nodes };
  }

  return { fromInput };
})();
