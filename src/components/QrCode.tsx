'use client';

import React, { useMemo } from 'react';

// Compact, zero-dependency SVG QR Code generator (Byte mode, ECC Level L, Versions 1..10, up to 271 bytes)
// Works 100% offline on LAN without external image APIs.

const CAPACITY_L = [0, 17, 32, 53, 78, 106, 134, 154, 192, 230, 271];
// [totalCodewords, ecCodewordsPerBlock, numBlocksGroup1, dataCodewordsGroup1, numBlocksGroup2, dataCodewordsGroup2]
const BLOCK_INFO_L: [number, number, number, number, number, number][] = [
  [0, 0, 0, 0, 0, 0],
  [26, 7, 1, 19, 0, 0],
  [44, 10, 1, 34, 0, 0],
  [70, 15, 1, 55, 0, 0],
  [100, 20, 1, 80, 0, 0],
  [134, 26, 1, 108, 0, 0],
  [172, 18, 2, 68, 0, 0],
  [196, 20, 4, 39, 0, 0],
  [242, 24, 2, 97, 0, 0],
  [292, 30, 2, 116, 0, 0],
  [346, 18, 2, 68, 2, 69],
];

const ALIGNMENT_POS: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const FORMAT_BITS_L = [
  0x77c4, 0x72f3, 0x7daa, 0x789d, 0x662f, 0x6318, 0x6c41, 0x6976,
];

const VERSION_BITS = [
  0, 0, 0, 0, 0, 0, 0, 0x07c94, 0x085bc, 0x09a99, 0x0a4d3,
];

function gfMul(a: number, b: number): number {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x11d;
    b >>= 1;
  }
  return p;
}

function rsGeneratorPoly(degree: number): number[] {
  let poly = [1];
  let root = 1;
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], root);
    }
    poly = next;
    root = gfMul(root, 2);
  }
  return poly;
}

function rsRemainder(data: number[], degree: number): number[] {
  const gen = rsGeneratorPoly(degree);
  const rem = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < degree; i++) {
      rem[i] ^= gfMul(gen[i + 1], factor);
    }
  }
  return rem;
}

