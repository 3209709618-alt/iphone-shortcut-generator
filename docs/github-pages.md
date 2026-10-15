# GitHub Pages 部署与手机使用

这是静态网页，部署后不需要本机保持开机，也不需要在线 Node.js 后台。

## 静态发布

仓库 `main` 保存源码，`gh-pages` 保存构建后的静态文件。Settings → Pages → Build and deployment → Source 选择 Deploy from a branch，分支为 `gh-pages`，目录为 `/ (root)`。GitHub 在发布分支更新后自动上线。

当前 GitHub 登录具备仓库权限，没有创建自定义 Actions 工作流的权限，所以使用平台内置的分支发布，不要求额外账号授权。不需要模型密钥或部署 Secret，也不提交自定义工作流。网站使用相对资源路径，支持 `https://用户名.github.io/仓库名/`。

更新网站时先运行 `npm ci`、`npm test`、`npm run build`，再把 `dist/` 内容放到发布分支的根目录，并保留空的 `.nojekyll` 文件。只更新 `main` 不会自动重新构建。发布分支只能放静态产物，不要放环境文件、API 密钥或本地历史数据。

公开仓库的 GitHub Pages 与标准 GitHub 托管 Actions runner 可在免费额度政策下使用，仍受 GitHub 当期使用限制；没有购买套餐、购买域名或开启超额计费。模型调用由所选服务商另行计费。参考 [Pages 使用限制](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) 与 [Actions 计费](https://docs.github.com/en/billing/concepts/product-billing/github-actions)。

## iPhone 使用

1. 使用 Safari 打开 Pages 网站网址。网址公开，其他人也能打开页面。
2. 「设置」中填写自己的模型 API 密钥，保存配置。不要把密钥写进 GitHub 文件或 Issue。连接测试可能消耗模型额度。
3. 回到「创作」，描述需求，根据提示回答必要问题。也可先查看示例，不调用模型。
4. 对话与截图保存在当前浏览器；密钥只保留在当前页面内存，刷新后需重新填写。不同手机、电脑不会自动同步历史。
5. 目前编译结果是 `.unsigned.plist`，签名尚未验证，不能直接导入快捷指令 App。部署上线不会解除这一限制。

Safari 可以通过「分享 → 添加到主屏幕」保留入口；这不提供离线功能。清除浏览器数据前，在「我的快捷指令」导出备份；目前没有备份导入界面。

## 网络验收

GitHub Pages 的服务端发布成功不代表中国大陆所有运营商均可访问。最终需要在 iPhone 关闭 Wi-Fi、关闭代理后，使用手机流量测试页面加载、模型连接和一次对话，并记录日期、运营商、iOS 版本。没有实测时不能标记通过。

如果手机无法访问，先保留 GitHub 源码仓库，再选择可访问的静态托管平台。不得自动购买域名、套餐或升级服务。
