const QUIET_ZONE_SIZE = 4;
const MODE_INDICATOR_BYTE = 0b0100;
const FORMAT_ERROR_CORRECTION_LEVEL_L = 0b01;
const FORMAT_POLYNOMIAL = 0x537;
const FORMAT_MASK = 0x5412;
const RS_PRIMITIVE = 0x11d;
const PENALTY_N1 = 3;
const PENALTY_N2 = 3;
const PENALTY_N3 = 40;
const PENALTY_N4 = 10;

const MAX_BYTE_CAPACITY_BY_VERSION = [17, 32, 53, 78, 106, 134, 154, 192, 230] as const;
const DATA_CODEWORDS_BY_VERSION = [19, 34, 55, 80, 108, 136, 156, 194, 232] as const;
const ECC_CODEWORDS_PER_BLOCK_BY_VERSION = [7, 10, 15, 20, 26, 18, 20, 24, 30] as const;
const BLOCK_COUNT_BY_VERSION = [1, 1, 1, 1, 1, 2, 2, 2, 2] as const;
const ALIGNMENT_PATTERN_POSITIONS_BY_VERSION = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46]
] as const;

interface QrContext {
  modules: boolean[][];
  functionModules: boolean[][];
  size: number;
}

class BitBuffer {
  private readonly bits: number[] = [];

  append(value: number, bitCount: number) {
    for (let bitIndex = bitCount - 1; bitIndex >= 0; bitIndex -= 1) {
      this.bits.push((value >>> bitIndex) & 1);
    }
  }

  appendByte(value: number) {
    this.append(value, 8);
  }

  get length() {
    return this.bits.length;
  }

  toArray() {
    return this.bits.slice();
  }
}

function createBooleanMatrix(size: number) {
  return Array.from({ length: size }, () => Array<boolean>(size).fill(false));
}

function setFunctionModule(context: QrContext, x: number, y: number, isDark: boolean) {
  context.modules[y][x] = isDark;
  context.functionModules[y][x] = true;
}

function drawFinderPattern(context: QrContext, centerX: number, centerY: number) {
  for (let dy = -4; dy <= 4; dy += 1) {
    for (let dx = -4; dx <= 4; dx += 1) {
      const x = centerX + dx;
      const y = centerY + dy;

      if (x < 0 || y < 0 || x >= context.size || y >= context.size) {
        continue;
      }

      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(context, x, y, distance !== 2 && distance !== 4);
    }
  }
}

function drawAlignmentPattern(context: QrContext, centerX: number, centerY: number) {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      setFunctionModule(context, centerX + dx, centerY + dy, distance !== 1);
    }
  }
}

function drawFunctionPatterns(context: QrContext, version: number) {
  const size = context.size;

  drawFinderPattern(context, 3, 3);
  drawFinderPattern(context, size - 4, 3);
  drawFinderPattern(context, 3, size - 4);

  for (let index = 0; index < size; index += 1) {
    if (!context.functionModules[6][index]) {
      setFunctionModule(context, index, 6, index % 2 === 0);
    }
    if (!context.functionModules[index][6]) {
      setFunctionModule(context, 6, index, index % 2 === 0);
    }
  }

  for (const centerY of ALIGNMENT_PATTERN_POSITIONS_BY_VERSION[version - 1]) {
    for (const centerX of ALIGNMENT_PATTERN_POSITIONS_BY_VERSION[version - 1]) {
      if (context.functionModules[centerY][centerX]) {
        continue;
      }
      drawAlignmentPattern(context, centerX, centerY);
    }
  }

  drawFormatBits(context, 0);
}

