import { SIZE_MAP, sizeFromWidth, sizeFromHeight } from './sizes.js';

let currentState;
let persist;
let floatingMenu;

// Holds references to currently shift-selected groups
let selectedGroups = [];
// Snap resizing to this grid size (px)
const GRID = 20;

// Allow snapping to existing card sizes when within this distance (px)
const SNAP_THRESHOLD = GRID;

const MIN_SIZE_ADJUSTER = Symbol('minSizeAdjuster');
const RESIZE_HANDLE_SIZE = 20;
const RESIZE_HANDLER_KEY = Symbol('resizeHandler');

let resizeGuideEl = null;
let measureHostEl = null;

const cardRegistry = new Map();
const cardDimensions = new WeakMap();

const intrinsicStates = new WeakMap();
const intrinsicPendingCards = new Set();
let intrinsicFrameToken = null;

function createGroupStructure(type, id) {
  const section = document.createElement('section');
  const classes = ['group'];
  if (type) classes.push(`group--${type}`);
  section.className = classes.join(' ');
  if (id != null) {
    section.dataset.id = id;
  }
  section.dataset.resizing = '0';

  const header = document.createElement('div');
  header.className = 'group-header';

  const content = document.createElement('div');
  content.className = 'group-content';

  const footer = document.createElement('div');
  footer.className = 'group-footer';
  footer.hidden = true;

  section.append(header, content, footer);

  return { section, header, content, footer };
}