export function encodeQrMatrix(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text));
  let ver = 1;
  while (ver <= 10 && bytes.length > CAPACITY_L[ver]) ver++;
  if (ver > 10) ver = 10;
  const payload = bytes.slice(0, CAPACITY_L[ver]);

  const [totalCw, ecLen, g1Blocks, g1Data, g2Blocks, g2Data] = BLOCK_INFO_L[ver];
  const totalDataCw = g1Blocks * g1Data + g2Blocks * g2Data;

  const bits: number[] = [];
  const pushBits = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1);
  };

  pushBits(0b0100, 4); // Byte mode
  pushBits(payload.length, ver <= 9 ? 8 : 16);
  for (const b of payload) pushBits(b, 8);
  pushBits(0, Math.min(4, totalDataCw * 8 - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const dataCw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    dataCw.push(byte);
  }
  let padIdx = 0;
  while (dataCw.length < totalDataCw) {
    dataCw.push(padIdx % 2 === 0 ? 0xec : 0x11);
    padIdx++;
  }

  // Split into blocks & compute Reed-Solomon EC
  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];
  let offset = 0;
  for (let i = 0; i < g1Blocks; i++) {
    const blk = dataCw.slice(offset, offset + g1Data);
    offset += g1Data;
    dataBlocks.push(blk);
    ecBlocks.push(rsRemainder(blk, ecLen));
  }
  for (let i = 0; i < g2Blocks; i++) {
    const blk = dataCw.slice(offset, offset + g2Data);
    offset += g2Data;
    dataBlocks.push(blk);
    ecBlocks.push(rsRemainder(blk, ecLen));
  }

  const finalCw: number[] = [];
  const maxDataLen = Math.max(g1Data, g2Data);
  for (let i = 0; i < maxDataLen; i++) {
    for (const blk of dataBlocks) {
      if (i < blk.length) finalCw.push(blk[i]);
    }
  }
  for (let i = 0; i < ecLen; i++) {
    for (const blk of ecBlocks) {
      finalCw.push(blk[i]);
    }
  }

  const size = ver * 4 + 17;
  const modules: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunc: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFunc = (r: number, c: number, dark: boolean) => {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      modules[r][c] = dark;
      isFunc[r][c] = true;
    }
  };

  const drawFinder = (r0: number, c0: number) => {
    for (let dr = -1; dr <= 7; dr++) {
      for (let dc = -1; dc <= 7; dc++) {
        const dark =
          dr >= 0 &&
          dr <= 6 &&
          dc >= 0 &&
          dc <= 6 &&
          (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4));
        setFunc(r0 + dr, c0 + dc, dark);
      }
    }
  };

  drawFinder(0, 0);
  drawFinder(0, size - 7);
  drawFinder(size - 7, 0);

  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0);
    setFunc(i, 6, i % 2 === 0);
  }

  const aligns = ALIGNMENT_POS[ver];
  for (const ar of aligns) {
    for (const ac of aligns) {
      if (
        (ar === 6 && ac === 6) ||
        (ar === 6 && ac === size - 7) ||
        (ar === size - 7 && ac === 6)
      ) {
        continue;
      }
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const dark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunc(ar + dr, ac + dc, dark);
        }
      }
    }
  }

  // Reserve format info areas + dark module
  for (let i = 0; i <= 8; i++) {
    if (i !== 6) {
      setFunc(8, i, false);
      setFunc(i, 8, false);
    }
    if (i < 8) {
      setFunc(8, size - 1 - i, false);
      setFunc(size - 1 - i, 8, false);
    }
  }
  setFunc(size - 8, 8, true);

  if (ver >= 7) {
    const vbits = VERSION_BITS[ver];
    for (let i = 0; i < 18; i++) {
      const bit = ((vbits >> i) & 1) === 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      setFunc(r, c, bit);
      setFunc(c, r, bit);
    }
  }

  // Place data bits (upward/downward 2-column zig-zag)
  let bitIdx = 0;
  const totalBits = totalCw * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!isFunc[r][c]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byte = finalCw[bitIdx >> 3];
            dark = ((byte >> (7 - (bitIdx & 7))) & 1) === 1;
            bitIdx++;
          }
          // Mask 0: (r + c) % 2 === 0
          if ((r + c) % 2 === 0) dark = !dark;
          modules[r][c] = dark;
        }
      }
    }
  }

  // Draw Format Info for Mask 0, Level L
  const fbits = FORMAT_BITS_L[0];
  for (let i = 0; i <= 5; i++) setFunc(8, i, ((fbits >> i) & 1) === 1);
  setFunc(8, 7, ((fbits >> 6) & 1) === 1);
  setFunc(8, 8, ((fbits >> 7) & 1) === 1);
  setFunc(7, 8, ((fbits >> 8) & 1) === 1);
  for (let i = 9; i < 15; i++) setFunc(14 - i, 8, ((fbits >> i) & 1) === 1);

  for (let i = 0; i < 8; i++) setFunc(8, size - 1 - i, ((fbits >> i) & 1) === 1);
  for (let i = 8; i < 15; i++) setFunc(size - 15 + i, 8, ((fbits >> i) & 1) === 1);

  return modules;
}

export function QrCode({ value, size = 148 }: { value: string; size?: number }) {
  const matrix = useMemo(() => encodeQrMatrix(value), [value]);
  const n = matrix.length;
  const quiet = 2;
  const viewSize = n + quiet * 2;

  return (
    <div
      className="inline-flex items-center justify-center rounded-2xl bg-white p-2.5 shadow-xl"
      style={{ width: size, height: size }}
    >
      <svg
        viewBox={`0 0 ${viewSize} ${viewSize}`}
        className="w-full h-full"
        shapeRendering="crispEdges"
      >
        <rect width={viewSize} height={viewSize} fill="#ffffff" />
        {matrix.map((row, r) =>
          row.map((dark, c) =>
            dark ? (
              <rect key={`${r}-${c}`} x={c + quiet} y={r + quiet} width={1} height={1} fill="#090a0f" />
            ) : null
          )
        )}
      </svg>
    </div>
  );
}
