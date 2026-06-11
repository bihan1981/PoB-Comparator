/**
 * TreeData — fetches and processes GGG skilltree-export JSON.
 * Nodes don't store x/y directly; positions are computed from
 * group center + orbit radius + orbit angle.
 */
const TreeData = (() => {

  const cache = {};

  // Fallback constants if not present in the JSON
  const DEFAULT_ORBIT_RADII   = [0, 82, 162, 335, 493];
  const DEFAULT_SKILLS_PER_ORBIT = [1, 6, 12, 12, 40];

  // Version string from PoB targetVersion (e.g. "3_26") → semver directory name
  function resolveVersion(targetVersion) {
    if (!targetVersion) return { game: 'poe1', dir: '3.26.0' };
    if (targetVersion.startsWith('2')) {
      // PoE2 — use latest known tag
      return { game: 'poe2', dir: '2.0.0' };
    }
    // PoE1: "3_26" → "3.26.0"
    const parts = targetVersion.replace(/_/g, '.').split('.');
    const maj = parts[0] || '3';
    const min = parts[1] || '26';
    return { game: 'poe1', dir: `${maj}.${min}.0` };
  }

  function getUrl(dir) {
    // Try jsdelivr CDN (better CORS than raw.githubusercontent)
    return `https://cdn.jsdelivr.net/gh/grindinggear/skilltree-export@master/${dir}/data.json`;
  }

  async function load(targetVersion) {
    const { game, dir } = resolveVersion(targetVersion);
    if (cache[game]) return cache[game];

    const url = getUrl(dir);
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`Tree data fetch failed (${resp.status}) — ${url}`);

    const raw = await resp.json();
    const processed = process(raw);
    cache[game] = processed;
    return processed;
  }

  function process(raw) {
    // Pull orbit constants from data if available
    const orbitRadii    = raw.constants?.orbitRadii    ?? raw.orbitRadii    ?? DEFAULT_ORBIT_RADII;
    const skillsPerOrbit = raw.constants?.skillsPerOrbit ?? raw.skillsPerOrbit ?? DEFAULT_SKILLS_PER_ORBIT;

    const nodes = {};

    for (const [id, node] of Object.entries(raw.nodes ?? {})) {
      const group = raw.groups?.[node.group];
      if (!group) continue;

      const orbit      = node.orbit      ?? 0;
      const orbitIndex = node.orbitIndex ?? 0;
      const radius     = orbitRadii[orbit]     ?? 0;
      const count      = skillsPerOrbit[orbit] ?? 1;

      // Angle: 0 = top (−π/2), clockwise
      const angle = count > 1
        ? (2 * Math.PI * orbitIndex) / count - Math.PI / 2
        : -Math.PI / 2;

      nodes[id] = {
        ...node,
        x: group.x + radius * Math.cos(angle),
        y: group.y + radius * Math.sin(angle),
      };
    }

    // Compute bounding box for quick fitView
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
