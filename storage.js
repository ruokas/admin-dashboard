import { SIZE_MAP, sizeFromWidth, sizeFromHeight } from './sizes.js';

const STORAGE_KEY = 'ed_dashboard_lt_v1';
const NOTE_DEFAULT_COLOR = '#fef08a';
const NOTE_DEFAULT_FONT = 20;
const NOTE_DEFAULT_PADDING = 20;
const DEFAULT_CARD_WIDTH = 360;
const DEFAULT_CARD_HEIGHT = 360;
const MAX_ICON_IMAGE_BYTES = 200 * 1024;
const MAX_ICON_IMAGE_LENGTH = Math.ceil((MAX_ICON_IMAGE_BYTES / 3) * 4) + 512;

function makeId(prefix = 'note') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(16)}-${Math.random()
    .toString(16)
    .slice(2, 6)}`;
}

function sanitizeColor(value, fallback = NOTE_DEFAULT_COLOR) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) {
    return trimmed;
  }
  return fallback;
}

function sanitizeTimestamp(value) {
  if (Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function sanitizeIconImage(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed.startsWith('data:image/')) return '';
  if (trimmed.length > MAX_ICON_IMAGE_LENGTH) return '';
  return trimmed;
}

function normalizeDimensionPair(width, height, wSize, hSize) {
  const widthPreset = SIZE_MAP[wSize]?.width;
  const heightPreset = SIZE_MAP[hSize]?.height;
  const finalWidth = Number.isFinite(widthPreset) ? widthPreset : width;
  const finalHeight = Number.isFinite(heightPreset) ? heightPreset : height;
  return {
    width: Number.isFinite(finalWidth) ? Math.round(finalWidth) : undefined,
    height: Number.isFinite(finalHeight) ? Math.round(finalHeight) : undefined,
  };
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
  return {
    sizePreset: {
      width: widthMatch ? widthMatch[0] : null,
      height: heightMatch ? heightMatch[0] : null,
    },
    customWidth: widthMatch ? null : Number.isFinite(width) ? Math.round(width) : null,
    customHeight: heightMatch ? null : Number.isFinite(height) ? Math.round(height) : null,
  };
}

export function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '');
    if (data && Array.isArray(data.groups)) {
      const groups = Array.isArray(data.groups) ? [...data.groups] : [];

      const legacyText = typeof data.notes === 'string' ? data.notes : '';
      const legacyTitle = typeof data.notesTitle === 'string' ? data.notesTitle : '';
      const legacyOpts = data.notesOpts || {};
      const legacyBox = data.notesBox || {};
      const migrateLegacy =
        legacyText.trim().length > 0 ||
        legacyTitle.trim().length > 0;
      if (migrateLegacy) {
        let width = Number.isFinite(legacyBox.width) ? legacyBox.width : DEFAULT_CARD_WIDTH;
        let height = Number.isFinite(legacyBox.height) ? legacyBox.height : DEFAULT_CARD_HEIGHT;
        if (!Number.isFinite(legacyBox.width) || !Number.isFinite(legacyBox.height)) {
          if (legacyBox.size === 'sm') {
            width = 240;
            height = 240;
          } else if (legacyBox.size === 'lg') {
            width = 480;
            height = 480;
          }
        }
        const wSize = legacyBox.wSize || sizeFromWidth(width);
        const hSize = legacyBox.hSize || sizeFromHeight(height);
        const dims = normalizeDimensionPair(width, height, wSize, hSize);
        const widthSnap = Number.isFinite(dims.width) ? dims.width : Math.round(width);
        const heightSnap = Number.isFinite(dims.height) ? dims.height : Math.round(height);
        const sizeMeta = resolveSizeMetadata(widthSnap, heightSnap);
        const note = {
          id: makeId(),
          type: 'note',
          title: legacyTitle || 'Pastabos',
          name: legacyTitle || 'Pastabos',
          text: legacyText,
          color: NOTE_DEFAULT_COLOR,
          width: widthSnap,
          height: heightSnap,
          wSize,
          hSize,
          sizePreset: sizeMeta.sizePreset,
          customWidth: sizeMeta.customWidth,
          customHeight: sizeMeta.customHeight,
          fontSize:
            Number.isFinite(legacyOpts.size) && legacyOpts.size > 0
              ? Math.round(legacyOpts.size)
              : NOTE_DEFAULT_FONT,
          padding:
            Number.isFinite(legacyOpts.padding) && legacyOpts.padding >= 0
              ? Math.round(legacyOpts.padding)
              : NOTE_DEFAULT_PADDING,
        };
        const pos = Math.max(
          0,
          Math.min(Number.isFinite(data.notesPos) ? Math.round(data.notesPos) : 0, groups.length),
        );
        groups.splice(pos, 0, note);
      }

      const normalisedGroups = groups
        .map((g) => {
          if (!g || typeof g !== 'object') return null;
          let width = Number.isFinite(g.width) ? g.width : DEFAULT_CARD_WIDTH;
          let height = Number.isFinite(g.height) ? g.height : DEFAULT_CARD_HEIGHT;
          if (!Number.isFinite(g.width) || !Number.isFinite(g.height)) {
            if (g.size === 'sm') {
              width = 240;
              height = 240;
            } else if (g.size === 'lg') {
              width = 480;
              height = 480;
            }
          }

          const wSize = g.wSize || sizeFromWidth(width);
          const hSize = g.hSize || sizeFromHeight(height);
          const { width: widthSnap, height: heightSnap } = normalizeDimensionPair(
            width,
            height,
            wSize,
            hSize,
          );
          width = Number.isFinite(widthSnap) ? widthSnap : width;
          height = Number.isFinite(heightSnap) ? heightSnap : height;
          const sizeMeta = resolveSizeMetadata(width, height);

          if (g.type === 'note') {
            const title =
              typeof g.title === 'string' && g.title.trim()
                ? g.title.trim()
                : typeof g.name === 'string' && g.name.trim()
                  ? g.name.trim()
                  : 'Pastabos';
            const fontSize =
              Number.isFinite(g.fontSize) && g.fontSize > 0
                ? Math.round(g.fontSize)
                : NOTE_DEFAULT_FONT;
            const padding =
              Number.isFinite(g.padding) && g.padding >= 0
                ? Math.round(g.padding)
                : NOTE_DEFAULT_PADDING;
            return {
              id: typeof g.id === 'string' && g.id ? g.id : makeId(),
              type: 'note',
              title,
              name: title,
              text: typeof g.text === 'string' ? g.text : '',
              color: sanitizeColor(g.color),
              width,
              height,
              wSize,
              hSize,
              sizePreset: sizeMeta.sizePreset,
              customWidth: sizeMeta.customWidth,
              customHeight: sizeMeta.customHeight,
              fontSize,
              padding,
            };
          }

          const group = { ...g };
          group.id = typeof g.id === 'string' && g.id ? g.id : makeId('group');
          group.width = width;
          group.height = height;
          group.wSize = wSize;
          group.hSize = hSize;
          group.sizePreset = sizeMeta.sizePreset;
          if (sizeMeta.customWidth != null) group.customWidth = sizeMeta.customWidth;
          else delete group.customWidth;
          if (sizeMeta.customHeight != null) group.customHeight = sizeMeta.customHeight;
          else delete group.customHeight;
          delete group.size;
          if (!Array.isArray(group.items)) group.items = [];
          group.items = group.items.map((it) => {
            if (!it || typeof it !== 'object') return null;
            const item = { ...it };
            if (!('iconUrl' in item)) item.iconUrl = '';
            if (!('icon' in item)) item.icon = '';
            if (Number.isFinite(item.reminderMinutes) && item.reminderMinutes > 0) {
              item.reminderMinutes = Math.max(0, Math.round(item.reminderMinutes));
            } else {
              delete item.reminderMinutes;
            }
            const reminderAt = sanitizeTimestamp(item.reminderAt);
            if (reminderAt) item.reminderAt = reminderAt;
            else delete item.reminderAt;
            return item;
          }).filter(Boolean);
          return group;
        })
        .filter(Boolean);

      data.groups = normalisedGroups;

      delete data.notes;
      delete data.notesTitle;
      delete data.notesBox;
      delete data.notesOpts;
      delete data.notesPos;
      delete data.notesReminderMinutes;
      delete data.notesReminderAt;

      data.title = typeof data.title === 'string' ? data.title : '';
      data.iconImage = sanitizeIconImage(data.iconImage || '');
      data.icon = data.iconImage
        ? ''
        : typeof data.icon === 'string'
          ? data.icon
          : '';

      if (!Array.isArray(data.customReminders)) data.customReminders = [];
      else
        data.customReminders = data.customReminders
          .filter((entry) => Number.isFinite(entry?.at))
          .map((entry) => ({
            id:
              typeof entry.id === 'string' && entry.id
                ? entry.id
                : typeof crypto !== 'undefined' && crypto.randomUUID
                  ? crypto.randomUUID()
                  : `custom-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
            title: typeof entry.title === 'string' ? entry.title : '',
            at: Math.round(entry.at),
            minutes:
              Number.isFinite(entry.minutes) && entry.minutes > 0
                ? Math.max(0, Math.round(entry.minutes))
                : null,
            createdAt: Number.isFinite(entry.createdAt)
              ? Math.round(entry.createdAt)
              : Date.now(),
          }));

      if (
        !data.remindersCard ||
        typeof data.remindersCard.width !== 'number' ||
        typeof data.remindersCard.height !== 'number'
      ) {
        const width = DEFAULT_CARD_WIDTH;
        const height = DEFAULT_CARD_HEIGHT;
        const wSize = sizeFromWidth(width);
        const hSize = sizeFromHeight(height);
        const dims = normalizeDimensionPair(width, height, wSize, hSize);
        const widthSnap = Number.isFinite(dims.width) ? dims.width : Math.round(width);
        const heightSnap = Number.isFinite(dims.height) ? dims.height : Math.round(height);
        const sizeMeta = resolveSizeMetadata(widthSnap, heightSnap);
        data.remindersCard = {
          enabled: false,
          title: '',
          width: widthSnap,
          height: heightSnap,
          wSize,
          hSize,
          sizePreset: sizeMeta.sizePreset,
          customWidth: sizeMeta.customWidth,
          customHeight: sizeMeta.customHeight,
          showQuick: false,
        };
      } else {
        data.remindersCard.enabled = Boolean(data.remindersCard.enabled);
        data.remindersCard.title =
          typeof data.remindersCard.title === 'string'
            ? data.remindersCard.title
            : '';
        const wSize =
          data.remindersCard.wSize || sizeFromWidth(data.remindersCard.width);
        const hSize =
          data.remindersCard.hSize || sizeFromHeight(data.remindersCard.height);
        const dims = normalizeDimensionPair(
          data.remindersCard.width,
          data.remindersCard.height,
          wSize,
          hSize,
        );
        const widthSnap = Number.isFinite(dims.width)
          ? dims.width
          : Math.round(data.remindersCard.width);
        const heightSnap = Number.isFinite(dims.height)
          ? dims.height
          : Math.round(data.remindersCard.height);
        const sizeMeta = resolveSizeMetadata(widthSnap, heightSnap);
        data.remindersCard.width = widthSnap;
        data.remindersCard.height = heightSnap;
        data.remindersCard.wSize = wSize;
        data.remindersCard.hSize = hSize;
        data.remindersCard.sizePreset = sizeMeta.sizePreset;
        data.remindersCard.customWidth = sizeMeta.customWidth;
        data.remindersCard.customHeight = sizeMeta.customHeight;
        data.remindersCard.showQuick = data.remindersCard.showQuick === true;
      }
      if (typeof data.remindersPos !== 'number') data.remindersPos = 0;
    }
    return data;
  } catch (e) {
    return null;
  }
}

