import { formatPrintf, highlightFormat, FormatError } from './formatter.js';
const segments = {
  flags: { number: '01 / FLAGS', title: '标志', description: '控制对齐、符号、前缀与补零，可组合使用。', choices: [['-', '左对齐'], ['+', '始终显示正负号'], ['␠', '正数前留空格'], ['#', '替代形式 / 进制前缀'], ['0', '用零填充']] },
  width: { number: '02 / WIDTH', title: '宽度', description: '设置最小输出宽度。内容超过宽度时不会截断。', choices: [['数字', '如 8、12、20'], ['*', '从一个 int 参数读取'], ['省略', '不填充']] },
  precision: { number: '03 / PRECISION', title: '精度', description: '整数：最少位数；f / e：小数位数；g：有效位数；s：最多字节。', choices: [['.数字', '如 .2、.5、.0'], ['.*', '从一个 int 参数读取'], ['.', '等同 .0'], ['省略', '使用转换的默认精度']] },
  length: { number: '04 / LENGTH', title: '修饰符', description: '选择参数的类型宽度，与输出字段宽度不同。N 通常为 8、16、32、64。', choices: [['省略', 'int / unsigned / double'], ['hh', 'char'], ['h', 'short'], ['l', 'long / 宽字符'], ['ll', 'long long'], ['j', 'intmax_t'], ['z', 'size_t'], ['t', 'ptrdiff_t'], ['wN', '固定位宽 · C23'], ['wfN', 'fast 类型 · C23'], ['L', 'long double']] },
  specifier: { number: '05 / SPECIFIER', title: '说明符', description: '选择输出转换，不可省略。% 须写成 %%；p、n 在此只提供说明。', choices: [['d / i', '有符号十进制'], ['u', '无符号十进制'], ['b / B', '二进制 · C23'], ['o', '八进制'], ['x / X', '十六进制'], ['f / F', '小数'], ['e / E', '科学计数'], ['g / G', '通用浮点'], ['a / A', '十六进制浮点'], ['c', '字符'], ['s', '字符串'], ['p', '指针地址'], ['n', '写回已输出字节数'], ['%', '输出 %，不读取参数']] }
};
const formatInput = document.querySelector('#format-input');
const argsInput = document.querySelector('#args-input');
const highlight = document.querySelector('#format-highlight');
const tokens = [...document.querySelectorAll('.token')];
let active = 'flags';
function showSegment(key) {
  const segment = segments[key];
  document.querySelector('#inspector').style.setProperty('--segment-color', `var(--${key})`);
  document.querySelector('#segment-title').textContent = segment.title;
  document.querySelector('#choices').replaceChildren(...segment.choices.map(([value, description]) => {
    const el = document.createElement('span'); el.className = 'choice';
    const code = document.createElement('code'); code.textContent = ({'数字':'N','.数字':'.N','省略':'∅'})[value] ?? value;
    el.append(code); return el;
  }));
}
tokens.forEach(token => {
  token.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { showSegment(token.dataset.segment); token.classList.add('is-preview'); } });
  token.addEventListener('pointerleave', () => { token.classList.remove('is-preview'); showSegment(active); });
  token.addEventListener('focus', () => showSegment(token.dataset.segment));
  token.addEventListener('blur', () => showSegment(active));
  token.addEventListener('click', () => {
    active = token.dataset.segment;
    tokens.forEach(el => { el.classList.toggle('is-active', el === token); el.setAttribute('aria-pressed', String(el === token)); });
    showSegment(active);
  });
});
showSegment(active);
document.querySelector('#printf-form').addEventListener('submit', event => event.preventDefault());
function updateOutput() {
  highlight.replaceChildren(...highlightFormat(formatInput.value).map(({text,part}) => {
    const span = document.createElement('span'); span.textContent = text;
    if (part) { span.dataset.part = part; span.style.color = `var(--${part})`; }
    return span;
  }));
  syncHighlightScroll();
  const output = document.querySelector('#output');
  const errorElement = document.querySelector('#output-error');
  const panel = document.querySelector('#output-panel');
  formatInput.removeAttribute('aria-invalid'); argsInput.removeAttribute('aria-invalid');
  try {
    const result = formatPrintf(formatInput.value,argsInput.value);
    output.textContent = result.text;
    output.hidden = false; errorElement.hidden = true; panel.classList.remove('has-error');
    return result;
  } catch (error) {
    output.textContent = ''; output.hidden = true; errorElement.hidden = false;
    errorElement.textContent = error instanceof FormatError ? error.message : '无法生成输出，请检查输入。';
    panel.classList.add('has-error');
    (error.field === 'args' ? argsInput : formatInput).setAttribute('aria-invalid','true');
    return {error:errorElement.textContent};
  }
}
[formatInput,argsInput].forEach(input => input.addEventListener('input',updateOutput));
function syncHighlightScroll() { highlight.style.transform = `translateX(${-formatInput.scrollLeft}px)`; }
formatInput.addEventListener('scroll',syncHighlightScroll);
formatInput.addEventListener('keyup',syncHighlightScroll);
formatInput.addEventListener('click',syncHighlightScroll);
window.addEventListener('resize',syncHighlightScroll);
updateOutput();
// Feature detection keeps the same page usable in browsers without WebMCP.
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  const register = tool => { try { Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(() => {}); } catch {} };
  register({name:'configure_printf',description:'设置页面的格式串和参数，并返回实时格式化结果。参数使用逗号分隔，字符串加双引号。',inputSchema:{type:'object',properties:{format:{type:'string',maxLength:20000},arguments:{type:'string',maxLength:20000}},required:['format','arguments'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},execute(input){
    if (!input || typeof input.format !== 'string' || typeof input.arguments !== 'string' || input.format.length > 20000 || input.arguments.length > 20000 || Object.keys(input).some(key => !['format','arguments'].includes(key))) throw new Error('需要 format 和 arguments 两个字符串。');
    formatInput.value = input.format; argsInput.value = input.arguments;
    const result = updateOutput();
    return result.error ? {error:result.error} : {output:result.text,bytes:result.bytes,warnings:result.warnings};
  }});
  window.addEventListener('pagehide',() => lifecycle.abort(),{once:true});
}
