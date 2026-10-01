// C printf teaching model: UTF-8, LP64, IEEE-754 double, round to nearest/even.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');
const MAX_OUTPUT = 20000;
export class FormatError extends Error {
  constructor(message, field = 'format') { super(message); this.field = field; }
}
export function decodeEscapes(source) {
  return source.replace(/\\(x[0-9a-fA-F]+|u[0-9a-fA-F]{4}|[0-7]{1,3}|.)/gs, (_, escape) => {
    const simple = {n:'\n',r:'\r',t:'\t',b:'\b',f:'\f',v:'\v',a:'\x07','\\':'\\','"':'"',"'":"'",'?':'?'};
    if (escape in simple) return simple[escape];
    if (/^[0-7]/.test(escape)) return String.fromCharCode(parseInt(escape, 8) & 255);
    if (escape[0] === 'x') return String.fromCharCode(parseInt(escape.slice(1), 16) & 255);
    if (escape[0] === 'u') return String.fromCharCode(parseInt(escape.slice(1), 16));
    throw new FormatError(`不认识转义序列 \\${escape}。`);
  });
}
function literalBytes(source) {
  const chunks = []; let start = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] !== '\\') continue;
    chunks.push(encoder.encode(source.slice(start,i)));
    const match = /^\\(x[0-9a-fA-F]+|u[0-9a-fA-F]{4}|[0-7]{1,3}|.)/s.exec(source.slice(i));
    if (!match) throw new FormatError('转义序列不完整。');
    const escape = match[1];
    if (escape[0] === 'x' || /^[0-7]/.test(escape)) chunks.push(new Uint8Array([parseInt(escape[0] === 'x' ? escape.slice(1) : escape,escape[0] === 'x' ? 16 : 8) & 255]));
    else chunks.push(encoder.encode(decodeEscapes(match[0])));
    i += match[0].length - 1; start = i + 1;
  }
  chunks.push(encoder.encode(source.slice(start)));
  const bytes = new Uint8Array(chunks.reduce((sum,chunk) => sum + chunk.length,0));
  let offset = 0; chunks.forEach(chunk => { bytes.set(chunk,offset); offset += chunk.length; });
  return bytes;
}
export function parseArguments(source) {
  if (!source.trim()) return [];
  if (source.length > MAX_OUTPUT) throw new FormatError('参数内容过长，请控制在 20,000 个字符内。', 'args');
  const parts = []; let quote = null, escaped = false, start = 0;
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if (char === ',') { parts.push(source.slice(start, i).trim()); start = i + 1; }
  }
  if (quote) throw new FormatError('字符串引号尚未闭合。', 'args');
  parts.push(source.slice(start).trim());
  return parts.map((raw, index) => {
    if (!raw) throw new FormatError(`第 ${index + 1} 个参数为空。`, 'args');
    if (raw[0] === '"' || raw[0] === "'") {
      if (raw.at(-1) !== raw[0] || /(?<!\\)["']/.test(raw.slice(1,-1).replace(raw[0] === '"' ? /'/g : /"/g, ''))) throw new FormatError(`第 ${index + 1} 个参数的引号不正确。`, 'args');
      let bytes;
      try { bytes = literalBytes(raw.slice(1, -1)); } catch (error) { error.field = 'args'; throw error; }
      if (raw[0] === "'") {
        if (bytes.length !== 1) throw new FormatError('普通字符参数请使用一个 ASCII 字符，如 \'A\'；中文请用 %s。', 'args');
        return {kind:'integer',value:BigInt(bytes[0]),raw};
      }
      return {kind:'string',value:decoder.decode(bytes),bytes,raw};
    }
    if (/^[+-]?(?:inf(?:inity)?|nan)$/i.test(raw)) return {kind:'number', value:/nan/i.test(raw) ? NaN : raw[0] === '-' ? -Infinity : Infinity, raw};
    const clean = raw.replace(/(?:ull|llu|ul|lu|ll|u|l)$/i, '');
    if (/^[+-]?(?:0[xX][\da-fA-F]+|0[bB][01]+|\d+)$/.test(clean)) {
      const sign = clean[0] === '-' ? -1n : 1n;
      const unsigned = clean.replace(/^[+-]/, '');
      const value = /^0[0-7]+$/.test(unsigned) && unsigned.length > 1 ? BigInt(`0o${unsigned.slice(1)}`) : BigInt(unsigned);
      return {kind:'integer',value:value * sign,raw};
    }
    if (/^[+-]?(?:(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)[fFlL]?$/i.test(raw)) {
      const value = Number(raw.replace(/[fFlL]$/, ''));
      return {kind:'number',value:/[fF]$/.test(raw) ? Math.fround(value) : value,raw};
    }
    throw new FormatError(`第 ${index + 1} 个参数不是数字或带引号的字符串。`, 'args');
  });
}
export function highlightFormat(source) {
  const parts = [];
  const add = (text,part = 'literal') => { if (text) parts.push({text,part}); };
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf('%',index);
    if (start < 0) { add(source.slice(index)); break; }
    add(source.slice(index,start)); add('%',null);
    const rest = source.slice(start + 1);
    const match = /^([-+ #0]*)(\*|\d+)?(\.(?:\*|\d*))?(hh|ll|wf\d*|w\d*|[hljztL])?([diubBoxXfFeEgGaAcspn%])?/.exec(rest);
    const [matched, flags, width, precision, length, specifier] = match;
    add(flags,'flags'); add(width,'width'); add(precision,'precision'); add(length,'length'); add(specifier,'specifier');
    index = start + 1 + matched.length;
  }
  return parts;
}
function asInteger(argument, position) {
  if (argument.kind !== 'integer') throw new FormatError(`第 ${position} 个参数需要整数。`, 'args');
  return argument.value;
}
function asNumber(argument, position) {
  if (argument.kind === 'string') throw new FormatError(`第 ${position} 个参数需要数字。`, 'args');
  return argument.kind === 'integer' && /^-0(?:[uUlL]*)$/.test(argument.raw) ? -0 : Number(argument.value);
}
function roundRatio(numerator, denominator) {
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n > denominator || (remainder * 2n === denominator && quotient % 2n)) quotient++;
  return quotient;
}
function binaryParts(number) {
  const view = new DataView(new ArrayBuffer(8)); view.setFloat64(0, number);
  const bits = view.getBigUint64(0);
  const exponentBits = Number((bits >> 52n) & 2047n);
  const fraction = bits & ((1n << 52n) - 1n);
  const mantissa = exponentBits ? fraction + (1n << 52n) : fraction;
  const exponent = exponentBits ? exponentBits - 1023 - 52 : -1074;
  return {mantissa, exponent, exponentBits, fraction};
}
function decimalScaled(number, power) {
  const {mantissa, exponent} = binaryParts(number);
  let numerator = mantissa, denominator = 1n;
  if (exponent >= 0) numerator <<= BigInt(exponent); else denominator <<= BigInt(-exponent);
  if (power >= 0) numerator *= 10n ** BigInt(power); else denominator *= 10n ** BigInt(-power);
  return roundRatio(numerator, denominator);
}
function fixed(number, precision, alternate) {
  const digits = decimalScaled(number, precision).toString().padStart(precision + 1, '0');
  if (!precision) return digits + (alternate ? '.' : '');
  return `${digits.slice(0,-precision)}.${digits.slice(-precision)}`;
}
function scientificParts(number, precision) {
  let exponent = number ? Math.floor(Math.log10(number)) : 0;
  let digits = decimalScaled(number, precision - exponent).toString();
  while (digits.length < precision + 1 && number) { exponent--; digits = decimalScaled(number, precision - exponent).toString(); }
  if (digits.length > precision + 1) { exponent++; digits = decimalScaled(number, precision - exponent).toString(); }
  return {digits:digits.padStart(precision + 1,'0'),exponent};
}
function exponentText(exponent, marker, minimumDigits = 2) { return marker + (exponent < 0 ? '-' : '+') + String(Math.abs(exponent)).padStart(minimumDigits, '0'); }
function scientific(number, precision, alternate) {
  const {digits,exponent} = scientificParts(number,precision);
  return digits[0] + (precision || alternate ? '.' + digits.slice(1) : '') + exponentText(exponent,'e');
}
function general(number, precision, alternate) {
  const significant = precision || 1;
  const {exponent} = scientificParts(number, significant - 1);
  let value = exponent >= -4 && exponent < significant ? fixed(number, Math.max(0, significant - exponent - 1),alternate) : scientific(number,significant - 1,alternate);
  if (!alternate) value = value.replace(/(\.\d*?)0+(?=e|$)/, '$1').replace(/\.(?=e|$)/, '');
  return value;
}
function hexFloat(number, precision, alternate) {
  const {mantissa,exponentBits,fraction} = binaryParts(number);
  const exponent = number === 0 ? 0 : exponentBits ? exponentBits - 1023 : -1022;
  let digits;
  if (precision === null) digits = (exponentBits ? '1' : '0') + fraction.toString(16).padStart(13,'0').replace(/0+$/, '');
  else if (precision <= 13) digits = roundRatio(mantissa, 1n << BigInt(52 - 4 * precision)).toString(16).padStart(precision + 1,'0');
  else digits = (exponentBits ? '1' : '0') + fraction.toString(16).padStart(13,'0') + '0'.repeat(precision - 13);
  return '0x' + digits[0] + (digits.length > 1 || alternate ? '.' + digits.slice(1) : '') + exponentText(exponent, 'p',1);
}
function pad(value, width, left, zero = false, prefixLength = 0, byteLength = value.length) {
  const fill = Math.max(0,width - byteLength);
  if (left) return value + ' '.repeat(fill);
  if (zero) return value.slice(0,prefixLength) + '0'.repeat(fill) + value.slice(prefixLength);
  return ' '.repeat(fill) + value;
}
function outputSpans(bytes, convertedBytes) {
  const spans = [];
  const characterDecoder = new TextDecoder('utf-8', {ignoreBOM:true});
  // Match TextDecoder's initial BOM handling without stripping a later BOM.
  let offset = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (offset < bytes.length) {
    const start = offset, lead = bytes[offset++];
    const length = lead >= 0xc2 && lead <= 0xdf ? 2 : lead >= 0xe0 && lead <= 0xef ? 3 : lead >= 0xf0 && lead <= 0xf4 ? 4 : 1;
    for (let index = 1; index < length && offset < bytes.length; index++) {
      const minimum = index === 1 && lead === 0xe0 ? 0xa0 : index === 1 && lead === 0xf0 ? 0x90 : 0x80;
      const maximum = index === 1 && lead === 0xed ? 0x9f : index === 1 && lead === 0xf4 ? 0x8f : 0xbf;
      if (bytes[offset] < minimum || bytes[offset] > maximum) break;
      offset++;
    }
    const text = characterDecoder.decode(bytes.subarray(start,offset));
    // A character assembled from several origins is colored if any byte was converted.
    const part = convertedBytes.subarray(start,offset).some(Boolean) ? 'specifier' : 'literal';
    if (spans.at(-1)?.part === part) spans.at(-1).text += text;
    else spans.push({text,part});
  }
  return spans;
}
export function formatPrintf(source, argumentSource) {
  if (source.length > MAX_OUTPUT) throw new FormatError('格式串过长，请控制在 20,000 个字符内。');
  let format = source;
  if (source.startsWith('"')) {
    if (!source.endsWith('"') || source.length === 1) throw new FormatError('格式串的双引号尚未闭合。');
    format = source.slice(1,-1);
  }
  let formatBytes = literalBytes(format);
  if (formatBytes.includes(0)) formatBytes = formatBytes.slice(0,formatBytes.indexOf(0));
  format = Array.from(formatBytes,byte => String.fromCharCode(byte)).join('');
  const argumentsList = parseArguments(argumentSource);
  let argumentIndex = 0, byteCount = 0;
  const chunks = [], chunkParts = [], warnings = [], cArguments = [];
  function consume(kind) {
    if (argumentIndex >= argumentsList.length) throw new FormatError(`缺少第 ${argumentIndex + 1} 个参数，请补充${kind}。`, 'args');
    return argumentsList[argumentIndex++];
  }
  function push(value, part = 'specifier') {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    byteCount += bytes.length;
    if (byteCount > MAX_OUTPUT) throw new FormatError('输出超过 20,000 字节，请减小宽度或精度。');
    chunks.push(bytes);
    chunkParts.push(part);
  }
  for (let offset = 0; offset < format.length;) {
    if (format[offset] !== '%') {
      const next = format.indexOf('%', offset); const end = next < 0 ? format.length : next;
      push(Uint8Array.from(format.slice(offset,end),char => char.charCodeAt(0)), 'literal'); offset = end; continue;
    }
    if (format[offset + 1] === '%') { push('%'); offset += 2; continue; }
    const match = /^%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d*))?(hh|ll|wf\d+|w\d+|[hljztL])?([diubBoxXfFeEgGaAcspn])/.exec(format.slice(offset));
    if (!match) throw new FormatError(`第 ${offset + 1} 个字符处的转换不完整或无法识别，请检查 % 后的内容。`);
    const [conversion,flags,widthSource,precisionSource,length = '',specifier] = match;
    offset += conversion.length;
    let width = 0, precision = precisionSource === undefined ? null : Number(precisionSource || 0);
    let left = flags.includes('-');
    if (widthSource === '*') {
      const value = consume('宽度参数'); width = Number(asInteger(value,argumentIndex));
      cArguments.push(value.raw);
      if (width < 0) { left = true; width = -width; }
    } else width = Number(widthSource || 0);
    if (precisionSource === '*') {
      const value = consume('精度参数'); precision = Number(asInteger(value,argumentIndex)); cArguments.push(value.raw);
      if (precision < 0) precision = null;
    }
    if (!Number.isSafeInteger(width) || width > 10000) throw new FormatError('演示宽度最大为 10,000。');
    if (precision !== null && (!Number.isSafeInteger(precision) || precision > 100)) throw new FormatError('演示精度最大为 100。');
    if (specifier === 'n') throw new FormatError('%n 会向指针写入已输出字节数；浏览器演示不提供内存写入。');
    if (specifier === 'p') throw new FormatError('%p 输出实际指针地址，具体形式由 C 实现决定；浏览器演示无法提供地址。');
    if (length === 'L') throw new FormatError('L 需要 long double；浏览器仅支持 double 精度。');
    if (length.startsWith('wf')) throw new FormatError('wfN 对应的 fast 类型宽度由平台决定，请改用 wN 或常见整数修饰符。');
    const argument = consume('转换参数');
    let value, sign = '', prefix = '';
    if ('diubBoxX'.includes(specifier)) {
      const bits = length.startsWith('w') ? Number(length.slice(1)) : ({hh:8,h:16,'':32,l:64,ll:64,j:64,z:64,t:64})[length];
      if (![8,16,32,64,128].includes(bits)) throw new FormatError(`不支持整数修饰符 ${length}；wN 可用 8、16、32、64、128。`);
      let integer = asInteger(argument,argumentIndex);
      integer = 'di'.includes(specifier) ? BigInt.asIntN(bits,integer) : BigInt.asUintN(bits,integer);
      const signed = 'di'.includes(specifier);
      sign = signed ? integer < 0n ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '' : '';
      if (integer < 0n) integer = -integer;
      const base = 'bB'.includes(specifier) ? 2 : specifier === 'o' ? 8 : 'xX'.includes(specifier) ? 16 : 10;
      value = integer === 0n && precision === 0 ? '' : integer.toString(base);
      value = value.padStart(precision ?? 0,'0');
      if (flags.includes('#')) {
        if (specifier === 'o' && !value.startsWith('0')) prefix = '0';
        if (integer !== 0n && 'xX'.includes(specifier)) prefix = '0x';
        if (integer !== 0n && 'bB'.includes(specifier)) prefix = '0b';
      }
      if ('XB'.includes(specifier)) { value = value.toUpperCase(); prefix = prefix.toUpperCase(); }
      value = pad(sign + prefix + value,width,left,flags.includes('0') && precision === null && !left,sign.length + prefix.length);
      cArguments.push(argument.raw);
    } else if ('fFeEgGaA'.includes(specifier)) {
      if (length !== '' && length !== 'l') throw new FormatError(`${conversion} 不能用于 double，请省略长度修饰符。`);
      const number = asNumber(argument,argumentIndex), magnitude = Math.abs(number);
      sign = number < 0 || Object.is(number,-0) ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
      const lower = specifier.toLowerCase(), alternate = flags.includes('#');
      if (!Number.isFinite(number)) value = Number.isNaN(number) ? 'nan' : 'inf';
      else if (lower === 'f') value = fixed(magnitude,precision ?? 6,alternate);
      else if (lower === 'e') value = scientific(magnitude,precision ?? 6,alternate);
      else if (lower === 'g') value = general(magnitude,precision ?? 6,alternate);
      else value = hexFloat(magnitude,precision,alternate);
      if (specifier !== lower) value = value.toUpperCase();
      value = pad(sign + value,width,left,flags.includes('0') && !left && Number.isFinite(number),sign.length + (lower === 'a' ? 2 : 0));
      cArguments.push(argument.kind === 'integer' ? `${Number(argument.value)}.0` : argument.raw.replace(/[fFlL]$/, ''));
    } else {
      if (length) throw new FormatError(`${conversion} 的宽字符版本依赖平台区域设置，演示请使用 %c 或 %s。`);
      if (flags.replace(/-/g,'').length) throw new FormatError(`${conversion} 仅支持 - 标志。`);
      let bytes;
      if (specifier === 's') {
        if (argument.kind !== 'string') throw new FormatError(`第 ${argumentIndex} 个参数需要双引号字符串。`, 'args');
        bytes = argument.bytes;
        if (bytes.includes(0)) bytes = bytes.slice(0,bytes.indexOf(0));
        if (precision !== null) bytes = bytes.slice(0,precision);
      } else {
        if (precision !== null) throw new FormatError('%c 不使用精度。');
        bytes = new Uint8Array([Number(BigInt.asUintN(8,asInteger(argument,argumentIndex)))]);
      }
      const spaces = encoder.encode(' '.repeat(Math.max(0,width - bytes.length)));
      push(left ? bytes : spaces); push(left ? spaces : bytes);
      cArguments.push(argument.raw); continue;
    }
    push(value);
  }
  if (argumentIndex < argumentsList.length) warnings.push(`多出的 ${argumentsList.length - argumentIndex} 个参数未使用`);
  const allBytes = new Uint8Array(byteCount), convertedBytes = new Uint8Array(byteCount); let cursor = 0;
  chunks.forEach((chunk,index) => {
    allBytes.set(chunk,cursor);
    if (chunkParts[index] === 'specifier') convertedBytes.fill(1,cursor,cursor + chunk.length);
    cursor += chunk.length;
  });
  try { new TextDecoder('utf-8',{fatal:true}).decode(allBytes); } catch { warnings.push('输出含不完整的 UTF-8 字节，以 � 显示'); }
  return {text:decoder.decode(allBytes),spans:outputSpans(allBytes,convertedBytes),bytes:byteCount,used:argumentIndex,total:argumentsList.length,warnings,format:decoder.decode(formatBytes),cArguments};
}
