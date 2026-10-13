// C printf teaching model: C23 on x86-64 Linux (LP64, glibc), UTF-8 literals and locale, round to nearest/even.
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8');
const MAX_OUTPUT = 20000;
export class FormatError extends Error {
  constructor(message, field = 'format') { super(message); this.field = field; }
}
const argumentError = message => { throw new FormatError(message, 'args'); };
const types = {};
[['bool',1,false],['char',8,true],['signed char',8,true],['unsigned char',8,false],['short',16,true],['unsigned short',16,false],['int',32,true],['unsigned int',32,false],['long',64,true],['unsigned long',64,false],['long long',64,true],['unsigned long long',64,false]]
  .forEach(([name,bits,signed]) => { types[name] = {kind:'integer',name,bits,signed}; });
[['float',24,-126,127],['double',53,-1022,1023,52],['long double',64,-16382,16383,60]]
  .forEach(([name,p,emin,emax,hex]) => { types[name] = {kind:'binary',name,p,emin,emax,hex}; });
[['_Decimal32',7,-101,90],['_Decimal64',16,-398,369],['_Decimal128',34,-6176,6111]]
  .forEach(([name,p,qmin,qmax]) => { types[name] = {kind:'decimal',name,p,qmin,qmax}; });
types.nullptr_t = {kind:'nullptr',name:'nullptr_t'};
const pointerTo = to => ({kind:'pointer',name:`${to} *`,to});
const unsignedOf = name => 'unsigned ' + name.replace(/^signed /, '');
const counterpart = name => name.startsWith('unsigned ') ? name.slice(9) : 'unsigned ' + name;
const typedefs = {size_t:'unsigned long',ptrdiff_t:'long',intmax_t:'long',uintmax_t:'unsigned long',intptr_t:'long',uintptr_t:'unsigned long',wchar_t:'int',wint_t:'unsigned int',char8_t:'unsigned char',char16_t:'unsigned short',char32_t:'unsigned int'};
// Each length modifier names the signed type of its conversion.
const lengthTypes = {'':'int',hh:'signed char',h:'short',l:'long',ll:'long long',j:'long',z:'long',t:'long'};
[[8,'signed char','signed char'],[16,'short','long'],[32,'int','long'],[64,'long','long']].forEach(([bits,exact,fast]) => {
  lengthTypes[`w${bits}`] = typedefs[`int${bits}_t`] = typedefs[`int_least${bits}_t`] = exact;
  lengthTypes[`wf${bits}`] = typedefs[`int_fast${bits}_t`] = fast;
  for (const kind of ['','_least','_fast']) typedefs[`uint${kind}${bits}_t`] = unsignedOf(typedefs[`int${kind}${bits}_t`]);
});
const floatTypes = {'':'double',l:'double',L:'long double',H:'_Decimal32',D:'_Decimal64',DD:'_Decimal128'};
const floatSuffixes = {'':'double',f:'float',F:'float',l:'long double',L:'long double',df:'_Decimal32',DF:'_Decimal32',dd:'_Decimal64',DD:'_Decimal64',dl:'_Decimal128',DL:'_Decimal128'};
const prefixTypes = {'':'char',u8:'unsigned char',u:'unsigned short',U:'unsigned int',L:'int'};
const characterTypes = ['char','signed char','unsigned char'];
const range = type => type.signed ? [-(1n << BigInt(type.bits - 1)),(1n << BigInt(type.bits - 1)) - 1n] : [0n,(1n << BigInt(type.bits)) - 1n];
const fits = (value, type) => { const [min,max] = range(type); return value >= min && value <= max; };
const wrap = (value, type) => type.name === 'bool' ? BigInt(value !== 0n) : type.signed ? BigInt.asIntN(type.bits,value) : BigInt.asUintN(type.bits,value);
const pow10 = power => 10n ** BigInt(power);
const digitCount = value => value.toString().length;
const bitLength = value => value.toString(2).length;
function roundRatio(numerator, denominator) {
  let quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder * 2n > denominator || (remainder * 2n === denominator && quotient % 2n)) quotient++;
  return quotient;
}
function toBinary(type, negative, numerator, denominator = 1n) {
  if (!numerator) return {type,negative,mantissa:0n,exponent:0};
  let exponent = bitLength(numerator) - bitLength(denominator);
  if (exponent >= 0 ? numerator < denominator << BigInt(exponent) : numerator << BigInt(-exponent) < denominator) exponent--;
  const shift = type.p - 1 - Math.max(exponent,type.emin);
  let mantissa = shift >= 0 ? roundRatio(numerator << BigInt(shift),denominator) : roundRatio(numerator,denominator << BigInt(-shift));
  exponent = -shift;
  if (mantissa >> BigInt(type.p)) { mantissa >>= 1n; exponent++; }
  return exponent + type.p - 1 > type.emax ? {type,negative,special:'inf'} : {type,negative,mantissa,exponent};
}
function toDecimal(type, negative, coefficient, quantum) {
  const drop = Math.max(digitCount(coefficient) - type.p,type.qmin - quantum);
  if (drop > 0) {
    coefficient = drop > digitCount(coefficient) ? 0n : roundRatio(coefficient,pow10(drop)); quantum += drop;
    if (digitCount(coefficient) > type.p) { coefficient /= 10n; quantum++; }
  }
  if (quantum > type.qmax) {
    const fill = quantum - type.qmax;
    if (coefficient && digitCount(coefficient) + fill > type.p) return {type,negative,special:'inf'};
    coefficient *= pow10(Math.min(fill,type.p)); quantum = type.qmax;
  }
  return {type,negative,coefficient,quantum};
}
function ratio(value) {
  if (value.type.kind === 'decimal') return value.quantum >= 0 ? [value.coefficient * pow10(value.quantum),1n] : [value.coefficient,pow10(-value.quantum)];
  return value.exponent >= 0 ? [value.mantissa << BigInt(value.exponent),1n] : [value.mantissa,1n << BigInt(-value.exponent)];
}
function isZero(value) {
  const {kind} = value.type;
  if (kind === 'integer') return value.value === 0n;
  if (kind === 'pointer') return value.address === 0n;
  return kind === 'nullptr' || !value.special && !(value.mantissa ?? value.coefficient);
}
const simpleEscapes = {n:10,r:13,t:9,b:8,f:12,v:11,a:7,'\\':92,'"':34,"'":39,'?':63};
const escapeLimits = {'':0xff,u8:0xff,u:0xffff,U:0xffffffff,L:0xffffffff};
// One array of code units per c-char or s-char, encoded as the prefix requires.
function decodeLiteral(body, prefix, field, quote) {
  const elements = [];
  for (let index = 0; index < body.length;) {
    let codePoint;
    if (body[index] === '\\') {
      const match = /^\\(?:([0-7]{1,3})|x([\da-fA-F]+)|u([\da-fA-F]{4})|U([\da-fA-F]{8})|(.))/su.exec(body.slice(index));
      if (!match) throw new FormatError('转义序列不完整。', field);
      const [escape,octal,hex,short,long,other] = match;
      index += escape.length;
      if (octal || hex) {
        const value = BigInt(octal ? '0o' + octal : '0x' + hex);
        if (value > BigInt(escapeLimits[prefix])) throw new FormatError(`转义序列 ${escape} 超出范围。`, field);
        elements.push([Number(value)]); continue;
      }
      codePoint = other === undefined ? parseInt(short ?? long, 16) : simpleEscapes[other];
      if (codePoint === undefined) throw new FormatError(`无效的转义序列 ${escape}。`, field);
      if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) throw new FormatError(`通用字符名 ${escape} 无效。`, field);
    } else {
      if (body[index] === quote) throw new FormatError(`字符串中的 ${quote} 需要写成 \\${quote}。`, field);
      codePoint = body.codePointAt(index); index += codePoint > 0xffff ? 2 : 1;
    }
    const character = String.fromCodePoint(codePoint);
    elements.push(prefix === 'L' || prefix === 'U' ? [codePoint] : prefix === 'u' ? Array.from({length:character.length},(_,i) => character.charCodeAt(i)) : [...encoder.encode(character)]);
  }
  return elements;
}
const tokenPattern = /\s+|(u8|[uUL])?(["'])((?:[^\\]|\\.)*?)\2|(?:\d|\.\d)(?:[eEpP][+-]|'\w|[\w.])*|[A-Za-z_]\w*|[(),+\-*&]/suy;
function tokenize(source, field) {
  const tokens = [];
  for (tokenPattern.lastIndex = 0; tokenPattern.lastIndex < source.length;) {
    const start = tokenPattern.lastIndex, match = tokenPattern.exec(source);
    if (!match) throw new FormatError(/^(u8|[uUL])?["']/.test(source.slice(start)) ? '引号尚未闭合。' : `无法识别 ${String.fromCodePoint(source.codePointAt(start))}。`, field);
    const [text,prefix = '',quote,body] = match;
    if (quote) tokens.push({kind:quote === '"' ? 'string' : 'char',prefix,body,text});
    else if (text.trim()) tokens.push({kind:/^[\d.]/.test(text) ? 'number' : /^\w/.test(text) ? 'identifier' : 'punctuator',text});
  }
  return tokens;
}
const integerPattern = /^(?:0[xX]([\da-fA-F](?:'?[\da-fA-F])*)|0[bB]([01](?:'?[01])*)|(0(?:'?[0-7])*)|([1-9](?:'?\d)*))([uU])?(ll|LL|[lL]|wb|WB)?([uU])?$/;
const decimalFloatPattern = /^(?:(\d(?:'?\d)*)?\.(\d(?:'?\d)*)?|(\d(?:'?\d)*)(?=[eE]))(?:[eE]([+-]?\d(?:'?\d)*))?(df|dd|dl|DF|DD|DL|[fFlL])?$/;
const hexFloatPattern = /^0[xX](?:([\da-fA-F](?:'?[\da-fA-F])*)?\.([\da-fA-F](?:'?[\da-fA-F])*)?|([\da-fA-F](?:'?[\da-fA-F])*))[pP]([+-]?\d(?:'?\d)*)([fFlL])?$/;
const clampExponent = text => text ? Math.max(-1e7,Math.min(1e7,Number(text.replace(/'/g, '')))) : 0;
function numberConstant(text) {
  let match = integerPattern.exec(text);
  if (match && !(match[5] && match[7])) {
    const digits = (match[1] ?? match[2] ?? match[3] ?? match[4]).replace(/'/g, '');
    const value = match[1] ? BigInt('0x' + digits) : match[2] ? BigInt('0b' + digits) : match[3] ? BigInt('0o' + (digits.slice(1) || '0')) : BigInt(digits);
    const unsigned = Boolean(match[5] || match[7]), size = (match[6] ?? '').toLowerCase();
    if (size === 'wb') {
      const bits = Math.max(unsigned ? 1 : 2,bitLength(value) + !unsigned);
      return {type:{kind:'integer',name:`${unsigned ? 'unsigned ' : ''}_BitInt(${bits})`,bits,signed:!unsigned,bitPrecise:true},value};
    }
    const names = ['int','long','long long'].slice(size === 'll' ? 2 : size === 'l' ? 1 : 0).flatMap(name => unsigned ? [unsignedOf(name)] : match[4] ? [name] : [name,unsignedOf(name)]);
    const type = names.map(name => types[name]).find(candidate => fits(value,candidate));
    if (!type) argumentError(`整数常量 ${text} 超出所有可用类型的范围。`);
    return {type,value};
  }
  const hex = (match = hexFloatPattern.exec(text)) && (match[1] || match[2] || match[3]);
  if (hex || ((match = decimalFloatPattern.exec(text)) && (match[1] || match[2] || match[3]))) {
    const whole = (match[1] ?? match[3] ?? '').replace(/'/g, ''), fraction = (match[2] ?? '').replace(/'/g, '');
    const type = types[floatSuffixes[match[5] ?? '']], coefficient = BigInt((hex ? '0x' : '') + (whole + fraction || '0'));
    const exponent = clampExponent(match[4]) - (hex ? 4 : 1) * fraction.length;
    if (type.kind === 'decimal') return toDecimal(type,false,coefficient,exponent);
    const magnitude = hex ? bitLength(coefficient) + exponent : digitCount(coefficient) + exponent, limit = hex ? 17000 : 5000;
    if (!coefficient || magnitude < -limit) return toBinary(type,false,0n);
    if (magnitude > limit) return {type,negative:false,special:'inf'};
    const scale = hex ? 1n << BigInt(Math.abs(exponent)) : pow10(Math.abs(exponent));
    return exponent >= 0 ? toBinary(type,false,coefficient * scale) : toBinary(type,false,coefficient,scale);
  }
  argumentError(`${text} 不是有效的数值常量。`);
}
function characterConstant({prefix,body,text}) {
  const units = decodeLiteral(body,prefix,'args').flat();
  if (!units.length) argumentError(`${text} 是空字符常量。`);
  // GCC builds a multi-character constant by shifting in one byte at a time, truncated to int.
  if (!prefix) return {type:types.int,value:units.length === 1 ? BigInt.asIntN(8,BigInt(units[0])) : BigInt.asIntN(32,units.reduce((value,unit) => value << 8n | BigInt(unit),0n))};
  if (units.length > 1) argumentError(`${text} 只能包含一个${prefix === 'L' ? '宽字符' : '码元'}。`);
  const type = types[prefixTypes[prefix]];
  return {type,value:wrap(BigInt(units[0]),type)};
}
function stringLiteral(tokens) {
  const prefixes = new Set(tokens.map(token => token.prefix).filter(Boolean));
  if (prefixes.size > 1) argumentError('相邻字符串的前缀不一致。');
  const [prefix = ''] = prefixes;
  return {type:pointerTo(prefixTypes[prefix]),units:[...tokens.flatMap(token => decodeLiteral(token.body,prefix,'args').flat()),0],address:null};
}
const typeWords = new Set(['void','char','short','int','long','float','double','signed','unsigned','bool','_Bool','_Decimal32','_Decimal64','_Decimal128','const','volatile']);
function resolveType(words) {
  const specifiers = words.filter(word => word !== 'const' && word !== 'volatile');
  if (specifiers.length === 1 && Object.hasOwn(typedefs,specifiers[0])) return types[typedefs[specifiers[0]]];
  const [signed,unsigned,longs,ints] = ['signed','unsigned','long','int'].map(word => specifiers.filter(item => item === word).length);
  const [base,...extra] = specifiers.filter(word => !['signed','unsigned','long','int'].includes(word));
  let name = null;
  if (extra.length || signed + unsigned > 1 || ints > 1 || longs > 2 || specifiers.some(word => Object.hasOwn(typedefs,word))) name = null;
  else if (!base) name = specifiers.length ? (unsigned ? 'unsigned ' : '') + ['int','long','long long'][longs] : null;
  else if (base === 'short') name = longs ? null : (unsigned ? 'unsigned ' : '') + 'short';
  else if (base === 'char') name = longs || ints ? null : unsigned ? 'unsigned char' : signed ? 'signed char' : 'char';
  else if (base === 'double' && longs === 1 && specifiers.length === 2) name = 'long double';
  else if (specifiers.length === 1) name = base === '_Bool' ? 'bool' : base;
  const type = name === 'void' ? {kind:'void',name} : name && types[name];
  if (!type) argumentError(`类型名 ${words.join(' ')} 无法识别。`);
  return type;
}
function convert(value, type) {
  const from = value.type;
  if (type.kind === 'void') argumentError('void 表达式不能作为参数。');
  if (type.name === 'bool') return {type,value:isZero(value) ? 0n : 1n};
  if (type.kind === 'integer' && from.kind === 'integer') return {type,value:wrap(value.value,type)};
  if (type.kind === 'integer' && from.kind === 'pointer') {
    if (value.address === null) argumentError(`${from.name} 的地址在运行时才确定。`);
    return {type,value:wrap(value.address,type)};
  }
  if (type.kind === 'integer' && (from.kind === 'binary' || from.kind === 'decimal')) {
    if (value.special) argumentError(`${value.special} 转换为 ${type.name} 是未定义行为。`);
    const [numerator,denominator] = ratio(value), integer = numerator / denominator * (value.negative ? -1n : 1n);
    if (!fits(integer,type)) argumentError(`${from.name} 的值超出 ${type.name} 的范围，转换是未定义行为。`);
    return {type,value:integer};
  }
  const magnitude = from.kind === 'integer' && (value.value < 0n ? -value.value : value.value);
  if (type.kind === 'binary' && from.kind === 'integer') return toBinary(type,value.value < 0n,magnitude);
  if (type.kind === 'binary' && (from.kind === 'binary' || from.kind === 'decimal')) return value.special ? {...value,type} : toBinary(type,value.negative,...ratio(value));
  if (type.kind === 'decimal' && from.kind === 'integer') return toDecimal(type,value.value < 0n,magnitude,0);
  if (type.kind === 'decimal' && from.kind === 'decimal') return value.special ? {...value,type} : toDecimal(type,value.negative,value.coefficient,value.quantum);
  if (type.kind === 'pointer' && from.kind === 'integer') return {type,address:BigInt.asUintN(64,value.value)};
  if (type.kind === 'pointer' && from.kind === 'pointer') return {...value,type};
  if (type.kind === 'pointer' && from.kind === 'nullptr') return {type,address:0n};
  argumentError(type.kind === 'decimal' && from.kind === 'binary' ? `演示不支持把 ${from.name} 转换为 ${type.name}。` : `${from.name} 不能转换为 ${type.name}。`);
}
function arithmetic(operator, value) {
  const {type} = value;
  if (type.kind === 'binary' || type.kind === 'decimal') return operator === '-' ? {...value,negative:!value.negative} : value;
  if (type.kind !== 'integer') argumentError(`${type.name} 不能使用一元 ${operator}。`);
  const promoted = type.bits < 32 && !type.bitPrecise ? types.int : type, result = operator === '-' ? -value.value : value.value;
  if (promoted.signed && !fits(result,promoted)) argumentError(`-(${value.value}) 超出 ${promoted.name} 的范围，有符号溢出是未定义行为。`);
  return {type:promoted,value:wrap(result,promoted)};
}
// Default argument promotions: small integers become int, float becomes double.
function promote(value) {
  if (value.type.kind === 'integer' && value.type.bits < 32 && !value.type.bitPrecise) return {type:types.int,value:value.value};
  return value.type === types.float ? convert(value,types.double) : value;
}
const special = (name, kind) => () => ({type:types[name],negative:false,special:kind});
const constants = {NULL:() => ({type:pointerTo('void'),address:0n}),nullptr:() => ({type:types.nullptr_t}),true:() => ({type:types.bool,value:1n}),false:() => ({type:types.bool,value:0n}),INFINITY:special('float','inf'),NAN:special('float','nan'),HUGE_VAL:special('double','inf'),HUGE_VALF:special('float','inf'),HUGE_VALL:special('long double','inf'),DEC_INFINITY:special('_Decimal32','inf'),DEC_NAN:special('_Decimal32','nan')};
// Arguments are C expressions: constants, string literals, NULL-like macros, &object, unary +/- and casts.
function parseArguments(source) {
  if (source.length > MAX_OUTPUT) argumentError('参数内容过长，请控制在 20,000 个字符内。');
  const tokens = tokenize(source,'args'), values = [];
  let index = 0;
  const take = text => tokens[index]?.text === text && ++index;
  const isTypeName = token => token?.kind === 'identifier' && (typeWords.has(token.text) || Object.hasOwn(typedefs,token.text));
  function typeName() {
    const words = [];
    while (isTypeName(tokens[index])) words.push(tokens[index++].text);
    let type = resolveType(words);
    while (take('*')) { type = pointerTo(type.name); while (['const','volatile','restrict'].includes(tokens[index]?.text)) index++; }
    return type;
  }
  function unary() {
    const token = tokens[index++];
    if (!token || token.text === ',' || token.text === ')') argumentError('表达式不完整。');
    if (token.text === '+' || token.text === '-') return arithmetic(token.text,unary());
    if (token.text === '&') {
      const name = tokens[index++];
      if (name?.kind !== 'identifier' || Object.hasOwn(constants,name.text) || isTypeName(name)) argumentError('& 后面需要变量名。');
      return {type:{kind:'pointer',name:`typeof(${name.text}) *`,to:null},address:null,object:name.text};
    }
    if (token.text === '(') {
      const type = isTypeName(tokens[index]) && typeName(), value = type || unary();
      if (!take(')')) argumentError('缺少右括号。');
      return type ? convert(unary(),type) : value;
    }
    if (token.kind === 'number') return numberConstant(token.text);
    if (token.kind === 'char') return characterConstant(token);
    if (token.kind === 'string') { const parts = [token]; while (tokens[index]?.kind === 'string') parts.push(tokens[index++]); return stringLiteral(parts); }
    if (Object.hasOwn(constants,token.text)) return constants[token.text]();
    argumentError(token.kind === 'identifier' ? `标识符 ${token.text} 未定义。` : `${token.text} 无法识别。`);
  }
  if (!tokens.length) return values;
  do {
    try { values.push(promote(unary())); }
    catch (error) { if (error instanceof FormatError) error.message = `第 ${values.length + 1} 个参数：${error.message}`; throw error; }
  } while (take(','));
  if (index < tokens.length) argumentError(`第 ${values.length} 个参数后的 ${tokens[index].text} 无法识别。`);
  return values;
}
// va_arg rules (C23 7.16.1.1) for the promoted type a conversion reads.
function compatible(argument, expected) {
  const actual = argument.type;
  if (actual.name === expected.name) return true;
  if (actual.kind === 'integer' && expected.kind === 'integer') return counterpart(actual.name) === expected.name && fits(argument.value,expected);
  if (expected.kind !== 'pointer') return false;
  return actual.kind === 'nullptr' || (actual.kind === 'pointer' && [actual.to,expected.to].every(name => name === 'void' || characterTypes.includes(name)));
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
    const match = /^([-+ #0]*)(\*|\d+)?(\.(?:\*|\d*))?(hh|ll|wf\d*|w\d*|DD|[hljztLHD])?([diubBoxXfFeEgGaAcspn%])?/.exec(rest);
    const [matched, flags, width, precision, length, specifier] = match;
    add(flags,'flags'); add(width,'width'); add(precision,'precision'); add(length,'length'); add(specifier,'specifier');
    index = start + 1 + matched.length;
  }
  return parts;
}
function decimalScaled([numerator,denominator], power) {
  return power >= 0 ? roundRatio(numerator * pow10(power),denominator) : roundRatio(numerator,denominator * pow10(-power));
}
function fixed(value, precision, alternate) {
  const digits = decimalScaled(value,precision).toString().padStart(precision + 1,'0');
  if (!precision) return digits + (alternate ? '.' : '');
  return `${digits.slice(0,-precision)}.${digits.slice(-precision)}`;
}
function decimalExponent([numerator,denominator]) {
  let exponent = digitCount(numerator) - digitCount(denominator);
  if (exponent >= 0 ? numerator < denominator * pow10(exponent) : numerator * pow10(-exponent) < denominator) exponent--;
  return exponent;
}
function scientificParts(value, precision) {
  let exponent = value[0] ? decimalExponent(value) : 0, digits = decimalScaled(value,precision - exponent).toString();
  if (digits.length > precision + 1) { exponent++; digits = digits.slice(0,-1); }
  return {digits:digits.padStart(precision + 1,'0'),exponent};
}
function exponentText(exponent, marker, minimumDigits = 2) { return marker + (exponent < 0 ? '-' : '+') + String(Math.abs(exponent)).padStart(minimumDigits, '0'); }
function scientific(value, precision, alternate) {
  const {digits,exponent} = scientificParts(value,precision);
  return digits[0] + (precision || alternate ? '.' + digits.slice(1) : '') + exponentText(exponent,'e');
}
function general(value, precision, alternate) {
  const significant = precision || 1;
  const {exponent} = scientificParts(value, significant - 1);
  let result = exponent >= -4 && exponent < significant ? fixed(value, significant - exponent - 1,alternate) : scientific(value,significant - 1,alternate);
  if (!alternate) result = result.replace(/(\.\d*?)0+(?=e|$)/, '$1').replace(/\.(?=e|$)/, '');
  return result;
}
// glibc puts a whole nibble before the point: 1 for double, the top four of 64 bits for long double.
function hexFloat({type,mantissa,exponent}, precision, alternate) {
  const size = type.hex / 4;
  let power = mantissa ? exponent + type.hex : 0, digits;
  if (precision === null) digits = mantissa.toString(16).padStart(size + 1,'0').replace(/(?<=.)0+$/, '');
  else if (precision < size) {
    let rounded = roundRatio(mantissa,1n << BigInt(type.hex - 4 * precision));
    if (rounded >> BigInt(4 * precision + 4)) { rounded >>= 4n; power += 4; }
    digits = rounded.toString(16).padStart(precision + 1,'0');
  } else digits = mantissa.toString(16).padStart(size + 1,'0') + '0'.repeat(precision - size);
  return '0x' + digits[0] + (digits.length > 1 || alternate ? '.' + digits.slice(1) : '') + exponentText(power, 'p',1);
}
// Decimal floating a/A keeps the quantum (C23 7.23.6.1).
function decimalA({type,coefficient,quantum}, precision, alternate) {
  if (precision && precision < type.p && digitCount(coefficient) > precision) {
    const drop = digitCount(coefficient) - precision;
    coefficient = roundRatio(coefficient,pow10(drop)); quantum += drop;
    if (digitCount(coefficient) > precision) { coefficient /= 10n; quantum++; }
  }
  const digits = coefficient.toString(), count = digits.length;
  if (quantum <= 0 && quantum >= -(count + 5)) {
    const padded = digits.padStart(1 - quantum,'0');
    return quantum ? `${padded.slice(0,quantum)}.${padded.slice(quantum)}` : padded + (alternate ? '.' : '');
  }
  return digits[0] + (count > 1 || alternate ? '.' + digits.slice(1) : '') + exponentText(coefficient ? quantum + count - 1 : quantum,'e',1);
}
function wideBytes(value, conversion) {
  if (value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) throw new FormatError(`${conversion}：宽字符 ${value < 0 ? value : 'U+' + value.toString(16).toUpperCase().padStart(4,'0')} 无法转换为 UTF-8，printf 返回负值。`, 'args');
  return encoder.encode(String.fromCodePoint(value));
}
function pad(value, width, left, zero = false, prefixLength = 0, byteLength = value.length) {
  const fill = Math.max(0,width - byteLength);
  if (left) return value + ' '.repeat(fill);
  if (zero) return value.slice(0,prefixLength) + '0'.repeat(fill) + value.slice(prefixLength);
  return ' '.repeat(fill) + value;
}
function outputSpans(bytes, convertedBytes, counts) {
  const spans = [];
  const characterDecoder = new TextDecoder('utf-8', {ignoreBOM:true});
  let next = 0;
  // A %n result follows the character that was complete when it was stored.
  const flush = offset => { while (counts[next]?.offset <= offset) spans.push({text:'',part:'count',value:String(counts[next++].value)}); };
  // Match TextDecoder's initial BOM handling without stripping a later BOM.
  let offset = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (offset < bytes.length) {
    flush(offset);
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
  flush(Infinity);
  return spans;
}
function formatLiteral(source) {
  if (!/^\s*"/.test(source)) return Uint8Array.from(decodeLiteral(source,'','format','"').flat());
  const tokens = tokenize(source,'format');
  if (tokens.some(token => token.kind !== 'string' || token.prefix)) throw new FormatError('格式串需要由普通字符串字面量组成。');
  return Uint8Array.from(tokens.flatMap(token => decodeLiteral(token.body,'','format').flat()));
}
export function formatPrintf(source, argumentSource) {
  if (source.length > MAX_OUTPUT) throw new FormatError('格式串过长，请控制在 20,000 个字符内。');
  let formatBytes = formatLiteral(source);
  if (formatBytes.includes(0)) formatBytes = formatBytes.slice(0,formatBytes.indexOf(0));
  const format = Array.from(formatBytes,byte => String.fromCharCode(byte)).join('');
  const argumentsList = parseArguments(argumentSource);
  let argumentIndex = 0, byteCount = 0;
  const chunks = [], chunkParts = [], counts = [];
  const fail = message => { throw new FormatError(message); };
  function consume(kind) {
    if (argumentIndex >= argumentsList.length) throw new FormatError(`缺少第 ${argumentIndex + 1} 个参数，请补充${kind}。`, 'args');
    return argumentsList[argumentIndex++];
  }
  function next(kind, expected, conversion) {
    const argument = consume(kind);
    if (!compatible(argument,expected)) throw new FormatError(argument.type.kind === 'integer' && counterpart(argument.type.name) === expected.name
      ? `第 ${argumentIndex} 个参数 ${argument.value} 无法用 ${expected.name} 表示，${conversion} 读取它是未定义行为。`
      : `第 ${argumentIndex} 个参数是 ${argument.type.name}，${conversion} 需要 ${expected.name}，类型不符是未定义行为。`, 'args');
    return argument;
  }
  function push(value, part = 'specifier') {
    const bytes = typeof value === 'string' ? encoder.encode(value) : value;
    byteCount += bytes.length;
    if (byteCount > MAX_OUTPUT) fail('输出超过 20,000 字节，请减小宽度或精度。');
    chunks.push(bytes);
    chunkParts.push(part);
  }
  for (let offset = 0; offset < format.length;) {
    if (format[offset] !== '%') {
      const percent = format.indexOf('%', offset); const end = percent < 0 ? format.length : percent;
      push(Uint8Array.from(format.slice(offset,end),char => char.charCodeAt(0)), 'literal'); offset = end; continue;
    }
    if (format[offset + 1] === '%') { push('%'); offset += 2; continue; }
    const match = /^%([-+ #0]*)(\*|\d+)?(?:\.(\*|\d*))?(hh|ll|wf[1-9]\d*|w[1-9]\d*|DD|[hljztLHD])?([diubBoxXfFeEgGaAcspn])/.exec(format.slice(offset));
    if (!match) fail(`第 ${offset + 1} 个字符处的转换不完整或无法识别，请检查 % 后的内容。`);
    const [conversion,flags,widthSource,precisionSource,length = '',specifier] = match;
    offset += conversion.length;
    const integer = 'diubBoxX'.includes(specifier), floating = 'fFeEgGaA'.includes(specifier);
    const lengths = integer || specifier === 'n' ? /^(?![LHD])/ : floating ? /^([lLHD]|DD)?$/ : 'cs'.includes(specifier) ? /^l?$/ : /^$/;
    if (!lengths.test(length)) fail(`${conversion}：长度修饰符 ${length} 不能用于 ${specifier}，未定义行为。`);
    if ((integer || specifier === 'n') && !Object.hasOwn(lengthTypes,length)) fail(`${conversion}：glibc 的 ${length.replace(/\d+$/, 'N')} 只支持 8、16、32、64 位，printf 返回负值。`);
    if (flags.includes('#') && !'oxXbBaAeEfFgG'.includes(specifier)) fail(`${conversion}：# 标志不能用于 ${specifier}，未定义行为。`);
    if (flags.includes('0') && !integer && !floating) fail(`${conversion}：0 标志不能用于 ${specifier}，未定义行为。`);
    if (precisionSource !== undefined && 'cpn'.includes(specifier)) fail(`${conversion}：${specifier} 不使用精度，未定义行为。`);
    if (specifier === 'n' && (flags || widthSource)) fail(`${conversion}：%n 不能带标志或宽度，未定义行为。`);
    let width = Number(widthSource ?? 0), precision = precisionSource === undefined ? null : Number(precisionSource || 0), left = flags.includes('-');
    if (widthSource === '*') { width = Number(next('宽度参数',types.int,conversion).value); if (width < 0) { left = true; width = -width; } }
    if (precisionSource === '*') { precision = Number(next('精度参数',types.int,conversion).value); if (precision < 0) precision = null; }
    if (width > MAX_OUTPUT || precision > MAX_OUTPUT) fail('输出超过 20,000 字节，请减小宽度或精度。');
    const sign = negative => negative ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
    let value;
    if (integer) {
      const signed = 'di'.includes(specifier), target = types[signed ? lengthTypes[length] : unsignedOf(lengthTypes[length])];
      let number = wrap(next('转换参数',target.bits < 32 ? types.int : target,conversion).value,target);
      const signText = signed ? sign(number < 0n) : '';
      if (number < 0n) number = -number;
      const base = 'bB'.includes(specifier) ? 2 : specifier === 'o' ? 8 : 'xX'.includes(specifier) ? 16 : 10;
      let prefix = '';
      value = number === 0n && precision === 0 ? '' : number.toString(base);
      value = value.padStart(precision ?? 0,'0');
      if (flags.includes('#')) {
        if (specifier === 'o' && !value.startsWith('0')) prefix = '0';
        if (number !== 0n && 'xX'.includes(specifier)) prefix = '0x';
        if (number !== 0n && 'bB'.includes(specifier)) prefix = '0b';
      }
      if ('XB'.includes(specifier)) { value = value.toUpperCase(); prefix = prefix.toUpperCase(); }
      value = pad(signText + prefix + value,width,left,flags.includes('0') && precision === null && !left,signText.length + prefix.length);
    } else if (floating) {
      const argument = next('转换参数',types[floatTypes[length]],conversion), lower = specifier.toLowerCase(), alternate = flags.includes('#'), signText = sign(argument.negative);
      if (argument.special) value = argument.special;
      else if (lower === 'a') value = argument.type.kind === 'decimal' ? decimalA(argument,precision,alternate) : hexFloat(argument,precision,alternate);
      else value = {f:fixed,e:scientific,g:general}[lower](ratio(argument),precision ?? 6,alternate);
      if (specifier !== lower) value = value.toUpperCase();
      value = pad(signText + value,width,left,flags.includes('0') && !left && !argument.special,signText.length + (lower === 'a' && argument.type.kind === 'binary' ? 2 : 0));
    } else if (specifier === 'n') {
      const target = types[lengthTypes[length]], argument = consume('转换参数');
      if (argument.type.kind === 'nullptr' || argument.address === 0n) throw new FormatError(`第 ${argumentIndex} 个参数是空指针，${conversion} 写入它是未定义行为。`, 'args');
      if (!argument.object && argument.type.to !== target.name) throw new FormatError(`第 ${argumentIndex} 个参数是 ${argument.type.name}，${conversion} 需要 ${target.name} *，类型不符是未定义行为。`, 'args');
      counts.push({offset:byteCount,value:wrap(BigInt(byteCount),target)});
      continue;
    } else {
      let bytes;
      if (specifier === 'p') {
        const argument = next('转换参数',pointerTo('void'),conversion), address = argument.type.kind === 'nullptr' ? 0n : argument.address;
        if (address === null) throw new FormatError(`第 ${argumentIndex} 个参数的地址在运行时才确定。`, 'args');
        bytes = encoder.encode(address ? '0x' + address.toString(16) : '(nil)');
      } else if (specifier === 'c') {
        const argument = next('转换参数',types[length ? 'unsigned int' : 'int'],conversion);
        bytes = length ? wideBytes(Number(BigInt.asIntN(32,argument.value)),conversion) : Uint8Array.of(Number(BigInt.asUintN(8,argument.value)));
      } else {
        const argument = next('转换参数',pointerTo(length ? 'int' : 'char'),conversion);
        if (argument.type.kind === 'nullptr' || argument.address === 0n) throw new FormatError(`第 ${argumentIndex} 个参数是空指针，${conversion} 读取它是未定义行为。`, 'args');
        if (!argument.units) throw new FormatError(`第 ${argumentIndex} 个参数指向的内容在运行时才确定。`, 'args');
        const units = argument.units.slice(0,argument.units.indexOf(0));
        if (length) {
          const encoded = [];
          for (const unit of units) {
            const character = wideBytes(Number(BigInt.asIntN(32,BigInt(unit))),conversion);
            if (precision !== null && encoded.length + character.length > precision) break;
            encoded.push(...character);
          }
          bytes = Uint8Array.from(encoded);
        } else bytes = Uint8Array.from(units.slice(0,precision ?? undefined));
      }
      const spaces = encoder.encode(' '.repeat(Math.max(0,width - bytes.length)));
      push(left ? bytes : spaces); push(left ? spaces : bytes);
      continue;
    }
    push(value);
  }
  const allBytes = new Uint8Array(byteCount), convertedBytes = new Uint8Array(byteCount); let cursor = 0;
  chunks.forEach((chunk,index) => {
    allBytes.set(chunk,cursor);
    if (chunkParts[index] === 'specifier') convertedBytes.fill(1,cursor,cursor + chunk.length);
    cursor += chunk.length;
  });
  return {text:decoder.decode(allBytes),spans:outputSpans(allBytes,convertedBytes,counts)};
}
