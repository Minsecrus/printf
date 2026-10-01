import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { formatPrintf, highlightFormat, FormatError } from './dist/formatter.js';
const cases = [
  ['%+08.2f','3.14159','+0003.14'],['%#x','255','0xff'],['%-12.5s','"hello, world"','hello       '],
  ['%*.*f','8, 2, 3.14159','    3.14'],['%*.*f','-8, -1, 3.14','3.140000'],
  ['%08.3d','12','     012'],['%+05d','-12','-0012'],['%#.0o','0','0'],['%#.0x','0',''],
  ['%hhd','255','-1'],['%hhu','-1','255'],['%llu','18446744073709551615','18446744073709551615'],
  ['%#b','10','0b1010'],['%w8d','255','-1'],['%u','-1','4294967295'],
  ['%.0f','2.5','2'],['%.0f','3.5','4'],['%.2f','2.675','2.67'],['%f','-0','-0.000000'],
  ['%.2e','12345','1.23e+04'],['%.3g','999.9','1e+03'],['%#.3g','12','12.0'],
  ['%.3g','0.00009999','0.0001'],['%.3g','0.000009999','1e-05'],['%E','1.2E3','1.200000E+03'],
  ['%a','1.5','0x1.8p+0'],['%.0a','1.5','0x2p+0'],['%A','0','0X0P+0'],
  ['%% %s: %d','"值", 42','% 值: 42'],['%c',"'A'",'A'],['%s','"a,b"','a,b'],
  ['%s','"a\\\"b"','a"b'],['%s','"a\\\\b"','a\\b'],['%.3s','"中文"','中'],
  ['%s','"\\xC3\\xA9"','é'],['\\xC3\\xA9', '', 'é'],['hello\\nworld','', 'hello\nworld'],
  ['%s','"a\\0b"','a'],['你好 %d','42','你好 42'],['%#08x','42','0x00002a'],
  ['%#08.0f','3','0000003.'],['%F','inf','INF'],['%s','"<script>alert(1)</script>"','<script>alert(1)</script>']
];
for (const [format,args,expected] of cases) assert.equal(formatPrintf(format,args).text,expected,`${format} / ${args}`);
for (const [format,args] of [['%d',''],['%d','"x"'],['%s','1'],['%q','1'],['%n','0'],['%p','0'],['%Lf','1'],['%10001d','1'],['%.101f','1'],['%d','42,'],['%s','"unterminated']]) assert.throws(() => formatPrintf(format,args),FormatError);
assert.equal(formatPrintf('%.1s','"中文"').bytes,1);
assert.equal(formatPrintf('%s','"\\377"').bytes,1);
assert.equal(formatPrintf('%d','1, 2').warnings.length,1);
assert.deepEqual(highlightFormat('%+08.2lld'),[{text:'%',part:null},{text:'+0',part:'flags'},{text:'8',part:'width'},{text:'.2',part:'precision'},{text:'ll',part:'length'},{text:'d',part:'specifier'}]);
assert.deepEqual(highlightFormat('hello %d'),[{text:'hello ',part:'literal'},{text:'%',part:null},{text:'d',part:'specifier'}]);
for (const value of ['hello %d / %s','%','%+08.','%*.*f','%wf16u','%%','"中文 %s"']) assert.equal(highlightFormat(value).map(part => part.text).join(''),value);
assert.equal(formatPrintf('%.10f','1.000000059604644775390625f').text,'1.0000000000');
const html = readFileSync('dist/index.html','utf8');
for (const ref of html.matchAll(/(?:src|href)="\.\/([^"?#]+)"/g)) assert(existsSync(`dist/${ref[1]}`),`missing asset ${ref[1]}`);
console.log(`${cases.length} formatting cases, error paths, byte semantics and local asset references passed.`);
