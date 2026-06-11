/**
 * TradeLinks — generates pathofexile.com trade search URLs.
 */
const TradeLinks = (() => {

  function isPoe2(targetVersion) {
    return typeof targetVersion === 'string' && targetVersion.startsWith('2');
  }

  function baseUrl(targetVersion, league) {
    const enc = encodeURIComponent(league);
    return isPoe2(targetVersion)
      ? `https://www.pathofexile.com/trade2/search/poe2/${enc}`
      : `https://www.pathofexile.com/trade/search/${enc}`;
  }

  function encodeQuery(q) {
    return `?q=${encodeURIComponent(JSON.stringify(q))}`;
  }

  // Unique item — search by name
  function uniqueItem(name, targetVersion, league = 'Standard') {
    const q = {
      query: {
        name,
        status: { option: 'any' },
        stats: [{ type: 'and', filters: [] }],
      },
      sort: { price: 'asc' },
    };
    return baseUrl(targetVersion, league) + encodeQuery(q);
  }

  // Rare item — search by up to 3 key affixes (Life / Res pattern)
  function rareItem(item, targetVersion, league = 'Standard') {
    const keyAffixes = pickKeyAffixes(item.affixes);
    const q = {
      query: {
        filters: {
          type_filters: { filters: { category: {} } },
        },
        status: { option: 'any' },
        stats: [{ type: 'and', filters: [] }],
      },
      sort: { price: 'asc' },
    };
    // We can't easily map affix text to stat IDs without a full stat table,
    // so fall back to a base-type search with the item base.
    if (item.base) {
      q.query.type = item.base;
    }
    return baseUrl(targetVersion, league) + encodeQuery(q);
  }

  // Gem — search by name and minimum level
  function gem(name, level, targetVersion, league = 'Standard') {
    const q = {
      query: {
        type: name,
        filters: {
          misc_filters: {
            filters: { gem_level: { min: Math.max(1, level - 1) } },
          },
        },
        status: { option: 'any' },
        stats: [{ type: 'and', filters: [] }],
      },
      sort: { price: 'asc' },
    };
    return baseUrl(targetVersion, league) + encodeQuery(q);
  }

  // Pick the most impactful affixes: prefer Life, Resistance, key damage lines
  function pickKeyAffixes(affixes, max = 3) {
    const priority = [/maximum life/i, /resistance/i, /damage/i, /spell/i, /attack/i];
    const ranked = [...affixes].sort((a, b) => {
      const pa = priority.findIndex(r => r.test(a));
      const pb = priority.findIndex(r => r.test(b));
      return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb);
    });
    return ranked.slice(0, max);
  }

  return { uniqueItem, rareItem, gem };
})();
