# IPHONE 快捷指令生成器

已按 2026-10-15 的新要求增加 **React / TypeScript / Vite 静态网站**，不部署在线后台。原来的技术验证、编译器、测试和报告全部保留。

当前能完成：浏览器直连模型、自然语言对话与单问题追问、截图输入、步骤校验和预览、本地历史与版本、继续修改、生成真实未签名 Apple plist。**签名服务未通过验证，不能提供可导入 iPhone 的文件，核心安装目标尚未完成。** 不用普通 JSON 或 HTML 冒充 `.shortcut`。

## 打开静态网站

- 手机入口：[GitHub Pages](https://3209709618-alt.github.io/iphone-shortcut-generator/)
- 公开源码：[GitHub 仓库](https://github.com/3209709618-alt/iphone-shortcut-generator)
- 发布状态：[GitHub Pages 发布记录](https://github.com/3209709618-alt/iphone-shortcut-generator/actions)

GitHub Pages 从 `gh-pages` 分支发布静态文件，成功发布后可直接在 Safari 打开，不需要电脑保持开机。修改 `main` 源码后需重新构建并更新发布分支。大陆手机流量可达性仍需实测，部署不会补齐尚未验证的快捷指令签名。详见 [部署与手机使用说明](docs/github-pages.md)。

本地开发：

Node.js 22.18+（推荐 24 LTS）：

```sh
npm ci
npm run dev
```

浏览器打开终端给出的本机地址。生产文件：

```sh
npm run build
npm run preview -- --port 4173
```

`dist/` 是全部部署内容，可放到支持 HTTPS 的静态托管平台，不需要 Node 在线服务。不要直接双击 HTML（浏览器模块和持久化需要 HTTP(S)）。本机预览不等于上线，不保证 iPhone 可访问本机地址。

在「设置」中填写自己的 API 密钥，再发起对话；密钥只在页面内存中，刷新需重新填写。可先点「查看一个示例」体验步骤和本地编译，示例不调用 AI。生成文件下载名以 `.unsigned.plist` 结尾，明确不能安装。

模型只在创作阶段被调用。静态版不向快捷指令嵌入供应商密钥，也没有运行时 AI 代理；原来的两个运行时 AI 验收案例尚未实现。参考 [静态版状态与验证报告](docs/static-site-report.md)。

- [第一阶段报告及路线选择](docs/phase-1-report.md)
- [实机验证记录表](docs/iphone-validation.md)
- [第三方许可证及署名](THIRD_PARTY_NOTICES.md)
- [固定编译器版本](compiler.lock.json)

## 已实现的验证

| 文件 | 验证范围 | 不代表 |
| --- | --- | --- |
| `fixtures/hello.cherri` | 显示合成测试文字 | 已签名或可导入 |
| `fixtures/input-preview.cherri` | plist 包含快捷指令输入引用 | 新短信真实触发成功 |
| `fixtures/csv-append.cherri` | 创建测试文件、缺失检查、禁止覆盖、追加模式 | iCloud 实际写入成功或完整记账功能 |
| `fixtures/import-question.cherri` | plist 包含导入配置问题 | 签名后导入配置成功 |
| `fixtures/browser-actions.cherri` | 浏览器 8 种动作的完整 plist 与 Cherri 编译语义对照 | iPhone 实机兼容 |

所有输出、下载工具及本地研究材料放在忽略目录 `.local/`，不进入公开源码。测试文件只包含明确的合成数据，CSV 探针使用独立路径 `Shortcuts/GeneratorValidation/probe.csv`。

## 运行验证

编译探针另需 Python 3.7 或以上（建议 3.11+）及固定 Cherri。探针不联网、不请求模型或签名；浏览器测试使用模拟模型响应，不消耗真实额度。

```sh
npm test
npm run verify:compiler
npm run build
npx playwright install chromium
npm run test:ui
```

也可直接运行：

```sh
python -m unittest discover -s tests -p 'test_*.py'
python scripts/verify_compiler.py
```

编译器默认路径：Windows `.local/tools/cherri.exe`；Linux `.local/tools/cherri`。可通过 `CHERRI_BIN` 指定本机已安装的可执行文件。脚本验证版本，固定使用 `--skip-sign --derive-uuids --no-ansi`，仅允许仓库中五份合成探针。每次创建独立工作目录，编译进程限时 15 秒，保留编译结果和 `report.json`。

### 获取编译器

Linux x86_64 使用 `compiler.lock.json` 的官方发布包，并在解压执行前核对 `archiveSha256`。不要下载不固定版本的 `latest` 包。

Windows：从锁文件中指定的源码 commit 构建，使用 Go 1.24 或以上；本次实际使用 Go 1.26.4。执行源码目录中的：

```sh
go build -trimpath -o /absolute/path/to/iphone-shortcut-generator/.local/tools/cherri.exe .
```

构建依赖由上游的 `go.mod` / `go.sum` 固定。上游源码、Go 缓存和二进制不提交本仓库。发布编译器副本时保留其许可证并提供对应源码。

## 当前边界

- CloudBase 免费版官方限制为 3 秒/256 MB；默认域名仅供开发测试，不能据此承诺长期正式部署。
- 用户尚未注册腾讯云，未验证免费资格；未创建环境、购买套餐、绑定域名或开启超额计费。
- HubSign 授权、额度及当前可用性尚未确认，未向第三方发送签名请求。
- 未配置模型密钥；实际模型调用、截图识别和费用尚未测试。
- 已创建公开 GitHub 仓库并使用 Pages 静态发布；真实 iPhone、手机流量可达性和实际模型调用仍未验收。

详细证据、费用分项和可选路线见报告。不要将 `.local/` 内的 `_unsigned.shortcut` 改名为已签名文件或作为安装链接发布。
