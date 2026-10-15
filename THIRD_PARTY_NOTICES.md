# 第三方署名与许可证

## Cherri

- 作者/项目：electrikmilk 及 Cherri 贡献者。
- 项目：<https://github.com/electrikmilk/cherri>
- 使用版本：v2.3.0，commit `d2072c62ea708e7727099fab94fa28b0bcec747b`。
- 上游许可证：GNU General Public License, version 2；原文保留于 [licenses/Cherri-GPL-2.0.txt](licenses/Cherri-GPL-2.0.txt)。
- 对应源码：<https://github.com/electrikmilk/cherri/tree/d2072c62ea708e7727099fab94fa28b0bcec747b>。

本地验证通过独立进程调用未修改的编译器。静态版的独立 TypeScript plist 序列化器依据其公开动作定义核对 Apple 动作标识、参数及变量序列化格式，并由合成 fixture 对比完整编译结果。应用没有嵌入或分发 Cherri 二进制；不将编译器的开源许可证当作 HubSign 在线服务使用授权。上游原文许可证保留，不移除署名。

## 静态网站依赖

React、React DOM、Scheduler 使用 MIT 许可证（Meta Platforms, Inc. and affiliates）。发布包中的 `THIRD_PARTY_LICENSES.txt` 保留原文。Vite、TypeScript、Playwright 及类型包仅作开发工具，版本和传递依赖记录于 `package-lock.json`，各自许可证保留在安装包中。

Apple、iPhone、Shortcuts 和 Siri 为 Apple 的相关商标。本项目与 Apple 无隶属关系。
