/**
 * TreeData — fetches and processes GGG skilltree-export JSON.
 * Nodes don't store x/y directly; positions are computed from
 * group center + orbit radius + orbit angle.
 */
const TreeData = (() => {

  const cache = {};

  const DEFAULT_ORBIT_RADII    = [0, 82, 162, 335, 493];
  const DEFAULT_SKILLS_PER_ORBIT = [1, 6, 12, 12, 40];

  // Candidate URLs tried in order until one succeeds
  function candidateUrls(targetVersion) {
    const isPoe2 = targetVersion?.startsWith('2');

    if (isPoe2) {
      return [
        'https://raw.githubusercontent.com/grindinggear/skilltree-export/master/data.json',
        'https://raw.githubusercontent.com/grindinggear/skilltree-export/2.0.0/data.json',
      ];
    }

    // PoE1 — derive semver from targetVersion ("3_26" → 3, 26)
    const parts = (targetVersion ?? '3_26').replace(/_/g, '.').split('.');
    const maj   = parseInt(parts[0]);
    const min   = parseInt(parts[1] ?? '26');

    // Only trust sane values; fall back to 3.26 otherwise
    const safeMaj = (Number.isFinite(maj) && maj >= 2 && maj <= 9) ? maj : 3;
    const safeMin = (Number.isFinite(min) && min >= 0)             ? min : 26;
    const ver = `${safeMaj}.${safeMin}.0`;

    return [
      `https://raw.githubusercontent.com/grindinggear/skilltree-export/${ver}/data.json`,
      `https://raw.githubusercontent.com/grindinggear/skilltree-export/master/data.json`,
    ];
  }

  async function load(targetVersion) {
    const key = targetVersion?.startsWith('2') ? 'poe2' : 'poe1';
    if (cache[key]) return cache[key];

    const urls = candidateUrls(targetVersion);
    let lastErr;

    for (const url of urls) {
      try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const raw = await resp.json();
        const data = process(raw);
        cache[key] = data;
        return data;
      } catch (e) {
        lastErr = new Error(`Tree data fetch failed — ${url} — ${e.message}`);
      }
    }

    throw lastErr;
  }

  function process(raw) {
    const orbitRadii     = raw.constants?.orbitRadii      ?? raw.orbitRadii      ?? DEFAULT_ORBIT_RADII;
    const skillsPerOrbit = raw.constants?.skillsPerOrbit  ?? raw.skillsPerOrbit  ?? DEFAULT_SKILLS_PER_ORBIT;

    const nodes = {};

    for (const [id, node] of Object.entries(raw.nodes ?? {})) {
      const group = raw.groups?.[node.group];
      if (!group) continue;

      const orbit      = node.orbit      ?? 0;
      const orbitIndex = node.orbitIndex ?? 0;
      const radius     = orbitRadii[orbit]     ?? 0;
      const count      = skillsPerOrbit[orbit] ?? 1;

      const angle = count > 1
        ? (2 * Math.PI * orbitIndex) / count - Math.PI / 2
        : -Math.PI / 2;

      nodes[id] = {
        ...node,
        x: group.x + radius * Math.cos(angle),
        y: group.y + radius * Math.sin(angle),
      };
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of Object.values(nodes)) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x > maxX) maxX = n.x;
      if (n.y > maxY) maxY = n.y;
    }

    return { nodes, bounds: { minX, minY, maxX, maxY } };
  }

  return { load };
})();
