/**
 * 自动构建 + 生成 sitemap/robots
 * 自动检测包管理器、调用 build、生成 SEO 文件
 */
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * 检测当前项目使用的包管理器
 */
function detectPackageManager(cwd) {
  if (existsSync(resolve(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(resolve(cwd, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

/**
 * 检测 dist 输出目录
 */
function detectDistDir(cwd) {
  // 常见 Vite 输出目录
  const candidates = ['dist', 'build', 'out'];
  for (const d of candidates) {
    const p = resolve(cwd, d);
    if (existsSync(p)) return d;
  }
  return 'dist'; // 默认
}

/**
 * 执行构建
 */
function runBuild(cwd, pm) {
  console.log('🔨 开始构建项目...');
  let buildCmd;

  try {
    // 读取 package.json 检查是否有 build 脚本
    const pkgPath = resolve(cwd, 'package.json');
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (!pkg.scripts?.build) {
        console.error('  ❌ package.json 中未找到 build 脚本');
        console.error(`  当前目录: ${cwd}`);
        console.error('  请确保在 Vite 项目根目录下执行 publish');
        process.exit(1);
      }
    }
  } catch (e) {
    console.error(`  ❌ 读取 package.json 失败: ${e.message}`);
    process.exit(1);
  }

  if (pm === 'pnpm') {
    buildCmd = 'pnpm build';
  } else if (pm === 'yarn') {
    buildCmd = 'yarn build';
  } else {
    buildCmd = 'npm run build';
  }

  try {
    execSync(buildCmd, { cwd, stdio: 'inherit' });
    console.log('  ✅ 构建完成');
  } catch (e) {
    console.error(`  ❌ 构建失败: ${e.message}`);
    process.exit(1);
  }

  const distDir = resolve(cwd, detectDistDir(cwd));
  if (!existsSync(distDir)) {
    console.error(`  ❌ 构建产物目录不存在: ${distDir}`);
    process.exit(1);
  }
  return distDir;
}

/**
 * 生成 sitemap.xml 和 robots.txt
 * 内置独立生成，不依赖外部脚本
 */
export function generateSeo(distDir, domain, protocol, cwd) {
  console.log('📋 生成 sitemap / robots...');

  const FULL_URL = `${protocol}://${domain}`;
  const OUTPUT_DIR = distDir;

  // 内置生成：尝试从路由文件解析
  const routesFiles = [
    resolve(cwd, 'src', 'routes.tsx'),
    resolve(cwd, 'src', 'router', 'index.ts'),
    resolve(cwd, 'src', 'router', 'index.tsx'),
    resolve(cwd, 'src', 'router.ts'),
    resolve(cwd, 'src', 'router.tsx'),
  ];

  let routesContent = null;
  for (const f of routesFiles) {
    if (existsSync(f)) {
      routesContent = readFileSync(f, 'utf-8');
      break;
    }
  }

  let paths = ['/'];
  if (routesContent) {
    // React Router: export const routes = [{ path: '/', ... }, ...]
    const routeArrayRegex = /export\s+const\s+routes[\s\S]*?=\s*\[([\s\S]*?)\];/;
    let arrayMatch = routeArrayRegex.exec(routesContent);
    if (!arrayMatch) {
      arrayMatch = /createBrowserRouter\s*\(\s*\[([\s\S]*?)\](?=\s*[,\)])/.exec(routesContent);
    }
    // Vue Router: routes: [...]
    if (!arrayMatch) {
      arrayMatch = /routes\s*:\s*\[([\s\S]*?)\](?=\s*[,\)\}])/.exec(routesContent);
    }

    if (arrayMatch) {
      const pathRegex = /path\s*:\s*['"`]([^'"`]+)['"`]/g;
      const parsedPaths = [];
      let match;
      while ((match = pathRegex.exec(arrayMatch[1])) !== null) {
        const p = match[1];
        if (p === '*' || p === '/*' || p.includes(':')) continue;
        parsedPaths.push(p);
      }
      if (parsedPaths.length > 0) paths = parsedPaths;
    }
  }

  // 生成 sitemap.xml
  const today = new Date().toISOString().split('T')[0];
  const urlEntries = paths.map((path) => `  <url>
    <loc>${FULL_URL}${path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`);

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries.join('\n')}
</urlset>
`;

  const sitemapPath = resolve(distDir, 'sitemap.xml');
  writeFileSync(sitemapPath, sitemap, 'utf-8');
  console.log(`  ✅ sitemap.xml 已生成 (${paths.length} 个 URL)`);

  // 生成 robots.txt
  const robotsTxt = `User-agent: *
Allow: /
Sitemap: ${FULL_URL}/sitemap.xml
`;
  const robotsPath = resolve(distDir, 'robots.txt');
  writeFileSync(robotsPath, robotsTxt, 'utf-8');
  console.log(`  ✅ robots.txt 已生成`);
}

/**
 * 主流程：构建 + SEO 生成
 * @returns {string} dist 目录绝对路径
 */
export async function buildAndGenerateSeo(domain, protocol, cwd) {
  const pm = detectPackageManager(cwd);
  console.log(`📦 检测到包管理器: ${pm}`);

  const distDir = runBuild(cwd, pm);
  generateSeo(distDir, domain, protocol, cwd);

  return distDir;
}
