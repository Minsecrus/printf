import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { formatPrintf, highlightFormat, FormatError } from './dist/formatter.js';
const cases = [
  ['%+08.2f','3.14159','+0003.14'],['%#x','255','0xff'],['%-12.5s','"hello, world"','hello       '],
  ['%*.*f','8, 2, 3.14159','    3.14'],['%*.*f','-8, -1, 3.14','3.140000'],
  ['%08.3d','12','     012'],['%+05d','-12','-0012'],['%#.0o','0','0'],['%#.0x','0',''],
  ['%hhd','255','-1'],['%hhu','-1','255'],['%llu','18446744073709551615ull','18446744073709551615'],
  ['%#b','10','0b1010'],['%w8d','255','-1'],['%u','-1u','4294967295'],
  ['%.0f','2.5','2'],['%.0f','3.5','4'],['%.2f','2.675','2.67'],['%f','-0.0','-0.000000'],
  ['%.2e','12345.0','1.23e+04'],['%.3g','999.9','1e+03'],['%#.3g','12.0','12.0'],
  ['%.3g','0.00009999','0.0001'],['%.3g','0.000009999','1e-05'],['%E','1.2E3','1.200000E+03'],
  ['%a','1.5','0x1.8p+0'],['%.0a','1.5','0x2p+0'],['%A','0.0','0X0P+0'],['%a','5e-324','0x0.0000000000001p-1022'],
  ['%% %s: %d','"值", 42','% 值: 42'],['%c',"'A'",'A'],['%s','"a,b"','a,b'],
  ['%s','"a\\\"b"','a"b'],['%s','"a\\\\b"','a\\b'],['%.3s','"中文"','中'],
  ['%s','"\\xC3\\xA9"','é'],['\\xC3\\xA9', '', 'é'],['hello\\nworld','', 'hello\nworld'],
  ['%s','"a\\0b"','a'],['你好 %d','42','你好 42'],['%#08x','42','0x00002a'],
  ['%#08.0f','3.0','0000003.'],['%F','INFINITY','INF'],['%f','-NAN','-nan'],['%s','"<script>alert(1)</script>"','<script>alert(1)</script>'],
  // Argument types follow C constants, casts and default argument promotions.
  ['%ld','-2147483648','-2147483648'],['%x','0xFFFFFFFF','ffffffff'],['%d',"'\\xff'",'-1'],['%d',"'ab'",'24930'],['%d','true','1'],
  ['%zu','(size_t)42','42'],['%hhu','(unsigned char)300','44'],['%d','(int)3.99','3'],['%f','(double)3','3.000000'],['%.10f','1.000000059604644775390625f','1.0000000000'],
  ['%.30f','1.0000000596046447753906250001f','1.000000119209289550781250000000'],['%a','0x1.8p0','0x1.8p+0'],['%d',"1'000'000",'1000000'],['%d','0b1\'0\'1','5'],
  ['%s','"ab" "cd"','abcd'],['"%d" "!"','1','1!'],['%s','"\\U0001F600"','😀'],['%d',"u'中'",'20013'],
  ['%wf16d','65537L','65537'],['%wf8d','255','-1'],['%w64d','1L','1'],['%+s','"a"','a'],['% s','"a"','a'],['%+u','5u','5'],
  ['%Lf','1.5L','1.500000'],['%La','1.0L','0x8p-3'],['%La','1.5L','0xcp-3'],['%.0La','0xf.8p0L','0x1p+4'],['%Le','1e5000L','inf'],['%Lg','1e4932L','1e+4932'],
  ['%lc',"L'中'",'中'],['%ls','L"你好"','你好'],['%.4ls','L"你好"','你'],['%5ls','L"ab"','   ab'],['%lc','0x1F600','😀'],['%ls','L"\\x4e2d"','中'],
  ['%p','NULL','(nil)'],['%p','nullptr','(nil)'],['%p','(void *)0x7ffd1234','0x7ffd1234'],['%-8p|','NULL','(nil)   |'],
  ['%Df','1.5dd','1.500000'],['%Ha','1e96df','1.000000e+96'],['%Hf','1e97df','inf'],['%Ha','1.23456789df','1.234568'],['%.2De','123.456dd','1.23e+02']
];
// C23 7.23.6.1 EXAMPLE 3.
for (const [args,expected] of [
  ['123.dd','123'],['-123.dd','-123'],['1.23dd','1.23'],['1.23e3dd','1.23e+3'],['-1.23e3dd','-1.23e+3'],['0.00000123dd','0.00000123'],['1.23e-7dd','1.23e-7'],
  ['0.00000120dd','0.00000120'],['1.20e-7dd','1.20e-7'],['1234567890123456.dd','1234567890123456'],['1234567890123456e1dd','1.234567890123456e+16'],
  ['123456789012345.6dd','123456789012345.6'],['0.000001234567890123456dd','0.000001234567890123456'],['1.234567890123456e-7dd','1.234567890123456e-7'],
  ['0.dd','0'],['-0.dd','-0'],['0.000000dd','0.000000'],['0e-7dd','0e-7'],['0e2dd','0e+2'],['0.000005dd','0.000005'],['0.0000050dd','0.0000050'],['5e-7dd','5e-7']
]) cases.push(['%Da',args,expected]);
for (const [format,args,expected] of [
  ['%Ha','6543.00DF','6543.00'],['%.6Ha','6543.00DF','6543.00'],['%.5Ha','6543.00DF','6543.0'],['%.4Ha','6543.00DF','6543'],['%.3Ha','6543.00DF','6.54e+3'],
  ['%.2Ha','6543.00DF','6.5e+3'],['%.1Ha','6543.00DF','7e+3'],['%.0Ha','6543.00DF','6543.00'],
  ['%.6Ha','9543210e87DF','9.54321e+93'],['%.5Ha','9543210e87DF','9.5432e+93'],['%.4Ha','9543210e87DF','9.543e+93'],['%.3Ha','9543210e87DF','9.54e+93'],
  ['%.2Ha','9543210e87DF','9.5e+93'],['%.1Ha','9543210e87DF','1e+94'],['%.1Ha','9500000e90DF','1e+97'],
  ['%.3Ha','9512345e90DF','9.51e+96'],['%.2Ha','9512345e90DF','9.5e+96'],['%.1Ha','9512345e90DF','1e+97'],['%.2Ha','9512345e86DF','9.5e+92']
]) cases.push([format,args,expected]);
for (const [format,args,expected] of cases) {
  const result = formatPrintf(format,args);
  assert.equal(result.text,expected,`${format} / ${args}`);
  assert.equal(result.spans.map(span => span.text).join(''),result.text,'Coloring must preserve the decoded output.');
}
for (const [format,args] of [
  ['%d',''],['%d','"x"'],['%s','1'],['%q','1'],['%n','0'],['%p','0'],['%Lf','1.0'],['%20001d','1'],['%.20001f','1.0'],['%d','42,'],['%s','"unterminated'],
  ['%f','3'],['%f','-0'],['%u','-1'],['%llu','-1'],['%lld','5L'],['%d','-2147483648'],['%d','3000000000'],['%d','08'],['%d','1lL'],['%s','"\\x100"'],
  ['%d','18446744073709551616'],['%d','3wb'],['%d','(float)1'],['%d','(int)1e10'],['%d','-(int)-2147483648'],['%d','x'],['say "hi"',''],['L"%d"','1'],
  ['%#d','5'],['%05s','"a"'],['%.3c',"'a'"],['%5n','&n'],['%w08d','1'],['%w128d','1'],['%Lc','65'],['%hs','"a"'],
  ['%s','NULL'],['%p','"abc"'],['%p','&n'],['%n','NULL'],['%lc','0xD800'],['%ls','L"\\xD800"'],['%s','L"a"'],['%ls','"a"'],['%Hf','1.5dd'],
  ['%s','"\\uD800"'],['%s','"\\q"'],['%c',"u8'é'"],['%c',"''"],['%f','(_Decimal64)1.5'],['%Da','123dd'],['%d','0x\'FF']
]) assert.throws(() => formatPrintf(format,args),FormatError,`${format} / ${args}`);
assert.equal(formatPrintf('%.1s','"中文"').text,'\uFFFD');
assert.equal(formatPrintf('%.4000f','1.0').text.length,4002);
assert.equal(formatPrintf('%d','1, 2').text,'1');
assert.deepEqual(formatPrintf('ab%nc','&n').spans,[{text:'ab',part:'literal'},{text:'',part:'count',value:'2'},{text:'c',part:'literal'}]);
assert.deepEqual(formatPrintf('%300c%hhn',"'x', &n").spans.at(-1),{text:'',part:'count',value:'44'});
assert.deepEqual(formatPrintf('%c%n%c','195, &n, 169').spans,[{text:'é',part:'specifier'},{text:'',part:'count',value:'1'}]);
assert.deepEqual(highlightFormat('%+08.2lld'),[{text:'%',part:null},{text:'+0',part:'flags'},{text:'8',part:'width'},{text:'.2',part:'precision'},{text:'ll',part:'length'},{text:'d',part:'specifier'}]);
assert.deepEqual(highlightFormat('hello %d'),[{text:'hello ',part:'literal'},{text:'%',part:null},{text:'d',part:'specifier'}]);
assert.deepEqual(highlightFormat('%DDa'),[{text:'%',part:null},{text:'DD',part:'length'},{text:'a',part:'specifier'}]);
for (const value of ['hello %d / %s','%','%+08.','%*.*f','%wf16u','%%','"中文 %s"','%.3Ha']) assert.equal(highlightFormat(value).map(part => part.text).join(''),value);
assert.deepEqual(formatPrintf('value: %+08.2f','3.14159').spans,[{text:'value: ',part:'literal'},{text:'+0003.14',part:'specifier'}]);
assert.deepEqual(formatPrintf('A%%B','').spans,[{text:'A',part:'literal'},{text:'%',part:'specifier'},{text:'B',part:'literal'}]);
assert.deepEqual(formatPrintf('%.1sX','"é"').spans,[{text:'�',part:'specifier'},{text:'X',part:'literal'}]);
assert.deepEqual(formatPrintf('\\xC3%d','7').spans,[{text:'�',part:'literal'},{text:'7',part:'specifier'}]);
for (const [format,args,expected] of [
  ['%c%c','195, 169','é'],['%c\\xA9','195','é'],['\\xC3%c','169','é'],
  ['\\xC3%.0d','0','�'],['\\uFEFF%s','"X"','X'],['A%sb','"\\uFEFF"','A\uFEFFb'],
  ['%c%c%c','226, 130, 172','€'],['%c%c%c%c','240, 159, 152, 128','😀']
]) {
  const result = formatPrintf(format,args);
  assert.equal(result.text,expected);
  assert.equal(result.spans.map(span => span.text).join(''),expected);
}
const html = readFileSync('dist/index.html','utf8');
for (const ref of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)) assert(existsSync(`dist/${ref[1]}`),`missing asset ${ref[1]}`);
console.log(`${cases.length} formatting cases, error paths, %n results and local asset references passed.`);