export function render(state, editing, T, I, handlers, saveFn) {
  renderGroups(state, editing, T, I, handlers, saveFn);
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function findCardInnerElement(cardEl) {
  if (!cardEl) return null;
  const preferred = ['group-content', 'group-body', 'items', 'embed'];
  for (const child of cardEl.children) {
    if (!child || !child.classList) continue;
    for (const cls of preferred) {
      if (child.classList.contains(cls)) {
        return child;
      }
    }
  }
  return cardEl.firstElementChild || null;
}

function ensureMeasureHost() {
  if (measureHostEl && measureHostEl.isConnected) {
    return measureHostEl;
  }
  if (typeof document === 'undefined' || !document?.body) {
    return null;
  }
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.position = 'absolute';
  host.style.left = '-10000px';
  host.style.top = '-10000px';
  host.style.visibility = 'hidden';
  host.style.pointerEvents = 'none';
  host.style.width = 'auto';
  host.style.height = 'auto';
  host.style.overflow = 'visible';
  document.body.appendChild(host);
  measureHostEl = host;
  return host;
}

function registerCard(id, el) {
  if (!id || !el) return;
  cardRegistry.set(id, el);
}

function rememberCardDimensions(el, width, height) {
  if (!el) return;
  cardDimensions.set(el, {
    width: Number.isFinite(width) ? Math.round(width) : null,
    height: Number.isFinite(height) ? Math.round(height) : null,
  });
}

function getCardDimensions(el) {
  if (!el) {
    return { width: 0, height: 0 };
  }
  const cached = cardDimensions.get(el);
  if (
    cached &&
    Number.isFinite(cached.width) &&
    Number.isFinite(cached.height)
  ) {
    return cached;
  }
  if (!el.isConnected) {
    return { width: 0, height: 0 };
  }
  const rect = el.getBoundingClientRect();
  const next = {
    width: Number.isFinite(rect?.width) ? Math.round(rect.width) : 0,
    height: Number.isFinite(rect?.height) ? Math.round(rect.height) : 0,
  };
  cardDimensions.set(el, next);
  return next;
}

function cleanupCardRegistry(activeIds = new Set()) {
  cardRegistry.forEach((el, id) => {
    if (!activeIds.has(id) || !el?.isConnected) {
      cardRegistry.delete(id);
      if (el) {
        cardDimensions.delete(el);
      }
    }
  });
}

function measureIntrinsicContentSize(cardEl, innerEl = findCardInnerElement(cardEl)) {
  if (!cardEl || !innerEl) {
    return { width: 0, height: 0, widthExtra: 0, heightExtra: 0 };
  }

  const host = ensureMeasureHost();
  if (host) {
    const clone = cardEl.cloneNode(true);
    clone.removeAttribute('id');
    clone.dataset.resizing = '0';
    clone.style.position = 'relative';
    clone.style.visibility = 'visible';
    clone.style.pointerEvents = 'none';
    clone.style.width = 'auto';
    clone.style.minWidth = '0';
    clone.style.maxWidth = 'none';
    clone.style.height = 'auto';
    clone.style.minHeight = '0';
    clone.style.maxHeight = 'none';
    clone.style.flex = '0 0 auto';
    clone.style.transform = 'none';
    clone.style.transition = 'none';

    const cloneInner = findCardInnerElement(clone);
    if (cloneInner) {
      cloneInner.style.width = 'auto';
      cloneInner.style.minWidth = '0';
      cloneInner.style.maxWidth = 'none';
      cloneInner.style.height = 'auto';
      cloneInner.style.minHeight = '0';
      cloneInner.style.maxHeight = 'none';
      cloneInner.style.flex = '0 0 auto';
    }

    host.appendChild(clone);
    const rect = clone.getBoundingClientRect();
    const innerRect = cloneInner ? cloneInner.getBoundingClientRect() : null;
    const width = Number.isFinite(rect.width) ? Math.ceil(rect.width) : 0;
    const height = Number.isFinite(rect.height) ? Math.ceil(rect.height) : 0;
    const widthExtra = innerRect
      ? Math.max(0, Math.ceil(rect.width - innerRect.width))
      : 0;
    const heightExtra = innerRect
      ? Math.max(0, Math.ceil(rect.height - innerRect.height))
      : 0;
    host.removeChild(clone);
    return { width, height, widthExtra, heightExtra };
  }

  const prevCard = {
    width: cardEl.style.width,
    minWidth: cardEl.style.minWidth,
    maxWidth: cardEl.style.maxWidth,
    height: cardEl.style.height,
    minHeight: cardEl.style.minHeight,
    maxHeight: cardEl.style.maxHeight,
  };
  const prevInner = {
    width: innerEl.style.width,
    minWidth: innerEl.style.minWidth,
    maxWidth: innerEl.style.maxWidth,
    height: innerEl.style.height,
    minHeight: innerEl.style.minHeight,
    maxHeight: innerEl.style.maxHeight,
  };

  cardEl.style.width = '';
  cardEl.style.minWidth = '';
  cardEl.style.maxWidth = 'none';
  cardEl.style.height = 'auto';
  cardEl.style.minHeight = '';
  cardEl.style.maxHeight = 'none';
  innerEl.style.width = 'auto';
  innerEl.style.minWidth = '';
  innerEl.style.maxWidth = 'none';
  innerEl.style.height = 'auto';
  innerEl.style.minHeight = '';
  innerEl.style.maxHeight = 'none';

  const parseSize = (value) => {
    const numeric = Number.parseFloat(value);
    return Number.isFinite(numeric) ? numeric : 0;
  };

  let borderX = 0;
  let borderY = 0;
  if (typeof window !== 'undefined' && cardEl instanceof HTMLElement) {
    const computed = window.getComputedStyle(cardEl);
    borderX = parseSize(computed.borderLeftWidth) + parseSize(computed.borderRightWidth);
    borderY = parseSize(computed.borderTopWidth) + parseSize(computed.borderBottomWidth);
  }

  const cardScrollWidth = Math.max(0, cardEl.scrollWidth);
  const cardScrollHeight = Math.max(0, cardEl.scrollHeight);
  const innerScrollWidth = Math.max(0, innerEl.scrollWidth);
  const innerScrollHeight = Math.max(0, innerEl.scrollHeight);

  const widthExtra = Math.max(0, cardScrollWidth - innerScrollWidth) + borderX;
  const heightExtra = Math.max(0, cardScrollHeight - innerScrollHeight) + borderY;

  const widthCandidate = Math.max(cardScrollWidth + borderX, innerScrollWidth + widthExtra);
  const heightCandidate = Math.max(cardScrollHeight + borderY, innerScrollHeight + heightExtra);

  const width = Number.isFinite(widthCandidate) ? Math.ceil(widthCandidate) : 0;
  const height = Number.isFinite(heightCandidate) ? Math.ceil(heightCandidate) : 0;

  cardEl.style.width = prevCard.width;
  cardEl.style.minWidth = prevCard.minWidth;
  cardEl.style.maxWidth = prevCard.maxWidth;
  cardEl.style.height = prevCard.height;
  cardEl.style.minHeight = prevCard.minHeight;
  cardEl.style.maxHeight = prevCard.maxHeight;
  innerEl.style.width = prevInner.width;
  innerEl.style.minWidth = prevInner.minWidth;
  innerEl.style.maxWidth = prevInner.maxWidth;
  innerEl.style.height = prevInner.height;
  innerEl.style.minHeight = prevInner.minHeight;
  innerEl.style.maxHeight = prevInner.maxHeight;

  return { width, height, widthExtra, heightExtra };
}

function applyMinSizeStyles(cardEl, width, height) {
  if (!cardEl) return;
  const widthPx = width > 0 ? `${width}px` : '';
  const heightPx = height > 0 ? `${height}px` : '';
  if (cardEl.style.minWidth !== widthPx) {
    cardEl.style.minWidth = widthPx;
  }
  if (cardEl.style.minHeight !== heightPx) {
    cardEl.style.minHeight = heightPx;
  }
}

function computeIntrinsicSizeFromState(state) {
  if (!state || !state.cardEl || !state.innerEl) {
    return { width: 0, height: 0 };
  }
  const measured = measureIntrinsicContentSize(state.cardEl, state.innerEl);
  if (Number.isFinite(measured.widthExtra)) {
    state.hostPaddingWidth = Math.max(0, measured.widthExtra);
  }
  if (Number.isFinite(measured.heightExtra)) {
    state.hostPaddingHeight = Math.max(0, measured.heightExtra);
  }
  return { width: measured.width, height: measured.height };
}

function scheduleIntrinsicUpdate(cardEl) {
  if (!cardEl || !intrinsicStates.has(cardEl)) return;
  intrinsicPendingCards.add(cardEl);
  if (intrinsicFrameToken != null) return;
  if (typeof requestAnimationFrame === 'function') {
    intrinsicFrameToken = requestAnimationFrame(() => {
      intrinsicFrameToken = null;
      queueMicrotask(() => {
        intrinsicPendingCards.forEach((el) => {
          if (el?.dataset?.resizing === '1') {
            return;
          }
          const state = intrinsicStates.get(el);
          if (!state) return;
          const size = computeIntrinsicSizeFromState(state);
          state.last = size;
          applyMinSizeStyles(el, size.width, size.height);
        });
        intrinsicPendingCards.clear();
      });
    });
  } else {
    queueMicrotask(() => {
      intrinsicPendingCards.forEach((el) => {
        if (el?.dataset?.resizing === '1') {
          return;
        }
        const state = intrinsicStates.get(el);
        if (!state) return;
        const size = computeIntrinsicSizeFromState(state);
        state.last = size;
        applyMinSizeStyles(el, size.width, size.height);
      });
      intrinsicPendingCards.clear();
    });
  }
}

function cleanupIntrinsicState(cardEl) {
  const state = intrinsicStates.get(cardEl);
  if (!state) return;
  if (state.observers?.length) {
    state.observers.forEach((disconnect) => {
      try {
        disconnect();
      } catch {}
    });
    state.observers = [];
  }
  if (state.removalCleanup) {
    try {
      state.removalCleanup();
    } catch {}
    state.removalCleanup = null;
  }
  intrinsicPendingCards.delete(cardEl);
  intrinsicStates.delete(cardEl);
  if (cardEl[MIN_SIZE_ADJUSTER]) {
    delete cardEl[MIN_SIZE_ADJUSTER];
  }
}

function ensureIntrinsicState(cardEl, innerEl = findCardInnerElement(cardEl)) {
  if (!cardEl || !innerEl) return null;
  let state = intrinsicStates.get(cardEl);
  if (!state) {
    state = {
      cardEl,
      innerEl,
      observers: [],
      last: { width: 0, height: 0 },
      hostRect: null,
      innerRect: null,
      innerScrollWidth: 0,
      innerScrollHeight: 0,
      removalCleanup: null,
      hostPaddingWidth: 0,
      hostPaddingHeight: 0,
    };
    intrinsicStates.set(cardEl, state);
  } else if (state.innerEl !== innerEl) {
    if (state.observers?.length) {
      state.observers.forEach((disconnect) => {
        try {
          disconnect();
        } catch {}
      });
    }
    state.observers = [];
    state.innerEl = innerEl;
    state.last = { width: 0, height: 0 };
    state.hostPaddingWidth = 0;
    state.hostPaddingHeight = 0;
  }

  if (!state.observers.length && typeof ResizeObserver === 'function') {
    const hostObserver = new ResizeObserver((entries) => {
      const entry = entries?.[entries.length - 1];
      state.hostRect = entry?.contentRect || null;
      scheduleIntrinsicUpdate(cardEl);
    });
    hostObserver.observe(cardEl);
    const innerObserver = new ResizeObserver((entries) => {
      const entry = entries?.[entries.length - 1];
      state.innerRect = entry?.contentRect || null;
      state.innerScrollWidth = innerEl.scrollWidth;
      state.innerScrollHeight = innerEl.scrollHeight;
      scheduleIntrinsicUpdate(cardEl);
    });
    innerObserver.observe(innerEl);
    state.observers.push(() => hostObserver.disconnect());
    state.observers.push(() => innerObserver.disconnect());
  }

  return state;
}

function applyIntrinsicMinSize(
  cardEl,
  innerEl = findCardInnerElement(cardEl),
  options = {},
) {
  const { forceMeasure = false } = options || {};
  const state = ensureIntrinsicState(cardEl, innerEl);
  if (!state) {
    return { width: 0, height: 0 };
  }
  if (forceMeasure) {
    state.last = { width: 0, height: 0 };
  }
  if (!state.last || (!state.last.width && !state.last.height)) {
    const measured = measureIntrinsicContentSize(cardEl, innerEl);
    state.last = { width: measured.width, height: measured.height };
    if (Number.isFinite(measured.widthExtra)) {
      state.hostPaddingWidth = Math.max(0, measured.widthExtra);
    }
    if (Number.isFinite(measured.heightExtra)) {
      state.hostPaddingHeight = Math.max(0, measured.heightExtra);
    }
    applyMinSizeStyles(cardEl, measured.width, measured.height);
  }
  scheduleIntrinsicUpdate(cardEl);
  return state.last;
}

function isWithinResizeHandle(cardEl, event) {
  if (!cardEl || !event) return false;
  const rect = cardEl.getBoundingClientRect();
  return (
    event.clientX >= rect.right - RESIZE_HANDLE_SIZE &&
    event.clientY >= rect.bottom - RESIZE_HANDLE_SIZE
  );
}

function getGroupLabel(cardEl) {
  if (!cardEl) return '';
  const title = cardEl.querySelector('.group-title h2');
  if (title && title.textContent) {
    const trimmed = title.textContent.trim();
    if (trimmed) return trimmed;
  }
  if (cardEl.dataset?.id) {
    return `#${cardEl.dataset.id}`;
  }
  return 'Kortelė';
}

function ensureResizeGuide() {
  if (resizeGuideEl && resizeGuideEl.isConnected) return resizeGuideEl;
  const guide = document.createElement('div');
  guide.className = 'resize-guide';
  guide.setAttribute('aria-hidden', 'true');
  guide.hidden = true;
  guide.innerHTML = `
    <div class="resize-guide__outline"></div>
    <div class="resize-guide__label resize-guide__label--width"></div>
    <div class="resize-guide__label resize-guide__label--height"></div>
  `;
  document.body.appendChild(guide);
  resizeGuideEl = guide;
  return guide;
}

function hideResizeGuide() {
  if (!resizeGuideEl) return;
  resizeGuideEl.hidden = true;
}

function updateResizeGuide(rect, widthSnap, heightSnap) {
  if (!rect) {
    hideResizeGuide();
    return;
  }
  const guide = ensureResizeGuide();
  guide.style.left = `${Math.round(rect.left)}px`;
  guide.style.top = `${Math.round(rect.top)}px`;
  guide.style.width = `${Math.round(rect.width)}px`;
  guide.style.height = `${Math.round(rect.height)}px`;
  const widthLabel = guide.querySelector('.resize-guide__label--width');
  const heightLabel = guide.querySelector('.resize-guide__label--height');
  if (widthLabel) {
    if (widthSnap) {
      widthLabel.textContent = `Plotis: ${widthSnap.value}px • ${widthSnap.label}`;
      widthLabel.hidden = false;
    } else {
      widthLabel.hidden = true;
    }
  }
  if (heightLabel) {
    if (heightSnap) {
      heightLabel.textContent = `Aukštis: ${heightSnap.value}px • ${heightSnap.label}`;
      heightLabel.hidden = false;
    } else {
      heightLabel.hidden = true;
    }
  }
  guide.hidden = !widthSnap && !heightSnap;
}

let activeResize = null;

function beginCardResize(cardEl, event) {
  if (!cardEl) return;
  cardEl.dataset.resizing = '1';
  cardEl.draggable = false;
  const isMultiSelection = selectedGroups.length > 1 && selectedGroups.includes(cardEl);
  const resizeTargets = (isMultiSelection ? selectedGroups : [cardEl]).filter(
    (el) => el && el.isConnected,
  );
  const intrinsicSizes = new Map();
  let aggregatedMinWidth = 0;
  let aggregatedMinHeight = 0;
  resizeTargets.forEach((target) => {
    const size = applyIntrinsicMinSize(target, undefined, { forceMeasure: true }) || {
      width: 0,
      height: 0,
    };
    intrinsicSizes.set(target, size);
    if (Number.isFinite(size.width)) {
      aggregatedMinWidth = Math.max(aggregatedMinWidth, size.width);
    }
    if (Number.isFinite(size.height)) {
      aggregatedMinHeight = Math.max(aggregatedMinHeight, size.height);
    }
  });
  const intrinsicSize = intrinsicSizes.get(cardEl) || { width: 0, height: 0 };
  const rect = cardEl.getBoundingClientRect();
  const computed =
    typeof window !== 'undefined' && cardEl instanceof HTMLElement
      ? window.getComputedStyle(cardEl)
      : null;
  const minWidthCandidates = [
    Number.parseFloat(cardEl.style.minWidth),
    Number.isFinite(intrinsicSize?.width) ? intrinsicSize.width : NaN,
    Number.isFinite(aggregatedMinWidth) && aggregatedMinWidth > 0
      ? aggregatedMinWidth
      : NaN,
    computed ? Number.parseFloat(computed.minWidth) : NaN,
  ].filter((val) => Number.isFinite(val) && val > 0);
  const minHeightCandidates = [
    Number.parseFloat(cardEl.style.minHeight),
    Number.isFinite(intrinsicSize?.height) ? intrinsicSize.height : NaN,
    Number.isFinite(aggregatedMinHeight) && aggregatedMinHeight > 0
      ? aggregatedMinHeight
      : NaN,
    computed ? Number.parseFloat(computed.minHeight) : NaN,
  ].filter((val) => Number.isFinite(val) && val > 0);
  activeResize = {
    el: cardEl,
    startX: event?.clientX ?? rect.right,
    startY: event?.clientY ?? rect.bottom,
    startWidth: rect.width,
    startHeight: rect.height,
    minWidth: minWidthCandidates.length ? Math.max(...minWidthCandidates) : 0,
    minHeight: minHeightCandidates.length ? Math.max(...minHeightCandidates) : 0,
    pointerId: event?.pointerId,
    targets: resizeTargets,
  };
  resizeTargets.forEach((target) => {
    target.dataset.resizing = '1';
    target.draggable = false;
    if (target !== cardEl) {
      target.style.minWidth = '';
      target.style.minHeight = '';
    }
  });
  if (cardEl.dataset?.id) {
    resizingElements.add(cardEl.dataset.id);
  }
}

function finalizeActiveResize() {
  const changed = applyPendingResizes();
  const allowDrag = document.body.classList.contains('editing');
  document.querySelectorAll('.group').forEach((g) => {
    g.dataset.resizing = '0';
    g.style.minWidth = '';
    g.style.minHeight = '';
    g.draggable = allowDrag;
    const adjust = g[MIN_SIZE_ADJUSTER];
    if (typeof adjust === 'function') {
      adjust();
    }
  });
  activeResize = null;
  hideResizeGuide();
  if (changed && typeof persist === 'function') {
    persist();
  }
}

function initResizeHandles(cardEl) {
  if (!cardEl || cardEl[RESIZE_HANDLER_KEY]) return;

  const handlePointerMove = (event) => {
    if (!activeResize || activeResize.el !== cardEl) return;
    const { startX, startY, startWidth, startHeight, minWidth, minHeight } = activeResize;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    let nextWidth = startWidth + deltaX;
    let nextHeight = startHeight + deltaY;
    if (Number.isFinite(minWidth)) nextWidth = Math.max(minWidth, nextWidth);
    if (Number.isFinite(minHeight)) nextHeight = Math.max(minHeight, nextHeight);
    if (Number.isFinite(nextWidth)) {
      nextWidth = Math.max(0, Math.round(nextWidth));
    }
    if (Number.isFinite(nextHeight)) {
      nextHeight = Math.max(0, Math.round(nextHeight));
    }

    let widthSnap = null;
    let heightSnap = null;
    let bestWidthDiff = SNAP_THRESHOLD + 1;
    let bestHeightDiff = SNAP_THRESHOLD + 1;
    const allGroups = Array.from(document.querySelectorAll('.group'));
    allGroups.forEach((group) => {
      if (!group || group === cardEl) return;
      const rect = group.getBoundingClientRect();
      const widthCandidate = Math.round(rect.width);
      const heightCandidate = Math.round(rect.height);
      if (Number.isFinite(nextWidth)) {
        const diffW = Math.abs(widthCandidate - nextWidth);
        if (diffW <= SNAP_THRESHOLD && diffW < bestWidthDiff) {
          bestWidthDiff = diffW;
          widthSnap = { value: widthCandidate, label: getGroupLabel(group) };
        }
      }
      if (Number.isFinite(nextHeight)) {
        const diffH = Math.abs(heightCandidate - nextHeight);
        if (diffH <= SNAP_THRESHOLD && diffH < bestHeightDiff) {
          bestHeightDiff = diffH;
          heightSnap = { value: heightCandidate, label: getGroupLabel(group) };
        }
      }
    });

    if (widthSnap) {
      nextWidth = widthSnap.value;
    }
    if (heightSnap) {
      nextHeight = heightSnap.value;
    }

    const targets = Array.isArray(activeResize.targets) && activeResize.targets.length
      ? activeResize.targets
      : [cardEl];
    targets
      .filter((target, index) => target && target.isConnected && targets.indexOf(target) === index)
      .forEach((target) => {
        if (Number.isFinite(nextWidth)) {
          target.style.width = `${Math.max(0, nextWidth)}px`;
        }
        if (Number.isFinite(nextHeight)) {
          target.style.height = `${Math.max(0, nextHeight)}px`;
        }
        rememberCardDimensions(target, nextWidth, nextHeight);
      });

    activeResize.snapWidth = widthSnap?.value ?? null;
    activeResize.snapHeight = heightSnap?.value ?? null;

    if (widthSnap || heightSnap) {
      const rect = cardEl.getBoundingClientRect();
      updateResizeGuide(rect, widthSnap, heightSnap);
    } else {
      hideResizeGuide();
    }

    event.preventDefault();
  };

  const handlePointerUp = (event) => {
    if (activeResize && activeResize.el === cardEl && cardEl.releasePointerCapture) {
      try {
        cardEl.releasePointerCapture(activeResize.pointerId);
      } catch {}
    }
    cardEl.removeEventListener('pointermove', handlePointerMove);
    cardEl.removeEventListener('pointerup', handlePointerUp);
    cardEl.removeEventListener('pointercancel', handlePointerUp);
    finalizeActiveResize();
    event.preventDefault();
  };

  const handlePointerDown = (event) => {
    if (!document.body.classList.contains('editing')) return;
    if (event.button != null && event.button !== 0 && event.pointerType !== 'touch') return;
    if (!isWithinResizeHandle(cardEl, event)) return;
    beginCardResize(cardEl, event);
    if (!activeResize) return;
    if (cardEl.setPointerCapture && Number.isFinite(event.pointerId)) {
      try {
        cardEl.setPointerCapture(event.pointerId);
      } catch {}
    }
    cardEl.addEventListener('pointermove', handlePointerMove);
    cardEl.addEventListener('pointerup', handlePointerUp);
    cardEl.addEventListener('pointercancel', handlePointerUp);
    event.preventDefault();
  };

  cardEl.addEventListener('pointerdown', handlePointerDown);
  cardEl[RESIZE_HANDLER_KEY] = {
    destroy() {
      cardEl.removeEventListener('pointerdown', handlePointerDown);
      cardEl.removeEventListener('pointermove', handlePointerMove);
      cardEl.removeEventListener('pointerup', handlePointerUp);
      cardEl.removeEventListener('pointercancel', handlePointerUp);
    },
  };
}

function setupMinSizeWatcher(cardEl, innerEl) {
  if (!cardEl || !innerEl) return;
  const state = ensureIntrinsicState(cardEl, innerEl);
  if (!state) return;

  const adjustMinSize = () => {
    if (!cardEl.isConnected) return;
    scheduleIntrinsicUpdate(cardEl);
  };

  state.adjust = adjustMinSize;
  cardEl[MIN_SIZE_ADJUSTER] = adjustMinSize;
  adjustMinSize();

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    cleanupIntrinsicState(cardEl);
  };

  if (state.removalCleanup) {
    try {
      state.removalCleanup();
    } catch {}
    state.removalCleanup = null;
  }

  const watchParent = (node) => {
    if (!node || typeof MutationObserver !== 'function') return;
    if (state.removalCleanup) {
      try {
        state.removalCleanup();
      } catch {}
      state.removalCleanup = null;
    }
    const removalObserver = new MutationObserver(() => {
      if (!cardEl.isConnected) {
        cleanup();
        return;
      }
      if (cardEl.parentNode && cardEl.parentNode !== node) {
        watchParent(cardEl.parentNode);
      }
    });
    removalObserver.observe(node, { childList: true });
    state.removalCleanup = () => {
      removalObserver.disconnect();
    };
  };

  if (typeof MutationObserver === 'function') {
    watchParent(cardEl.parentNode);
  } else {
    cardEl.addEventListener(
      'DOMNodeRemoved',
      (event) => {
        if (event.target === cardEl) cleanup();
      },
      { once: true },
    );
  }
}

