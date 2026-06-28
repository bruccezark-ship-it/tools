#!/usr/bin/env node

/**
 * publish CLI 入口
 *
 * 用法:
 *   publish              # 交互式模式
 *   publish --dry-run    # 试运行（仅显示 diff）
 *   publish --help       # 帮助
 */

import { collectParams } from '../src/prompts.mjs';
import { buildAndGenerateSeo } from '../src/build.mjs';
import { deployToCos } from '../src/cos-deploy.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || args.includes('-d');
const showHelp = args.includes('--help') || args.includes('-h');

if (showHelp) {
  console.log(`
╔══════════════════════════════════════════╗
║  publish — Vite 前端 COS 部署工具 ║
╚══════════════════════════════════════════╝

用法:
  publish              交互式模式，逐步问答
  publish --dry-run    试运行模式，仅显示 diff
  publish --help       显示此帮助

COS 配置文件格式 (JSON):
  {
    "SecretId":  "AKIDxxxxxxxxxxxxxxxxxxxxxxxx",
    "SecretKey": "xxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "Region":    "ap-guangzhou",
    "Bucket":    "my-bucket-1234567890"
  }

部署流程:
  1. 问答式收集 COS 配置路径、目标目录、域名
  2. 自动检测包管理器并执行构建
  3. 自动生成 sitemap.xml 和 robots.txt
  4. 增量 diff 对比本地/远程文件
  5. 仅上传变更 + 删除远程多余文件
  `);
  process.exit(0);
}

async function main() {
  const cwd = process.cwd();

  // 1. 问答
  const { cosConfig, targetPath, domain, protocol } = await collectParams(cwd);

  // 2. 构建 + 生成 sitemap/robots
  const distDir = await buildAndGenerateSeo(domain, protocol, cwd);

  // 3. 确认即将同步的范围
  console.log(`📂 本地目录: ${distDir}`);
  console.log(`☁️  COS 前缀: ${targetPath}`);
  console.log(`🌐 站点域名: ${protocol}://${domain}`);
  console.log('');

  // 4. 增量部署
  const result = await deployToCos(cosConfig, targetPath, distDir, { dryRun });

  if (dryRun) {
    console.log('\n💡 试运行完成。去掉 --dry-run 参数以执行实际同步。');
  } else {
    const url = `https://${cosConfig.Bucket}.cos.${cosConfig.Region}.myqcloud.com/${targetPath.replace(/^\/+/, '')}`;
    console.log(`\n🌐 COS 访问地址: ${url}`);
  }
}

main().catch((err) => {
  console.error(`\n❌ 部署失败: ${err.message}`);
  if (process.env.DEBUG) console.error(err.stack);
  process.exit(1);
});
