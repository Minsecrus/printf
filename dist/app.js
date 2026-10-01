import { formatPrintf, highlightFormat, FormatError } from './formatter.js';
const segments = {
  flags: { title: '标志', choices: [
    ['-', '在最小宽度内左对齐，右侧补空格。与 0 同时使用时，0 被忽略。'],
    ['+', '有符号数始终显示正负号，零也显示 +。与空格标志同时使用时，以 + 为准。'],
    ['␠', '有符号数没有负号时，前面补一个空格。与 + 同时使用时，此标志被忽略。'],
    ['#', '使用替代形式，如八进制前导 0、非零十六进制前缀 0x。浮点数保留小数点，g/G 还保留末尾零。'],
    ['0', '用零补足最小宽度，零放在符号或进制前缀之后。遇到 -，或整数明确指定精度时，改用空格补齐。']
  ] },
  width: { title: '宽度', choices: [
    ['数字', '指定最小字段宽度，例如 8。内容较短时补齐；内容超过宽度时完整输出。'],
    ['*', '从下一个 int 参数读取宽度，再读取要转换的值。负宽度表示左对齐，宽度取其绝对值。'],
    ['省略', '不额外补齐宽度，按内容所需的长度输出。']
  ] },
  precision: { title: '精度', choices: [
    ['.数字', '整数：最少数字位数；f/e/a：小数点后位数；g：有效位数；s：最多输出字节数。'],
    ['.*', '从一个 int 参数读取精度。若宽度也用 *，先读取宽度；负精度等同于省略精度。'],
    ['.', '等同于 .0。整数值为零时不输出数字，但 %#.0o 仍输出 0。'],
    ['省略', '整数至少输出一位；f/e/g 默认精度为 6。a 使用足够精度准确表示数值；s 输出至字符串末尾。']
  ] },
  length: { title: '修饰符', choices: [
    ['省略', '整数按 int 或 unsigned int 转换；浮点数按 double 转换。float 参数会先提升为 double。'],
    ['hh', '整数按 signed char 或 unsigned char 转换；参数先提升，输出前再转换为字符类型。'],
    ['h', '整数按 short 或 unsigned short 转换；参数先提升，输出前再转换为 short 类型。'],
    ['l', '整数使用 long；lc/ls 使用宽字符或宽字符串。用于浮点转换时，l 不改变 double 类型。'],
    ['ll', '整数使用 long long 或 unsigned long long。不要与大写 L 混淆。'],
    ['j', '整数使用 intmax_t 或 uintmax_t，即实现提供的最大宽度整数类型。'],
    ['z', '无符号转换使用 size_t；有符号转换使用其对应的有符号类型。常用于输出对象大小。'],
    ['t', '有符号转换使用 ptrdiff_t；无符号转换使用其对应的无符号类型。常用于输出指针差值。'],
    ['wN', 'N 指定整数位宽，例如 w32 表示 32 位整数。C23 新增，可用位宽由实现决定。'],
    ['wfN', '使用至少 N 位且适合快速运算的整数类型，实际位宽由平台决定。C23 新增。'],
    ['L', '浮点转换使用 long double，精度由平台决定。']
  ] },
  specifier: { title: '说明符', choices: [
    ['d / i', '以有符号十进制输出整数。printf 中 d 与 i 的输出行为相同。'],
    ['u', '以无符号十进制输出整数，不显示正负号。精度指定最少数字位数。'],
    ['b / B', '以无符号二进制输出整数，# 为非零值添加 0b/0B。C23 新增，B 属于可选支持。'],
    ['o', '以无符号八进制输出整数。# 确保首位为 0，零值配合零精度也输出一个 0。'],
    ['x / X', '以无符号十六进制输出整数，分别使用小写或大写字母。# 为非零值添加 0x/0X。'],
    ['f / F', '以普通小数形式输出浮点数，精度控制小数位数。F 使用大写 INF/NAN。'],
    ['e / E', '以科学计数法输出浮点数，如 1.23e+04。精度控制小数位数，指数至少包含两位数字。'],
    ['g / G', '根据数值与有效位数选择普通小数或科学计数法。默认删除小数部分的末尾零，# 可以保留。'],
    ['a / A', '以十六进制形式输出浮点数，如 0x1.8p+0。p/P 后是以 2 为底的指数，精度控制十六进制小数位数。'],
    ['c', '将 int 参数转换为 unsigned char，输出一个字节。支持宽度与左对齐，不使用精度。'],
    ['s', '输出字符串，遇到结尾的空字符停止。精度限制最多输出的字节数，可能截断 UTF-8 字符。'],
    ['p', '输出指针地址，具体表示形式由 C 实现决定。'],
    ['n', '不输出字符，将此前已输出的字节数写入整数指针。'],
    ['%', '写成 %%，输出一个 %，不读取参数。不能附加标志、宽度、精度或长度修饰符。']
  ] }
};
const formatInput = document.querySelector('#format-input');
const argsInput = document.querySelector('#args-input');
const highlight = document.querySelector('#format-highlight');
const tokens = [...document.querySelectorAll('.token')];
const ruleTooltip = document.querySelector('#rule-tooltip');
let tooltipOwner = null;
let tooltipDismissTimer = null;
function hideRuleTooltip() {
  clearTimeout(tooltipDismissTimer);
  ruleTooltip.hidden = true;
  tooltipOwner = null;
}
function positionRuleTooltip() {
  if (!tooltipOwner?.isConnected) return hideRuleTooltip();
  const ownerRect = tooltipOwner.getBoundingClientRect();
  const tooltipRect = ruleTooltip.getBoundingClientRect();
  const left = Math.min(window.innerWidth - tooltipRect.width - 12, Math.max(12, ownerRect.left + ownerRect.width / 2 - tooltipRect.width / 2));
  const above = ownerRect.top - tooltipRect.height - 9;
  ruleTooltip.style.left = `${left}px`;
  ruleTooltip.style.top = `${above >= 12 ? above : ownerRect.bottom + 9}px`;
}
function showRuleTooltip(owner, description) {
  clearTimeout(tooltipDismissTimer);
  tooltipOwner = owner;
  ruleTooltip.textContent = description;
  ruleTooltip.hidden = false;
  positionRuleTooltip();
}
function scheduleTooltipDismiss() {
  clearTimeout(tooltipDismissTimer);
  tooltipDismissTimer = setTimeout(() => {
    if (!tooltipOwner?.matches(':hover, :focus') && !ruleTooltip.matches(':hover')) hideRuleTooltip();
  }, 120);
}
ruleTooltip.addEventListener('pointerenter', () => clearTimeout(tooltipDismissTimer));
ruleTooltip.addEventListener('pointerleave', scheduleTooltipDismiss);
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideRuleTooltip(); });
window.addEventListener('resize', () => { if (!ruleTooltip.hidden) positionRuleTooltip(); });
window.addEventListener('scroll', hideRuleTooltip, {passive:true});
let active = 'flags';
let displayedSegment = null;
function showSegment(key) {
  if (displayedSegment === key) return;
  displayedSegment = key;
  hideRuleTooltip();
  const segment = segments[key];
  document.querySelector('#inspector').style.setProperty('--segment-color', `var(--${key})`);
  document.querySelector('#segment-title').textContent = segment.title;
  document.querySelector('#choices').replaceChildren(...segment.choices.map(([value, description]) => {
    const el = document.createElement('button'); el.className = 'choice'; el.type = 'button';
    const code = document.createElement('code'); code.textContent = ({'数字':'N','.数字':'.N','省略':'∅'})[value] ?? value;
    el.setAttribute('aria-label',code.textContent);
    el.setAttribute('aria-describedby','rule-tooltip');
    el.addEventListener('pointerenter', () => showRuleTooltip(el,description));
    el.addEventListener('pointerleave', scheduleTooltipDismiss);
    el.addEventListener('focus', () => showRuleTooltip(el,description));
    el.addEventListener('blur', scheduleTooltipDismiss);
    el.addEventListener('click', () => showRuleTooltip(el,description));
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
    output.replaceChildren(...result.spans.map(({text,part}) => {
      const span = document.createElement('span'); span.textContent = text; span.dataset.part = part;
      return span;
    }));
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