function drawFormatBits(context: QrContext, mask: number) {
  const formatData = (FORMAT_ERROR_CORRECTION_LEVEL_L << 3) | mask;
  let remainder = formatData;

  for (let bitIndex = 0; bitIndex < 10; bitIndex += 1) {
    remainder = (remainder << 1) ^ (((remainder >>> 9) & 1) * FORMAT_POLYNOMIAL);
  }

  const formatBits = ((formatData << 10) | remainder) ^ FORMAT_MASK;
  const size = context.size;

  for (let bitIndex = 0; bitIndex <= 5; bitIndex += 1) {
    setFunctionModule(context, 8, bitIndex, getBit(formatBits, bitIndex));
  }

  setFunctionModule(context, 8, 7, getBit(formatBits, 6));
  setFunctionModule(context, 8, 8, getBit(formatBits, 7));
  setFunctionModule(context, 7, 8, getBit(formatBits, 8));

  for (let bitIndex = 9; bitIndex < 15; bitIndex += 1) {
    setFunctionModule(context, 14 - bitIndex, 8, getBit(formatBits, bitIndex));
  }

  for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) {
    setFunctionModule(context, size - 1 - bitIndex, 8, getBit(formatBits, bitIndex));
  }

  for (let bitIndex = 8; bitIndex < 15; bitIndex += 1) {
    setFunctionModule(context, 8, size - 15 + bitIndex, getBit(formatBits, bitIndex));
  }

  setFunctionModule(context, 8, size - 8, true);
}

function getBit(value: number, bitIndex: number) {
  return ((value >>> bitIndex) & 1) !== 0;
}

function resolveVersion(payloadBytes: Uint8Array) {
  const version = MAX_BYTE_CAPACITY_BY_VERSION.findIndex((capacity) => payloadBytes.length <= capacity);

  return version === -1 ? null : version + 1;
}

function buildDataCodewords(payloadBytes: Uint8Array, version: number) {
  const bitBuffer = new BitBuffer();
  const dataCodewordCount = DATA_CODEWORDS_BY_VERSION[version - 1];
  const capacityBits = dataCodewordCount * 8;

  bitBuffer.append(MODE_INDICATOR_BYTE, 4);
  bitBuffer.append(payloadBytes.length, 8);

  for (const payloadByte of payloadBytes) {
    bitBuffer.appendByte(payloadByte);
  }

  bitBuffer.append(0, Math.min(4, capacityBits - bitBuffer.length));

  while (bitBuffer.length % 8 !== 0) {
    bitBuffer.append(0, 1);
  }

  let padWithEc = true;
  while (bitBuffer.length < capacityBits) {
    bitBuffer.appendByte(padWithEc ? 0xec : 0x11);
    padWithEc = !padWithEc;
  }

  const bits = bitBuffer.toArray();
  const codewords = new Uint8Array(dataCodewordCount);

  for (let codewordIndex = 0; codewordIndex < dataCodewordCount; codewordIndex += 1) {
    let value = 0;

    for (let bitOffset = 0; bitOffset < 8; bitOffset += 1) {
      value = (value << 1) | bits[codewordIndex * 8 + bitOffset];
    }

    codewords[codewordIndex] = value;
  }

  return codewords;
}

function multiplyInGaloisField(left: number, right: number) {
  let product = 0;
  let a = left;
  let b = right;

  while (b > 0) {
    if ((b & 1) !== 0) {
      product ^= a;
    }

    a <<= 1;
    if ((a & 0x100) !== 0) {
      a ^= RS_PRIMITIVE;
    }

    b >>>= 1;
  }

  return product;
}

function buildGeneratorPolynomial(degree: number) {
  let polynomial = [1];
  let root = 1;

  for (let factorIndex = 0; factorIndex < degree; factorIndex += 1) {
    const nextPolynomial = Array<number>(polynomial.length + 1).fill(0);

    for (let index = 0; index < polynomial.length; index += 1) {
      nextPolynomial[index] ^= polynomial[index];
      nextPolynomial[index + 1] ^= multiplyInGaloisField(polynomial[index], root);
    }

    polynomial = nextPolynomial;
    root = multiplyInGaloisField(root, 0x02);
  }

  return polynomial.slice(1);
}

