/**
 * 交互式用户提示模块（纯 Node.js readline，零依赖）
 */
import { createInterface } from 'node:readline';

function ask(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

/**
 * 交互式询问用户配置
 * @param {import('./detect.mjs').DetectResult} detected
 */
export async function promptUser(detected) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  console.log('');
  console.log('🔍 项目检测结果:');
  console.log(`   框架:       ${detected.framework}`);
  console.log(`   打包器:     ${detected.bundler}`);
  console.log(`   语言:       ${detected.language}`);
  console.log(`   路由候选:   ${detected.routeCandidates.join(', ') || '(未找到)'}`);
  console.log('');

  console.log('📝 请配置部署工作流:\n');

  // 1. 路由文件
  let routesFile;
  if (detected.routeCandidates.length === 1) {
    const def = detected.routeCandidates[0];
    const ans  = await ask(rl, `? 路由文件路径 (${def}): `);
    routesFile = ans || def;
  } else if (detected.routeCandidates.length > 1) {
    console.log('  检测到多个候选路由文件:');
    detected.routeCandidates.forEach((f, i) => console.log(`    ${i + 1}. ${f}`));
    const ans = await ask(rl, `? 请选择序号或输入路径 (1): `);
    const idx = parseInt(ans, 10);
    if (!isNaN(idx) && idx >= 1 && idx <= detected.routeCandidates.length) {
      routesFile = detected.routeCandidates[idx - 1];
    } else {
      routesFile = ans || detected.routeCandidates[0];
    }
  } else {
    const def = detected.framework === 'React' ? 'src/routes.tsx' : 'src/router/index.ts';
    const ans  = await ask(rl, `? 路由文件路径 (${def}): `);
    routesFile = ans || def;
  }

  // 2. 部署分支
  const branch = await ask(rl, '? 部署分支 (master): ') || 'master';

  // 3. 站点域名
  const domain = await ask(rl, '? 站点域名（不含协议，如 www.example.com）: ');
  if (!domain) {
    console.error('✗ 域名不能为空');
    rl.close();
    process.exit(1);
  }

  // 3b. 协议选择
  const protocolInput = await ask(rl, '? 协议 http 或 https (https): ');
  const protocol = (protocolInput.toLowerCase() === 'http') ? 'http' : 'https';

  // 4. Node 版本
  const nodeVersion = await ask(rl, '? Node.js 版本 (20): ') || '20';

  // 5. Python 版本（coscmd 需要）
  const pythonVersion = await ask(rl, '? Python 版本 (3.11): ') || '3.11';

  // 6. 包管理器
  const pm = await ask(rl, '? 包管理器 npm/pnpm/yarn (npm): ') || 'npm';
  const installCmd = pm === 'yarn' ? 'yarn install --frozen-lockfile'
    : pm === 'pnpm' ? 'pnpm install --frozen-lockfile'
    : 'npm ci';

  // 7. 构建命令
  const buildCmd = await ask(rl, '? 构建命令 (npm run build): ') || 'npm run build';

  rl.close();

  return {
    routesFile,
    branch,
    domain,
    protocol,
    nodeVersion,
    pythonVersion,
    installCmd,
    buildCmd,
    framework: detected.framework,
    bundler:   detected.bundler,
    language:  detected.language,
  };
}
