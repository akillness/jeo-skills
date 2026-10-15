import fs from 'node:fs/promises';

const DAEMON_LOG_SCAN_CHUNK_BYTES = 1024 * 1024;
const DAEMON_URL_PREFIX = 'http://127.0.0.1:';
const DAEMON_KEY_BYTES = Buffer.from('"url"', 'ascii');
const DAEMON_WHITESPACE_RE = /\s/;

function isDaemonWhitespace(char) {
  return DAEMON_WHITESPACE_RE.test(char);
}

function isAsciiDigit(char) {
  return char >= '0' && char <= '9';
}

async function validateDaemonUrlAt(handle, start, size) {
  let position = start;
  let state = 'before-colon-whitespace';
  let prefixIndex = 0;
  const port = [];
  const decoder = new TextDecoder('utf-8');
  const consume = (text) => {
    for (const char of text) {
      if (state === 'before-colon-whitespace') {
        if (isDaemonWhitespace(char)) continue;
        if (char !== ':') return null;
        state = 'after-colon-whitespace';
        continue;
      }
      if (state === 'after-colon-whitespace') {
        if (isDaemonWhitespace(char)) continue;
        if (char !== '"') return null;
        state = 'url-prefix';
        continue;
      }
      if (state === 'url-prefix') {
        if (char !== DAEMON_URL_PREFIX[prefixIndex]) return null;
        prefixIndex += 1;
        if (prefixIndex === DAEMON_URL_PREFIX.length) state = 'port';
        continue;
      }
      if (state === 'port') {
        if (isAsciiDigit(char)) {
          port.push(char);
          continue;
        }
        return char === '"' && port.length ? `${DAEMON_URL_PREFIX}${port.join('')}` : null;
      }
    }
    return undefined;
  };
  while (position < size) {
    const length = Math.min(DAEMON_LOG_SCAN_CHUNK_BYTES, size - position);
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, position);
    if (!bytesRead) return null;
    position += bytesRead;
    const result = consume(decoder.decode(buffer.subarray(0, bytesRead), { stream: position < size }));
    if (result !== undefined) return result;
  }
  const result = consume(decoder.decode());
  return result === undefined ? null : result;
}

export async function discoverDaemonUrl(logPath) {
  const handle = await fs.open(logPath, 'r');
  try {
    const { size } = await handle.stat();
    const scanBuffer = Buffer.allocUnsafe(DAEMON_LOG_SCAN_CHUNK_BYTES + DAEMON_KEY_BYTES.length - 1);
    let end = size;
    while (end > 0) {
      const logicalStart = Math.max(0, end - DAEMON_LOG_SCAN_CHUNK_BYTES);
      const readStart = Math.max(0, logicalStart - DAEMON_KEY_BYTES.length + 1);
      const readLength = end - readStart;
      const { bytesRead } = await handle.read(scanBuffer, 0, readLength, readStart);
      if (!bytesRead) {
        end = readStart;
        continue;
      }
      const buffer = scanBuffer.subarray(0, bytesRead);
      const availableEnd = readStart + bytesRead;
      const candidateLimit = Math.min(end, availableEnd);
      const candidates = [];
      for (let offset = buffer.indexOf(DAEMON_KEY_BYTES); offset !== -1; offset = buffer.indexOf(DAEMON_KEY_BYTES, offset + 1)) {
        const candidate = readStart + offset;
        if (candidate + DAEMON_KEY_BYTES.length <= candidateLimit) candidates.push(candidate);
      }
      for (let index = candidates.length - 1; index >= 0; index -= 1) {
        const url = await validateDaemonUrlAt(handle, candidates[index] + DAEMON_KEY_BYTES.length, size);
        if (url) return url;
      }
      end = Math.min(logicalStart, availableEnd);
    }
  } finally {
    await handle.close();
  }
  throw new Error(`Could not discover Open Design daemon URL from ${logPath}`);
}
