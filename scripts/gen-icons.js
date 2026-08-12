const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// 임시 아이콘 — owner/js/app.js의 logoSvg()와 같은 마크(잉크색 원 + 액센트색 점).
// 실제 브랜드 이미지가 오면 이 svg() 함수를 교체하거나, 스크립트를 이미지 리사이즈용으로
// 바꿔서 재사용한다. 결과 PNG는 public/icons/, owner/icons/에 같은 파일명으로 떨어지므로
// manifest.json·HTML은 손댈 필요 없이 파일만 교체하면 된다.
const BG = '#F5F4F1';
const INK = '#171614';
const ACCENT = '#E4572E';

// purpose:"any"용 — 배경까지 꽉 채운 원래 마크. 브라우저 탭/즐겨찾기 등 안 잘리는 곳에 쓰인다.
function svg(size) {
  const cx = size / 2;
  const cy = size / 2;
  const r1 = size * 0.42;
  const r2 = size * 0.08;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${BG}"/>
    <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="${INK}" stroke-width="${size * 0.035}"/>
    <circle cx="${cx}" cy="${cy}" r="${r2}" fill="${ACCENT}"/>
  </svg>`;
}

// purpose:"maskable"용 — OS가 원/스퀴클 등으로 잘라내므로 핵심 그림을 중앙 80% 안전영역
// (반지름 0.4×size) 안쪽으로 더 작게 그린다. 배경은 동일하게 전체를 채운다.
function svgMaskable(size) {
  const cx = size / 2;
  const cy = size / 2;
  const r1 = size * 0.32;
  const r2 = size * 0.06;
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" fill="${BG}"/>
    <circle cx="${cx}" cy="${cy}" r="${r1}" fill="none" stroke="${INK}" stroke-width="${size * 0.035}"/>
    <circle cx="${cx}" cy="${cy}" r="${r2}" fill="${ACCENT}"/>
  </svg>`;
}

const targets = [
  ['public/icons/icon-192.png', 192, svg],
  ['public/icons/icon-512.png', 512, svg],
  ['public/icons/icon-192-maskable.png', 192, svgMaskable],
  ['public/icons/icon-512-maskable.png', 512, svgMaskable],
  ['public/icons/apple-touch-icon.png', 180, svg],
  ['owner/icons/icon-192.png', 192, svg],
  ['owner/icons/icon-512.png', 512, svg],
  ['owner/icons/icon-192-maskable.png', 192, svgMaskable],
  ['owner/icons/icon-512-maskable.png', 512, svgMaskable],
  ['owner/icons/apple-touch-icon.png', 180, svg],
];

(async () => {
  for (const [outPath, size, render] of targets) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await sharp(Buffer.from(render(size))).png().toFile(outPath);
    console.log('wrote', outPath);
  }
})();
