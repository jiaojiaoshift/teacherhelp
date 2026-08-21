# TeachHelper 智题库

TeachHelper 是面向本地教研工作的题库整理、题目框选、跨页复核、OCR 分类、答案匹配和组卷工具。当前发布版本为 `1.0.0`。



![TeachHelper icon](app/icon.png)

## 客户端边界

- Web / 桌面主工程：Next.js 14、React 18、TypeScript。
- Windows 桌面端：Electron + Next.js standalone，本机数据默认保存在 `%LOCALAPPDATA%\TeachHelper`。
- Android 安装线：Expo / React Native，路径为 `android-app/src` 与 `android-app/android`。
- Android 开发线：Native Kotlin / Compose，路径为 `android-app/app` 与 `android-app/core`。

两条 Android 线仍然并存。修改其中一条不会自动修改另一条，维护前请运行：

```powershell
npm.cmd run status:android
```

不要并行运行会同时写 `android-app/app/build` 的 Gradle 命令。

Android 构建额外需要 JDK 21 与 Android SDK。脚本会优先使用可选的仓库本地工具链 `tmp/toolchains/jdk-21` 和 `android-sdk`，不存在时沿用当前 `JAVA_HOME`、`ANDROID_HOME` 或 `ANDROID_SDK_ROOT`。生成带当前版本和品牌资源的 Expo 安装 APK：

```powershell
npm.cmd run android:expo:release
npm.cmd run status:android
```

release APK 输出到 `android-app/android/app/build/outputs/apk/release/app-release.apk`。该命令只构建 Expo prebuild 安装线，不会替代 Native Compose 开发线。

## Windows 快速使用

普通用户优先安装 NSIS 正式包。安装器会创建桌面和开始菜单快捷方式，卸载时不会删除本机题库数据。

从源码准备一台新电脑时，安装 Git、Node.js 22 LTS 和 npm 10，然后执行：

```powershell
git clone https://github.com/jiaojiaoshift/teacherhelp.git
cd teacherhelp
npm.cmd run setup:fresh -- --install-command
teacherhelp
```

启动后访问 `http://localhost:3000/`；也可以在任意目录打开命令行直接输入 `teacherhelp`。首次运行只需执行一次 `setup:fresh`，它会安装依赖、生成品牌资源、检查部署环境并构建 Web。设置页位于 `http://localhost:3000/settings`，保存的 AI 配置和主题位于数据根，不会随源码更新被覆盖。

`setup:fresh` 只在 `.env.local` 不存在时从 `.env.example` 创建它，不会覆盖已有配置。`--install-command` 是 Windows 可选项，用于把 `teacherhelp` 命令安装到用户 PATH。

停止本地 Web 服务：

```powershell
teacherhelp -stop
```

## macOS / Linux 源码运行

要求 Node.js `20.19–24.x`，推荐 Node.js 22 LTS：

```bash
git clone https://github.com/jiaojiaoshift/teacherhelp.git
cd teacherhelp
npm run setup:fresh
npm run dev
```

只检查当前机器，不安装或构建：

```bash
npm run deploy:check
```

## AI 配置

首次启动默认使用本机 ccSwitch / Codex 路由。打开 Web 或桌面端的“设置”页即可切换深色/浅色主题，以及在 ccSwitch 路由、直接 API、本地模型三种模式之间选择。直接 API 和本地模型只需填写兼容 OpenAI 的 URL、模型和接口类型；密钥只写入本机数据根的 `settings.json`，接口读取时只返回“是否已配置”，不会回显密钥。

直接 API 预设提供千问、豆包和 `gpt-5.6-sol` 入口；当前直接接入优先支持千问和豆包，`gpt-5.6-sol` 推荐通过 ccSwitch 路由使用。

本机 ccSwitch / Codex 模式继续使用 `CODEX_HOME/config.toml` 和 `auth.json`。服务器或容器推荐使用 OpenAI-compatible 环境变量：

```dotenv
TEACHHELPER_AI_PROVIDER=openai-compatible
TEACHHELPER_AI_BASE_URL=https://gateway.example.com/v1
TEACHHELPER_AI_MODEL=your_model
TEACHHELPER_AI_API_KEY=your_api_key
TEACHHELPER_AI_WIRE_API=responses
```

不要把真实 key 写入代码、README、Dockerfile、Compose 文件或提交到 Git。

## Docker 部署

准备 `.env.local` 后构建并启动：

```bash
docker compose --env-file .env.local -f docker-compose.example.yml up --build -d
docker compose -f docker-compose.example.yml ps
```

题库、任务和日志保存在命名卷 `teachhelper-data`，容器更新不会删除该卷。健康检查地址为：

```text
http://127.0.0.1:3000/api/health
```

## 接入域名

将公开根地址写入部署环境：

```dotenv
TEACHHELPER_PUBLIC_ORIGIN=https://teachhelper.example.com
```

它会用于 Web metadata 和移动端配对 URL。若移动上传需要不同地址，可用 `TEACHHELPER_MOBILE_UPLOAD_BASE_URL` 单独覆盖。

Nginx 示例位于 `deploy/nginx/teachhelper.conf.example`。公网部署必须同时满足：

1. 使用 HTTPS。
2. 在反向代理或零信任网关中配置身份认证。
3. 持久化并备份 `TEACHHELPER_DATA_ROOT`。
4. 不把 `.codex`、`.env.local`、题库数据或学生资料打进镜像。

当前应用不提供面向公网的多用户权限系统，不应裸露在互联网。

## 生产构建

普通 Web 构建：

```bash
npm run build
npm run start
```

可复制的 standalone 构建：

```bash
npm run deploy:build
HOSTNAME=0.0.0.0 PORT=3000 TEACHHELPER_DATA_ROOT=/path/to/data node .next/standalone/server.js
```

Windows 桌面安装包：

```powershell
npm.cmd run desktop:dist
```

## 数据与备份

- 源码 Web 在未配置时兼容使用仓库的 `data/`，该目录已被 Git 和 Docker 忽略；开源部署和长期使用应显式把 `TEACHHELPER_DATA_ROOT` 指向仓库外的持久目录。
- 推荐配置示例：`TEACHHELPER_DATA_ROOT=C:\Users\Teacher\TeachHelperData`（Windows）或 `TEACHHELPER_DATA_ROOT=/var/lib/teachhelper`（Linux）。
- `setup:fresh` 只创建缺失目录，不覆盖已有 `.env.local`、题库、专题卷、任务或日志；更新源码时不要把用户数据目录复制回仓库。
- 桌面端：系统用户数据目录下的 `TeachHelper`。
- 导出文件和备份目录也属于用户数据，默认不会进入 Git 或 Docker 镜像。
- 升级、迁移或清理前备份整个数据根，至少保留 `library/catalog.json` 与所有 `assets/`。

## 开发验证

```bash
npm test
npm run build
npm run deploy:check
```

贡献前请阅读 `CONTRIBUTING.md`、`SECURITY.md` 与 `spec_skill.md`。

## License

[GNU GPL-3.0-only](LICENSE)