export function save(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function seed() {
  const defaultWSize = sizeFromWidth(DEFAULT_CARD_WIDTH);
  const defaultHSize = sizeFromHeight(DEFAULT_CARD_HEIGHT);
  const defaultDims = normalizeDimensionPair(
    DEFAULT_CARD_WIDTH,
    DEFAULT_CARD_HEIGHT,
    defaultWSize,
    defaultHSize,
  );
  const defaultWidth = Number.isFinite(defaultDims.width)
    ? defaultDims.width
    : Math.round(DEFAULT_CARD_WIDTH);
  const defaultHeight = Number.isFinite(defaultDims.height)
    ? defaultDims.height
    : Math.round(DEFAULT_CARD_HEIGHT);
  const defaultMeta = resolveSizeMetadata(defaultWidth, defaultHeight);
  const data = {
    groups: [],
    remindersCard: {
      enabled: false,
      title: '',
      width: defaultWidth,
      height: defaultHeight,
      wSize: defaultWSize,
      hSize: defaultHSize,
      sizePreset: defaultMeta.sizePreset,
      customWidth: defaultMeta.customWidth,
      customHeight: defaultMeta.customHeight,
      showQuick: false,
    },
    remindersPos: 0,
    customReminders: [],
    title: '',
    icon: '',
    iconImage: '',
  };
  save(data);
  return data;
}

export function sheetsSync(state, syncStatus, saveFn, renderFn) {
  const SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbxGrClqMHfkKqCUK8zZSix35s26oFW2Oyje-LsIcSH-6DTftkNtEVWcALfbD__rEfy_/exec'; // Pakeiskite į savo "web app" URL

  async function send(action, payload) {
    const res = await fetch(SCRIPT_URL, {
      method: 'POST',
      // Jokios "Content-Type" antraštės – taip išvengiama CORS preflight
      body: JSON.stringify({ action, data: payload }),
    });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  return {
    async export() {
      syncStatus.textContent = 'Sinchronizuojama…';
      if (!navigator.onLine) {
        syncStatus.textContent = 'Nėra ryšio';
        alert('Nėra interneto ryšio');
        return;
      }
      try {
        await send('export', state);
        syncStatus.textContent = 'Baigta';
        console.log('Sheets eksportas pavyko');
      } catch (err) {
        syncStatus.textContent = 'Nepavyko';
        console.error('Sheets eksportas nepavyko', err);
        alert('Eksportas nepavyko: ' + err.message);
      } finally {
        setTimeout(() => {
          syncStatus.textContent = '';
        }, 3000);
      }
    },
    async import() {
      syncStatus.textContent = 'Sinchronizuojama…';
      if (!navigator.onLine) {
        syncStatus.textContent = 'Nėra ryšio';
        alert('Nėra interneto ryšio');
        return;
      }
      try {
        const res = await send('import');
        if (res && res.data) {
          Object.assign(state, res.data);
          saveFn(state);
          renderFn();
          console.log('Sheets importas pavyko');
        }
        syncStatus.textContent = 'Baigta';
      } catch (err) {
        syncStatus.textContent = 'Nepavyko';
        console.error('Sheets importas nepavyko', err);
        alert('Sheets importas nepavyko');
      } finally {
        setTimeout(() => {
          syncStatus.textContent = '';
        }, 3000);
      }
    },
  };
}
