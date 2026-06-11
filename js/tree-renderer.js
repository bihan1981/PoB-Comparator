/**
 * TreeRenderer — Canvas2D passive tree renderer.
 * Colors: green = both, red = reference only, blue = mine only.
 * Supports pan (drag) and zoom (wheel).
 */
const TreeRenderer = (() => {

  const COL = {
    both:     '#22c55e',
    ref:      '#ef4444',
    mine:     '#3b82f6',
    edge:     '#2a2a2a',
    edgeBoth: '#22c55e',
    edgeRef:  '#ef4444',
    edgeMine: '#3b82f6',
    bg:       '#111',
    nodeOff:  '#2a2a2a',
    nodeBorder: '#444',
  };

  let S = null; // singleton state

  function mount(canvas, treeData, refNodes, mineNodes) {
    if (S) destroy();

    S = {
      canvas,
      ctx: canvas.getContext('2d'),
      treeData,
      refNodes,   // Set<number>
      mineNodes,  // Set<number>
      pan:  { x: 0, y: 0 },
      zoom: 1,
      drag: null,  // { startX, startY, panX, panY } while dragging
      raf: null,
      dirty: true,
    };

    fitView();
    attachEvents();
    loop();
  }

  function destroy() {
    if (!S) return;
    detachEvents();
    cancelAnimationFrame(S.raf);
    const tip = document.getElementById('tree-tip');
    if (tip) tip.remove();
    S = null;
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  function fitView() {
    const { canvas, treeData: { bounds } } = S;
    const pad = 60;
    const tw = bounds.maxX - bounds.minX || 1;
    const th = bounds.maxY - bounds.minY || 1;
    const zoom = Math.min(
      (canvas.width  - pad * 2) / tw,
      (canvas.height - pad * 2) / th
    ) * 0.9;
    S.zoom = zoom;
    S.pan  = {
      x: canvas.width  / 2 - (bounds.minX + tw / 2) * zoom,
      y: canvas.height / 2 - (bounds.minY + th / 2) * zoom,
    };
  }

  // ── Render loop ───────────────────────────────────────────────────────────

  function loop() {
    if (!S) return;
    if (S.dirty) { draw(); S.dirty = false; }
    S.raf = requestAnimationFrame(loop);
  }

  function draw() {
    const { ctx, canvas, treeData, refNodes, mineNodes, pan, zoom } = S;

    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    drawEdges(ctx, treeData, refNodes, mineNodes, zoom);
    drawNodes(ctx, treeData, refNodes, mineNodes, zoom);

    ctx.restore();
  }

  function drawEdges(ctx, treeData, refNodes, mineNodes, zoom) {
    ctx.lineWidth = Math.max(0.5, 1.5 / zoom);

    for (const [id, node] of Object.entries(treeData.nodes)) {
      const nid = +id;
      for (const outId of (node.out ?? [])) {
        const target = treeData.nodes[outId];
        if (!target) continue;

        const aRef  = refNodes.has(nid)   && refNodes.has(outId);
        const aMine = mineNodes.has(nid)  && mineNodes.has(outId);

        if (aRef && aMine) ctx.strokeStyle = COL.edgeBoth + 'aa';
        else if (aRef)     ctx.strokeStyle = COL.edgeRef  + '88';
        else if (aMine)    ctx.strokeStyle = COL.edgeMine + '88';
        else               ctx.strokeStyle = COL.edge;

        ctx.beginPath();
        ctx.moveTo(node.x, node.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
      }
    }
  }

  function drawNodes(ctx, treeData, refNodes, mineNodes, zoom) {
    for (const [id, node] of Object.entries(treeData.nodes)) {
      const nid   = +id;
      const isRef  = refNodes.has(nid);
      const isMine = mineNodes.has(nid);
      const active = isRef || isMine;

      // Skip invisible inactive nodes at low zoom
      if (!active && zoom < 0.12) continue;

      const r = nodeRadius(node, zoom);

      let fill, stroke;
      if (isRef && isMine) { fill = COL.both;    stroke = COL.both; }
      else if (isRef)      { fill = COL.ref;     stroke = COL.ref; }
      else if (isMine)     { fill = COL.mine;    stroke = COL.mine; }
      else                 { fill = COL.nodeOff; stroke = COL.nodeBorder; }

      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = fill;
      ctx.strokeStyle = stroke;
      ctx.lineWidth   = active ? Math.max(1, 2 / zoom) : Math.max(0.3, 0.8 / zoom);
      ctx.fill();
      ctx.stroke();
    }
  }

  function nodeRadius(node, zoom) {
    const base = node.isKeystone ? 14 : node.isNotable ? 9 : 5;
    // Keep apparent size reasonably stable across zoom levels
    return Math.max(base * 0.4, base / zoom);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  const _handlers = {};

  function attachEvents() {
    const c = S.canvas;

    _handlers.mousedown = e => {
      S.drag = { startX: e.clientX, startY: e.clientY, panX: S.pan.x, panY: S.pan.y };
    };
    _handlers.mousemove = e => {
      if (S.drag) {
        S.pan = {
          x: S.drag.panX + e.clientX - S.drag.startX,
          y: S.drag.panY + e.clientY - S.drag.startY,
        };
        S.dirty = true;
        S.canvas.style.cursor = 'grabbing';
      } else {
        handleHover(e);
      }
    };
    _handlers.mouseup    = () => { S.drag = null; S.canvas.style.cursor = 'grab'; };
    _handlers.mouseleave = () => { S.drag = null; hideTip(); };
    _handlers.wheel      = e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const rect = S.canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      S.pan.x = mx - (mx - S.pan.x) * factor;
      S.pan.y = my - (my - S.pan.y) * factor;
      S.zoom *= factor;
      S.dirty = true;
    };
    _handlers.dblclick = () => { fitView(); S.dirty = true; };

    c.style.cursor = 'grab';
    for (const [ev, fn] of Object.entries(_handlers)) {
      c.addEventListener(ev, fn, ev === 'wheel' ? { passive: false } : undefined);
    }
  }

  function detachEvents() {
    if (!S) return;
    for (const [ev, fn] of Object.entries(_handlers)) {
      S.canvas.removeEventListener(ev, fn);
    }
  }

  // ── Tooltip ───────────────────────────────────────────────────────────────

  function handleHover(e) {
    const rect = S.canvas.getBoundingClientRect();
    const wx = (e.clientX - rect.left - S.pan.x) / S.zoom;
    const wy = (e.clientY - rect.top  - S.pan.y) / S.zoom;
    const node = hitTest(wx, wy);
    if (node) showTip(node, e.clientX - rect.left, e.clientY - rect.top);
    else hideTip();
  }

  function hitTest(wx, wy) {
    let best = null, bestD = Infinity;
    for (const node of Object.values(S.treeData.nodes)) {
      const d = Math.hypot(node.x - wx, node.y - wy);
      const threshold = node.isKeystone ? 18 : node.isNotable ? 14 : 10;
      if (d < threshold && d < bestD) { best = node; bestD = d; }
    }
    return best;
  }

  function showTip(node, x, y) {
    let tip = document.getElementById('tree-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'tree-tip';
      S.canvas.parentElement.appendChild(tip);
    }
    const nid = node.id ?? node.skill;
    const isRef  = S.refNodes.has(nid);
    const isMine = S.mineNodes.has(nid);
    const tag = isRef && isMine ? '● Both'
              : isRef  ? '● Reference'
              : isMine ? '● Mine'
              : '';

    tip.innerHTML = `
      <div class="tip-name">${node.name ?? 'Node'}</div>
      ${node.stats?.length ? `<div class="tip-stats">${node.stats.join('<br>')}</div>` : ''}
      ${tag ? `<div class="tip-tag">${tag}</div>` : ''}
    `;
    const cw = S.canvas.offsetWidth, ch = S.canvas.offsetHeight;
    tip.style.left = (x + 14 + 180 > cw ? x - 194 : x + 14) + 'px';
    tip.style.top  = (y + 8  + 120 > ch ? y - 100  : y + 8)  + 'px';
    tip.style.display = 'block';
  }

  function hideTip() {
    const tip = document.getElementById('tree-tip');
    if (tip) tip.style.display = 'none';
  }

  return { mount, destroy };
})();