function buildErrorCorrectionCodewords(dataCodewords: number[], eccCodewordCount: number) {
  const generator = buildGeneratorPolynomial(eccCodewordCount);
  const remainder = Array<number>(eccCodewordCount).fill(0);

  for (const dataCodeword of dataCodewords) {
    const factor = dataCodeword ^ remainder[0];

    remainder.shift();
    remainder.push(0);

    for (let index = 0; index < generator.length; index += 1) {
      remainder[index] ^= multiplyInGaloisField(generator[index], factor);
    }
  }

  return remainder;
}

function interleaveCodewordsWithErrorCorrection(dataCodewords: Uint8Array, version: number) {
  const blockCount = BLOCK_COUNT_BY_VERSION[version - 1];
  const eccCodewordCount = ECC_CODEWORDS_PER_BLOCK_BY_VERSION[version - 1];
  const blockDataCodewordCount = dataCodewords.length / blockCount;
  const dataBlocks = Array.from({ length: blockCount }, (_, blockIndex) =>
    Array.from(
      dataCodewords.slice(
        blockIndex * blockDataCodewordCount,
        (blockIndex + 1) * blockDataCodewordCount
      )
    )
  );
  const eccBlocks = dataBlocks.map((block) =>
    buildErrorCorrectionCodewords(block, eccCodewordCount)
  );
  const codewords: number[] = [];

  for (let codewordIndex = 0; codewordIndex < blockDataCodewordCount; codewordIndex += 1) {
    for (const block of dataBlocks) {
      codewords.push(block[codewordIndex]);
    }
  }

  for (let codewordIndex = 0; codewordIndex < eccCodewordCount; codewordIndex += 1) {
    for (const block of eccBlocks) {
      codewords.push(block[codewordIndex]);
    }
  }

  return codewords;
}

function drawCodewords(context: QrContext, codewords: number[]) {
  const bits = codewords.flatMap((codeword) =>
    Array.from({ length: 8 }, (_, bitOffset) => ((codeword >>> (7 - bitOffset)) & 1) !== 0)
  );
  let bitCursor = 0;
  let moveUpwards = true;

  for (let rightColumn = context.size - 1; rightColumn >= 1; rightColumn -= 2) {
    if (rightColumn === 6) {
      rightColumn -= 1;
    }

    for (let index = 0; index < context.size; index += 1) {
      const y = moveUpwards ? context.size - 1 - index : index;

      for (let dx = 0; dx < 2; dx += 1) {
        const x = rightColumn - dx;

        if (context.functionModules[y][x]) {
          continue;
        }

        context.modules[y][x] = bitCursor < bits.length ? bits[bitCursor] : false;
        bitCursor += 1;
      }
    }

    moveUpwards = !moveUpwards;
  }
}

function shouldInvertModule(mask: number, x: number, y: number) {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return ((((x * y) % 2) + ((x * y) % 3)) % 2) === 0;
    case 7:
      return ((((x + y) % 2) + ((x * y) % 3)) % 2) === 0;
    default:
      return false;
  }
}

function applyMask(context: QrContext, mask: number) {
  for (let y = 0; y < context.size; y += 1) {
    for (let x = 0; x < context.size; x += 1) {
      if (context.functionModules[y][x]) {
        continue;
      }

      if (shouldInvertModule(mask, x, y)) {
        context.modules[y][x] = !context.modules[y][x];
      }
    }
  }
}

function scoreRuns(line: boolean[]) {
  let score = 0;
  let runLength = 1;

  for (let index = 1; index <= line.length; index += 1) {
    if (index < line.length && line[index] === line[index - 1]) {
      runLength += 1;
      continue;
    }

    if (runLength >= 5) {
      score += PENALTY_N1 + (runLength - 5);
    }

    runLength = 1;
  }

  return score;
}

