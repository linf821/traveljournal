import { useState, useEffect, useRef } from 'react';
import { Plus, Upload, ChevronLeft, ChevronDown, X, Edit3, Trash2, Loader2, Briefcase, Plane, MapPin, BarChart3, Globe, ExternalLink, RotateCw, Utensils, ShoppingBag, Sparkles, BedDouble } from 'lucide-react';

/* ============================================================
   storage shim — 把 Claude artifact 的 window.storage 改用 localStorage
   ============================================================ */
if (typeof window !== 'undefined' && !window.storage) {
  const STORAGE_PREFIX = 'tj2026:';
  window.storage = {
    get: (key) => {
      try {
        const value = localStorage.getItem(STORAGE_PREFIX + key);
        return Promise.resolve(value === null ? null : { value });
      } catch (e) { return Promise.reject(e); }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(STORAGE_PREFIX + key, value);
        return Promise.resolve({ value });
      } catch (e) { return Promise.reject(e); }
    },
    delete: (key) => {
      try {
        localStorage.removeItem(STORAGE_PREFIX + key);
        return Promise.resolve({ key, deleted: true });
      } catch (e) { return Promise.reject(e); }
    },
    list: (prefix) => {
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX)) {
            const realKey = k.slice(STORAGE_PREFIX.length);
            if (!prefix || realKey.startsWith(prefix)) keys.push(realKey);
          }
        }
        return Promise.resolve({ keys, prefix });
      } catch (e) { return Promise.reject(e); }
    },
  };
}

/* ============================================================
   常數
   ============================================================ */

const DEFAULT_YEAR = 2026;
const SUPPORTED_YEARS = [2025, 2026];
const ZODIAC = { 2025: 'snake', 2026: 'horse' };
const ZODIAC_TC = { 2025: '蛇', 2026: '馬' };

// 台灣中心點（軌跡動畫起點）
const TAIWAN_BASE = { lat: 23.7, lng: 121.0 };
const isDomesticTrip = (trip) => {
  if (!trip || typeof trip.lat !== 'number') return false;
  return Math.abs(trip.lat - TAIWAN_BASE.lat) < 2.5
    && Math.abs(trip.lng - TAIWAN_BASE.lng) < 2.5;
};

const BG = '#FFFFFF';
const INK = '#1F1A14';
const INK_LIGHT = '#5C5247';
const INK_DASH = '#D4D4D4';
const PAPER_CREAM = '#FAFAF7';
const CLOUD_FILL = '#FFFFFF';
const CLOUD_STROKE = '#B5C7DC';
const CLOUD_SHADOW = '#DDE5EE';
const SOFT_BLUE = '#5A7FB0';
const MAP_LAND = '#EFEFEC';
const MAP_LAND_STROKE = '#CFCFC8';

const PURPOSE_PRESETS = {
  business:        { label: '出差',     sublabel: 'Business',           color: '#2A4858', icon: Briefcase },
  domesticLeisure: { label: '國內旅遊', sublabel: 'Domestic Leisure',   color: '#6B7A3F', icon: MapPin },
  overseasLeisure: { label: '海外旅遊', sublabel: 'Overseas Leisure',   color: '#C44536', icon: Plane },
};

const PLACE_TYPES = {
  sight:    { label: '景點', icon: MapPin,      color: '#5A7FB0' },
  food:     { label: '餐廳', icon: Utensils,    color: '#C44536' },
  shopping: { label: '購物', icon: ShoppingBag, color: '#B89243' },
  other:    { label: '其他', icon: Sparkles,    color: '#6B5B7A' },
  stay:     { label: '住宿', icon: BedDouble,   color: '#4F6E5B' },
};
const PLACE_TYPE_ORDER = ['sight', 'food', 'shopping', 'other', 'stay'];

const TRIP_PALETTE = [
  { name: '朱砂', value: '#C44536' },
  { name: '靛青', value: '#2A4858' },
  { name: '橄欖', value: '#6B7A3F' },
  { name: '桃粉', value: '#B86F77' },
  { name: '芥黃', value: '#B89243' },
  { name: '紫鳶', value: '#6B5B7A' },
  { name: '苔綠', value: '#4F6E5B' },
  { name: '炭墨', value: '#3D3935' },
];

const MOOD_OPTIONS = [
  { emoji: '🤩', label: '太棒了' },
  { emoji: '😊', label: '開心' },
  { emoji: '😌', label: '放鬆' },
  { emoji: '😎', label: '充實' },
  { emoji: '😅', label: '辛苦' },
  { emoji: '🥲', label: '五味雜陳' },
];

const MONTH_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS_SUN = ['S','M','T','W','T','F','S'];

const SANS_TC = "'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif";
const HANDWRITE_EN = "'Caveat', cursive";
const NUMERIC = "'Inter Tight', 'Noto Sans TC', sans-serif";

const migratePurpose = (p) => {
  if (p === 'workTravel') return 'business';
  if (p === 'leisure') return 'overseasLeisure';
  return p;
};

/* ============================================================
   日期工具
   ============================================================ */

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => { const d = new Date(); return fmtDate(d.getFullYear(), d.getMonth(), d.getDate()); };

const daysBetween = (start, end) => {
  const arr = [];
  let cur = parseDate(start);
  const endD = parseDate(end);
  while (cur <= endD) {
    arr.push(fmtDate(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    cur.setDate(cur.getDate() + 1);
  }
  return arr;
};
const tripLength = (t) => daysBetween(t.startDate, t.endDate).length;

const formatDateLabel = (s) => { const d = parseDate(s); return `${d.getMonth() + 1}月${d.getDate()}日`; };
const formatRange = (a, b) => a === b ? formatDateLabel(a) : `${formatDateLabel(a)} – ${formatDateLabel(b)}`;

const buildMonthGrid = (year, month) => {
  const sundayWeekday = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < sundayWeekday; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
};

const findTripsForDate = (trips, ds) => trips.filter(t => ds >= t.startDate && ds <= t.endDate);
const newId = () => 'trip-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
const newPlaceId = () => 'place-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
const orderedRange = (a, b) => (a <= b ? [a, b] : [b, a]);

const overlapDays = (trip, start, end) => {
  if (trip.endDate < start || trip.startDate > end) return 0;
  const a = trip.startDate < start ? start : trip.startDate;
  const b = trip.endDate > end ? end : trip.endDate;
  return daysBetween(a, b).length;
};

/* ============================================================
   Google Maps 工具
   ============================================================ */

const mapsUrl = (location, country) => {
  const q = (country && location !== country ? `${location} ${country}` : location).trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
};

const isGmapsUrl = (text) => {
  if (!text || typeof text !== 'string') return false;
  if (!text.toLowerCase().startsWith('http')) return false;
  return /(google\.[a-z.]+\/maps|maps\.google|maps\.app\.goo\.gl|goo\.gl\/maps)/i.test(text);
};

// 從 Google Maps URL 抽出地點名稱
const parseGmapsUrl = (url) => {
  try {
    const u = new URL(url);
    // /maps/place/<NAME>/@...
    const placeMatch = u.pathname.match(/\/maps\/place\/([^/@]+)/);
    if (placeMatch) {
      return decodeURIComponent(placeMatch[1].replace(/\+/g, ' ')).trim();
    }
    // ?query=<NAME> 或 ?q=<NAME>
    const q = u.searchParams.get('query') || u.searchParams.get('q');
    if (q) return decodeURIComponent(q.replace(/\+/g, ' ')).trim();
    return null;
  } catch (e) {
    return null;
  }
};

/* ============================================================
   座標查找表
   ============================================================ */

const LOCATION_COORDS = {
  '台北': { lat: 25.03, lng: 121.57 }, '台北市': { lat: 25.03, lng: 121.57 }, 'Taipei': { lat: 25.03, lng: 121.57 },
  '高雄': { lat: 22.62, lng: 120.31 }, '台中': { lat: 24.15, lng: 120.67 }, '台南': { lat: 22.99, lng: 120.21 },
  '花蓮': { lat: 23.99, lng: 121.61 }, '宜蘭': { lat: 24.75, lng: 121.75 }, '墾丁': { lat: 21.95, lng: 120.79 },
  '新竹': { lat: 24.81, lng: 120.97 }, '桃園': { lat: 24.99, lng: 121.31 }, '嘉義': { lat: 23.48, lng: 120.45 },
  '南投': { lat: 23.91, lng: 120.68 }, '苗栗': { lat: 24.56, lng: 120.82 }, '基隆': { lat: 25.13, lng: 121.74 },
  '屏東': { lat: 22.67, lng: 120.49 }, '台東': { lat: 22.76, lng: 121.15 }, '澎湖': { lat: 23.57, lng: 119.58 },
  '金門': { lat: 24.45, lng: 118.32 }, '馬祖': { lat: 26.16, lng: 119.95 }, '阿里山': { lat: 23.51, lng: 120.80 },
  '日月潭': { lat: 23.86, lng: 120.92 }, '九份': { lat: 25.11, lng: 121.84 },
  '東京': { lat: 35.68, lng: 139.69 }, 'Tokyo': { lat: 35.68, lng: 139.69 },
  '大阪': { lat: 34.69, lng: 135.50 }, 'Osaka': { lat: 34.69, lng: 135.50 },
  '京都': { lat: 35.01, lng: 135.77 }, 'Kyoto': { lat: 35.01, lng: 135.77 },
  '北海道': { lat: 43.06, lng: 141.35 }, '札幌': { lat: 43.06, lng: 141.35 },
  '沖繩': { lat: 26.21, lng: 127.68 }, '名古屋': { lat: 35.18, lng: 136.91 },
  '福岡': { lat: 33.59, lng: 130.40 }, '橫濱': { lat: 35.44, lng: 139.64 }, '神戶': { lat: 34.69, lng: 135.20 },
  '奈良': { lat: 34.69, lng: 135.83 }, '廣島': { lat: 34.40, lng: 132.46 },
  '首爾': { lat: 37.57, lng: 126.98 }, 'Seoul': { lat: 37.57, lng: 126.98 },
  '釜山': { lat: 35.18, lng: 129.08 }, '濟州': { lat: 33.50, lng: 126.53 }, '濟州島': { lat: 33.50, lng: 126.53 },
  '上海': { lat: 31.23, lng: 121.47 }, '北京': { lat: 39.90, lng: 116.40 },
  '深圳': { lat: 22.54, lng: 114.06 }, '廣州': { lat: 23.13, lng: 113.26 },
  '成都': { lat: 30.66, lng: 104.07 }, '杭州': { lat: 30.27, lng: 120.15 },
  '蘇州': { lat: 31.30, lng: 120.59 }, '南京': { lat: 32.06, lng: 118.79 },
  '青島': { lat: 36.07, lng: 120.38 }, '廈門': { lat: 24.48, lng: 118.08 },
  '重慶': { lat: 29.43, lng: 106.91 }, '西安': { lat: 34.34, lng: 108.94 }, '武漢': { lat: 30.59, lng: 114.31 },
  '香港': { lat: 22.31, lng: 114.17 }, 'Hong Kong': { lat: 22.31, lng: 114.17 }, '澳門': { lat: 22.20, lng: 113.54 },
  '新加坡': { lat: 1.35, lng: 103.82 }, 'Singapore': { lat: 1.35, lng: 103.82 },
  '曼谷': { lat: 13.76, lng: 100.50 }, '清邁': { lat: 18.79, lng: 98.99 }, '普吉島': { lat: 7.88, lng: 98.39 },
  '巴厘島': { lat: -8.65, lng: 115.22 }, '峇里島': { lat: -8.65, lng: 115.22 },
  '河內': { lat: 21.03, lng: 105.85 }, '胡志明市': { lat: 10.82, lng: 106.63 }, '峴港': { lat: 16.05, lng: 108.20 },
  '吉隆坡': { lat: 3.14, lng: 101.69 }, '馬尼拉': { lat: 14.60, lng: 120.98 },
  '宿霧': { lat: 10.32, lng: 123.90 }, '長灘島': { lat: 11.97, lng: 121.92 }, '雅加達': { lat: -6.21, lng: 106.85 },
  '倫敦': { lat: 51.51, lng: -0.13 }, 'London': { lat: 51.51, lng: -0.13 },
  '巴黎': { lat: 48.86, lng: 2.35 }, 'Paris': { lat: 48.86, lng: 2.35 },
  '羅馬': { lat: 41.90, lng: 12.50 }, '米蘭': { lat: 45.46, lng: 9.19 },
  '巴塞隆納': { lat: 41.39, lng: 2.17 }, '馬德里': { lat: 40.42, lng: -3.70 },
  '阿姆斯特丹': { lat: 52.37, lng: 4.90 }, '柏林': { lat: 52.52, lng: 13.40 },
  '慕尼黑': { lat: 48.14, lng: 11.58 }, '蘇黎世': { lat: 47.38, lng: 8.54 },
  '維也納': { lat: 48.21, lng: 16.37 }, '布拉格': { lat: 50.08, lng: 14.44 },
  '哥本哈根': { lat: 55.68, lng: 12.57 }, '冰島': { lat: 64.13, lng: -21.94 }, '雷克雅維克': { lat: 64.13, lng: -21.94 },
  '紐約': { lat: 40.71, lng: -74.01 }, 'New York': { lat: 40.71, lng: -74.01 },
  '洛杉磯': { lat: 34.05, lng: -118.24 }, '舊金山': { lat: 37.77, lng: -122.42 },
  '西雅圖': { lat: 47.61, lng: -122.33 }, '拉斯維加斯': { lat: 36.17, lng: -115.14 },
  '芝加哥': { lat: 41.88, lng: -87.63 }, '波士頓': { lat: 42.36, lng: -71.06 },
  '華盛頓': { lat: 38.91, lng: -77.04 }, '邁阿密': { lat: 25.76, lng: -80.19 },
  '溫哥華': { lat: 49.28, lng: -123.12 }, '多倫多': { lat: 43.65, lng: -79.38 },
  '雪梨': { lat: -33.87, lng: 151.21 }, '墨爾本': { lat: -37.81, lng: 144.96 },
  '布里斯本': { lat: -27.47, lng: 153.03 }, '紐西蘭': { lat: -41.29, lng: 174.78 }, '奧克蘭': { lat: -36.85, lng: 174.76 },
  '杜拜': { lat: 25.20, lng: 55.27 }, '伊斯坦堡': { lat: 41.01, lng: 28.98 },
};

const COUNTRY_COORDS = {
  '台灣': { lat: 23.7, lng: 121.0 }, 'Taiwan': { lat: 23.7, lng: 121.0 },
  '日本': { lat: 36.0, lng: 138.0 }, 'Japan': { lat: 36.0, lng: 138.0 },
  '韓國': { lat: 37.0, lng: 127.5 }, 'Korea': { lat: 37.0, lng: 127.5 },
  '中國': { lat: 35.0, lng: 105.0 }, 'China': { lat: 35.0, lng: 105.0 },
  '美國': { lat: 39.0, lng: -98.0 }, 'USA': { lat: 39.0, lng: -98.0 },
  '英國': { lat: 54.0, lng: -2.0 }, 'UK': { lat: 54.0, lng: -2.0 },
  '法國': { lat: 47.0, lng: 2.0 }, 'France': { lat: 47.0, lng: 2.0 },
  '德國': { lat: 51.0, lng: 10.0 }, 'Germany': { lat: 51.0, lng: 10.0 },
  '義大利': { lat: 42.0, lng: 12.5 }, 'Italy': { lat: 42.0, lng: 12.5 },
  '泰國': { lat: 13.0, lng: 100.5 }, 'Thailand': { lat: 13.0, lng: 100.5 },
  '越南': { lat: 16.0, lng: 108.0 }, 'Vietnam': { lat: 16.0, lng: 108.0 },
  '菲律賓': { lat: 13.0, lng: 122.0 }, 'Philippines': { lat: 13.0, lng: 122.0 },
  '馬來西亞': { lat: 4.0, lng: 102.0 }, 'Malaysia': { lat: 4.0, lng: 102.0 },
  '印尼': { lat: -2.0, lng: 118.0 }, 'Indonesia': { lat: -2.0, lng: 118.0 },
  '澳洲': { lat: -25.0, lng: 135.0 }, 'Australia': { lat: -25.0, lng: 135.0 },
  '加拿大': { lat: 56.0, lng: -106.0 }, 'Canada': { lat: 56.0, lng: -106.0 },
  '荷蘭': { lat: 52.0, lng: 5.5 }, '西班牙': { lat: 40.0, lng: -3.7 }, '瑞士': { lat: 46.8, lng: 8.2 },
  '希臘': { lat: 39.0, lng: 22.0 }, '葡萄牙': { lat: 39.5, lng: -8.0 },
};

/* ============================================================
   自動定位
   ============================================================ */

async function geocodeLocation(location, country) {
  const trimmedLoc = (location || '').trim();
  const trimmedCountry = (country || '').trim();
  if (!trimmedLoc) return null;

  if (LOCATION_COORDS[trimmedLoc]) {
    return { ...LOCATION_COORDS[trimmedLoc], source: 'builtin' };
  }
  try {
    const query = trimmedCountry ? `${trimmedLoc} ${trimmedCountry}` : trimmedLoc;
    const params = new URLSearchParams({
      q: query, format: 'json', limit: '1', 'accept-language': 'zh-TW,en',
    });
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        if (!isNaN(lat) && !isNaN(lng)) {
          return { lat, lng, source: 'nominatim' };
        }
      }
    }
  } catch (e) {
    console.error('[geocode] Nominatim 失敗:', trimmedLoc, e);
  }
  if (trimmedCountry && COUNTRY_COORDS[trimmedCountry]) {
    return { ...COUNTRY_COORDS[trimmedCountry], source: 'country' };
  }
  return null;
}

