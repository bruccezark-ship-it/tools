# publish

**Vite React/Vue TypeScript 前端项目** → 自动构建 → 增量部署至**腾讯云 COS**

## 功能

- ✅ 自动检测 Vite + React/Vue + TypeScript 项目
- ✅ 自动检测包管理器（npm / pnpm / yarn）并执行构建
- ✅ 自动生成 `sitemap.xml` + `robots.txt`（解析路由文件）
- ✅ **增量 diff 部署**：MD5 vs ETag 对比，仅上传变更 + 删除远程多余文件
- ✅ 并发上传（默认 10 并发）+ 失败重试（3 次）
- ✅ 交互式问答：COS 配置文件、目标目录、站点域名
- ✅ PowerShell 全局命令支持

## 安装

### 方式一：npm 全局安装（推荐）

```powershell
npm install -g 文件路径\publish\
```

安装后即可在任意 Vite 项目目录执行：

```powershell
publish
```

### 方式二：直接运行

```powershell
cd tools/publish
npm -g install
node bin/cli.mjs
```

## 用法

### 基本用法

在 Vite 项目根目录下：

```powershell
publish
```

### 试运行（仅显示 diff）

```powershell
publish --dry-run
```

### 帮助

```powershell
publish --help
```

## COS 配置文件

创建一个 JSON 文件（如 `cos-config.json`），内容格式：

```json
{
  "SecretId": "AKIDxxxxxxxxxxxxxxxxxxxxxxxx",
  "SecretKey": "xxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "Region": "ap-guangzhou",
  "Bucket": "my-bucket-1234567890"
}
```

| 字段 | 说明 | 示例 |
|------|------|------|
| `SecretId` | 腾讯云 API 密钥 ID | `AKID...` |
| `SecretKey` | 腾讯云 API 密钥 Key | `...` |
| `Region` | COS 地域 | `ap-guangzhou` / `ap-shanghai` / `ap-beijing` |
| `Bucket` | COS 存储桶名称（含 APPID） | `my-bucket-1234567890` |

> ⚠️ **安全提醒**：不要将包含密钥的配置文件提交到 Git 仓库！建议添加到 `.gitignore`。

## 交互流程

```
╔══════════════════════════════════════════╗
║   🚀 publish  v1.0.0            ║
║   Vite 前端项目增量部署至腾讯云 COS       ║
╚══════════════════════════════════════════╝

📁 COS 配置文件路径 (JSON): ./cos-config.json
  ✅ 配置读取成功 → Bucket: my-bucket-xxx, Region: ap-guangzhou

📂 COS 目标目录 (如 / 或 /my-app/)
  ✅ COS 目标默认路径: /Default/

🌐 站点域名 (如 www.shangwang.com，不要协议): www.shangwang.com
  ✅ 站点域名: https://www.shangwang.com

📦 检测到包管理器: npm
🔨 开始构建项目...
  ✅ 构建完成
📋 生成 sitemap / robots...
  ✅ sitemap.xml 已生成 (15 个 URL)
  ✅ robots.txt 已生成

☁️  连接腾讯云 COS...
📊 扫描本地文件: D:\project\dist
  📁 本地文件: 42 个
📊 获取远程对象列表: Bucket=my-bucket-xxx, Prefix=my-website/
  ☁️  远程对象: 40 个

═══════════════════════════════════════════
  📊 增量同步摘要
    ⬆️  上传 (新增/变更): 3 个
    🗑️  删除 (远程多余):  1 个
    ✅  跳过 (无变化):    39 个
═══════════════════════════════════════════

📤 将上传:
    + assets/index-D4x9kL2p.js  (156.3 KB)
    + assets/index-Cm8tF3rQ.css  (42.1 KB)
    + index.html  (0.5 KB)

🗑️  将删除:
    - assets/old-chunk-Ab1Cd2.js

⬆️  开始上传 3 个文件...
  上传中... 3/3
  ✅ 上传完成 (3 个文件)
🗑️  开始清理 1 个远程多余文件...
  已删除: assets/old-chunk-Ab1Cd2.js

═══════════════════════════════════════════
  🎉 部署完成!
    ⬆️  上传: 3 个
    🗑️  删除: 1 个
    ✅  跳过: 39 个
═══════════════════════════════════════════
```

## 增量同步策略

| 本地 | 远程 | 操作 |
|------|------|------|
| ✅ 有 | ❌ 无 | **上传** |
| ✅ 有 | ✅ 有 | MD5≠ETag → **上传** / 相同 → **跳过** |
| ❌ 无 | ✅ 有 | **删除** |

> ⚠️ 工具**只操作**用户指定的 COS 目标目录前缀，不会影响桶内其他文件。

## SEO 支持

工具会自动生成 `sitemap.xml` 和 `robots.txt`：

1. **优先使用**项目中的 `scripts/generate-sitemap.mjs`
2. 若无，从 `src/routes.tsx` 或路由配置文件中解析路由
3. 支持 React Router 和 Vue Router

可通过设置环境变量控制：
- `FULL_URL` — 站点完整 URL
- `OUTPUT_DIR` — 输出目录

## 技术架构

```
tools/publish/
├── bin/
│   └── cli.mjs                  # CLI 入口
├── src/
│   ├── prompts.mjs              # 交互式问答
│   ├── build.mjs                # 构建 + sitemap/robots 生成
│   └── cos-deploy.mjs           # COS 增量 diff 同步
├── deploy.ps1                   # PowerShell 全局封装
├── package.json
└── README.md
```

## License

MIT
