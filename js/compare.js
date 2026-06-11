/**
 * PoBCompare — produces a structured diff between two parsed PoB builds.
 */
const PoBCompare = (() => {

  const SLOT_ORDER = [
    'Weapon 1', 'Weapon 2', 'Helmet', 'Body Armour',
    'Gloves', 'Boots', 'Amulet', 'Ring 1', 'Ring 2', 'Belt',
    'Flask 1', 'Flask 2', 'Flask 3', 'Flask 4', 'Flask 5',
  ];

  function compare(master, mine) {
    return {
      build: { master: master.build, mine: mine.build },
      skills: compareSkills(master.skills, mine.skills),
      items: compareItems(master.items, mine.items),
      tree: compareTree(master.tree, mine.tree),
    };
  }

  // ── Skills ─────────────────────────────────────────────────────────────────

  function compareSkills(masterGroups, mineGroups) {
    const results = [];
    const usedMine = new Set();

    for (const ms of masterGroups) {
      if (!ms.mainGem || !ms.enabled) continue;

      // Match by main gem name; prefer higher link count when multiple candidates
      let best = null, bestIdx = -1;
      mineGroups.forEach((mg, i) => {
        if (usedMine.has(i) || !mg.mainGem) return;
        if (mg.mainGem.name === ms.mainGem.name) {
          if (!best || mg.linkCount > best.linkCount) { best = mg; bestIdx = i; }
        }
      });

      if (best) {
        usedMine.add(bestIdx);
        const diff = gemDiff(ms, best);
        results.push({
          type: 'matched',
          masterSkill: ms,
          mineSkill: best,
          diff,
          priority: skillPriority(ms, diff),
        });
      } else {
        results.push({
          type: 'master-only',
          masterSkill: ms,
          mineSkill: null,
          diff: { missing: ms.gems.filter(g => !g.isSupport ? false : true).map(g => g.name), extra: [] },
          priority: 'critical',
        });
      }
    }

    // Mine-only skill groups
    mineGroups.forEach((mg, i) => {
      if (!usedMine.has(i) && mg.mainGem && mg.enabled) {
        results.push({
          type: 'mine-only',
          masterSkill: null,
          mineSkill: mg,
          diff: { missing: [], extra: [] },
          priority: 'info',
        });
      }
    });

    return results;
  }

  function gemDiff(masterSkill, mineSkill) {
    const masterNames = masterSkill.gems.map(g => g.name);
    const mineNames = mineSkill.gems.map(g => g.name);
    return {
      missing: masterNames.filter(n => !mineNames.includes(n)),
      extra: mineNames.filter(n => !masterNames.includes(n)),
      masterLinkCount: masterSkill.linkCount,
      mineLinkCount: mineSkill.linkCount,
    };
  }

  function skillPriority(masterSkill, diff) {
    // 6L not complete and master has 6L
    if (masterSkill.linkCount >= 6 && diff.mineLinkCount < 6) return 'high';
    if (diff.missing.length >= 2) return 'high';
    if (diff.missing.length === 1) return 'medium';
    if (diff.extra.length > 0) return 'low';
    return 'ok';
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  function compareItems(masterItems, mineItems) {
    const results = [];
    const allSlots = new Set([...Object.keys(masterItems), ...Object.keys(mineItems)]);
    const ordered = SLOT_ORDER.filter(s => allSlots.has(s));
    // Append any slots not in the predefined order
    for (const s of allSlots) {
      if (!ordered.includes(s)) ordered.push(s);
    }

    for (const slot of ordered) {
      const master = masterItems[slot];
      const mine = mineItems[slot];
      if (!master && !mine) continue;
      results.push(classifyItem(slot, master, mine));
    }
    return results;
  }

  function classifyItem(slot, master, mine) {
    if (!master) {
      return { slot, type: 'mine-only', master: null, mine, priority: 'info' };
    }
    if (!mine) {
      const isKeyUnique = master.rarity === 'UNIQUE';
      return { slot, type: 'master-only', master, mine: null, priority: isKeyUnique ? 'high' : 'medium' };
    }

    const mu = master.rarity === 'UNIQUE';
    const iu = mine.rarity === 'UNIQUE';

    if (mu && iu) {
      const same = master.name === mine.name;
      return { slot, type: same ? 'same' : 'unique-diff', master, mine, priority: same ? 'ok' : 'high' };
    }
    if (mu && !iu) {
      return { slot, type: 'type-conflict', master, mine, priority: 'high' };
    }
    if (!mu && iu) {
      return { slot, type: 'type-conflict', master, mine, priority: 'medium' };
    }
    // Both rare/magic/normal
    const affixDiff = rareAffixDiff(master, mine);
    return { slot, type: 'rare-diff', master, mine, affixDiff, priority: rarePriority(affixDiff) };
  }

  function rareAffixDiff(master, mine) {
    const mineSet = new Set(mine.affixes.map(normalizeAffix));
    const missing = master.affixes.filter(a => !mineSet.has(normalizeAffix(a)));
    return { missing };
  }

  function normalizeAffix(a) {
    // Normalize numbers for fuzzy matching (strip exact values)
    return a.replace(/\d+/g, '#').toLowerCase().trim();
  }

  function rarePriority(diff) {
    if (diff.missing.length >= 3) return 'high';
    if (diff.missing.length >= 1) return 'medium';
    return 'ok';
  }

  // ── Passive Tree ───────────────────────────────────────────────────────────

  function compareTree(masterTree, mineTree) {
    const m = masterTree.nodes;
    const n = mineTree.nodes;
    const both = new Set([...m].filter(id => n.has(id)));
    const masterOnly = new Set([...m].filter(id => !n.has(id)));
    const mineOnly = new Set([...n].filter(id => !m.has(id)));
    return { both, masterOnly, mineOnly };
  }

  // ── Priority ordering ──────────────────────────────────────────────────────

  const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4, ok: 5 };

  function sortByPriority(items) {
    return [...items].sort((a, b) =>
      (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
    );
  }

  return { compare, sortByPriority, PRIORITY_RANK };
})();