/* ============================================================
   圖片壓縮
   ============================================================ */

const processImage = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const maxW = 1200;
      const scale = img.width > maxW ? maxW / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = e.target.result;
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

/* ============================================================
   字型
   ============================================================ */

const FontLoader = () => {
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Noto+Sans+TC:wght@300;400;500;700;900&family=Inter+Tight:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInTrail {
        from { opacity: 0; }
        to { opacity: 0.7; }
      }
    `;
    document.head.appendChild(style);

    return () => {
      try { document.head.removeChild(link); } catch (e) {}
      try { document.head.removeChild(style); } catch (e) {}
    };
  }, []);
  return null;
};

/* ============================================================
   插畫
   ============================================================ */

function HorseIllustration() {
  return (
    <svg viewBox="0 0 480 320" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
      <g stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 60 60 Q 75 48 90 58 Q 100 53 110 60 L 113 64 L 105 67 L 96 65 L 88 68 L 80 65 L 70 66 Z" />
        <path d="M 80 64 L 90 66" />
        <circle cx="108" cy="62" r="0.9" fill={INK} />
      </g>
      <g stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 380 65 Q 395 53 410 63 Q 420 58 430 65 L 433 69 L 425 72 L 416 70 L 408 73 L 400 70 L 390 71 Z" />
        <path d="M 400 69 L 410 71" />
        <circle cx="428" cy="67" r="0.9" fill={INK} />
      </g>
      <g stroke={SOFT_BLUE} strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 350 35 L 350 55" />
        <path d="M 350 35 Q 358 32 360 38" />
        <ellipse cx="347" cy="55" rx="3.5" ry="2.5" fill={SOFT_BLUE} stroke="none" />
        <path d="M 145 70 L 145 88" />
        <path d="M 145 70 Q 152 67 154 73" />
        <ellipse cx="142" cy="88" rx="3" ry="2" fill={SOFT_BLUE} stroke="none" />
      </g>
      <g fill={CLOUD_SHADOW} stroke="none">
        <ellipse cx="240" cy="295" rx="220" ry="14" opacity="0.5" />
      </g>
      <g stroke={CLOUD_STROKE} strokeWidth="2" fill={CLOUD_FILL} strokeLinejoin="round" strokeLinecap="round">
        <path d="M 20 280 Q 10 270 22 260 Q 22 246 38 248 Q 48 232 65 240 Q 75 232 88 244 Q 102 246 100 260 Q 110 268 100 278 Q 88 286 70 282 Q 50 290 32 284 Z" />
      </g>
      <g stroke={CLOUD_STROKE} strokeWidth="2.2" fill={CLOUD_FILL} strokeLinejoin="round" strokeLinecap="round">
        <path d="M 110 285 Q 95 270 112 258 Q 115 240 138 244 Q 148 222 175 230 Q 188 215 215 222 Q 230 205 258 215 Q 275 200 305 212 Q 322 205 340 222 Q 358 222 365 240 Q 380 244 378 260 Q 388 272 376 282 Q 360 295 340 290 Q 318 298 295 290 Q 270 296 245 290 Q 220 296 198 290 Q 175 296 152 290 Q 130 295 110 285 Z" />
      </g>
      <g stroke={CLOUD_STROKE} strokeWidth="2" fill={CLOUD_FILL} strokeLinejoin="round" strokeLinecap="round">
        <path d="M 390 280 Q 380 268 392 258 Q 395 245 412 248 Q 420 235 438 244 Q 452 244 452 260 Q 462 266 454 278 Q 442 286 425 282 Q 408 290 392 284 Z" />
      </g>
      <g stroke={CLOUD_STROKE} strokeWidth="1.5" fill="none" strokeLinecap="round" opacity="0.7">
        <path d="M 145 268 Q 165 262 185 270" />
        <path d="M 220 262 Q 245 256 268 264" />
        <path d="M 305 268 Q 325 262 345 268" />
      </g>
      <g stroke={INK} strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 145 215 Q 175 200 215 198 Q 255 196 290 202 Q 310 205 320 212 L 327 218 Q 323 225 310 225 L 300 224 L 295 235 L 285 240 L 280 235 L 275 228 L 245 228 L 235 240 L 225 238 L 220 228 L 190 228 L 175 245 L 167 240 L 163 228 L 145 225 Q 137 220 145 215 Z" />
        <path d="M 310 205 Q 325 192 340 185 Q 355 182 363 192 Q 367 200 365 210 L 360 218 Q 353 222 347 218 L 340 215 Q 333 218 325 215" />
        <path d="M 320 198 Q 323 192 327 196" />
        <path d="M 327 192 Q 331 185 335 190" />
        <path d="M 335 188 Q 339 182 343 186" />
        <path d="M 343 185 Q 347 180 351 184" />
        <path d="M 355 185 L 358 178 L 362 183" />
        <circle cx="353" cy="200" r="1.1" fill={INK} />
        <path d="M 363 208 L 365 210 M 363 212 L 365 213" strokeWidth="1.3" />
        <path d="M 145 215 Q 125 207 110 215 Q 100 225 110 235 Q 120 240 130 232" />
        <path d="M 285 240 Q 283 256 290 270 L 293 278" />
        <path d="M 265 235 Q 260 252 265 268 L 268 278" />
        <path d="M 180 240 Q 173 258 167 274 L 163 282" />
        <path d="M 160 235 Q 150 254 143 274 L 139 282" />
      </g>
      <g stroke={INK} strokeWidth="1.9" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 230 170 Q 230 185 233 195 L 235 202" />
        <circle cx="228" cy="163" r="6" fill={BG} />
        <path d="M 233 178 Q 243 170 255 162" />
        <path d="M 230 180 Q 223 185 220 192" />
        <path d="M 233 202 Q 240 205 245 208" />
      </g>
      <g stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <line x1="255" y1="162" x2="260" y2="120" />
        <path d="M 260 118 Q 267 105 283 110 Q 295 105 305 115 Q 315 112 320 122 Q 323 132 310 135 Q 300 140 290 135 Q 280 140 273 135 Q 263 135 260 125 Z" fill={BG} />
      </g>
      <text x="290" y="128" textAnchor="middle" fill={INK} style={{ fontFamily: HANDWRITE_EN, fontSize: 17, fontWeight: 700 }}>2026</text>
      <g stroke={INK} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d="M 415 175 Q 415 162 428 162 Q 440 162 440 175 Q 440 184 428 184 Q 422 184 422 178 Q 422 173 428 173 Q 432 173 432 177" />
        <path d="M 415 184 Q 402 184 398 190 L 396 192" />
        <path d="M 396 190 L 392 188 M 396 192 L 393 194" />
      </g>
      <g stroke={INK} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="220" cy="265" r="2.5" />
        <circle cx="216" cy="269" r="1.8" />
        <circle cx="224" cy="269" r="1.8" />
        <circle cx="220" cy="271" r="2" />
        <line x1="220" y1="275" x2="220" y2="282" />
      </g>
    </svg>
  );
}

/* ============================================================
   世界地圖（共用元件）
   ============================================================ */

const project = (lat, lng) => ({
  x: ((lng + 180) / 360) * 1000,
  y: ((90 - lat) / 180) * 500,
});

function ContinentsLayer() {
  return (
    <>
      <g fill={MAP_LAND} stroke={MAP_LAND_STROKE} strokeWidth="1" strokeLinejoin="round">
        {/* 北美洲（含中美洲）*/}
        <path d="M 30 70 L 75 55 L 145 50 L 245 50 L 305 65 L 340 100 L 348 130 L 320 165 L 305 185 L 290 195 L 282 188 L 250 200 L 220 215 L 245 230 L 275 232 L 240 220 L 200 195 L 175 165 L 155 140 L 130 120 L 105 105 L 75 95 L 45 85 Z" />
        {/* 格陵蘭 */}
        <path d="M 365 50 L 412 45 L 425 70 L 420 105 L 395 110 L 368 100 L 358 80 Z" />
        {/* 南美洲 */}
        <path d="M 285 220 L 310 215 L 345 215 L 380 235 L 405 250 L 410 290 L 400 320 L 380 355 L 365 380 L 345 405 L 315 410 L 305 380 L 295 340 L 285 290 L 280 245 Z" />
        {/* 歐亞大陸 */}
        <path d="M 460 65 L 540 48 L 700 52 L 850 48 L 970 75 L 945 110 L 920 130 L 900 145 L 875 145 L 858 158 L 845 168 L 837 178 L 830 192 L 818 195 L 808 205 L 802 215 L 803 230 L 790 248 L 786 245 L 780 232 L 775 220 L 768 215 L 758 220 L 745 225 L 720 232 L 712 222 L 700 200 L 692 188 L 685 195 L 670 215 L 658 220 L 625 218 L 620 200 L 605 175 L 593 168 L 583 152 L 575 138 L 560 132 L 538 132 L 522 130 L 488 138 L 478 122 L 478 100 L 510 80 Z" />
        {/* 不列顛群島 */}
        <path d="M 472 88 L 488 88 L 492 102 L 488 113 L 478 115 L 470 110 L 468 95 Z" />
        {/* 愛爾蘭 */}
        <path d="M 458 100 L 470 102 L 470 113 L 460 113 L 455 105 Z" />
        {/* 冰島 */}
        <path d="M 437 75 L 458 72 L 462 88 L 444 92 L 432 85 Z" />
        {/* 非洲 */}
        <path d="M 510 155 L 545 145 L 600 155 L 625 170 L 640 200 L 645 215 L 660 222 L 645 245 L 635 285 L 615 320 L 580 348 L 555 345 L 535 320 L 518 290 L 505 260 L 490 225 L 488 200 L 488 180 L 495 165 Z" />
        {/* 馬達加斯加 */}
        <path d="M 615 290 L 632 290 L 636 320 L 622 335 L 614 320 Z" />
        {/* 日本 北海道 */}
        <path d="M 880 122 L 910 120 L 912 140 L 895 145 L 880 138 Z" />
        {/* 日本 本州 + 四國 + 九州 */}
        <path d="M 880 145 L 908 148 L 928 160 L 925 175 L 895 178 L 868 175 L 860 165 L 868 153 Z" />
        {/* 沖繩 */}
        <path d="M 850 175 L 860 175 L 862 182 L 852 182 Z" />
        {/* 台灣 */}
        <path d="M 833 175 L 842 175 L 845 195 L 836 195 Z" />
        {/* 海南 */}
        <path d="M 815 200 L 825 200 L 825 210 L 815 210 Z" />
        {/* 菲律賓 */}
        <path d="M 833 205 L 855 205 L 860 245 L 838 250 L 830 225 Z" />
        {/* 蘇門答臘 + 婆羅洲 + 蘇拉威西 + 新幾內亞 */}
        <path d="M 770 250 L 800 250 L 825 255 L 850 268 L 880 270 L 895 285 L 882 295 L 850 285 L 815 280 L 800 275 L 770 270 Z" />
        {/* 澳洲 */}
        <path d="M 815 280 L 855 273 L 895 280 L 935 295 L 940 325 L 920 350 L 880 360 L 845 360 L 825 345 L 815 320 Z" />
        {/* 塔斯馬尼亞 */}
        <path d="M 890 372 L 905 372 L 905 385 L 890 385 Z" />
        {/* 紐西蘭 北島 */}
        <path d="M 970 350 L 990 348 L 992 368 L 975 372 Z" />
        {/* 紐西蘭 南島 */}
        <path d="M 975 372 L 992 372 L 998 392 L 980 395 Z" />
        {/* 斯里蘭卡 */}
        <path d="M 717 230 L 723 230 L 723 242 L 717 242 Z" />
      </g>
      <g stroke={MAP_LAND_STROKE} strokeWidth="0.5" opacity="0.3" fill="none">
        <line x1="0" y1="250" x2="1000" y2="250" strokeDasharray="2,3" />
        <line x1="500" y1="0" x2="500" y2="500" strokeDasharray="2,3" />
      </g>
    </>
  );
}

function WorldMap({ trips, onOpenDetail }) {
  const tripsWithCoords = trips.filter(t => typeof t.lat === 'number' && typeof t.lng === 'number');
  const groups = {};
  tripsWithCoords.forEach(t => {
    const key = `${t.lat.toFixed(2)},${t.lng.toFixed(2)}`;
    if (!groups[key]) {
      groups[key] = { lat: t.lat, lng: t.lng, name: t.location, country: t.country || '', trips: [] };
    }
    groups[key].trips.push(t);
  });
  const points = Object.values(groups).map(p => {
    const sorted = [...p.trips].sort((a, b) => b.startDate.localeCompare(a.startDate));
    return { ...p, color: sorted[0].color, size: Math.min(8, 4 + Math.floor(p.trips.length * 0.8)) };
  });
  const [hovered, setHovered] = useState(null);

  return (
    <div className="relative w-full">
      <svg viewBox="0 0 1000 500" className="w-full" style={{ height: 'auto', maxHeight: 480 }}>
        <ContinentsLayer />
        {points.map((p, i) => {
          const { x, y } = project(p.lat, p.lng);
          const isHovered = hovered === i;
          return (
            <g key={i}
               onMouseEnter={() => setHovered(i)}
               onMouseLeave={() => setHovered(null)}
               onClick={() => p.trips.length === 1 && onOpenDetail ? onOpenDetail(p.trips[0].id) : null}
               style={{ cursor: p.trips.length === 1 && onOpenDetail ? 'pointer' : 'default' }}>
              <circle cx={x} cy={y} r={p.size + 5} fill={p.color} opacity={isHovered ? 0.4 : 0.22} />
              <circle cx={x} cy={y} r={p.size} fill={p.color} stroke="#FFFFFF" strokeWidth="1.5" />
              {p.trips.length > 1 && (
                <text x={x} y={y + 1}
                  textAnchor="middle" dominantBaseline="middle" fill="#FFFFFF"
                  style={{ fontFamily: NUMERIC, fontSize: p.size + 2, fontWeight: 700, pointerEvents: 'none' }}>
                  {p.trips.length}
                </text>
              )}
            </g>
          );
        })}
        {hovered !== null && points[hovered] && (() => {
          const p = points[hovered];
          const { x, y } = project(p.lat, p.lng);
          const days = p.trips.reduce((s, t) => s + tripLength(t), 0);
          const labelText = `${p.name} · ${p.trips.length} 段 · ${days} 天`;
          const labelW = Math.max(120, labelText.length * 9);
          const labelX = Math.min(Math.max(x - labelW/2, 10), 1000 - labelW - 10);
          const labelY = y - p.size - 28;
          return (
            <g pointerEvents="none">
              <rect x={labelX} y={labelY} width={labelW} height={22} rx={4} fill={INK} opacity="0.92" />
              <text x={labelX + labelW/2} y={labelY + 15}
                textAnchor="middle" fill="#FFFFFF"
                style={{ fontFamily: SANS_TC, fontSize: 12, fontWeight: 500 }}>
                {labelText}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/* ============================================================
   軌跡地圖（Recap 用，可播放動畫）
   ============================================================ */

function TrailMap({ trips, sortedTrips, trailMode, trailIndex, onOpenDetail }) {
  const tripsWithCoords = trips.filter(t => typeof t.lat === 'number' && typeof t.lng === 'number');
  const groups = {};
  tripsWithCoords.forEach(t => {
    const key = `${t.lat.toFixed(2)},${t.lng.toFixed(2)}`;
    if (!groups[key]) {
      groups[key] = { lat: t.lat, lng: t.lng, name: t.location, country: t.country || '', trips: [] };
    }
    groups[key].trips.push(t);
  });
  const points = Object.values(groups).map(p => {
    const sorted = [...p.trips].sort((a, b) => b.startDate.localeCompare(a.startDate));
    return { ...p, color: sorted[0].color, size: Math.min(8, 4 + Math.floor(p.trips.length * 0.8)) };
  });

  // 已造訪 location keys（用於 dim 未到的點）
  const visitedKeys = new Set();
  if (trailMode !== 'idle' && trailIndex >= 0) {
    for (let i = 0; i <= trailIndex && i < sortedTrips.length; i++) {
      const t = sortedTrips[i];
      if (t) visitedKeys.add(`${t.lat.toFixed(2)},${t.lng.toFixed(2)}`);
    }
  }

  // 軌跡：每段都從台灣出發飛到目的地
  const taiwanProj = project(TAIWAN_BASE.lat, TAIWAN_BASE.lng);
  const buildArc = (p1, p2) => {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const offset = Math.min(dist * 0.18, 60);
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2 - offset;
    return `M ${p1.x} ${p1.y} Q ${midX} ${midY} ${p2.x} ${p2.y}`;
  };

  const trailPaths = [];
  if (trailMode !== 'idle' && trailIndex >= 0) {
    for (let i = 0; i <= trailIndex && i < sortedTrips.length; i++) {
      const cur = sortedTrips[i];
      if (!cur || isDomesticTrip(cur)) continue;
      const p2 = project(cur.lat, cur.lng);
      trailPaths.push({
        index: i,
        color: cur.color,
        d: buildArc(taiwanProj, p2),
      });
    }
  }

  const [hovered, setHovered] = useState(null);

  // 當前正在播放的點（用於顯示字幕）
  const currentTrip = (trailMode !== 'idle' && trailIndex >= 0 && trailIndex < sortedTrips.length)
    ? sortedTrips[trailIndex] : null;

  // 飛機路徑（只在 playing 中、且非國內旅程時顯示）
  const flyingPath = (trailMode === 'playing' && currentTrip && !isDomesticTrip(currentTrip))
    ? buildArc(taiwanProj, project(currentTrip.lat, currentTrip.lng))
    : null;

  // 飛機動畫秒數，跟 step interval 約略匹配
  const planeDur = sortedTrips.length <= 5 ? '0.75s'
    : sortedTrips.length <= 10 ? '0.55s'
    : '0.4s';

  return (
    <div className="relative w-full">
      <svg viewBox="0 0 1000 500" className="w-full" style={{ height: 'auto', maxHeight: 480 }}>
        <ContinentsLayer />

        {/* 軌跡連線（從台灣出發的弧線）*/}
        {trailPaths.map(tp => (
          <path
            key={`trail-${tp.index}`}
            d={tp.d}
            fill="none"
            stroke={INK}
            strokeWidth="1.6"
            strokeDasharray="5,3"
            strokeLinecap="round"
            opacity="0"
            style={{ animation: 'fadeInTrail 0.45s ease-out forwards' }}
          />
        ))}

        {/* 台灣 home base 標記（軌跡播放/完成時顯示）*/}
        {trailMode !== 'idle' && (
          <g pointerEvents="none">
            <circle cx={taiwanProj.x} cy={taiwanProj.y} r="4"
              fill="#FFFFFF" stroke={INK} strokeWidth="1.5" />
            <circle cx={taiwanProj.x} cy={taiwanProj.y} r="1.5" fill={INK} />
            <text x={taiwanProj.x} y={taiwanProj.y - 9}
              textAnchor="middle" fill={INK}
              style={{ fontFamily: SANS_TC, fontSize: 10, fontWeight: 700 }}>
              台灣
            </text>
          </g>
        )}

        {/* 點 */}
        {points.map((p, i) => {
          const key = `${p.lat.toFixed(2)},${p.lng.toFixed(2)}`;
          const isVisited = visitedKeys.has(key);
          const dimmed = trailMode === 'playing' && !isVisited;
          const isCurrent = currentTrip
            && Math.abs(currentTrip.lat - p.lat) < 0.05
            && Math.abs(currentTrip.lng - p.lng) < 0.05;
          const { x, y } = project(p.lat, p.lng);
          const isHovered = hovered === i;
          return (
            <g key={i}
               onMouseEnter={() => setHovered(i)}
               onMouseLeave={() => setHovered(null)}
               onClick={() => p.trips.length === 1 && onOpenDetail ? onOpenDetail(p.trips[0].id) : null}
               style={{
                 cursor: p.trips.length === 1 && onOpenDetail ? 'pointer' : 'default',
                 opacity: dimmed ? 0.2 : 1,
                 transition: 'opacity 0.4s ease',
               }}>
              {isCurrent && (
                <circle cx={x} cy={y} r={p.size + 8} fill={p.color} opacity="0.5">
                  <animate attributeName="r"
                    values={`${p.size + 6};${p.size + 22}`}
                    dur="1.2s" repeatCount="indefinite" />
                  <animate attributeName="opacity"
                    values="0.5;0"
                    dur="1.2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={x} cy={y} r={p.size + 5} fill={p.color} opacity={isHovered ? 0.4 : 0.22} />
              <circle cx={x} cy={y} r={p.size} fill={p.color} stroke="#FFFFFF" strokeWidth="1.5" />
              {p.trips.length > 1 && (
                <text x={x} y={y + 1}
                  textAnchor="middle" dominantBaseline="middle" fill="#FFFFFF"
                  style={{ fontFamily: NUMERIC, fontSize: p.size + 2, fontWeight: 700, pointerEvents: 'none' }}>
                  {p.trips.length}
                </text>
              )}
            </g>
          );
        })}

        {/* 飛機（從台灣飛到當前目的地）*/}
        {flyingPath && (
          <g key={`plane-${trailIndex}`} pointerEvents="none">
            <g>
              {/* 紙飛機形狀，朝右 */}
              <polygon points="11,0 -5,-7 -1,0 -5,7"
                fill={INK} stroke="#FFFFFF" strokeWidth="0.8" strokeLinejoin="round" />
              <animateMotion
                path={flyingPath}
                dur={planeDur}
                rotate="auto"
                fill="freeze"
              />
            </g>
          </g>
        )}

        {/* Hover 標籤 */}
        {hovered !== null && points[hovered] && (() => {
          const p = points[hovered];
          const { x, y } = project(p.lat, p.lng);
          const days = p.trips.reduce((s, t) => s + tripLength(t), 0);
          const labelText = `${p.name} · ${p.trips.length} 段 · ${days} 天`;
          const labelW = Math.max(120, labelText.length * 9);
          const labelX = Math.min(Math.max(x - labelW / 2, 10), 1000 - labelW - 10);
          const labelY = y - p.size - 28;
          return (
            <g pointerEvents="none">
              <rect x={labelX} y={labelY} width={labelW} height={22} rx={4} fill={INK} opacity="0.92" />
              <text x={labelX + labelW / 2} y={labelY + 15}
                textAnchor="middle" fill="#FFFFFF"
                style={{ fontFamily: SANS_TC, fontSize: 12, fontWeight: 500 }}>
                {labelText}
              </text>
            </g>
          );
        })()}

        {/* 播放中字幕（顯示當前 trip）*/}
        {currentTrip && (() => {
          const { x, y } = project(currentTrip.lat, currentTrip.lng);
          const domestic = isDomesticTrip(currentTrip);
          const labelText = domestic
            ? `${currentTrip.location} · ${formatDateLabel(currentTrip.startDate)}`
            : `✈ ${currentTrip.location} · ${formatDateLabel(currentTrip.startDate)}`;
          const labelW = Math.max(150, labelText.length * 11);
          const labelX = Math.min(Math.max(x - labelW / 2, 10), 1000 - labelW - 10);
          const labelY = Math.max(y - 38, 8);
          return (
            <g pointerEvents="none">
              <rect x={labelX} y={labelY} width={labelW} height={26} rx={13} fill={currentTrip.color} opacity="0.96" />
              <text x={labelX + labelW / 2} y={labelY + 18}
                textAnchor="middle" fill="#FFFFFF"
                style={{ fontFamily: SANS_TC, fontSize: 13, fontWeight: 700 }}>
                {labelText}
              </text>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}

/* ============================================================
   首頁世界地圖區塊
   ============================================================ */

function WorldMapSection({ trips, expanded, onToggle, onOpenDetail, onUpdateTrip }) {
  const mapped = trips.filter(t => typeof t.lat === 'number' && typeof t.lng === 'number');
  const unmapped = trips.filter(t => typeof t.lat !== 'number' || typeof t.lng !== 'number');
  const uniquePlaces = new Set(mapped.map(t => `${t.lat.toFixed(2)},${t.lng.toFixed(2)}`)).size;

  const [geocoding, setGeocoding] = useState({});
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });

  const handleAutoLocate = async (trip, e) => {
    if (e) e.stopPropagation();
    setGeocoding(prev => ({ ...prev, [trip.id]: true }));
    try {
      const coords = await geocodeLocation(trip.location, trip.country);
      if (coords) {
        onUpdateTrip({ ...trip, lat: coords.lat, lng: coords.lng });
      } else {
        alert(`找不到「${trip.location}」的地理位置，請打開該段旅程編輯，補上更精確的地點或國家`);
      }
    } catch (err) {
      console.error('[autoLocate] error', err);
      alert(`定位「${trip.location}」時發生錯誤：${err.message}`);
    } finally {
      setGeocoding(prev => { const n = { ...prev }; delete n[trip.id]; return n; });
    }
  };

  const handleBatchLocate = async (e) => {
    if (e) e.stopPropagation();
    // snapshot 現在的 unmapped（避免 loop 中 trips 變動造成混亂）
    const targets = [...unmapped];
    if (targets.length === 0) return;
    console.log('[batchLocate] start, targets:', targets.length);
    setBatchRunning(true);
    setBatchProgress({ done: 0, total: targets.length });
    let success = 0;
    let failed = 0;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      try {
        const coords = await geocodeLocation(t.location, t.country);
        if (coords) {
          onUpdateTrip({ ...t, lat: coords.lat, lng: coords.lng });
          success++;
          console.log(`[batchLocate] ✓ ${t.location} (${coords.source})`);
        } else {
          failed++;
          console.warn(`[batchLocate] ✗ ${t.location}: 找不到`);
        }
      } catch (err) {
        failed++;
        console.error(`[batchLocate] ✗ ${t.location} 錯誤:`, err);
      }
      setBatchProgress({ done: i + 1, total: targets.length });
      // 一律 sleep（避免打爆 API + 讓使用者看見進度）
      if (i < targets.length - 1) {
        await new Promise(r => setTimeout(r, 1100));
      }
    }
    setBatchRunning(false);
    console.log(`[batchLocate] done. success=${success}, failed=${failed}`);
    if (failed > 0) {
      alert(`完成 ${targets.length} 個地點：成功 ${success} 個，失敗 ${failed} 個。\n失敗的地點請查看 console 或編輯該段旅程補上更精確的地點或國家。`);
    }
  };

  return (
    <section className="my-8 rounded-xl overflow-hidden" style={{ border: `1.5px solid ${INK_DASH}` }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 transition-colors"
        style={{
          background: expanded ? PAPER_CREAM : BG,
          borderBottom: expanded ? `1px solid ${INK_DASH}` : 'none',
        }}
        onMouseEnter={(e) => { if (!expanded) e.currentTarget.style.background = PAPER_CREAM; }}
        onMouseLeave={(e) => { if (!expanded) e.currentTarget.style.background = BG; }}>
        <div className="flex items-center gap-2.5">
          <Globe className="w-4 h-4" style={{ color: INK }} />
          <span style={{ fontFamily: SANS_TC, fontSize: 15, fontWeight: 700, color: INK, letterSpacing: '0.05em' }}>
            世界地圖
          </span>
          <span style={{ fontFamily: HANDWRITE_EN, fontSize: 16, color: INK_LIGHT, fontStyle: 'italic' }}>
            · World Map
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span style={{ fontFamily: NUMERIC, fontSize: 12, color: INK_LIGHT }}>
            {uniquePlaces} 個地點 · {trips.length} 段旅程
            {unmapped.length > 0 && (
              <span style={{ marginLeft: 6, color: '#C44536' }}>· {unmapped.length} 未顯示</span>
            )}
          </span>
          <ChevronDown className="w-4 h-4 transition-transform"
            style={{ color: INK, transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
        </div>
      </button>

      {expanded && (
        <div className="p-4 md:p-5">
          {trips.length === 0 ? (
            <div className="text-center py-12" style={{ fontFamily: SANS_TC, fontSize: 14, color: INK_LIGHT }}>
              還沒有旅程記錄
            </div>
          ) : (
            <>
              <WorldMap trips={trips} onOpenDetail={onOpenDetail} />
              {unmapped.length > 0 && (
                <div className="mt-4 pt-3" style={{ borderTop: `1px dashed ${INK_DASH}` }}>
                  <div className="flex items-center justify-between mb-2">
                    <div style={{
                      fontFamily: SANS_TC, fontSize: 11, fontWeight: 500,
                      color: INK_LIGHT, letterSpacing: '0.2em',
                    }}>
                      未顯示在地圖上 · {unmapped.length}
                    </div>
                    <button
                      type="button"
                      onClick={handleBatchLocate}
                      disabled={batchRunning}
                      className="flex items-center gap-1 px-3 py-1 rounded-full hover:bg-black/5 transition-colors"
                      style={{
                        color: SOFT_BLUE, fontFamily: SANS_TC, fontSize: 12,
                        border: `1px solid ${SOFT_BLUE}`, fontWeight: 500,
                        opacity: batchRunning ? 0.6 : 1,
                        cursor: batchRunning ? 'wait' : 'pointer',
                      }}>
                      {batchRunning ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> {batchProgress.done}/{batchProgress.total}</>
                      ) : (
                        <><RotateCw className="w-3 h-3" /> 全部自動定位</>
                      )}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {unmapped.map(t => (
                      <div key={t.id} className="inline-flex items-center">
                        <button
                          type="button"
                          onClick={() => onOpenDetail(t.id)}
                          className="px-2 py-1 rounded-l hover:opacity-70"
                          style={{
                            background: t.color + '15', color: t.color,
                            fontFamily: SANS_TC, fontSize: 12, fontWeight: 500,
                            border: `1px solid ${t.color}30`, borderRight: 'none',
                          }}>
                          {t.location}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleAutoLocate(t, e)}
                          disabled={!!geocoding[t.id]}
                          className="px-2 py-1 rounded-r hover:bg-black/5"
                          style={{
                            background: t.color + '15', color: t.color,
                            border: `1px solid ${t.color}30`,
                            opacity: geocoding[t.id] ? 0.6 : 1,
                          }}
                          title="自動定位這段旅程">
                          {geocoding[t.id] ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RotateCw className="w-3 h-3" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   主元件
   ============================================================ */

export default function App() {
  const [view, setView] = useState('home');
  const [selectedTripId, setSelectedTripId] = useState(null);
  const [coverImage, setCoverImage] = useState('');
  const [trips, setTrips] = useState([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showFullEdit, setShowFullEdit] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [quickAddRange, setQuickAddRange] = useState({ start: '', end: '' });
  const [loading, setLoading] = useState(true);
  const [imageUploading, setImageUploading] = useState(false);
  const [hoverTrips, setHoverTrips] = useState(null);
  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });
  const [mapExpanded, setMapExpanded] = useState(true);
  const [currentYear, setCurrentYear] = useState(DEFAULT_YEAR);

  const dragRef = useRef({ active: false, start: null, end: null, hadTrip: false, tripId: null });
  const [dragVisual, setDragVisual] = useState({ start: null, end: null, active: false });

  // tooltip 互動 refs
  const tooltipRef = useRef(null);
  const hideTimerRef = useRef(null);
  const hoveredCellRef = useRef(false); // 是否正 hover 在一個 trip cell 上

  // 共享 tooltip 控制 helpers
  const cancelHide = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };
  const scheduleHide = () => {
    cancelHide();
    hideTimerRef.current = setTimeout(() => {
      setHoverTrips(null);
      hideTimerRef.current = null;
    }, 200);
  };

  // 點擊空白關閉 tooltip
  useEffect(() => {
    if (!hoverTrips) return;
    const onDocMouseDown = (e) => {
      // 點 tooltip 內部 → 不關
      if (tooltipRef.current && tooltipRef.current.contains(e.target)) return;
      // 點 day cell → tooltip 自己會切換，不在這裡關
      const dayCell = e.target.closest && e.target.closest('[data-date]');
      if (dayCell) return;
      cancelHide();
      setHoverTrips(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('touchstart', onDocMouseDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('touchstart', onDocMouseDown);
    };
  }, [hoverTrips]);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get('trips').catch(() => null);
        if (r) {
          const loaded = JSON.parse(r.value);
          const migrated = loaded.map(t => ({ ...t, purpose: migratePurpose(t.purpose) }));
          setTrips(migrated);
        }
      } catch (e) {}
      try {
        const r = await window.storage.get('cover-image').catch(() => null);
        if (r) setCoverImage(r.value);
      } catch (e) {}
      try {
        const r = await window.storage.get('map-expanded').catch(() => null);
        if (r) setMapExpanded(r.value === 'true');
      } catch (e) {}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    window.storage.set('trips', JSON.stringify(trips)).catch((e) => console.error(e));
  }, [trips, loading]);
  useEffect(() => {
    if (loading || !coverImage) return;
    window.storage.set('cover-image', coverImage).catch((e) => console.error(e));
  }, [coverImage, loading]);
  useEffect(() => {
    if (loading) return;
    window.storage.set('map-expanded', String(mapExpanded)).catch(() => {});
  }, [mapExpanded, loading]);

  const handleDayMouseDown = (date, dayTrips) => (e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      active: true, start: date, end: date,
      hadTrip: dayTrips.length > 0, tripId: dayTrips[0]?.id || null,
    };
    setDragVisual({ start: date, end: date, active: true });
  };

  const handleDayMouseEnter = (date) => () => {
    if (!dragRef.current.active) return;
    dragRef.current.end = date;
    setDragVisual({ start: dragRef.current.start, end: date, active: true });
  };

  useEffect(() => {
    const onUp = () => {
      if (!dragRef.current.active) return;
      const { start, end, hadTrip, tripId } = dragRef.current;
      dragRef.current = { active: false, start: null, end: null, hadTrip: false, tripId: null };
      setDragVisual({ start: null, end: null, active: false });
      if (!start) return;
      const [a, b] = orderedRange(start, end || start);
      if (a === b && hadTrip && tripId) {
        setSelectedTripId(tripId);
        setView('detail');
        cancelHide();
        setHoverTrips(null);
        return;
      }
      setQuickAddRange({ start: a, end: b });
      setShowQuickAdd(true);
      cancelHide();
      setHoverTrips(null);
    };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchend', onUp);
    };
  }, []);

  const handleTouchMove = (e) => {
    if (!dragRef.current.active) return;
    const touch = e.touches[0];
    if (!touch) return;
    const elem = document.elementFromPoint(touch.clientX, touch.clientY);
    const date = elem?.getAttribute?.('data-date') || elem?.closest?.('[data-date]')?.getAttribute('data-date');
    if (date) {
      dragRef.current.end = date;
      setDragVisual({ start: dragRef.current.start, end: date, active: true });
    }
  };

  const upsertTrip = (trip) => {
    setTrips((prev) => {
      const idx = prev.findIndex((t) => t.id === trip.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = trip;
        return next;
      }
      return [...prev, trip];
    });
  };

  const deleteTrip = (id) => {
    setTrips((prev) => prev.filter((t) => t.id !== id));
    if (selectedTripId === id) {
      setSelectedTripId(null);
      setView('home');
    }
  };

  const handleCoverChange = async (file) => {
    if (!file) return;
    setImageUploading(true);
    try {
      const dataUrl = await processImage(file);
      setCoverImage(dataUrl);
    } catch (e) { alert('圖片處理失敗'); }
    setImageUploading(false);
  };

  const handleQuickSave = async (data, openDetail) => {
    const id = newId();
    const baseTrip = {
      id,
      location: data.location, country: data.country || '',
      startDate: quickAddRange.start, endDate: quickAddRange.end,
      color: data.color, purpose: data.purpose,
      mood: null, summary: '',
      dailyNotes: {},   // legacy 保留
      dailyPlaces: {},  // 每天的地點 chip 清單
      lat: null, lng: null,
    };
    const coords = await geocodeLocation(data.location, data.country || '');
    const newTrip = coords ? { ...baseTrip, lat: coords.lat, lng: coords.lng } : baseTrip;
    upsertTrip(newTrip);
    setShowQuickAdd(false);
    if (openDetail) {
      setSelectedTripId(id);
      setView('detail');
    }
  };

  const handleNewTripBtn = () => {
    setQuickAddRange({ start: `${currentYear}-01-01`, end: `${currentYear}-01-01` });
    setShowQuickAdd(true);
  };

  const handleEditFull = (trip) => {
    setEditingTrip(trip);
    setShowFullEdit(true);
  };

  const handleEditSave = async (newTrip) => {
    const oldTrip = editingTrip;
    const locChanged = newTrip.location !== oldTrip.location || (newTrip.country || '') !== (oldTrip.country || '');
    let finalTrip = newTrip;
    if (locChanged || typeof newTrip.lat !== 'number') {
      const coords = await geocodeLocation(newTrip.location, newTrip.country);
      finalTrip = coords
        ? { ...newTrip, lat: coords.lat, lng: coords.lng }
        : { ...newTrip, lat: null, lng: null };
    }
    upsertTrip(finalTrip);
    setShowFullEdit(false);
  };

  const selectedTrip = trips.find((t) => t.id === selectedTripId);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: BG }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: INK }} />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative"
      onTouchMove={handleTouchMove}
      style={{
        background: BG, color: INK, fontFamily: SANS_TC,
        userSelect: dragVisual.active ? 'none' : 'auto',
      }}>
      <FontLoader />

      {view === 'home' && (
        <HomeView
          coverImage={coverImage}
          imageUploading={imageUploading}
          onCoverChange={handleCoverChange}
          onClearCover={() => setCoverImage('')}
          trips={trips}
          onNewTripBtn={handleNewTripBtn}
          onOpenRecap={() => setView('recap')}
          handleDayMouseDown={handleDayMouseDown}
          handleDayMouseEnter={handleDayMouseEnter}
          dragVisual={dragVisual}
          hoverTrips={hoverTrips}
          setHoverTrips={setHoverTrips}
          hoverPos={hoverPos}
          setHoverPos={setHoverPos}
          cancelHide={cancelHide}
          scheduleHide={scheduleHide}
          onOpenDetail={(id) => { setSelectedTripId(id); setView('detail'); }}
          onUpdateTrip={upsertTrip}
          mapExpanded={mapExpanded}
          setMapExpanded={setMapExpanded}
          currentYear={currentYear}
          onYearChange={setCurrentYear}
        />
      )}

      {view === 'detail' && selectedTrip && (
        <DetailView
          trip={selectedTrip}
          onBack={() => { setView('home'); setSelectedTripId(null); }}
          onEdit={() => handleEditFull(selectedTrip)}
          onDelete={() => { if (confirm('確定要刪除這段旅程嗎？')) deleteTrip(selectedTrip.id); }}
          onUpdate={upsertTrip}
        />
      )}

      {view === 'recap' && (
        <RecapView
          trips={trips}
          year={currentYear}
          onBack={() => setView('home')}
          onOpenDetail={(id) => { setSelectedTripId(id); setView('detail'); }}
        />
      )}

      {showQuickAdd && (
        <QuickAddModal
          year={currentYear}
          range={quickAddRange}
          onClose={() => setShowQuickAdd(false)}
          onSave={handleQuickSave}
          onRangeChange={(r) => setQuickAddRange(r)}
        />
      )}

      {showFullEdit && editingTrip && (
        <FullEditModal
          year={currentYear}
          trip={editingTrip}
          onClose={() => setShowFullEdit(false)}
          onSave={handleEditSave}
          onDelete={() => { deleteTrip(editingTrip.id); setShowFullEdit(false); }}
        />
      )}

      {hoverTrips && hoverTrips.length > 0 && !dragVisual.active && view === 'home' && (
        <Tooltip
          innerRef={tooltipRef}
          trips={hoverTrips}
          position={hoverPos}
          onMouseEnter={cancelHide}
          onMouseLeave={scheduleHide}
          onOpenDetail={(id) => {
            setSelectedTripId(id); setView('detail');
            cancelHide(); setHoverTrips(null);
          }}
        />
      )}
    </div>
  );
}

/* ============================================================
   首頁
   ============================================================ */

function HomeView({
  coverImage, imageUploading, onCoverChange, onClearCover,
  trips, onNewTripBtn, onOpenRecap, onOpenDetail,
  handleDayMouseDown, handleDayMouseEnter, dragVisual,
  hoverTrips, setHoverTrips, hoverPos, setHoverPos,
  cancelHide, scheduleHide,
  mapExpanded, setMapExpanded, onUpdateTrip,
  currentYear, onYearChange,
}) {
  const fileInputRef = useRef(null);
  const [hoverIllu, setHoverIllu] = useState(false);

  // 只計入當前年度的旅程到 footer/legend/map 統計
  const yearStartStr = `${currentYear}-01-01`;
  const yearEndStr = `${currentYear}-12-31`;
  const yearTrips = trips.filter(t =>
    !(t.endDate < yearStartStr || t.startDate > yearEndStr)
  );

  return (
    <div className="relative max-w-5xl mx-auto px-6 md:px-10 pt-10 pb-16">
      <button
        onClick={onNewTripBtn}
        className="fixed bottom-8 right-8 z-30 flex items-center gap-2 px-5 py-3 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
        style={{ background: INK, color: BG, fontFamily: SANS_TC, fontSize: 15, fontWeight: 500 }}>
        <Plus className="w-4 h-4" /> 新增旅程
      </button>

      {trips.length > 0 && (
        <button
          onClick={onOpenRecap}
          className="fixed bottom-8 right-40 z-30 flex items-center gap-2 px-5 py-3 rounded-full shadow-lg transition-all hover:scale-105 active:scale-95"
          style={{
            background: BG, color: INK, border: `1.5px solid ${INK}`,
            fontFamily: SANS_TC, fontSize: 15, fontWeight: 500,
          }}>
          <BarChart3 className="w-4 h-4" /> Recap
        </button>
      )}

      <header className="relative text-center pt-2 pb-2">
        <div className="flex justify-center mt-2 mb-3 relative" style={{ zIndex: 1 }}>
          <div
            onMouseEnter={() => setHoverIllu(true)}
            onMouseLeave={() => setHoverIllu(false)}
            className="relative cursor-pointer"
            style={{ width: 'min(420px, 75vw)', height: 'min(240px, 45vw)' }}
            onClick={() => fileInputRef.current?.click()}>
            {coverImage ? (
              <img src={coverImage} alt="封面插圖"
                className="w-full h-full object-contain"
                style={{ filter: hoverIllu ? 'brightness(0.93)' : 'none', transition: 'filter 0.2s' }} />
            ) : (
              <HorseIllustration />
            )}
            {hoverIllu && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="px-3.5 py-1.5 rounded-full backdrop-blur-sm flex items-center gap-1.5"
                  style={{
                    background: 'rgba(255, 255, 255, 0.92)',
                    border: `1.5px solid ${INK}`,
                    fontFamily: SANS_TC, fontSize: 14, color: INK, fontWeight: 500,
                  }}>
                  {imageUploading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> 處理中…</>
                    : <><Upload className="w-4 h-4" /> {coverImage ? '更換插圖' : '替換成自己的插圖'}</>}
                </div>
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => onCoverChange(e.target.files[0])} />
        </div>

        {coverImage && (
          <div className="text-center" style={{ marginTop: -2, marginBottom: 4 }}>
            <button onClick={onClearCover} className="text-xs hover:underline"
              style={{ color: INK_LIGHT, fontFamily: SANS_TC }}>
              移除插圖，回到預設
            </button>
          </div>
        )}

        <div style={{
          fontFamily: HANDWRITE_EN, fontSize: 'clamp(18px, 2.2vw, 22px)',
          color: INK, letterSpacing: '0.06em', fontStyle: 'italic', fontWeight: 500,
        }}>
          year of the {ZODIAC[currentYear]} · {currentYear}
        </div>
        <div style={{
          fontFamily: HANDWRITE_EN, fontSize: 'clamp(15px, 1.8vw, 18px)',
          color: INK_LIGHT, fontStyle: 'italic', marginTop: 2,
        }}>
          every decision you're making is right.
        </div>

        {/* 年度切換 */}
        <div className="mt-3 flex items-center justify-center gap-1">
          {SUPPORTED_YEARS.map(y => {
            const active = y === currentYear;
            return (
              <button key={y} onClick={() => onYearChange(y)}
                className="px-3.5 py-1 rounded-full transition-all"
                style={{
                  background: active ? INK : 'transparent',
                  color: active ? BG : INK,
                  border: `1.5px solid ${INK}`,
                  fontFamily: NUMERIC, fontSize: 13, fontWeight: 600,
                  letterSpacing: '0.05em',
                }}>
                {y} <span style={{ opacity: 0.7, marginLeft: 2 }}>· {ZODIAC_TC[y]}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-2 flex items-center justify-center gap-2 opacity-65">
          <svg width="36" height="10" viewBox="0 0 60 10">
            <path d="M 2 5 Q 12 1 22 5 Q 32 9 42 5 Q 52 1 58 5" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span style={{ fontFamily: SANS_TC, fontSize: 12, color: INK }}>
            點擊或拖曳日期建立旅程
          </span>
          <svg width="36" height="10" viewBox="0 0 60 10">
            <path d="M 2 5 Q 12 9 22 5 Q 32 1 42 5 Q 52 9 58 5" fill="none" stroke={INK} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </header>

      <WorldMapSection
        trips={yearTrips}
        expanded={mapExpanded}
        onToggle={() => setMapExpanded(v => !v)}
        onOpenDetail={onOpenDetail}
        onUpdateTrip={onUpdateTrip}
      />

      <main className="mt-4 relative" style={{ zIndex: 2 }}>
        <div className="overflow-x-auto -mx-2 px-2 pb-2" style={{ scrollbarWidth: 'thin' }}>
          <div className="grid grid-cols-4 gap-x-5 md:gap-x-8 gap-y-7" style={{ minWidth: 720 }}>
            {Array.from({ length: 12 }, (_, m) => (
              <MonthCard
                key={m}
                year={currentYear} month={m} trips={yearTrips}
                dragVisual={dragVisual}
                handleDayMouseDown={handleDayMouseDown}
                handleDayMouseEnter={handleDayMouseEnter}
                setHoverTrips={setHoverTrips}
                setHoverPos={setHoverPos}
                cancelHide={cancelHide}
                scheduleHide={scheduleHide}
                hoverTrips={hoverTrips}
              />
            ))}
          </div>
        </div>
      </main>

      {yearTrips.length > 0 && (
        <TripLegend trips={yearTrips} onOpenDetail={onOpenDetail} onOpenRecap={onOpenRecap} />
      )}

      <footer className="mt-14 pt-6 text-center" style={{ borderTop: `1px dashed ${INK_DASH}` }}>
        <div className="flex items-center justify-center gap-2.5">
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
            <path d="M 12 30 Q 12 20 16 16 Q 20 10 26 12 Q 32 14 32 22 L 33 28 L 30 30 L 28 33 L 22 33 L 18 30 Z" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx="26" cy="22" r="1" fill={INK} />
            <path d="M 24 13 L 25 9 L 27 12" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          <div style={{ fontFamily: SANS_TC, fontSize: 13, color: INK_LIGHT }}>
            calendar · {currentYear} · 共 {yearTrips.length} 段旅程，{yearTrips.reduce((s, t) => s + tripLength(t), 0)} 天
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ============================================================
   單月卡片
   ============================================================ */

function MonthCard({
  year, month, trips,
  dragVisual,
  handleDayMouseDown, handleDayMouseEnter,
  setHoverTrips, setHoverPos, hoverTrips,
  cancelHide, scheduleHide,
}) {
  const cells = buildMonthGrid(year, month);
  const today = todayStr();

  const inDragRange = (ds) => {
    if (!dragVisual.active || !dragVisual.start || !dragVisual.end) return false;
    const [a, b] = orderedRange(dragVisual.start, dragVisual.end);
    return ds >= a && ds <= b;
  };

  return (
    <div>
      <div className="mb-1" style={{
        fontFamily: HANDWRITE_EN, fontSize: 22, fontWeight: 500, fontStyle: 'italic',
        color: INK, letterSpacing: '0.02em',
      }}>
        {MONTH_EN[month]}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5 mb-0.5">
        {WEEKDAYS_SUN.map((d, i) => (
          <div key={i} className="text-center" style={{
            fontFamily: NUMERIC, fontSize: 9, color: INK_LIGHT,
            fontWeight: 500, letterSpacing: '0.05em', lineHeight: 1.4,
          }}>
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, idx) => {
          if (d === null) return <div key={idx} className="aspect-square" />;
          const ds = fmtDate(year, month, d);
          const dayTrips = findTripsForDate(trips, ds);
          const hasTrip = dayTrips.length > 0;
          const isToday = ds === today;
          const trip = dayTrips[0];
          const inDrag = inDragRange(ds);
          const isHovered = hoverTrips && hoverTrips.some(t => dayTrips.some(d2 => d2.id === t.id));

          return (
            <div key={idx} className="aspect-square flex items-center justify-center">
              <div
                data-date={ds}
                onMouseDown={handleDayMouseDown(ds, dayTrips)}
                onTouchStart={handleDayMouseDown(ds, dayTrips)}
                onMouseEnter={(e) => {
                  handleDayMouseEnter(ds)();
                  if (hasTrip && !dragVisual.active) {
                    cancelHide();
                    const rect = e.currentTarget.getBoundingClientRect();
                    setHoverPos({ x: rect.left + rect.width / 2, y: rect.top });
                    setHoverTrips(dayTrips);
                  }
                }}
                onMouseLeave={() => {
                  if (hasTrip) scheduleHide();
                }}
                className="relative flex items-center justify-center cursor-pointer"
                style={{
                  width: '82%', height: '82%', borderRadius: '50%',
                  background: hasTrip ? trip.color : (inDrag ? 'rgba(31,26,20,0.10)' : 'transparent'),
                  color: hasTrip ? '#FFFFFF' : INK,
                  fontFamily: NUMERIC, fontSize: 11, fontWeight: hasTrip ? 500 : 400,
                  boxShadow: isHovered
                    ? `0 0 0 2px ${BG}, 0 0 0 3.5px ${trip?.color}`
                    : (inDrag && !hasTrip ? `0 0 0 1.5px ${INK}` : 'none'),
                  outline: isToday && !hasTrip && !inDrag ? `1.5px dashed ${INK}` : 'none',
                  outlineOffset: -2,
                }}>
                {d}
                {dayTrips.length > 1 && (
                  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full"
                    style={{ background: BG, border: `1px solid ${dayTrips[1].color}` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================================
   Tooltip
   ============================================================ */

function Tooltip({ trips, position, onOpenDetail, onMouseEnter, onMouseLeave, innerRef }) {
  const w = 240;
  const left = Math.min(Math.max(position.x - w / 2, 12), window.innerWidth - w - 12);
  const top = position.y - 12;
  return (
    <div
      ref={innerRef}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="fixed z-50 pointer-events-auto"
      style={{ left, top, width: w, transform: 'translateY(-100%)' }}>
      <div className="rounded-lg p-3 shadow-xl"
        style={{ background: BG, border: `1.5px solid ${INK}`, fontFamily: SANS_TC }}>
        {trips.map((t, i) => (
          <button key={t.id}
            type="button"
            onClick={() => onOpenDetail(t.id)}
            className="w-full text-left transition-opacity hover:opacity-70"
            style={{
              marginTop: i === 0 ? 0 : 10,
              paddingTop: i === 0 ? 0 : 10,
              borderTop: i === 0 ? 'none' : `1px dashed ${INK_DASH}`,
            }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: t.color }} />
              <span style={{ color: INK_LIGHT, fontFamily: NUMERIC, fontSize: 12 }}>
                {formatRange(t.startDate, t.endDate)} · {tripLength(t)}天
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div style={{ fontFamily: SANS_TC, fontSize: 17, fontWeight: 700, color: INK }}>
                {t.location}
              </div>
              {t.mood && <span style={{ fontSize: 16 }}>{t.mood}</span>}
            </div>
            {t.purpose && PURPOSE_PRESETS[t.purpose] && (
              <div className="mt-1" style={{
                color: PURPOSE_PRESETS[t.purpose].color,
                fontFamily: SANS_TC, fontWeight: 500, fontSize: 12,
              }}>
                {PURPOSE_PRESETS[t.purpose].label}
              </div>
            )}
            <div className="mt-1.5" style={{ color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 12 }}>
              點擊查看詳情 →
            </div>
          </button>
        ))}
      </div>
      <div className="absolute left-1/2"
        style={{
          bottom: -7, width: 12, height: 12,
          background: BG,
          borderRight: `1.5px solid ${INK}`,
          borderBottom: `1.5px solid ${INK}`,
          transform: 'translateX(-50%) rotate(45deg)',
        }} />
    </div>
  );
}

/* ============================================================
   旅程清單
   ============================================================ */

function TripLegend({ trips, onOpenDetail, onOpenRecap }) {
  const sorted = [...trips].sort((a, b) => a.startDate.localeCompare(b.startDate));
  return (
    <div className="mt-12 pt-7" style={{ borderTop: `1px dashed ${INK_DASH}` }}>
      <div className="mb-4 flex items-center justify-between">
        <div style={{ fontFamily: SANS_TC, fontSize: 17, color: INK, fontWeight: 700, letterSpacing: '0.05em' }}>
          旅程一覽
        </div>
        <button onClick={onOpenRecap}
          className="flex items-center gap-1.5 hover:opacity-70 transition-opacity"
          style={{ color: INK, fontFamily: SANS_TC, fontSize: 14, fontWeight: 500 }}>
          <BarChart3 className="w-4 h-4" /> 看 Recap →
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-1">
        {sorted.map((t) => (
          <button key={t.id}
            onClick={() => onOpenDetail(t.id)}
            className="flex items-center gap-3 py-2 text-left rounded -mx-2 px-2"
            style={{ transition: 'background 0.15s' }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(31,26,20,0.04)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: t.color }} />
            <div className="flex-1 min-w-0 flex items-baseline gap-2.5 flex-wrap">
              <div style={{ fontFamily: SANS_TC, fontSize: 16, fontWeight: 700, color: INK }}>
                {t.location}
              </div>
              {t.mood && <span style={{ fontSize: 16 }}>{t.mood}</span>}
              {t.purpose && PURPOSE_PRESETS[t.purpose] && (
                <span className="px-1.5 py-0.5 rounded"
                  style={{
                    background: PURPOSE_PRESETS[t.purpose].color + '18',
                    color: PURPOSE_PRESETS[t.purpose].color,
                    fontFamily: SANS_TC, fontSize: 11, fontWeight: 500,
                  }}>
                  {PURPOSE_PRESETS[t.purpose].label}
                </span>
              )}
            </div>
            <div style={{ fontFamily: NUMERIC, fontSize: 13, color: INK_LIGHT }}>
              {formatRange(t.startDate, t.endDate)} · {tripLength(t)}天
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   QuickAdd
   ============================================================ */

function QuickAddModal({ year, range, onClose, onSave, onRangeChange }) {
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [purpose, setPurpose] = useState('overseasLeisure');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const countryRef = useRef(null);

  const days = daysBetween(range.start, range.end).length;
  const preset = PURPOSE_PRESETS[purpose];

  const submit = async (openDetail = false) => {
    if (!city.trim()) { setError('請輸入城市'); return; }
    if (range.start > range.end) { setError('日期錯誤'); return; }
    setSaving(true);
    await onSave({
      location: city.trim(),
      country: country.trim(),
      purpose,
      color: preset.color,
    }, openDetail);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(31,26,20,0.45)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
        style={{ background: BG, border: `1.5px solid ${INK}`, fontFamily: SANS_TC }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <div style={{ fontFamily: SANS_TC, fontSize: 20, fontWeight: 700, color: INK, letterSpacing: '0.05em' }}>
            新增旅程
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/5">
            <X className="w-5 h-5" style={{ color: INK_LIGHT }} />
          </button>
        </div>

        <div className="px-6 pb-4">
          <div style={{ fontFamily: SANS_TC, fontSize: 15, color: INK }}>
            {formatRange(range.start, range.end)} · {days} 天
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs" style={{ color: INK_LIGHT }}>
            <input type="date" value={range.start}
              min={`${year}-01-01`} max={`${year}-12-31`}
              onChange={(e) => onRangeChange({ ...range, start: e.target.value })}
              className="bg-transparent outline-none border-b py-0.5"
              style={{ borderColor: INK_DASH, fontFamily: NUMERIC }} />
            <span>至</span>
            <input type="date" value={range.end}
              min={`${year}-01-01`} max={`${year}-12-31`}
              onChange={(e) => onRangeChange({ ...range, end: e.target.value })}
              className="bg-transparent outline-none border-b py-0.5"
              style={{ borderColor: INK_DASH, fontFamily: NUMERIC }} />
          </div>
        </div>

        <div style={{ borderTop: `1px dashed ${INK_DASH}` }} />

        <div className="px-6 pt-5">
          <div className="mb-1" style={{
            color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 11,
            fontWeight: 500, letterSpacing: '0.2em',
          }}>
            城市 · CITY
          </div>
          <input value={city} onChange={(e) => setCity(e.target.value)}
            placeholder="例：東京、首爾、台北"
            autoFocus
            className="w-full bg-transparent outline-none py-1.5"
            style={{
              fontFamily: SANS_TC, fontSize: 18, fontWeight: 500,
              color: INK, borderBottom: `1.5px solid ${INK_DASH}`,
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !saving) {
                e.preventDefault();
                countryRef.current?.focus();
              }
            }} />
        </div>

        <div className="px-6 pt-4">
          <div className="mb-1" style={{
            color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 11,
            fontWeight: 500, letterSpacing: '0.2em',
          }}>
            國家／區域 · COUNTRY <span style={{ opacity: 0.6 }}>(選填)</span>
          </div>
          <input ref={countryRef} value={country} onChange={(e) => setCountry(e.target.value)}
            placeholder="例：日本、Japan、台灣"
            className="w-full bg-transparent outline-none py-1.5"
            style={{
              fontFamily: SANS_TC, fontSize: 16, fontWeight: 400,
              color: INK, borderBottom: `1.5px solid ${INK_DASH}`,
            }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !saving) submit(false); }} />
          <div className="mt-1.5 text-xs" style={{ color: INK_LIGHT, fontFamily: SANS_TC, fontStyle: 'italic' }}>
            儲存時會根據城市 + 國家自動定位到地圖上
          </div>
        </div>

        <div className="px-6 pt-5">
          <div className="mb-2" style={{
            color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 11,
            fontWeight: 500, letterSpacing: '0.2em',
          }}>
            類型 · PURPOSE
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(PURPOSE_PRESETS).map(([key, p]) => {
              const Icon = p.icon;
              const active = purpose === key;
              return (
                <button key={key} onClick={() => setPurpose(key)}
                  className="relative flex flex-col items-center gap-1.5 py-3 rounded-lg transition-all"
                  style={{
                    background: active ? p.color : 'transparent',
                    color: active ? '#FFFFFF' : INK,
                    border: active ? `1.5px solid ${p.color}` : `1.5px solid ${INK_DASH}`,
                  }}>
                  <Icon className="w-4 h-4" />
                  <div style={{ fontFamily: SANS_TC, fontSize: 13, fontWeight: 700 }}>{p.label}</div>
                  <div style={{ fontFamily: HANDWRITE_EN, fontSize: 11, opacity: 0.75 }}>{p.sublabel}</div>
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="px-6 pt-3 text-sm" style={{ color: '#C44536', fontFamily: SANS_TC }}>{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 px-6 pt-5 pb-5 flex-wrap">
          <button onClick={onClose} disabled={saving}
            className="px-4 py-2 rounded-full hover:bg-black/5"
            style={{ color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 14, opacity: saving ? 0.5 : 1 }}>
            取消
          </button>
          <button onClick={() => submit(false)} disabled={saving}
            className="px-5 py-2 rounded-full hover:opacity-85 flex items-center gap-2"
            style={{ background: INK, color: BG, fontFamily: SANS_TC, fontSize: 14, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 定位中…</> : '儲存'}
          </button>
          <button onClick={() => submit(true)} disabled={saving}
            className="px-5 py-2 rounded-full hover:opacity-85 flex items-center gap-2"
            style={{ background: preset.color, color: '#FFFFFF', fontFamily: SANS_TC, fontSize: 14, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
            {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 定位中…</> : '儲存並編輯詳情 →'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   FullEdit
   ============================================================ */

function FullEditModal({ year, trip, onClose, onSave, onDelete }) {
  const [location, setLocation] = useState(trip.location);
  const [country, setCountry] = useState(trip.country || '');
  const [startDate, setStartDate] = useState(trip.startDate);
  const [endDate, setEndDate] = useState(trip.endDate);
  const [color, setColor] = useState(trip.color);
  const [purpose, setPurpose] = useState(trip.purpose || 'overseasLeisure');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!location.trim()) return setError('請輸入地點');
    if (startDate > endDate) return setError('結束日不可早於開始日');
    setSaving(true);
    await onSave({
      ...trip,
      location: location.trim(), country: country.trim(),
      startDate, endDate, color, purpose,
    });
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(31,26,20,0.45)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        style={{ background: BG, border: `1.5px solid ${INK}`, fontFamily: SANS_TC }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-3 sticky top-0"
          style={{ background: BG, borderBottom: `1px solid ${INK_DASH}`, zIndex: 1 }}>
          <div style={{ fontFamily: SANS_TC, fontSize: 20, fontWeight: 700, color: INK, letterSpacing: '0.05em' }}>
            編輯旅程
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/5">
            <X className="w-5 h-5" style={{ color: INK_LIGHT }} />
          </button>
        </div>

        <div className="px-6 pb-2 pt-4 space-y-4">
          <Field label="地點">
            <input value={location} onChange={(e) => setLocation(e.target.value)}
              className="w-full bg-transparent outline-none border-b py-1.5"
              style={{ borderColor: INK_DASH, fontFamily: SANS_TC, fontSize: 16, fontWeight: 500 }} />
          </Field>
          <Field label="國家／區域">
            <input value={country} onChange={(e) => setCountry(e.target.value)}
              className="w-full bg-transparent outline-none border-b py-1.5"
              placeholder="例：日本、Japan"
              style={{ borderColor: INK_DASH, fontFamily: SANS_TC, fontSize: 14 }} />
            <div className="mt-1 text-xs" style={{ color: INK_LIGHT, fontFamily: SANS_TC, fontStyle: 'italic' }}>
              更動地點或國家後儲存，地圖座標會自動更新
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="開始日">
              <input type="date" value={startDate}
                min={`${year}-01-01`} max={`${year}-12-31`}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-transparent outline-none border-b py-1.5"
                style={{ borderColor: INK_DASH, fontFamily: NUMERIC, fontSize: 13 }} />
            </Field>
            <Field label="結束日">
              <input type="date" value={endDate}
                min={`${year}-01-01`} max={`${year}-12-31`}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-transparent outline-none border-b py-1.5"
                style={{ borderColor: INK_DASH, fontFamily: NUMERIC, fontSize: 13 }} />
            </Field>
          </div>

          <Field label="類型">
            <div className="flex gap-2">
              {Object.entries(PURPOSE_PRESETS).map(([key, p]) => (
                <button key={key} onClick={() => { setPurpose(key); setColor(p.color); }}
                  className="flex-1 py-2 rounded transition-all"
                  style={{
                    background: purpose === key ? p.color : 'transparent',
                    color: purpose === key ? '#FFFFFF' : INK,
                    border: purpose === key ? `1.5px solid ${p.color}` : `1.5px solid ${INK_DASH}`,
                    fontFamily: SANS_TC, fontSize: 13, fontWeight: 500,
                  }}>
                  {p.label}
                </button>
              ))}
            </div>
          </Field>

          <Field label="標記顏色">
            <div className="flex flex-wrap gap-2">
              {TRIP_PALETTE.map((c) => (
                <button key={c.value} onClick={() => setColor(c.value)}
                  className="w-8 h-8 rounded-full transition-transform hover:scale-110"
                  style={{
                    background: c.value,
                    boxShadow: color === c.value ? `0 0 0 2px ${BG}, 0 0 0 4px ${INK}` : 'none',
                  }}
                  title={c.name} />
              ))}
            </div>
          </Field>

          {error && (
            <div className="text-sm py-1" style={{ color: '#C44536', fontFamily: SANS_TC }}>{error}</div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 pt-3 pb-5">
          <button onClick={() => { if (confirm('確定要刪除？')) onDelete(); }}
            className="text-sm hover:opacity-70"
            style={{ color: '#C44536', fontFamily: SANS_TC, fontSize: 14 }}>
            刪除
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} disabled={saving}
              className="px-4 py-2 rounded-full hover:bg-black/5"
              style={{ color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 14, opacity: saving ? 0.5 : 1 }}>
              取消
            </button>
            <button onClick={handleSave} disabled={saving}
              className="px-5 py-2 rounded-full hover:opacity-85 flex items-center gap-2"
              style={{ background: INK, color: BG, fontFamily: SANS_TC, fontSize: 14, fontWeight: 500, opacity: saving ? 0.7 : 1 }}>
              {saving ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> 定位中…</> : '儲存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <div className="mb-1" style={{
        color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 11,
        fontWeight: 500, letterSpacing: '0.2em',
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

/* ============================================================
   詳情頁
   ============================================================ */

function DetailView({ trip, onBack, onEdit, onDelete, onUpdate }) {
  const days = daysBetween(trip.startDate, trip.endDate);
  const dailyPlaces = trip.dailyPlaces || {};
  const purposeInfo = trip.purpose ? PURPOSE_PRESETS[trip.purpose] : null;
  const currentMood = trip.mood || null;

  const setMood = (emoji) => {
    onUpdate({ ...trip, mood: trip.mood === emoji ? null : emoji });
  };

  const updateDayPlaces = (dateStr, places) => {
    onUpdate({
      ...trip,
      dailyPlaces: { ...dailyPlaces, [dateStr]: places },
    });
  };

  return (
    <div className="relative">
      <div style={{ height: 8, background: trip.color }} />

      <div className="max-w-4xl mx-auto px-6 md:px-10 pt-7 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1 hover:opacity-60"
          style={{ color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 14 }}>
          <ChevronLeft className="w-5 h-5" /> 返回
        </button>
        <div className="flex items-center gap-2">
          <button onClick={onEdit}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full hover:bg-black/5"
            style={{ color: INK, border: `1.5px solid ${INK}`, fontFamily: SANS_TC, fontSize: 13, fontWeight: 500 }}>
            <Edit3 className="w-3.5 h-3.5" /> 編輯
          </button>
          <button onClick={onDelete}
            className="flex items-center gap-1 px-3.5 py-1.5 rounded-full hover:bg-black/5"
            style={{ color: '#C44536', border: '1.5px solid #C44536', fontFamily: SANS_TC, fontSize: 13, fontWeight: 500 }}>
            <Trash2 className="w-3.5 h-3.5" /> 刪除
          </button>
        </div>
      </div>

      <header className="max-w-4xl mx-auto px-6 md:px-10 pt-8 pb-8 text-center">
        {purposeInfo && (
          <div className="inline-block mb-3 px-3 py-0.5 rounded-full"
            style={{
              background: purposeInfo.color + '18', color: purposeInfo.color,
              fontFamily: SANS_TC, fontSize: 13, fontWeight: 500,
            }}>
            {purposeInfo.label} · {purposeInfo.sublabel}
          </div>
        )}
        <div className="mb-2" style={{ color: INK_LIGHT, fontFamily: NUMERIC, fontSize: 16 }}>
          {formatRange(trip.startDate, trip.endDate)} · {tripLength(trip)} 天
        </div>
        <h1 style={{
          fontFamily: SANS_TC,
          fontSize: 'clamp(40px, 6.5vw, 64px)',
          color: INK, letterSpacing: '0.06em', lineHeight: 1.1, fontWeight: 900,
        }}>
          {trip.location}
        </h1>
        {trip.country && (
          <div className="mt-3" style={{ color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 16 }}>
            {trip.country}
          </div>
        )}

        <div className="mt-4 flex justify-center">
          <a
            href={mapsUrl(trip.location, trip.country)}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:bg-black/5 transition-colors"
            style={{
              border: `1.5px solid ${INK_DASH}`,
              fontFamily: SANS_TC, fontSize: 13, fontWeight: 500, color: INK,
            }}>
            <MapPin className="w-3.5 h-3.5" /> 在 Google Maps 開啟
            <ExternalLink className="w-3 h-3" style={{ opacity: 0.6 }} />
          </a>
        </div>

        <div className="mt-7">
          <div style={{
            color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 11,
            fontWeight: 500, letterSpacing: '0.25em', marginBottom: 8,
          }}>
            旅程心情 · MOOD
          </div>
          <div className="flex justify-center gap-2 md:gap-3 flex-wrap">
            {MOOD_OPTIONS.map(opt => {
              const isActive = currentMood === opt.emoji;
              return (
                <button key={opt.emoji}
                  onClick={() => setMood(opt.emoji)}
                  className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg transition-all"
                  style={{
                    background: isActive ? PAPER_CREAM : 'transparent',
                    border: isActive ? `1.5px solid ${INK}` : `1.5px solid transparent`,
                    transform: isActive ? 'scale(1.08)' : 'scale(1)',
                    opacity: currentMood && !isActive ? 0.4 : 1,
                  }}
                  title={opt.label}>
                  <span style={{ fontSize: isActive ? 32 : 26, lineHeight: 1, transition: 'font-size 0.15s' }}>
                    {opt.emoji}
                  </span>
                  <span style={{
                    fontFamily: SANS_TC, fontSize: 11, color: INK,
                    fontWeight: isActive ? 700 : 400,
                  }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <section className="max-w-4xl mx-auto px-6 md:px-10 pb-24">
        <div className="mb-2 flex items-baseline gap-2">
          <span style={{ fontFamily: SANS_TC, fontSize: 16, color: INK, fontWeight: 700, letterSpacing: '0.05em' }}>
            旅遊行程
          </span>
          <span style={{ color: INK_LIGHT, fontFamily: HANDWRITE_EN, fontSize: 18, fontStyle: 'italic' }}>
            · Itinerary
          </span>
        </div>
        <div className="mb-5" style={{ fontFamily: SANS_TC, fontSize: 12, color: INK_LIGHT, fontStyle: 'italic' }}>
          每天可加入景點、餐廳、購物、其他、住宿。直接輸入名稱，或貼上 Google Maps 網址自動匯入。
        </div>
        <div className="space-y-1">
          {days.map((d, i) => (
            <DayEntry key={d}
              date={d} dayIndex={i + 1} totalDays={days.length}
              places={dailyPlaces[d] || []}
              color={trip.color}
              location={trip.location} country={trip.country}
              onChange={(newPlaces) => updateDayPlaces(d, newPlaces)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ============================================================
   單日行程：地點 chip 列表 + 輸入框
   ============================================================ */

function DayEntry({ date, dayIndex, totalDays, places, color, location, country, onChange }) {
  const [inputValue, setInputValue] = useState('');
  const [selectedType, setSelectedType] = useState('sight');
  const wd = ['日', '一', '二', '三', '四', '五', '六'][parseDate(date).getDay()];

  const addPlace = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    let newPlace;
    if (isGmapsUrl(trimmed)) {
      const parsedName = parseGmapsUrl(trimmed);
      newPlace = {
        id: newPlaceId(),
        name: parsedName || '從 Google Maps 匯入',
        url: trimmed,
        source: 'gmaps',
        type: selectedType,
      };
    } else {
      newPlace = {
        id: newPlaceId(),
        name: trimmed,
        url: mapsUrl(trimmed, country),
        source: 'manual',
        type: selectedType,
      };
    }
    onChange([...places, newPlace]);
    setInputValue('');
  };

  const removePlace = (id) => {
    onChange(places.filter(p => p.id !== id));
  };

  // 按 type 排序，同 type 保留輸入順序
  const placesByType = {};
  PLACE_TYPE_ORDER.forEach(t => { placesByType[t] = []; });
  places.forEach(p => {
    const t = p.type && PLACE_TYPES[p.type] ? p.type : 'sight';
    placesByType[t].push(p);
  });

  return (
    <div className="grid grid-cols-12 gap-4 py-4" style={{ borderBottom: `1px dashed ${INK_DASH}` }}>
      <div className="col-span-12 md:col-span-3">
        <div style={{ fontFamily: HANDWRITE_EN, fontSize: 14, color: INK_LIGHT, fontWeight: 500 }}>
          Day {dayIndex} / {totalDays}
        </div>
        <div className="mt-0.5" style={{ fontFamily: SANS_TC, fontSize: 18, fontWeight: 700, color: INK }}>
          {formatDateLabel(date)}
        </div>
        <div style={{ fontFamily: SANS_TC, fontSize: 12, color: INK_LIGHT }}>
          週{wd} · {date}
        </div>
        <a href={mapsUrl(location, country)} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 mt-2 text-xs hover:underline"
          style={{ color: SOFT_BLUE, fontFamily: SANS_TC }}>
          <MapPin className="w-3 h-3" /> 開啟地圖
        </a>
      </div>

      <div className="col-span-12 md:col-span-9 flex gap-3">
        <span className="w-1 rounded-full flex-shrink-0 mt-2" style={{ background: color, opacity: 0.5 }} />
        <div className="flex-1 min-w-0">
          {/* 類別選擇 */}
          <div className="flex flex-wrap gap-1 mb-2">
            {PLACE_TYPE_ORDER.map(typeKey => {
              const t = PLACE_TYPES[typeKey];
              const Icon = t.icon;
              const active = selectedType === typeKey;
              return (
                <button key={typeKey}
                  onClick={() => setSelectedType(typeKey)}
                  className="flex items-center gap-1 px-2 py-1 rounded-full transition"
                  style={{
                    background: active ? t.color : 'transparent',
                    color: active ? '#FFFFFF' : t.color,
                    border: `1px solid ${active ? t.color : t.color + '50'}`,
                    fontFamily: SANS_TC, fontSize: 11, fontWeight: 500,
                  }}>
                  <Icon className="w-3 h-3" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* 輸入框 */}
          <div className="flex items-center gap-2 mb-3">
            <input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPlace(); } }}
              placeholder={`輸入${PLACE_TYPES[selectedType].label}名稱，或貼上 Google Maps 網址`}
              className="flex-1 min-w-0 bg-transparent outline-none py-1.5 px-1 border-b"
              style={{
                borderColor: INK_DASH,
                fontFamily: SANS_TC, fontSize: 14, color: INK,
              }} />
            {inputValue.trim() && (
              <button
                onClick={addPlace}
                className="flex-shrink-0 px-3 py-1.5 rounded-full hover:opacity-85"
                style={{
                  background: PLACE_TYPES[selectedType].color, color: '#FFFFFF',
                  fontFamily: SANS_TC, fontSize: 12, fontWeight: 500,
                }}>
                {isGmapsUrl(inputValue.trim()) ? '匯入' : '加入'}
              </button>
            )}
          </div>

          {/* 已加入的地點，按類別分組 */}
          {PLACE_TYPE_ORDER.map(typeKey => {
            const list = placesByType[typeKey];
            if (list.length === 0) return null;
            const t = PLACE_TYPES[typeKey];
            const Icon = t.icon;
            return (
              <div key={typeKey} className="mb-2">
                <div className="flex items-center gap-1.5 mb-1"
                  style={{ color: t.color, fontFamily: SANS_TC, fontSize: 11, fontWeight: 600, letterSpacing: '0.05em' }}>
                  <Icon className="w-3 h-3" />
                  {t.label}
                  <span style={{ opacity: 0.55, fontFamily: NUMERIC, fontWeight: 500 }}>· {list.length}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map(p => (
                    <PlaceChip key={p.id} place={p} typeKey={typeKey}
                      onRemove={() => removePlace(p.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function PlaceChip({ place, typeKey, onRemove }) {
  const isGmaps = place.source === 'gmaps';
  const tk = typeKey || place.type || 'sight';
  const typeInfo = PLACE_TYPES[tk] || PLACE_TYPES.sight;
  const tint = typeInfo.color;
  return (
    <span className="inline-flex items-center rounded-full overflow-hidden"
      style={{ background: tint + '12', border: `1px solid ${tint}30` }}>
      <a
        href={place.url}
        target="_blank" rel="noopener noreferrer"
        className="flex items-center gap-1 px-2.5 py-1 hover:opacity-70"
        style={{
          fontFamily: SANS_TC, fontSize: 13, color: tint, fontWeight: 500,
          maxWidth: 280,
        }}>
        <span className="truncate" title={place.name}>
          {place.name}
        </span>
        {isGmaps && (
          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" style={{ opacity: 0.6 }} />
        )}
      </a>
      <button
        onClick={onRemove}
        className="px-1.5 py-1 hover:bg-black/5 transition-colors"
        style={{ color: tint, opacity: 0.7, borderLeft: `1px solid ${tint}30` }}
        title="移除">
        <X className="w-3 h-3" />
      </button>
    </span>
  );
}

/* ============================================================
   Recap
   ============================================================ */

const getRecapPresets = (year) => [
  { id: 'year', label: '全年',     start: `${year}-01-01`, end: `${year}-12-31` },
  { id: 'h1',   label: '上半年',   start: `${year}-01-01`, end: `${year}-06-30` },
  { id: 'h2',   label: '下半年',   start: `${year}-07-01`, end: `${year}-12-31` },
  { id: 'q1',   label: 'Q1',      start: `${year}-01-01`, end: `${year}-03-31` },
  { id: 'q2',   label: 'Q2',      start: `${year}-04-01`, end: `${year}-06-30` },
  { id: 'q3',   label: 'Q3',      start: `${year}-07-01`, end: `${year}-09-30` },
  { id: 'q4',   label: 'Q4',      start: `${year}-10-01`, end: `${year}-12-31` },
];

function RecapView({ trips, year, onBack, onOpenDetail }) {
  const [presetId, setPresetId] = useState('year');
  const [customStart, setCustomStart] = useState(`${year}-01-01`);
  const [customEnd, setCustomEnd] = useState(`${year}-12-31`);

  // 軌跡動畫 state
  const [trailMode, setTrailMode] = useState('idle'); // 'idle' | 'playing' | 'done'
  const [trailIndex, setTrailIndex] = useState(-1);

  const presets = getRecapPresets(year);
  const isCustom = presetId === 'custom';
  const preset = presets.find(p => p.id === presetId);
  const range = isCustom
    ? { start: customStart, end: customEnd }
    : { start: preset.start, end: preset.end };

  const filtered = trips
    .filter(t => overlapDays(t, range.start, range.end) > 0)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  // 軌跡用：只取有座標的，按 startDate 排序
  const sortedTrailTrips = filtered.filter(t => typeof t.lat === 'number' && typeof t.lng === 'number');

  // 換時段時重置軌跡
  useEffect(() => {
    setTrailMode('idle');
    setTrailIndex(-1);
  }, [presetId, customStart, customEnd]);

  // 動畫 loop
  useEffect(() => {
    if (trailMode !== 'playing') return;
    if (trailIndex >= sortedTrailTrips.length - 1) {
      setTrailMode('done');
      return;
    }
    const interval = sortedTrailTrips.length <= 5 ? 1100
      : sortedTrailTrips.length <= 10 ? 850
      : 650;
    const t = setTimeout(() => setTrailIndex(i => i + 1), interval);
    return () => clearTimeout(t);
  }, [trailMode, trailIndex, sortedTrailTrips.length]);

  const handlePlayTrail = () => {
    if (sortedTrailTrips.length < 2) return;
    setTrailIndex(0);
    setTrailMode('playing');
  };
  const handleResetTrail = () => {
    setTrailMode('idle');
    setTrailIndex(-1);
  };

  const totalTrips = filtered.length;
  const totalDays = filtered.reduce((s, t) => s + overlapDays(t, range.start, range.end), 0);

  const placesMap = {};
  filtered.forEach(t => {
    const key = t.location;
    if (!placesMap[key]) placesMap[key] = { name: key, count: 0, days: 0 };
    placesMap[key].count += 1;
    placesMap[key].days += overlapDays(t, range.start, range.end);
  });
  const uniquePlaces = Object.keys(placesMap).length;

  const mappedFiltered = filtered.filter(t => typeof t.lat === 'number' && typeof t.lng === 'number');
  const unmappedCount = filtered.length - mappedFiltered.length;

  const purposeCounts = { business: 0, domesticLeisure: 0, overseasLeisure: 0 };
  const purposeDays = { business: 0, domesticLeisure: 0, overseasLeisure: 0 };
  filtered.forEach(t => {
    if (purposeCounts[t.purpose] !== undefined) {
      purposeCounts[t.purpose] += 1;
      purposeDays[t.purpose] += overlapDays(t, range.start, range.end);
    }
  });
  const totalPurposeTrips = Object.values(purposeCounts).reduce((a, b) => a + b, 0) || 1;

  const monthCounts = Array(12).fill(0);
  const monthDays = Array(12).fill(0);
  filtered.forEach(t => {
    daysBetween(
      t.startDate < range.start ? range.start : t.startDate,
      t.endDate > range.end ? range.end : t.endDate
    ).forEach(d => {
      const m = parseDate(d).getMonth();
      monthDays[m] += 1;
    });
    const startM = parseDate(t.startDate < range.start ? range.start : t.startDate).getMonth();
    monthCounts[startM] += 1;
  });
  const maxMonthDays = Math.max(...monthDays, 1);

  return (
    <div className="relative max-w-4xl mx-auto px-6 md:px-10 pt-8 pb-20">
      <div className="flex items-center justify-between mb-8">
        <button onClick={onBack} className="flex items-center gap-1 hover:opacity-60"
          style={{ color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 14 }}>
          <ChevronLeft className="w-5 h-5" /> 返回月曆
        </button>
      </div>

      <header className="text-center mb-8">
        <div style={{
          fontFamily: HANDWRITE_EN, fontSize: 'clamp(56px, 9vw, 96px)',
          color: INK, fontWeight: 700, fontStyle: 'italic',
          lineHeight: 1, letterSpacing: '-0.02em',
        }}>
          recap
        </div>
        <div style={{
          fontFamily: SANS_TC, fontSize: 'clamp(16px, 2vw, 20px)',
          color: INK, letterSpacing: '0.1em', marginTop: 2, fontWeight: 700,
        }}>
          年度回顧 · {year}
        </div>
      </header>

      <section className="mb-10">
        <div className="mb-3 text-center" style={{
          color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 11, fontWeight: 500, letterSpacing: '0.25em',
        }}>
          時間範圍 · DATE RANGE
        </div>
        <div className="flex flex-wrap justify-center gap-2 mb-3">
          {presets.map(p => (
            <button key={p.id} onClick={() => setPresetId(p.id)}
              className="px-4 py-1.5 rounded-full transition-all"
              style={{
                background: presetId === p.id ? INK : 'transparent',
                color: presetId === p.id ? BG : INK,
                border: `1.5px solid ${INK}`,
                fontFamily: SANS_TC, fontSize: 13, fontWeight: 500,
              }}>
              {p.label}
            </button>
          ))}
          <button onClick={() => setPresetId('custom')}
            className="px-4 py-1.5 rounded-full transition-all"
            style={{
              background: isCustom ? INK : 'transparent',
              color: isCustom ? BG : INK,
              border: `1.5px solid ${INK}`,
              fontFamily: SANS_TC, fontSize: 13, fontWeight: 500,
            }}>
            自訂
          </button>
        </div>
        {isCustom ? (
          <div className="flex items-center justify-center gap-2 text-sm" style={{ color: INK_LIGHT }}>
            <input type="date" value={customStart}
              min={`${year}-01-01`} max={`${year}-12-31`}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-transparent outline-none border-b py-0.5 px-1"
              style={{ borderColor: INK_DASH, fontFamily: NUMERIC, color: INK }} />
            <span>—</span>
            <input type="date" value={customEnd}
              min={`${year}-01-01`} max={`${year}-12-31`}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-transparent outline-none border-b py-0.5 px-1"
              style={{ borderColor: INK_DASH, fontFamily: NUMERIC, color: INK }} />
          </div>
        ) : (
          <div className="text-center" style={{ fontFamily: NUMERIC, fontSize: 14, color: INK_LIGHT }}>
            {formatDateLabel(range.start)} – {formatDateLabel(range.end)}
          </div>
        )}
      </section>

      {filtered.length === 0 ? (
        <div className="text-center py-20" style={{ fontFamily: SANS_TC, fontSize: 16, color: INK_LIGHT }}>
          這段時間還沒有旅程記錄
        </div>
      ) : (
        <>
          <section className="mb-12">
            <div className="grid grid-cols-3 gap-3 md:gap-6">
              <BigStat number={totalTrips} unit="段" label="trips · 旅程" />
              <BigStat number={uniquePlaces} unit="個" label="places · 地點" />
              <BigStat number={totalDays} unit="天" label="days · 天數" />
            </div>
          </section>

          <section className="mb-12">
            <div className="mb-4 flex items-baseline justify-between gap-3 flex-wrap">
              <div className="flex items-baseline gap-3">
                <span style={{ fontFamily: SANS_TC, fontSize: 18, fontWeight: 700, color: INK, letterSpacing: '0.05em' }}>
                  去過的地方
                </span>
                <span style={{ fontFamily: HANDWRITE_EN, fontSize: 17, color: INK_LIGHT, fontStyle: 'italic' }}>
                  · On the Map
                </span>
              </div>
              {sortedTrailTrips.length >= 2 && (
                <div className="flex items-center gap-2">
                  {trailMode === 'idle' && (
                    <button
                      onClick={handlePlayTrail}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:opacity-85 transition"
                      style={{
                        background: INK, color: BG,
                        fontFamily: SANS_TC, fontSize: 13, fontWeight: 500,
                      }}>
                      <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="2,1 9,5 2,9" fill="currentColor" /></svg>
                      播放軌跡
                    </button>
                  )}
                  {trailMode === 'playing' && (
                    <div className="flex items-center gap-2">
                      <span style={{ fontFamily: NUMERIC, fontSize: 12, color: INK_LIGHT, fontWeight: 500 }}>
                        {trailIndex + 1} / {sortedTrailTrips.length}
                      </span>
                      <button
                        onClick={handleResetTrail}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-full hover:bg-black/5 transition"
                        style={{
                          color: INK_LIGHT, border: `1px solid ${INK_DASH}`,
                          fontFamily: SANS_TC, fontSize: 12,
                        }}>
                        停止
                      </button>
                    </div>
                  )}
                  {trailMode === 'done' && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handlePlayTrail}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full hover:opacity-85 transition"
                        style={{
                          background: INK, color: BG,
                          fontFamily: SANS_TC, fontSize: 13, fontWeight: 500,
                        }}>
                        <RotateCw className="w-3 h-3" /> 重新播放
                      </button>
                      <button
                        onClick={handleResetTrail}
                        className="px-3 py-1.5 rounded-full hover:bg-black/5 transition"
                        style={{
                          color: INK_LIGHT, border: `1px solid ${INK_DASH}`,
                          fontFamily: SANS_TC, fontSize: 12,
                        }}>
                        清除軌跡
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="rounded-xl p-4 md:p-5" style={{ border: `1.5px solid ${INK_DASH}`, background: PAPER_CREAM }}>
              <TrailMap
                trips={filtered}
                sortedTrips={sortedTrailTrips}
                trailMode={trailMode}
                trailIndex={trailIndex}
                onOpenDetail={onOpenDetail}
              />
              <div className="mt-3 text-center"
                style={{ fontFamily: SANS_TC, fontSize: 12, color: INK_LIGHT, fontStyle: 'italic' }}>
                {trailMode === 'idle' && (
                  <>圓點大小與數字代表造訪次數 · Hover 圓點查看地點細節</>
                )}
                {trailMode === 'playing' && (
                  <>正在播放：依時間順序展開 · 共 {sortedTrailTrips.length} 段</>
                )}
                {trailMode === 'done' && (
                  <>軌跡完成 · 一共經過 {sortedTrailTrips.length} 段旅程</>
                )}
                {unmappedCount > 0 && (
                  <span style={{ color: '#C44536', marginLeft: 6 }}>
                    · {unmappedCount} 段未顯示
                  </span>
                )}
              </div>
            </div>
          </section>

          <section className="mb-12">
            <SectionTitle main="類型分布" sub="By Purpose" />
            <div className="space-y-3">
              {Object.entries(PURPOSE_PRESETS).map(([key, p]) => {
                const count = purposeCounts[key];
                const days = purposeDays[key];
                const pct = (count / totalPurposeTrips) * 100;
                const Icon = p.icon;
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" style={{ color: p.color }} />
                        <span style={{ fontFamily: SANS_TC, fontSize: 16, fontWeight: 700, color: INK }}>
                          {p.label}
                        </span>
                        <span style={{ fontFamily: HANDWRITE_EN, fontSize: 15, color: INK_LIGHT, fontStyle: 'italic' }}>
                          {p.sublabel}
                        </span>
                      </div>
                      <div style={{ fontFamily: NUMERIC, fontSize: 14, color: INK }}>
                        {count} 次 · {days} 天 · {Math.round(pct)}%
                      </div>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ background: 'rgba(31,26,20,0.08)', height: 10 }}>
                      <div className="h-full rounded-full transition-all"
                        style={{ background: p.color, width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="mb-12">
            <SectionTitle main="月份分布" sub="By Month" />
            <div className="grid grid-cols-12 gap-1.5 items-end" style={{ height: 130 }}>
              {monthDays.map((d, i) => {
                const h = (d / maxMonthDays) * 100;
                const tripCount = monthCounts[i];
                return (
                  <div key={i} className="flex flex-col items-center justify-end h-full">
                    <div style={{
                      fontFamily: NUMERIC, fontSize: 11, color: INK_LIGHT,
                      marginBottom: 2, opacity: d > 0 ? 1 : 0, fontWeight: 500,
                    }}>
                      {d}
                    </div>
                    <div className="w-full rounded-sm transition-all"
                      style={{
                        background: d > 0 ? INK : 'rgba(31,26,20,0.08)',
                        height: `${Math.max(h, 4)}%`, minHeight: 4,
                      }}
                      title={`${MONTH_EN[i]}: ${tripCount} 段旅程 · ${d} 天`} />
                    <div className="text-center mt-1" style={{
                      fontFamily: NUMERIC, fontSize: 10, color: INK_LIGHT, fontWeight: 500,
                    }}>
                      {MONTH_EN[i].slice(0, 3)}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 text-center" style={{ fontFamily: SANS_TC, fontSize: 12, color: INK_LIGHT }}>
              長條高度 = 該月在外天數
            </div>
          </section>

          <footer className="mt-12 pt-6 text-center" style={{ borderTop: `1px dashed ${INK_DASH}` }}>
            <div style={{ fontFamily: SANS_TC, fontSize: 13, color: INK_LIGHT }}>
              {formatDateLabel(range.start)} – {formatDateLabel(range.end)} · 一共走過 {uniquePlaces} 個地方，共 {totalDays} 天
            </div>
          </footer>
        </>
      )}
    </div>
  );
}

function BigStat({ number, unit, label }) {
  return (
    <div className="text-center py-5 px-3 rounded-lg" style={{ border: `1.5px solid ${INK}`, background: PAPER_CREAM }}>
      <div style={{
        fontFamily: NUMERIC, fontSize: 'clamp(40px, 6vw, 60px)',
        color: INK, fontWeight: 700, lineHeight: 1,
      }}>
        {number}
      </div>
      <div style={{ fontFamily: SANS_TC, fontSize: 14, fontWeight: 700, color: INK, marginTop: 4 }}>
        {unit}
      </div>
      <div className="mt-1.5" style={{
        color: INK_LIGHT, fontFamily: SANS_TC, fontSize: 10, fontWeight: 500, letterSpacing: '0.2em',
      }}>
        {label}
      </div>
    </div>
  );
}

function SectionTitle({ main, sub }) {
  return (
    <div className="mb-4 flex items-baseline gap-3">
      <span style={{ fontFamily: SANS_TC, fontSize: 18, fontWeight: 700, color: INK, letterSpacing: '0.05em' }}>
        {main}
      </span>
      <span style={{ fontFamily: HANDWRITE_EN, fontSize: 17, color: INK_LIGHT, fontStyle: 'italic' }}>
        · {sub}
      </span>
    </div>
  );
}
