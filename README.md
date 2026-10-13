# printf.

一个极简的 C `printf` 格式化交互页面。

- 分解 `%[FF][WW][.PP][LL]SS`，悬停查看替换规则和解释。
- 格式化串按语法部分着色，输出区区分普通文本和格式化结果。
- 输入格式化串与参数，实时显示结果。
- 参数按 C 表达式求值：常量、字符串字面量、类型转换、`NULL`、`nullptr`、`INFINITY`、`NAN` 和 `&变量`。`%n` 写入的值标在输出的对应位置。

在线访问：[minsecrus.github.io/printf](https://minsecrus.github.io/printf/)

## 本地运行

页面源码位于 `dist/`，使用原生 HTML、CSS 和 JavaScript，无需安装依赖或构建。

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory dist
```

打开 <http://127.0.0.1:4173/>。

## 检查

使用 Node.js 运行格式化、字节处理、着色和静态资源检查：

```sh
node check.mjs
```

格式化逻辑在浏览器内运行，遵循 C23；实现定义的部分按 x86-64 Linux（LP64、glibc）和 UTF-8 区域设置处理。参数类型与转换说明不符、未定义行为和实现不支持的写法会显示错误提示。它用于交互学习，具体 C 环境的行为请以该环境为准。

## 部署

推送到 `main` 后，GitHub Actions 检查代码并将 `dist/` 部署到 GitHub Pages；也可手动触发工作流。

## 许可证

[MIT](LICENSE) © 2026 Minsecrus