let reminderTicker = null;
let reminderEntryCache = new Map();

function formatRelativeTime(ms) {
  if (!Number.isFinite(ms)) return '';
  const isNegative = ms < 0;
  const absMs = Math.abs(ms);
  if (absMs < 60000) {
    const seconds = Math.round(absMs / 1000);
    return `${isNegative ? '-' : ''}${seconds}s`;
  }
  const totalMinutes = Math.round(absMs / 60000);
  if (totalMinutes < 60) {
    return `${isNegative ? '-' : ''}${totalMinutes} min`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const label = minutes
    ? `${hours} val ${minutes} min`
    : `${hours} val`;
  return isNegative ? `-${label}` : label;
}

function formatClockLabel(ms) {
  if (!Number.isFinite(ms)) return '00:00';
  const isNegative = ms < 0;
  const absMs = Math.abs(ms);
  const totalSeconds = Math.floor(absMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  let baseLabel;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    baseLabel = `${hours}h${remMinutes.toString().padStart(2, '0')}`;
  } else {
    baseLabel = `${minutes.toString().padStart(2, '0')}:${seconds
      .toString()
      .padStart(2, '0')}`;
  }
  return isNegative ? `-${baseLabel}` : baseLabel;
}

function formatDueLabel(ts) {
  try {
    return new Date(ts).toLocaleString('lt-LT', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function applySize(el, width, height, wSize = sizeFromWidth(width), hSize = sizeFromHeight(height)) {
  if (Number.isFinite(width)) {
    el.style.width = `${Math.round(width)}px`;
  } else {
    el.style.removeProperty('width');
  }

  if (Number.isFinite(height)) {
    el.style.height = `${Math.round(height)}px`;
  } else {
    el.style.removeProperty('height');
  }

  el.classList.remove('w-sm', 'w-md', 'w-lg', 'h-sm', 'h-md', 'h-lg');
  el.classList.add(`w-${wSize}`, `h-${hSize}`);

  rememberCardDimensions(el, width, height);
}

function resolveSizeMetadata(width, height) {
  const widthMatch = Object.entries(SIZE_MAP).find(([, dims]) => {
    const preset = Number.isFinite(dims?.width) ? Math.round(dims.width) : NaN;
    return Number.isFinite(preset) && Number.isFinite(width) && Math.round(width) === preset;
  });
  const heightMatch = Object.entries(SIZE_MAP).find(([, dims]) => {
    const preset = Number.isFinite(dims?.height) ? Math.round(dims.height) : NaN;
    return Number.isFinite(preset) && Number.isFinite(height) && Math.round(height) === preset;
  });
  const metadata = {
    sizePreset: {
      width: widthMatch ? widthMatch[0] : null,
      height: heightMatch ? heightMatch[0] : null,
    },
    customWidth: widthMatch ? null : Number.isFinite(width) ? Math.round(width) : null,
    customHeight: heightMatch ? null : Number.isFinite(height) ? Math.round(height) : null,
  };
  return metadata;
}

const resizingElements = new Set();

function applyResizeForElement(el, width, height, wSize, hSize) {
  const widthPreset = SIZE_MAP[wSize]?.width;
  const heightPreset = SIZE_MAP[hSize]?.height;
  const widthMatchesPreset =
    Number.isFinite(widthPreset) && Number.isFinite(width) && Math.round(width) === Math.round(widthPreset);
  const heightMatchesPreset =
    Number.isFinite(heightPreset) && Number.isFinite(height) && Math.round(height) === Math.round(heightPreset);
  const finalWidth = widthMatchesPreset ? widthPreset : width;
  const finalHeight = heightMatchesPreset ? heightPreset : height;
  const metadata = resolveSizeMetadata(finalWidth, finalHeight);

  applySize(el, finalWidth, finalHeight, wSize, hSize);
  if (el.dataset.id === 'reminders') {
    const prev = currentState.remindersCard || {};
    const changed =
      prev.width !== finalWidth || prev.height !== finalHeight || prev.wSize !== wSize || prev.hSize !== hSize;
    currentState.remindersCard = {
      ...prev,
      width: finalWidth,
      height: finalHeight,
      wSize,
      hSize,
      sizePreset: metadata.sizePreset,
      customWidth: metadata.customWidth,
      customHeight: metadata.customHeight,
    };
    return changed;
  }
  const sg = currentState.groups.find((x) => x.id === el.dataset.id);
  if (!sg) return false;
  const changed =
    sg.width !== finalWidth || sg.height !== finalHeight || sg.wSize !== wSize || sg.hSize !== hSize;
  sg.width = finalWidth;
  sg.height = finalHeight;
  sg.wSize = wSize;
  sg.hSize = hSize;
  sg.sizePreset = metadata.sizePreset;
  if (metadata.customWidth != null) sg.customWidth = metadata.customWidth;
  else delete sg.customWidth;
  if (metadata.customHeight != null) sg.customHeight = metadata.customHeight;
  else delete sg.customHeight;
  delete sg.size;
  return changed;
}

function applyPendingResizes() {
  if (!resizingElements.size) return false;
  let changed = false;
  const processed = new Set();
  resizingElements.forEach((id) => {
    if (!id || processed.has(id)) return;
    processed.add(id);
    const baseEl = cardRegistry.get(id);
    if (!baseEl || !baseEl.isConnected) {
      if (baseEl) {
        cardDimensions.delete(baseEl);
      }
      cardRegistry.delete(id);
      return;
    }
    const rect = baseEl.getBoundingClientRect();
    let baseW = Math.round(rect.width / GRID) * GRID;
    let baseH = Math.round(rect.height / GRID) * GRID;
    cardRegistry.forEach((otherEl) => {
      if (!otherEl || otherEl === baseEl || !otherEl.isConnected) return;
      const dims = getCardDimensions(otherEl);
      if (Math.abs(baseW - Math.round(dims.width)) <= SNAP_THRESHOLD) {
        baseW = Math.round(dims.width);
      }
      if (Math.abs(baseH - Math.round(dims.height)) <= SNAP_THRESHOLD) {
        baseH = Math.round(dims.height);
      }
    });
    const wSize = sizeFromWidth(baseW);
    const hSize = sizeFromHeight(baseH);
    const presetWidth = SIZE_MAP[wSize]?.width;
    const presetHeight = SIZE_MAP[hSize]?.height;
    const finalWidth =
      Number.isFinite(presetWidth) && Math.round(baseW) === Math.round(presetWidth)
        ? presetWidth
        : baseW;
    const finalHeight =
      Number.isFinite(presetHeight) && Math.round(baseH) === Math.round(presetHeight)
        ? presetHeight
        : baseH;
    const targets = selectedGroups.includes(baseEl) ? selectedGroups : [baseEl];
    targets.forEach((target) => {
      const didChange = applyResizeForElement(target, finalWidth, finalHeight, wSize, hSize);
      if (didChange) changed = true;
      rememberCardDimensions(target, finalWidth, finalHeight);
    });
  });
  resizingElements.clear();
  return changed;
}

document.addEventListener('click', (e) => {
  if (
    floatingMenu &&
    !e.target.closest('.floating-menu') &&
    !e.target.closest('[data-a="menu"]')
  ) {
    floatingMenu.remove();
    floatingMenu = null;
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && floatingMenu) {
    floatingMenu.remove();
    floatingMenu = null;
  }
});

function toFavicon(u) {
  try {
    const url = new URL(u);
    return `${url.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

export function toSheetEmbed(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('docs.google.com')) return null;
    if (/\/(pub|pubhtml|htmlview|htmlembed)/.test(u.pathname)) return url;
    const parts = u.pathname.split('/').filter(Boolean);
    const dIdx = parts.indexOf('d');
    if (dIdx === -1) return null;
    let id = parts[dIdx + 1];
    if (id === 'e') id = parts[dIdx + 2];
    if (!id) return null;
    const gid = u.searchParams.get('gid') || u.hash.match(/gid=([^&]+)/)?.[1];
    const params = new URLSearchParams({ widget: 'true', headers: 'false' });
    if (gid) params.set('gid', gid);
    return `https://docs.google.com/spreadsheets/d/${id}/htmlembed?${params.toString()}`;
  } catch {
    return null;
  }
}

function escapeHtml(str) {
  return String(str).replace(
    /[&<>"]/g,
    (s) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
      })[s],
  );
}

function createEmptyState(iconHtml, text, action) {
  const wrapper = document.createElement('div');
  wrapper.className = 'empty-state';
  wrapper.innerHTML = `
    <div class="empty-state__icon" aria-hidden="true">${iconHtml || ''}</div>
    <p class="empty-state__text">${escapeHtml(text || '')}</p>
  `;
  if (
    action &&
    typeof action.actionLabel === 'string' &&
    action.actionLabel.trim() !== '' &&
    typeof action.onAction === 'function'
  ) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'empty-state__action';
    button.textContent = action.actionLabel;
    button.addEventListener('click', (event) => {
      try {
        const result = action.onAction(event);
        if (result && typeof result.then === 'function') {
          result.catch((err) =>
            console.error('empty-state action failed', err),
          );
        }
      } catch (err) {
        console.error('empty-state action failed', err);
      }
    });
    wrapper.appendChild(button);
  }
  return wrapper;
}

function previewItem(it, mount) {
  const existing = mount.nextElementSibling;
  if (existing && existing.classList.contains('embed')) {
    existing.remove();
    return;
  }
  const wrap = document.createElement('div');
  wrap.className = 'embed';
  wrap.style.overflow = 'hidden';
  wrap.dataset.custom = it.h ? '1' : '0';
  if (it.h) wrap.style.height = it.h + 'px';
  let src = it.url;
  if (it.type === 'sheet') {
    const conv = toSheetEmbed(it.url);
    if (conv) src = conv;
  }
  wrap.innerHTML = `<iframe src="${src}" loading="lazy" referrerpolicy="no-referrer"></iframe>`;
  wrap.addEventListener('mouseup', () => {
    it.h = Math.round(wrap.getBoundingClientRect().height);
    wrap.dataset.custom = '1';
    persist();
  });
  mount.after(wrap);
}

export function renderGroups(state, editing, T, I, handlers, saveFn) {
  currentState = state;
  persist = saveFn;
  const groupsEl = document.getElementById('groups');
  const searchEl = document.getElementById('q');
  const reduceMotion = prefersReducedMotion();
  const previousGroupRects = new Map();
  const previousItemRects = new Map();
  if (groupsEl) {
    groupsEl.querySelectorAll('.group[data-id]').forEach((el) => {
      if (!el.dataset?.id) return;
      const rect = el.getBoundingClientRect();
      previousGroupRects.set(el.dataset.id, {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    });
    groupsEl.querySelectorAll('.item[data-gid][data-iid]').forEach((el) => {
      const gid = el.dataset?.gid;
      const iid = el.dataset?.iid;
      if (!gid || !iid) return;
      const rect = el.getBoundingClientRect();
      previousItemRects.set(`${gid}::${iid}`, {
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
    });
  }

  const runEnterAnimation = (el) => {
    if (!el || reduceMotion) return;
    let resolved = false;
    let fallbackId = null;
    const cleanup = () => {
      if (resolved) return;
      resolved = true;
      el.removeEventListener('animationend', handleEnd);
      if (
        fallbackId != null &&
        typeof window !== 'undefined' &&
        typeof window.clearTimeout === 'function'
      ) {
        window.clearTimeout(fallbackId);
      }
      if (el.dataset.anim === 'enter') {
        el.removeAttribute('data-anim');
      }
    };
    const handleEnd = (event) => {
      if (event?.target !== el) return;
      cleanup();
    };
    el.dataset.anim = 'enter';
    void el.offsetWidth;
    el.addEventListener('animationend', handleEnd);
    if (
      typeof window !== 'undefined' &&
      typeof window.setTimeout === 'function'
    ) {
      fallbackId = window.setTimeout(() => cleanup(), 400);
    }
  };

  selectedGroups = [];
  if (reminderTicker) {
    clearInterval(reminderTicker);
    reminderTicker = null;
  }
  reminderEntryCache = new Map();

  const q = (searchEl?.value || '').toLowerCase().trim();
  if (!groupsEl) {
    cleanupCardRegistry(new Set());
    return;
  }
  const fragment = document.createDocumentFragment();
  const activeCardIds = new Set();
  function handleDrop(e) {
    e.preventDefault();
    const fromId = e.dataTransfer.getData('text/group');
    const toId = e.currentTarget.dataset.id;
    if (!fromId || fromId === toId) return;
    const ids = currentState.groups.map((g) => g.id);
    if (currentState.remindersCard?.enabled) {
      const rPos = Math.max(
        0,
        Math.min(currentState.remindersPos || 0, ids.length),
      );
      ids.splice(rPos, 0, 'reminders');
    }
    const fromIdx = ids.indexOf(fromId);
    const toIdx = ids.indexOf(toId);
    if (fromIdx === -1 || toIdx === -1) return;
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, fromId);
    const map = new Map(currentState.groups.map((g) => [g.id, g]));
    currentState.remindersPos = ids.indexOf('reminders');
    if (currentState.remindersPos < 0) currentState.remindersPos = 0;
    currentState.groups = ids
      .filter((id) => id !== 'reminders')
      .map((id) => map.get(id));
    persist();
    render(currentState, editing, T, I, handlers, persist);
  }
  const groupMap = new Map(state.groups.map((g) => [g.id, g]));
  const ids = state.groups.map((g) => g.id);
  const specials = [];
  if (state.remindersCard?.enabled) {
    specials.push({ id: 'reminders', pos: state.remindersPos || 0 });
  }
  specials
    .sort((a, b) => a.pos - b.pos)
    .forEach((special) => {
      const pos = Math.max(0, Math.min(special.pos, ids.length));
      ids.splice(pos, 0, special.id);
    });
  currentState.remindersPos = ids.indexOf('reminders');
  if (currentState.remindersPos < 0)
    currentState.remindersPos = Math.max(
      0,
      Math.min(state.remindersPos || 0, ids.length),
    );
  const allGroups = ids
    .map((id) => {
      if (id === 'reminders') return { id: 'reminders' };
      return groupMap.get(id);
    })
    .filter(Boolean);
  const hasAnyGroups = Array.isArray(state.groups) && state.groups.length > 0;
  const hasRemindersCard = Boolean(state.remindersCard?.enabled);

  if (!hasAnyGroups && !hasRemindersCard) {
    groupsEl.classList.add('is-empty');
    const performAddGroup = () => {
      if (typeof handlers?.beginAddGroup === 'function') {
        handlers.beginAddGroup();
        return;
      }
      if (typeof handlers?.addGroup === 'function') {
        handlers.addGroup();
      }
    };
    const emptyMessage =
      T.emptyGroups ||
      T.empty ||
      'Dar nėra sukurtų grupių. Įjunkite redagavimą ir sukurkite pirmą kortelę.';
    const emptyAction =
      typeof handlers?.beginAddGroup === 'function' ||
      typeof handlers?.addGroup === 'function'
        ? {
            actionLabel: T.emptyGroupsAction || T.addGroup || 'Pridėti grupę',
            onAction: () => performAddGroup(),
          }
        : undefined;
    const emptyState = createEmptyState(I.folder, emptyMessage, emptyAction);
    fragment.appendChild(emptyState);
    groupsEl.replaceChildren(fragment);
    cleanupCardRegistry(new Set());
    return;
  }

  groupsEl.classList.remove('is-empty');
  allGroups.forEach((g) => {
    if (g.id === 'reminders') {
      const reminderHandlers = handlers.reminders || {};
      const cardState =
        (typeof reminderHandlers.cardState === 'function'
          ? reminderHandlers.cardState()
          : state.remindersCard) || {};
      const { section: remGrp, header, content: body } =
        createGroupStructure('reminders', 'reminders');
      const rWidth =
        cardState.width ?? SIZE_MAP[cardState.wSize || 'md']?.width ?? 360;
      const rHeight =
        cardState.height ?? SIZE_MAP[cardState.hSize || 'md']?.height ?? 360;
      const rWSize = cardState.wSize || sizeFromWidth(rWidth);
      const rHSize = cardState.hSize || sizeFromHeight(rHeight);
      applySize(remGrp, rWidth, rHeight, rWSize, rHSize);
      initResizeHandles(remGrp);
      remGrp.style.resize = editing ? 'both' : 'none';
      remGrp.style.overflow = editing ? 'auto' : 'visible';
      if (editing) {
        remGrp.draggable = true;
        remGrp.addEventListener('dragstart', (e) => {
          if (remGrp.dataset.resizing === '1') {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData('text/group', 'reminders');
          remGrp.style.opacity = 0.5;
        });
        remGrp.addEventListener('dragend', () => {
          remGrp.style.opacity = 1;
        });
        remGrp.addEventListener('dragover', (e) => {
          e.preventDefault();
        });
        remGrp.addEventListener('drop', handleDrop);
      } else {
        remGrp.draggable = false;
      }
      remGrp.addEventListener('click', (e) => {
        if (!e.shiftKey) return;
        if (e.target.closest('button')) return;
        e.preventDefault();
        const idx = selectedGroups.indexOf(remGrp);
        if (idx === -1) {
          selectedGroups.push(remGrp);
          remGrp.classList.add('selected');
        } else {
          selectedGroups.splice(idx, 1);
          remGrp.classList.remove('selected');
        }
      });
      const titleText = (cardState.title || '').trim() ||
        T.remindersCardTitle ||
        T.reminders;
      header.innerHTML = `
        <div class="group-title">
          <span class="dot" aria-hidden="true"></span>
          <h2 data-reminders-title>${escapeHtml(titleText)}</h2>
        </div>
        ${
          editing
            ? `<div class="group-actions">
          <button type="button" title="${escapeHtml(T.remove)}" aria-label="${escapeHtml(T.remove)}" data-act="remove">${I.trash}</button>
        </div>`
            : ''
        }
      `;
      header.style.setProperty('--dot-color', '#38bdf8');
      const titleEl = header.querySelector('[data-reminders-title]');
      if (titleEl) {
        titleEl.contentEditable = editing;
        titleEl.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') {
            ev.preventDefault();
            titleEl.blur();
          }
        });
        titleEl.addEventListener('blur', () => {
          if (!editing) return;
          if (reminderHandlers.setTitle) {
            reminderHandlers.setTitle(titleEl.textContent || '');
          }
        });
      }
      header.addEventListener('click', (ev) => {
        const btn = ev.target.closest('button[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'remove') {
          if (handlers.confirmDialog) {
            handlers
              .confirmDialog(T.reminderCardRemove)
              .then((ok) => ok && reminderHandlers.removeCard?.());
          } else {
            reminderHandlers.removeCard?.();
          }
        }
      });
      const controlsWrap = document.createElement('div');
      controlsWrap.className = 'reminder-controls';

      const quickSection = document.createElement('section');
      quickSection.className = 'reminder-quick-start';
      const quickDetails = document.createElement('details');
      quickDetails.className = 'reminder-quick-details';
      quickDetails.open = cardState.showQuick === true;
      const quickSummary = document.createElement('summary');
      quickSummary.className = 'reminder-quick-summary';
      quickSummary.textContent =
        T.reminderQuickTitle || 'Greiti laikmačiai (išskleiskite)';
      quickDetails.appendChild(quickSummary);
      const quickText = document.createElement('div');
      quickText.className = 'reminder-quick-text';
      quickText.innerHTML = `
        <p>${escapeHtml(T.reminderQuickDescription)}</p>
      `;
      quickDetails.appendChild(quickText);
      const quickButtons = document.createElement('div');
      quickButtons.className = 'reminder-quick-buttons';
      quickButtons.setAttribute('data-reminder-quick-start', '1');
      quickDetails.appendChild(quickButtons);
      quickSection.appendChild(quickDetails);
      const quickPresets = (() => {
        if (typeof reminderHandlers.quickPresets === 'function') {
          const res = reminderHandlers.quickPresets();
          if (Array.isArray(res)) return res;
        }
        return [5, 10, 15, 30];
      })();
      const quickLabels = {
        5: T.reminderPlus5,
        10: T.reminderPlus10,
        15: T.reminderPlus15,
        30: T.reminderPlus30,
      };
      quickPresets
        .filter((min) => Number.isFinite(min) && min > 0)
        .forEach((min) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.minutes = String(min);
          const titleLabel = (T.reminderTimerPattern || 'Laikmatis {min} min.').replace(
            '{min}',
            min,
          );
          const quickLabel = quickLabels[min] || `+${min} min`;
          btn.title = titleLabel;
          btn.innerHTML = `${I.clock} ${escapeHtml(quickLabel)}`;
          quickButtons.appendChild(btn);
        });
      if (!quickButtons.childElementCount) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.minutes = '5';
        btn.title = T.reminderPlus5;
        btn.innerHTML = `${I.clock} ${escapeHtml(T.reminderPlus5)}`;
        quickButtons.appendChild(btn);
      }
      controlsWrap.appendChild(quickSection);
      quickDetails.addEventListener('toggle', () => {
        if (!cardState || typeof cardState !== 'object') return;
        const nextState = Boolean(quickDetails.open);
        if (cardState.showQuick === nextState) return;
        cardState.showQuick = nextState;
        if (typeof persist === 'function') {
          persist();
        }
      });

      const form = document.createElement('form');
      form.className = 'reminder-form';
      form.setAttribute('data-reminder-form', '1');
      form.innerHTML = `
        <div class="reminder-form-fields">
          <label class="reminder-field reminder-field--full" data-reminder-field="title">
            <span>${escapeHtml(T.reminderName)}</span>
            <input name="title" placeholder="${escapeHtml(
              T.reminderNamePH || ''
            )}" autocomplete="off">
          </label>
          <div class="reminder-form-row">
            <label class="reminder-field" data-reminder-field="minutes">
              <span>${escapeHtml(T.reminderMinutes)}</span>
              <input name="reminderMinutes" type="number" min="1" step="1">
            </label>
            <div class="reminder-quick-fill" data-reminder-quick-fill></div>
          </div>
          <label class="reminder-field reminder-field--full" data-reminder-field="datetime">
            <span>${escapeHtml(T.reminderExactTime)}</span>
            <input name="reminderAt" type="datetime-local">
          </label>
        </div>
        <div class="reminder-form-actions">
          <button type="submit" class="btn-accent" data-reminder-submit>
            ${I.plus} <span>${escapeHtml(T.reminderCreate)}</span>
          </button>
          <button type="button" data-reminder-cancel hidden>
            ${I.close} <span>${escapeHtml(T.reminderCancelEdit)}</span>
          </button>
        </div>
        <p class="error" data-reminder-error aria-live="polite"></p>
      `;
      const quickFill = form.querySelector('[data-reminder-quick-fill]');
      quickPresets
        .filter((min) => Number.isFinite(min) && min > 0)
        .forEach((min) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.dataset.minutes = String(min);
          btn.textContent = quickLabels[min] || `+${min} min`;
          quickFill?.appendChild(btn);
        });
      const formState = reminderHandlers.formState
        ? reminderHandlers.formState()
        : { editingId: null, values: null, error: '' };
      const values = formState?.values || {};
      form.title.value = values.title || '';
      form.reminderMinutes.value = values.reminderMinutes || '';
      form.reminderAt.value = values.reminderAt || '';
      const errorEl = form.querySelector('[data-reminder-error]');
      if (errorEl) errorEl.textContent = formState.error || '';
      const submitBtn = form.querySelector('[data-reminder-submit]');
      const cancelBtn = form.querySelector('[data-reminder-cancel]');
      const createLabel = `${I.plus} <span>${escapeHtml(T.reminderCreate)}</span>`;
      const updateLabel = `${I.check} <span>${escapeHtml(T.reminderUpdate)}</span>`;
      const cancelLabel = `${I.close} <span>${escapeHtml(
        T.reminderCancelEdit,
      )}</span>`;
      if (cancelBtn) {
        cancelBtn.innerHTML = cancelLabel;
      }
      if (formState.editingId) {
        if (submitBtn) submitBtn.innerHTML = updateLabel;
        if (cancelBtn) cancelBtn.hidden = false;
        form.classList.add('is-editing');
      } else {
        if (submitBtn) submitBtn.innerHTML = createLabel;
        if (cancelBtn) cancelBtn.hidden = true;
        form.classList.remove('is-editing');
      }
      const setActiveMode = (mode) => {
        const next = mode === 'datetime' ? 'datetime' : 'minutes';
        form.setAttribute('data-active-mode', next);
      };
      const initialMode = values.reminderMode
        ? values.reminderMode
        : values.reminderAt
          ? 'datetime'
          : 'minutes';
      setActiveMode(initialMode);
      form.reminderMinutes.addEventListener('input', () => {
        if (form.reminderMinutes.value) setActiveMode('minutes');
      });
      form.reminderAt.addEventListener('input', () => {
        if (form.reminderAt.value) setActiveMode('datetime');
      });
      quickFill?.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-minutes]');
        if (!btn) return;
        form.reminderMinutes.value = btn.dataset.minutes || '';
        setActiveMode('minutes');
        form.reminderMinutes.dispatchEvent(new Event('input', { bubbles: true }));
        if (typeof form.reminderMinutes.focus === 'function') {
          form.reminderMinutes.focus();
        }
      });
      quickButtons.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-minutes]');
        if (!btn) return;
        const minutes = parseInt(btn.dataset.minutes || '', 10);
        if (Number.isFinite(minutes) && reminderHandlers.quick) {
          reminderHandlers.quick(minutes);
        }
        setActiveMode('minutes');
      });
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        if (typeof reminderHandlers.submit === 'function') {
          const payload = Object.fromEntries(new FormData(form));
          reminderHandlers.submit(payload);
        }
      });
      cancelBtn?.addEventListener('click', () => {
        reminderHandlers.cancelEdit?.();
      });
      controlsWrap.appendChild(form);

      body.appendChild(controlsWrap);

      const listSection = document.createElement('section');
      listSection.className = 'reminder-list-section';
      listSection.dataset.state = 'empty';
      listSection.innerHTML = `
        <h3>${escapeHtml(T.remindersUpcoming)}</h3>
        <div class="reminder-empty" data-reminder-empty>${escapeHtml(
          T.noReminders,
        )}</div>
        <ul class="reminder-items" data-reminder-list></ul>
      `;
      const listEl = listSection.querySelector('[data-reminder-list]');
      const emptyEl = listSection.querySelector('[data-reminder-empty]');
      const snoozeMinutes = reminderHandlers.snoozeMinutes || 5;
      const updateReminders = () => {
        const entries = reminderHandlers.entries
          ? reminderHandlers.entries()
          : [];
        const sorted = Array.isArray(entries)
          ? [...entries].sort((a, b) => a.at - b.at)
          : [];
        reminderEntryCache = new Map(sorted.map((entry) => [entry.key, entry]));
        if (!listEl) return;
        listEl.innerHTML = '';
        const hasItems = sorted.length > 0;
        if (!hasItems) {
          if (emptyEl) {
            emptyEl.hidden = false;
            emptyEl.setAttribute('aria-hidden', 'false');
          }
          listEl.hidden = true;
          listSection.dataset.state = 'empty';
          return;
        }
        if (emptyEl) {
          emptyEl.hidden = true;
          emptyEl.setAttribute('aria-hidden', 'true');
        }
        listEl.hidden = false;
        listSection.dataset.state = 'has-items';
        sorted.forEach((entry) => {
          const li = document.createElement('li');
          li.dataset.key = entry.key;
          const remaining = Number.isFinite(entry.at)
            ? entry.at - Date.now()
            : NaN;
          const duration = Number.isFinite(entry.duration)
            ? entry.duration
            : null;
          const isOverdue = Number.isFinite(remaining) && remaining <= 0;
          let ratio = duration
            ? Math.max(0, Math.min(1, 1 - remaining / duration))
            : 0;
          if (isOverdue) {
            ratio = 1;
          }
          li.classList.toggle('overdue', isOverdue);
          const progress = document.createElement('div');
          progress.className = 'reminder-progress';
          progress.style.setProperty('--ratio', String(ratio));
          if (isOverdue) {
            progress.dataset.state = 'overdue';
          } else {
            delete progress.dataset.state;
          }
          const clockLabel = formatClockLabel(remaining);
          const relativeLabel = formatRelativeTime(remaining);
          const statusLabel = isOverdue
            ? T.reminderOverdueAria || T.reminderOverdue || T.reminderLeft
            : T.reminderLeft;
          progress.setAttribute('aria-label', `${statusLabel}: ${relativeLabel}`);
          progress.innerHTML = `<span>${escapeHtml(clockLabel)}</span>`;
          li.appendChild(progress);
          const info = document.createElement('div');
          info.className = 'reminder-info';
          const titleRow = document.createElement('div');
          titleRow.className = 'reminder-title';
          titleRow.textContent =
            entry.body || entry.title || T.reminderNotificationTitle;
          info.appendChild(titleRow);
          const meta = document.createElement('div');
          meta.className = 'reminder-meta';
          const typeSpan = document.createElement('span');
          typeSpan.className = 'reminder-tag';
          const typeLabel =
            entry.data?.type === 'note'
              ? T.reminderTypeNotes
              : entry.data?.type === 'item'
                ? T.reminderTypeItem
                : T.reminderTypeCustom;
          typeSpan.textContent = typeLabel;
          meta.appendChild(typeSpan);
          const dueSpan = document.createElement('span');
          dueSpan.className = 'reminder-due';
          dueSpan.textContent = `${T.reminderDue}: ${formatDueLabel(entry.at)}`;
          meta.appendChild(dueSpan);
          const leftSpan = document.createElement('span');
          leftSpan.className = 'reminder-left';
          leftSpan.textContent = `${T.reminderLeft}: ${formatRelativeTime(
            remaining,
          )}`;
          meta.appendChild(leftSpan);
          info.appendChild(meta);
          li.appendChild(info);
          const actions = document.createElement('div');
          actions.className = 'reminder-actions';
          const snoozeBtn = document.createElement('button');
          snoozeBtn.type = 'button';
          snoozeBtn.dataset.action = 'snooze';
          snoozeBtn.title = T.reminderSnoozeShort || T.reminderSnooze;
          snoozeBtn.innerHTML = `${I.clock}`;
          actions.appendChild(snoozeBtn);
          const editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.dataset.action = 'edit';
          editBtn.title = T.reminderEditInline || T.reminderEdit;
          editBtn.innerHTML = `${I.pencil}`;
          actions.appendChild(editBtn);
          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.dataset.action = 'remove';
          removeBtn.title = T.reminderRemove || T.remove;
          removeBtn.classList.add('btn-danger');
          removeBtn.innerHTML = `${I.trash}`;
          actions.appendChild(removeBtn);
          li.appendChild(actions);
          listEl.appendChild(li);
        });
      };
      updateReminders();
      if (reminderTicker) {
        clearInterval(reminderTicker);
      }
      reminderTicker = setInterval(updateReminders, 1000);
      listEl?.addEventListener('click', (event) => {
        const btn = event.target.closest('button[data-action]');
        if (!btn) return;
        const item = btn.closest('li');
        if (!item) return;
        const key = item.dataset.key;
        if (!key) return;
        const action = btn.dataset.action;
        if (action === 'remove') {
          reminderHandlers.clear?.(key);
        } else if (action === 'snooze') {
          reminderHandlers.snooze?.(key, snoozeMinutes);
        } else if (action === 'edit') {
          const entry = reminderEntryCache.get(key);
          if (entry) reminderHandlers.edit?.(entry);
        }
      });
      body.appendChild(listSection);

      fragment.appendChild(remGrp);
      activeCardIds.add('reminders');
      registerCard('reminders', remGrp);
      const inner = remGrp.querySelector('.group-content');
      setupMinSizeWatcher(remGrp, inner);

      return;
    }
    if (g.type === 'note') {
      const { section: noteGrp, header: h, content } =
        createGroupStructure('note', g.id);
      const fallbackW = SIZE_MAP[g.wSize ?? 'md']?.width ?? SIZE_MAP.md.width;
      const fallbackH = SIZE_MAP[g.hSize ?? 'md']?.height ?? SIZE_MAP.md.height;
      const nWidth = Number.isFinite(g.width) ? g.width : fallbackW;
      const nHeight = Number.isFinite(g.height) ? g.height : fallbackH;
      const nWSize = g.wSize || sizeFromWidth(nWidth);
      const nHSize = g.hSize || sizeFromHeight(nHeight);
      applySize(noteGrp, nWidth, nHeight, nWSize, nHSize);
      initResizeHandles(noteGrp);
      noteGrp.style.resize = editing ? 'both' : 'none';
      noteGrp.style.overflow = editing ? 'auto' : 'visible';
      if (editing) {
        noteGrp.draggable = true;
        noteGrp.addEventListener('dragstart', (e) => {
          if (noteGrp.dataset.resizing === '1') {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData('text/group', g.id);
          noteGrp.style.opacity = 0.5;
        });
        noteGrp.addEventListener('dragend', () => {
          noteGrp.style.opacity = 1;
        });
        noteGrp.addEventListener('dragover', (e) => {
          e.preventDefault();
        });
        noteGrp.addEventListener('drop', handleDrop);
      }
      noteGrp.addEventListener('click', (e) => {
        if (!e.shiftKey) return;
        if (e.target.closest('button')) return;
        e.preventDefault();
        const idx = selectedGroups.indexOf(noteGrp);
        if (idx === -1) {
          selectedGroups.push(noteGrp);
          noteGrp.classList.add('selected');
        } else {
          selectedGroups.splice(idx, 1);
          noteGrp.classList.remove('selected');
        }
      });
      const dotColor = g.color || '#fef08a';
      const headerTitle = escapeHtml(g.title || g.name || T.notes);
      h.innerHTML = `
        <div class="group-title">
          <span class="dot" aria-hidden="true"></span>
          <h2>${headerTitle}</h2>
        </div>
        ${
          editing
            ? `<div class="group-actions">
          <button type="button" title="${T.edit}" aria-label="${T.edit}" data-act="edit">${I.pencil}</button>
          <button type="button" class="btn-danger" title="${T.deleteNotes}" aria-label="${T.deleteNotes}" data-act="del">${I.trash}</button>
        </div>`
            : ''
        }`;
      h.style.setProperty('--dot-color', dotColor);
      h.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        if (btn.dataset.act === 'edit') handlers.notes?.edit?.(g.id);
        if (btn.dataset.act === 'del') handlers.notes?.remove?.(g.id);
      });
      const itemsWrap = document.createElement('div');
      itemsWrap.className = 'items';
      const itemsScroll = document.createElement('div');
      itemsScroll.className = 'items-scroll';
      const p = document.createElement('p');
      p.className = 'note-content';
      const padding = Number.isFinite(g.padding) ? g.padding : 20;
      const fontSize = Number.isFinite(g.fontSize) ? g.fontSize : 20;
      noteGrp.style.setProperty('--note-padding', `${padding}px`);
      noteGrp.style.setProperty('--note-font-size', `${fontSize}px`);
      p.textContent = g.text || '';
      itemsScroll.appendChild(p);
      itemsWrap.appendChild(itemsScroll);
      content.appendChild(itemsWrap);
      fragment.appendChild(noteGrp);
      activeCardIds.add(g.id);
      registerCard(g.id, noteGrp);
      const inner = noteGrp.querySelector('.items');
      setupMinSizeWatcher(noteGrp, inner);
      
      return;
    }
    if (g.type === 'chart') {
      const { section: grp, header: h, content } =
        createGroupStructure('chart', g.id);
      const gWidth =
        g.width ?? SIZE_MAP[g.wSize ?? 'md'].width;
      const gHeight =
        g.height ?? SIZE_MAP[g.hSize ?? 'md'].height;
      const gWSize = g.wSize ?? sizeFromWidth(gWidth);
      const gHSize = g.hSize ?? sizeFromHeight(gHeight);
      applySize(grp, gWidth, gHeight, gWSize, gHSize);
      initResizeHandles(grp);
      grp.style.resize = editing ? 'both' : 'none';
      grp.style.overflow = editing ? 'auto' : 'visible';
      if (editing) {
        grp.draggable = true;
        grp.addEventListener('dragstart', (e) => {
          if (grp.dataset.resizing === '1') {
            e.preventDefault();
            return;
          }
          e.dataTransfer.setData('text/group', g.id);
          grp.style.opacity = 0.5;
        });
        grp.addEventListener('dragend', () => {
          grp.style.opacity = 1;
        });
        grp.addEventListener('dragover', (e) => {
          e.preventDefault();
        });
        grp.addEventListener('drop', handleDrop);
      }

      grp.addEventListener('click', (e) => {
        if (!e.shiftKey) return;
        if (e.target.closest('button')) return;
        e.preventDefault();
        const idx = selectedGroups.indexOf(grp);
        if (idx === -1) {
          selectedGroups.push(grp);
          grp.classList.add('selected');
        } else {
          selectedGroups.splice(idx, 1);
          grp.classList.remove('selected');
        }
      });

      h.innerHTML = `
        <div class="group-title">
          <span class="dot" aria-hidden="true"></span>
          <h2 title="Tempkite, kad perrikiuotumėte" class="handle">${escapeHtml(g.name || '')}</h2>
        </div>
        ${
          editing
            ? `<div class="group-actions">
          <button type="button" title="${T.moveUp}" aria-label="${T.moveUp}" data-act="up">${I.arrowUp}</button>
          <button type="button" title="${T.moveDown}" aria-label="${T.moveDown}" data-act="down">${I.arrowDown}</button>
          <button type="button" title="${T.editChart}" aria-label="${T.editChart}" data-act="edit">${I.pencil}</button>
          <button type="button" class="btn-danger" title="${T.deleteGroup}" aria-label="${T.deleteGroup}" data-act="del">${I.trash}</button>
        </div>`
            : ''
        }`;
      h.style.setProperty('--dot-color', g.color || '#6ee7b7');

      h.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const act = btn.dataset.act;
        if (act === 'edit') return handlers.editChart(g.id);
        if (act === 'del') {
          handlers.confirmDialog(T.confirmDelChart).then((ok) => {
            if (ok) handlers.removeGroup?.(g.id);
          });
          return;
        }
        if (act === 'up' || act === 'down') {
          const idx = state.groups.findIndex((x) => x.id === g.id);
          if (act === 'up' && idx > 0) {
            const [moved] = state.groups.splice(idx, 1);
            state.groups.splice(idx - 1, 0, moved);
          }
          if (act === 'down' && idx < state.groups.length - 1) {
            const [moved] = state.groups.splice(idx, 1);
            state.groups.splice(idx + 1, 0, moved);
          }
          persist();
          render(state, editing, T, I, handlers, saveFn);
        }
      });

      const emb = document.createElement('div');
      emb.className = 'embed';
      emb.dataset.custom = '1';
      emb.style.flex = '1';
      emb.style.resize = 'none';

      const frameWrap = document.createElement('div');
      frameWrap.className = 'chart-frame';
      const iframe = document.createElement('iframe');
      iframe.src = g.url;
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer';
      iframe.allowFullscreen = true;
      iframe.title = g.name ? `${g.name}` : T.chartFrameTitle || 'Grafikas';

      const clampScale = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return 1;
        return Math.min(2, Math.max(0.5, numeric));
      };
      const clampHeight = (value) => {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return null;
        return Math.min(2000, Math.max(120, Math.round(numeric)));
      };

      const fallbackCardHeight = Number.isFinite(g.height)
        ? g.height
        : SIZE_MAP[g.hSize ?? 'md']?.height ?? SIZE_MAP.md.height;
      const baseHeightRaw = Number.isFinite(g.frameHeight)
        ? g.frameHeight
        : Number.isFinite(g.h)
          ? g.h
          : null;
      const baseHeight = clampHeight(baseHeightRaw) ?? clampHeight(fallbackCardHeight);
      const scale = clampScale(g.scale);

      if (baseHeight) {
        const displayHeight = Math.max(120, Math.round(baseHeight * scale));
        emb.style.minHeight = `${displayHeight}px`;
        frameWrap.style.height = `${displayHeight}px`;
        iframe.style.height = `${baseHeight}px`;
        iframe.style.width = scale === 1 ? '100%' : `${(100 / scale).toFixed(2)}%`;
        iframe.style.transform = scale === 1 ? 'none' : `scale(${scale})`;
        iframe.style.transformOrigin = 'top left';
        if (Number.isFinite(g.frameHeight) || Number.isFinite(g.h)) {
          iframe.style.aspectRatio = 'auto';
        }
      }

      frameWrap.appendChild(iframe);
      emb.appendChild(frameWrap);
      content.appendChild(emb);
      fragment.appendChild(grp);
      activeCardIds.add(g.id);
      registerCard(g.id, grp);
      const inner = grp.querySelector('.embed');
      setupMinSizeWatcher(grp, inner);
      
      return;
    }
    const { section: grp, header: h, content } =
      createGroupStructure('links', g.id);
    const gWidth2 =
      g.width ?? SIZE_MAP[g.wSize ?? 'md'].width;
    const gHeight2 =
      g.height ?? SIZE_MAP[g.hSize ?? 'md'].height;
    const gWSize2 = g.wSize ?? sizeFromWidth(gWidth2);
    const gHSize2 = g.hSize ?? sizeFromHeight(gHeight2);
    applySize(grp, gWidth2, gHeight2, gWSize2, gHSize2);
    initResizeHandles(grp);
    grp.style.resize = editing ? 'both' : 'none';
    grp.style.overflow = editing ? 'auto' : 'visible';
    if (editing) {
      grp.draggable = true;
      grp.addEventListener('dragstart', (e) => {
        if (grp.dataset.resizing === '1') {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('text/group', g.id);
        grp.style.opacity = 0.5;
      });
      grp.addEventListener('dragend', () => {
        grp.style.opacity = 1;
      });
      grp.addEventListener('dragover', (e) => {
        e.preventDefault();
      });
      grp.addEventListener('drop', handleDrop);
    }

    grp.addEventListener('click', (e) => {
      if (!e.shiftKey) return;
      if (e.target.closest('button')) return;
      e.preventDefault();
      const idx = selectedGroups.indexOf(grp);
      if (idx === -1) {
        selectedGroups.push(grp);
        grp.classList.add('selected');
      } else {
        selectedGroups.splice(idx, 1);
        grp.classList.remove('selected');
      }
    });

    h.innerHTML = `
        <div class="group-title">
          <span class="dot" aria-hidden="true"></span>
          <h2 title="Tempkite, kad perrikiuotumėte" class="handle">${escapeHtml(g.name)}</h2>
        </div>
        ${
          editing
            ? `<div class="group-actions">
          <button type="button" title="${T.moveUp}" aria-label="${T.moveUp}" data-act="up">${I.arrowUp}</button>
          <button type="button" title="${T.moveDown}" aria-label="${T.moveDown}" data-act="down">${I.arrowDown}</button>
          <button type="button" title="${T.openAll}" aria-label="${T.openAll}" data-act="openAll">${I.arrowUpRight}</button>
          <button type="button" title="${T.addItem}" aria-label="${T.addItem}" data-act="add">${I.plus}</button>
          <button type="button" title="${T.editGroup}" aria-label="${T.editGroup}" data-act="edit">${I.pencil}</button>
          <button type="button" class="btn-danger" title="${T.deleteGroup}" aria-label="${T.deleteGroup}" data-act="del">${I.trash}</button>
        </div>`
            : ''
        }`;
    h.style.setProperty('--dot-color', g.color || '#6ee7b7');

    h.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'add') return handlers.addItem(g.id);
      if (act === 'edit') return handlers.editGroup(g.id);
      if (act === 'del') {
        handlers.confirmDialog(T.confirmDelGroup).then((ok) => {
          if (ok) handlers.removeGroup?.(g.id);
        });
        return;
      }
      if (act === 'up' || act === 'down') {
        const idx = state.groups.findIndex((x) => x.id === g.id);
        if (act === 'up' && idx > 0) {
          const [moved] = state.groups.splice(idx, 1);
          state.groups.splice(idx - 1, 0, moved);
        }
        if (act === 'down' && idx < state.groups.length - 1) {
          const [moved] = state.groups.splice(idx, 1);
          state.groups.splice(idx + 1, 0, moved);
        }
        persist();
        render(state, editing, T, I, handlers, saveFn);
        return;
      }
      if (act === 'openAll') {
        g.items
          .filter((i) => i.type === 'link')
          .forEach((i) => window.open(i.url, '_blank'));
      }
    });

    const itemsWrap = document.createElement('div');
    itemsWrap.className = 'items';
    const itemsScroll = document.createElement('div');
    itemsScroll.className = 'items-scroll';
    if (editing) {
      itemsScroll.addEventListener('dragover', (e) => e.preventDefault());
      itemsScroll.addEventListener('drop', (e) => {
        e.preventDefault();
        const data = JSON.parse(e.dataTransfer.getData('text/item') || '{}');
        if (!data.iid) return;
        const fromG = state.groups.find((x) => x.id === data.gid);
        const idxFrom = fromG.items.findIndex((x) => x.id === data.iid);
        const [moved] = fromG.items.splice(idxFrom, 1);
        g.items.push(moved);
        persist();
        render(state, editing, T, I, handlers, saveFn);
      });
    }

    const filteredItems = g.items.filter((i) => {
      if (!q) return true;
      return [i.title, i.url, i.note]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });

    if (filteredItems.length === 0) {
      const emptyMessage = q ? T.noMatches : T.empty;
      const emptyAction =
        editing && typeof handlers?.addItem === 'function'
          ? {
              actionLabel: T.addItem,
              onAction: () => {
                // Allow adding items straight from the empty state while editing.
                const result = handlers.addItem(g.id);
                if (result && typeof result.then === 'function') {
                  return result
                    .then(() =>
                      render(state, editing, T, I, handlers, saveFn),
                    )
                    .catch((err) => {
                      console.error('Failed to add item from empty state', err);
                    });
                }
                render(state, editing, T, I, handlers, saveFn);
                return null;
              },
            }
          : undefined;
      const empty = createEmptyState(I.clipboard, emptyMessage, emptyAction);
      itemsScroll.appendChild(empty);
    } else {
      filteredItems.forEach((it) => {
        const isLink = !editing && it.type === 'link';
        const card = document.createElement(isLink ? 'a' : 'div');
        card.className = 'item';
        card.dataset.gid = g.id;
        card.dataset.iid = it.id;
        card.draggable = editing;
        if (isLink) {
          card.href = it.url;
          card.target = '_blank';
          card.rel = 'noopener';
        }
        if (editing) {
          card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData(
              'text/item',
              JSON.stringify({ gid: g.id, iid: it.id }),
            );
            card.classList.add('dragging');
          });
          card.addEventListener('dragend', () =>
            card.classList.remove('dragging'),
          );
          card.addEventListener('dragover', (e) => e.preventDefault());
          card.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const data = JSON.parse(
              e.dataTransfer.getData('text/item') || '{}',
            );
            if (!data.iid) return;
            if (data.gid === g.id) {
              const idxFrom = g.items.findIndex((x) => x.id === data.iid);
              const idxTo = g.items.findIndex((x) => x.id === it.id);
              const [moved] = g.items.splice(idxFrom, 1);
              g.items.splice(idxTo, 0, moved);
              persist();
              render(state, editing, T, I, handlers, saveFn);
            } else {
              const fromG = state.groups.find((x) => x.id === data.gid);
              const idxFrom = fromG.items.findIndex((x) => x.id === data.iid);
              const [moved] = fromG.items.splice(idxFrom, 1);
              const idxTo = g.items.findIndex((x) => x.id === it.id);
              g.items.splice(idxTo, 0, moved);
              persist();
              render(state, editing, T, I, handlers, saveFn);
            }
          });
        }

        const favicon = it.icon
          ? `<div class="favicon">${I[it.icon] || ''}</div>`
          : it.iconUrl
            ? `<img class="favicon" alt="" src="${it.iconUrl}">`
            : it.type === 'link'
              ? `<img class="favicon" alt="" src="${toFavicon(it.url)}">`
              : `<div class="favicon">${
                  it.type === 'sheet'
                    ? I.table
                    : it.type === 'chart'
                      ? I.chart
                      : I.puzzle
                }</div>`;

        const hasReminder = Number.isFinite(it.reminderAt);
        const reminderLabel = escapeHtml(
          T.reminderNotificationTitle || 'Priminimas',
        );
        const reminderHtml = hasReminder
          ? `<span class="reminder-flag" role="img" aria-label="${reminderLabel}" title="${reminderLabel}">⏰</span>`
          : '';
        const metaHtml = `<div class="meta"><div class="title-row"><div class="title">${escapeHtml(
          it.title || '(be pavadinimo)',
        )}</div>${reminderHtml}</div><div class="sub">${escapeHtml(
          it.note || '',
        )}</div></div>`;

        const actionsHtml = editing
          ? `<div class="actions">
              <button type="button" title="${T.actions}" aria-label="${T.actions}" data-a="menu">${I.more}</button>
            </div>`
          : '';
        card.innerHTML = `${favicon}${metaHtml}${actionsHtml}`;
        const imgFav = card.querySelector('img.favicon');
        if (imgFav)
          imgFav.addEventListener('error', (e) => {
            const fallback =
              it.type === 'sheet'
                ? I.table
                : it.type === 'chart'
                  ? I.chart
                  : it.type === 'embed'
                    ? I.puzzle
                    : I.globe;
            e.target.outerHTML = `<div class="favicon">${fallback}</div>`;
          });

        card.addEventListener('click', (e) => {
          if (e.target.closest('a')) return;
          if (editing) {
            const b = e.target.closest('button');
            if (!b) return;
            const a = b.dataset.a;
            if (a === 'menu') {
              if (floatingMenu) {
                if (floatingMenu.dataset.item === it.id) {
                  floatingMenu.remove();
                  floatingMenu = null;
                  return;
                }
                floatingMenu.remove();
              }
              floatingMenu = document.createElement('div');
              floatingMenu.className = 'floating-menu';
              floatingMenu.dataset.item = it.id;
              floatingMenu.innerHTML = `
                <button type="button" data-a="up">${I.arrowUp} ${T.moveUp}</button>
                <button type="button" data-a="down">${I.arrowDown} ${T.moveDown}</button>
                <button type="button" data-a="preview">${I.eye} ${T.preview}</button>
                <button type="button" data-a="edit">${I.pencil} ${T.edit}</button>
                <button type="button" class="btn-danger" data-a="del">${I.trash} ${T.remove}</button>
              `;
              document.body.appendChild(floatingMenu);
              const rect = b.getBoundingClientRect();
              floatingMenu.style.position = 'fixed';
              floatingMenu.style.top = rect.bottom + 4 + 'px';
              floatingMenu.style.left =
                rect.right - floatingMenu.offsetWidth + 'px';
              floatingMenu.addEventListener('click', (ev) => {
                const btn = ev.target.closest('button');
                if (!btn) return;
                const action = btn.dataset.a;
                floatingMenu.remove();
                floatingMenu = null;
                if (action === 'edit') return handlers.editItem(g.id, it.id);
                if (action === 'del') {
                  handlers.confirmDialog(T.confirmDelItem).then((ok) => {
                    if (ok) handlers.removeItem?.(g.id, it.id);
                  });
                  return;
                }
                if (action === 'preview') return previewItem(it, card);
                if (action === 'up' || action === 'down') {
                  const idx = g.items.findIndex((x) => x.id === it.id);
                  if (action === 'up' && idx > 0) {
                    const [moved] = g.items.splice(idx, 1);
                    g.items.splice(idx - 1, 0, moved);
                  }
                  if (action === 'down' && idx < g.items.length - 1) {
                    const [moved] = g.items.splice(idx, 1);
                    g.items.splice(idx + 1, 0, moved);
                  }
                  persist();
                  render(state, editing, T, I, handlers, saveFn);
                }
              });
              return;
            }
          } else {
            if (it.type !== 'link') previewItem(it, card);
          }
        });

        itemsScroll.appendChild(card);
      });
    }

    itemsWrap.appendChild(itemsScroll);
    content.appendChild(itemsWrap);
    fragment.appendChild(grp);
    activeCardIds.add(g.id);
    registerCard(g.id, grp);
    const inner = grp.querySelector('.items');
    setupMinSizeWatcher(grp, inner);

  });

  groupsEl.replaceChildren(fragment);
  cleanupCardRegistry(activeCardIds);

  const applyLayoutAnimations = () => {
    if (!groupsEl) return;
    const groupEls = Array.from(groupsEl.querySelectorAll('.group[data-id]'));
    groupEls.forEach((el) => {
      const id = el.dataset?.id;
      if (!id) return;
      if (id === 'reminders') {
        // Reminder card turinys kinta dažnai (pvz., laikmačiams tiksint),
        // todėl praleidžiame bendrą FLIP animaciją, kad kortelė nešokinėtų.
        if (el.dataset.anim) {
          el.removeAttribute('data-anim');
        }
        return;
      }
      const previous = previousGroupRects.get(id);
      if (
        previous &&
        !reduceMotion &&
        typeof el.animate === 'function'
      ) {
        const current = el.getBoundingClientRect();
        const width = current.width || 1;
        const height = current.height || 1;
        if (!width || !height) return;
        const deltaX = previous.left - current.left;
        const deltaY = previous.top - current.top;
        const scaleX = previous.width / width;
        const scaleY = previous.height / height;
        if (
          Math.abs(deltaX) > 0.5 ||
          Math.abs(deltaY) > 0.5 ||
          Math.abs(scaleX - 1) > 0.01 ||
          Math.abs(scaleY - 1) > 0.01
        ) {
          el.animate(
            [
              {
                transformOrigin: 'top left',
                transform: `translate(${deltaX}px, ${deltaY}px) scale(${scaleX}, ${scaleY})`,
              },
              {
                transformOrigin: 'top left',
                transform: 'translate(0, 0) scale(1, 1)',
              },
            ],
            {
              duration: 200,
              easing: 'ease-out',
            },
          );
        }
      } else if (!previous) {
        runEnterAnimation(el);
      }
    });

    const itemEls = Array.from(
      groupsEl.querySelectorAll('.item[data-gid][data-iid]'),
    );
    itemEls.forEach((el) => {
      const key = `${el.dataset?.gid || ''}::${el.dataset?.iid || ''}`;
      if (!previousItemRects.has(key)) {
        runEnterAnimation(el);
      }
    });
  };

  if (!reduceMotion && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => applyLayoutAnimations());
  } else {
    applyLayoutAnimations();
  }
}

