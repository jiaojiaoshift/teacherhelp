# TeachHelper Android App

`android-app/` 当前并行存在两条 Android 实现线：

1. `android-app/src` + `App.tsx`：Expo / React Native 线
2. `android-app/app` + `android-app/core`：原生 Android / Kotlin / Compose 线

不要默认把它们当成同一套客户端。

当前维护建议：

1. 给用户直接安装试用：优先使用 `android-app/android/app/build/outputs/apk/release/app-release.apk`
2. 继续开发 Android：优先收敛到原生 `app + core` 线
3. 修改前先跑一遍根目录的 `npm run status:android`

作用上，这两条线都在覆盖第四阶段的安卓端上传闭环：把手机或平板上的 PDF 直接投递到本机局域网中的 TeachHelper PC 助手。

## 功能

1. 扫描 PC 页面二维码完成配对
2. 按上传用途浏览对应目录树
3. 选择 PDF 并上传
4. 讲义归档命名校验
5. 下载当前主讲义并上传编辑后的主讲义

## 启动

### Expo / React Native 线

```bash
cd android-app
npm install
npx expo start
```

建议直接在 Android 真机上用 Expo Go 调试。

### 原生 Android / Kotlin / Compose 线

```bash
cd android-app
./gradlew :core:test
./gradlew :app:assembleDebug
```

Windows 环境下可先在仓库根目录运行：

```bash
npm run status:android
```

它会自动复核 Expo typecheck、原生 `:core:test`、原生 `:app:assembleDebug`，同时纳入 native mobile-upload contract 校验，并输出当前推荐的“装机产物”和“开发主线”。

如需查看当前建议的 Android 维护工作流，可在仓库根目录运行：

```bash
npm run android:workflow
```

如需先确认某个目录或文件属于 Native 主线、Expo 辅助线还是 Expo prebuild 产物，可运行：

```bash
npm run android:boundaries -- android-app/app/src/main/kotlin/com/teachhelper/mobile/MainActivity.kt
```

如一次传入多条路径，命令会在检测到 Native 主线与 Expo 相关路径混用时直接输出警告。
检测到这种混线时，命令会返回非零退出码，可直接作为维护前置检查。

如需按当前建议的开发主线直接从仓库根目录维护原生 Android，可运行：

```bash
npm run android:dev:test
npm run android:dev:build
```

如需只复核 Expo 辅助线的当前类型检查，可运行：

```bash
npm run android:expo:typecheck
```

如需单独复核共享上传契约与原生 Kotlin 字面量是否仍一致，可在仓库根目录运行：

```bash
npm run verify:android-contract
```

注意：Expo 线当前保留 `android-app/src/domain/upload-types.ts` 里的本地上传契约常量，不要直接从根仓库通过 `@/lib/...` 引到 `android-app/`。跨线一致性由根测试和 `verify:android-contract` 负责兜底。

## 使用流程

1. PC 端打开移动上传配对页面，生成二维码
2. 手机端打开本 App，扫描二维码
3. 选择上传用途
4. 选择目标目录或主讲义文档
5. 选择 PDF 并上传
6. 若是主讲义，可先下载当前版本到本地编辑，再重新上传
