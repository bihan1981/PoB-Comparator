/**
 * UI — renders comparison results into the DOM.
 */
const UI = (() => {

  const PRIORITY_LABEL = {
    critical: { text: 'Critical', cls: 'p-critical' },
    high:     { text: 'High',     cls: 'p-high' },
    medium:   { text: 'Medium',   cls: 'p-medium' },
    low:      { text: 'Low',      cls: 'p-low' },
    ok:       { text: 'OK',       cls: 'p-ok' },
    info:     { text: 'Info',     cls: 'p-info' },
  };

  function render(result, league, targetVersion) {
    const root = document.getElementById('results');
    root.innerHTML = '';

    renderBuildHeader(root, result.build);
    renderTreeSummary(root, result.tree);
    renderSection(root, 'Skills', renderSkillRows(result.skills, targetVersion, league));
    renderSection(root, 'Equipment', renderItemRows(result.items, targetVersion, league));
  }

  function renderBuildHeader(root, build) {
    const m = build.master;
    const n = build.mine;

    const versionTag = v => {
      const isPoe2 = v?.startsWith('2');
      return `<span class="badge ${isPoe2 ? 'b-purple' : 'b-blue'}">${isPoe2 ? 'PoE2' : 'PoE1'}</span>`;
    };

    root.insertAdjacentHTML('beforeend', `
      <div class="build-header">
        <div class="bh-col bh-master">
          <span class="bh-role">Master</span>
          <strong>${esc(m.className)}${m.ascendClassName ? ' / ' + esc(m.ascendClassName) : ''}</strong>
          <span class="bh-level">Lv ${m.level}</span>
          ${versionTag(m.targetVersion)}
        </div>
        <div class="bh-vs">VS</div>
        <div class="bh-col bh-mine">
          <span class="bh-role">Mine</span>
          <strong>${esc(n.className)}${n.ascendClassName ? ' / ' + esc(n.ascendClassName) : ''}</strong>
          <span class="bh-level">Lv ${n.level}</span>
          ${versionTag(n.targetVersion)}
        </div>
      </div>
    `);
  }

  function renderTreeSummary(root, tree) {
    const total = tree.both.size + tree.masterOnly.size + tree.mineOnly.size;
    root.insertAdjacentHTML('beforeend', `
      <div class="tree-summary">
        <span class="ts-label">Passive Tree</span>
        <span class="ts-item ts-both">&#9679; ${tree.both.size} shared</span>
        <span class="ts-item ts-master">&#9679; ${tree.masterOnly.size} master-only</span>
        <span class="ts-item ts-mine">&#9679; ${tree.mineOnly.size} mine-only</span>
        <span class="ts-total">${total} total nodes compared</span>
      </div>
    `);
  }

  function renderSection(root, title, rows) {
    if (!rows.length) return;
    const section = document.createElement('div');
    section.className = 'result-section';
    section.innerHTML = `<p class="section-title">${title}</p>`;
    rows.forEach(row => section.appendChild(row));
    root.appendChild(section);
  }

  // ── Skills ─────────────────────────────────────────────────────────────────

  function renderSkillRows(skills, targetVersion, league) {
    return PoBCompare.sortByPriority(skills).map(s => skillRow(s, targetVersion, league));
  }

  function skillRow(s, targetVersion, league) {
    const card = document.createElement('div');
    card.className = 'result-card';

    if (s.type === 'matched') {
      const ms = s.masterSkill;
      const my = s.mineSkill;
      const { missing, extra, masterLinkCount, mineLinkCount } = s.diff;

      const masterGems = ms.gems.map(g =>
        missing.includes(g.name)
          ? `<span class="gem gem-missing">${esc(g.name)}</span>`
          : `<span class="gem gem-ok">${esc(g.name)}</span>`
      ).join('');

      const mineGems = my.gems.map(g =>
        extra.includes(g.name)
          ? `<span class="gem gem-extra">${esc(g.name)}</span>`
          : `<span class="gem gem-ok">${esc(g.name)}</span>`
      ).join('');

      const linkDiff = masterLinkCount !== mineLinkCount
        ? `<span class="link-diff">${masterLinkCount}L → ${mineLinkCount}L</span>`
        : `<span class="link-ok">${masterLinkCount}L</span>`;

      card.innerHTML = `
        <div class="card-header">
          ${priorityBadge(s.priority)}
          <span class="card-title">${esc(ms.mainGem.name)}</span>
          ${linkDiff}
          <span class="card-slot">${esc(ms.slot || ms.label)}</span>
        </div>
        <div class="skill-compare">
          <div class="sc-col">
            <div class="sc-role sc-master">Master</div>
            <div class="gem-list">${masterGems}</div>
          </div>
          <div class="sc-col">
            <div class="sc-role sc-mine">Mine</div>
            <div class="gem-list">${mineGems}</div>
          </div>
        </div>
        ${missing.length ? `<div class="diff-note missing-note">Missing: ${missing.map(n => gemTradeLink(n, 20, targetVersion, league)).join(', ')}</div>` : ''}
        ${extra.length ? `<div class="diff-note extra-note">Extra (not in master): ${extra.map(esc).join(', ')}</div>` : ''}
      `;
    } else if (s.type === 'master-only') {
      const ms = s.masterSkill;
      card.innerHTML = `
        <div class="card-header">
          ${priorityBadge('critical')}
          <span class="card-title">${esc(ms.mainGem?.name ?? 'Unknown')}</span>
          <span class="card-slot">${esc(ms.slot || ms.label)}</span>
        </div>
        <div class="diff-note missing-note">
          Missing from your build — master uses ${ms.linkCount}L:
          ${ms.gems.map(g => `<span class="gem gem-missing">${esc(g.name)}</span>`).join(' ')}
        </div>
      `;
    } else {
      const mg = s.mineSkill;
      card.innerHTML = `
        <div class="card-header">
          ${priorityBadge('info')}
          <span class="card-title">${esc(mg.mainGem?.name ?? 'Unknown')}</span>
          <span class="card-slot">${esc(mg.slot || mg.label)}</span>
          <span class="mine-only-tag">mine only</span>
        </div>
        <div class="gem-list">${mg.gems.map(g => `<span class="gem gem-ok">${esc(g.name)}</span>`).join('')}</div>
      `;
    }
    return card;
  }

  function gemTradeLink(name, level, targetVersion, league) {
    const url = TradeLinks.gem(name, level, targetVersion, league);
    return `<a href="${url}" target="_blank" class="trade-link">${esc(name)} ↗</a>`;
  }

  // ── Items ──────────────────────────────────────────────────────────────────

  function renderItemRows(items, targetVersion, league) {
    return PoBCompare.sortByPriority(items).map(i => itemRow(i, targetVersion, league));
  }

  function itemRow(item, targetVersion, league) {
    const card = document.createElement('div');
    card.className = 'result-card';

    const slotLabel = `<span class="item-slot">${esc(item.slot)}</span>`;

    if (item.type === 'same') {
      card.innerHTML = `
        <div class="card-header">
          ${priorityBadge('ok')}
          ${slotLabel}
          <span class="card-title">${esc(item.master.name)}</span>
          <span class="same-tag">&#10003; identical</span>
        </div>
      `;
    } else if (item.type === 'unique-diff') {
      card.innerHTML = `
        <div class="card-header">
          ${priorityBadge(item.priority)}
          ${slotLabel}
        </div>
        <div class="item-compare">
          <div class="ic-col ic-master">
            <div class="ic-role">Master</div>
            <div class="ic-name unique-name">${esc(item.master.name)}</div>
            ${itemTradeLink(item.master, targetVersion, league)}
          </div>
          <div class="ic-col ic-mine">
            <div class="ic-role">Mine</div>
            <div class="ic-name unique-name">${esc(item.mine.name)}</div>
          </div>
        </div>
      `;
    } else if (item.type === 'type-conflict') {
      const masterIsUnique = item.master.rarity === 'UNIQUE';
      card.innerHTML = `
        <div class="card-header">
          ${priorityBadge(item.priority)}
          ${slotLabel}
          <span class="conflict-tag">type conflict</span>
        </div>
        <div class="item-compare">
          <div class="ic-col ic-master">
            <div class="ic-role">Master</div>
            <div class="ic-name ${masterIsUnique ? 'unique-name' : ''}">${esc(item.master.name)}</div>
            <div class="ic-rarity">${esc(item.master.rarity)}</div>
            ${masterIsUnique ? itemTradeLink(item.master, targetVersion, league) : ''}
          </div>
          <div class="ic-col ic-mine">
            <div class="ic-role">Mine</div>
            <div class="ic-name ${!masterIsUnique ? 'unique-name' : ''}">${esc(item.mine.name)}</div>
            <div class="ic-rarity">${esc(item.mine.rarity)}</div>
          </div>
        </div>
      `;
    } else if (item.type === 'master-only') {
      card.innerHTML = `
        <div class="card-header">
          ${priorityBadge(item.priority)}
          ${slotLabel}
          <span class="card-title">${esc(item.master.name)}</span>
        </div>
        <div class="diff-note missing-note">
          Not equipped — master uses: <strong>${esc(item.master.rarity)} ${esc(item.master.base || item.master.name)}</strong>
          ${itemTradeLink(item.master, targetVersion, league)}
        </div>
      `;
    } else if (item.type === 'mine-only') {
      card.innerHTML = `
        <div class="card-header">
          ${priorityBadge('info')}
          ${slotLabel}
          <span class="card-title">${esc(item.mine.name)}</span>
          <span class="mine-only-tag">mine only</span>
        </div>
      `;
    } else if (item.type === 'rare-diff') {
      const missing = item.affixDiff?.missing ?? [];
      card.innerHTML = `
        <div class="card-header">
          ${priorityBadge(item.priority)}
          ${slotLabel}
        </div>
        <div class="item-compare">
          <div class="ic-col ic-master">
            <div class="ic-role">Master</div>
            <div class="ic-name">${esc(item.master.name || item.master.base)}</div>
            ${item.master.affixes.map(a =>
              missing.includes(a)
                ? `<div class="affix affix-missing">${esc(a)}</div>`
                : `<div class="affix">${esc(a)}</div>`
            ).join('')}
            ${itemTradeLink(item.master, targetVersion, league)}
          </div>
          <div class="ic-col ic-mine">
            <div class="ic-role">Mine</div>
            <div class="ic-name">${esc(item.mine.name || item.mine.base)}</div>
            ${item.mine.affixes.map(a => `<div class="affix">${esc(a)}</div>`).join('')}
          </div>
        </div>
        ${missing.length ? `<div class="diff-note missing-note">Weaker affixes: ${missing.map(esc).join(' · ')}</div>` : ''}
      `;
    }

    return card;
  }

  function itemTradeLink(item, targetVersion, league) {
    const url = item.rarity === 'UNIQUE'
      ? TradeLinks.uniqueItem(item.name, targetVersion, league)
      : TradeLinks.rareItem(item, targetVersion, league);
    return `<a href="${url}" target="_blank" class="trade-link">Trade ↗</a>`;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function priorityBadge(p) {
    const info = PRIORITY_LABEL[p] || PRIORITY_LABEL.info;
    return `<span class="badge ${info.cls}">${info.text}</span>`;
  }

  function esc(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showError(message) {
    const root = document.getElementById('results');
    root.innerHTML = `<div class="error-box">${esc(message)}</div>`;
  }

  function showLoading(show) {
    document.getElementById('compareBtn').disabled = show;
    document.getElementById('compareBtn').textContent = show ? 'Comparing…' : 'Compare';
  }

  return { render, showError, showLoading };
})();