export function updateEditingUI(editing, state, T, I, renderFn) {
  const editBtn = document.getElementById('editBtn');
  const hasRemindersCard = Boolean(state.remindersCard?.enabled);
  if (!editing) {
    hideResizeGuide();
  }
  if (document.body) {
    document.body.classList.toggle('editing', editing);
    document.body.classList.toggle('is-editing', editing);
    document.body.classList.toggle('has-reminders-card', hasRemindersCard);
  }
  if (editBtn) {
    editBtn.innerHTML = editing
      ? `${I.check} <span>${T.done}</span>`
      : `${I.pencil} <span>${T.editMode}</span>`;
  }
  const addBtn = document.getElementById('addBtn');
  const addGroup = document.getElementById('addGroup');
  const addChart = document.getElementById('addChart');
  const addNote = document.getElementById('addNote');
  const addReminder = document.getElementById('addRemindersCard');
  if (addBtn) addBtn.innerHTML = `${I.plus} <span>${T.add}</span>`;
  if (addGroup) addGroup.innerHTML = `${I.plus} ${T.addGroup}`;
  if (addChart) addChart.innerHTML = `${I.chart} ${T.addChart}`;
  if (addNote) addNote.innerHTML = `${I.plus} ${T.addNote}`;
  if (addReminder) {
    addReminder.innerHTML = `${I.clock} ${T.addRemindersCard}`;
  }
  renderFn();
}

export function applyTheme() {
  let theme = localStorage.getItem('ed_dash_theme');
  if (!theme) {
    const prefersLight =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: light)').matches;
    // Jei reikia kitos pradinės temos – keiskite šiame bloke.
    theme = prefersLight ? 'light' : 'dark';
    localStorage.setItem('ed_dash_theme', theme);
  }
  if (theme === 'light') document.documentElement.classList.add('theme-light');
  else document.documentElement.classList.remove('theme-light');
}

export function toggleTheme() {
  const now =
    (localStorage.getItem('ed_dash_theme') || 'dark') === 'dark'
      ? 'light'
      : 'dark';
  localStorage.setItem('ed_dash_theme', now);
  applyTheme();
}