function scoreFinderLikePatterns(line: boolean[]) {
  let score = 0;

  for (let index = 0; index <= line.length - 11; index += 1) {
    const segment = line.slice(index, index + 11);
    const matchesForward =
      segment[0] &&
      !segment[1] &&
      segment[2] &&
      segment[3] &&
      segment[4] &&
      !segment[5] &&
      segment[6] &&
      !segment[7] &&
      !segment[8] &&
      !segment[9] &&
      !segment[10];
    const matchesBackward =
      !segment[0] &&
      !segment[1] &&
      !segment[2] &&
      !segment[3] &&
      segment[4] &&
      !segment[5] &&
      segment[6] &&
      segment[7] &&
      segment[8] &&
      !segment[9] &&
      segment[10];

    if (matchesForward || matchesBackward) {
      score += PENALTY_N3;
    }
  }

  return score;
}

function calculateMaskPenalty(context: QrContext) {
  let score = 0;
  let darkModuleCount = 0;

  for (let y = 0; y < context.size; y += 1) {
    const row = context.modules[y];
    score += scoreRuns(row);
    score += scoreFinderLikePatterns(row);

    for (let x = 0; x < context.size; x += 1) {
      if (row[x]) {
        darkModuleCount += 1;
      }

      if (
        x + 1 < context.size &&
        y + 1 < context.size &&
        row[x] === row[x + 1] &&
        row[x] === context.modules[y + 1][x] &&
        row[x] === context.modules[y + 1][x + 1]
      ) {
        score += PENALTY_N2;
      }
    }
  }

  for (let x = 0; x < context.size; x += 1) {
    const column = Array.from({ length: context.size }, (_, y) => context.modules[y][x]);
    score += scoreRuns(column);
    score += scoreFinderLikePatterns(column);
  }

  const totalModuleCount = context.size * context.size;
  const balancePenalty =
    Math.ceil(Math.abs(darkModuleCount * 20 - totalModuleCount * 10) / totalModuleCount) - 1;

  return score + balancePenalty * PENALTY_N4;
}

function selectBestMask(context: QrContext) {
  let bestMask = 0;
  let bestPenalty = Number.POSITIVE_INFINITY;

  for (let mask = 0; mask < 8; mask += 1) {
    applyMask(context, mask);
    drawFormatBits(context, mask);

    const penalty = calculateMaskPenalty(context);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
    }

    applyMask(context, mask);
  }

  applyMask(context, bestMask);
  drawFormatBits(context, bestMask);
}

function buildSvgDataUrl(context: QrContext) {
  const pathCommands: string[] = [];

  for (let y = 0; y < context.size; y += 1) {
    for (let x = 0; x < context.size; x += 1) {
      if (!context.modules[y][x]) {
        continue;
      }

      pathCommands.push(`M${x + QUIET_ZONE_SIZE},${y + QUIET_ZONE_SIZE}h1v1h-1z`);
    }
  }

  const viewBoxSize = context.size + QUIET_ZONE_SIZE * 2;
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" shape-rendering="crispEdges">`,
    `<rect width="${viewBoxSize}" height="${viewBoxSize}" fill="#ffffff"/>`,
    `<path fill="#0f172a" d="${pathCommands.join("")}"/>`,
    "</svg>"
  ].join("");

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildMobileUploadPairingQrImageDataUrl(payload: string) {
  const normalizedPayload = payload.trim();

  if (!normalizedPayload) {
    return null;
  }

  const payloadBytes = new TextEncoder().encode(normalizedPayload);
  const version = resolveVersion(payloadBytes);

  if (version === null) {
    return null;
  }

  const size = version * 4 + 17;
  const context: QrContext = {
    modules: createBooleanMatrix(size),
    functionModules: createBooleanMatrix(size),
    size
  };
  const dataCodewords = buildDataCodewords(payloadBytes, version);
  const fullCodewords = interleaveCodewordsWithErrorCorrection(dataCodewords, version);

  drawFunctionPatterns(context, version);
  drawCodewords(context, fullCodewords);
  selectBestMask(context);

  return buildSvgDataUrl(context);
}
