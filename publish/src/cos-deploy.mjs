/**
 * 腾讯云 COS 增量同步部署
 * 
 * 核心策略：
 *  1. 扫描本地 dist 目录所有文件，计算 MD5
 *  2. 列出 COS 目标前缀下所有对象，获取 ETag
 *  3. Diff 对比：本地有+远程无→上传；本地有+远程有+MD5≠ETag→上传；
 *               本地有+远程有+MD5=ETag→跳过；本地无+远程有→删除
 *  4. 并行批量执行上传/删除
 */
import { createHash } from 'node:crypto';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { resolve, relative, join, sep } from 'node:path';
import COS from 'cos-nodejs-sdk-v5';

/**
 * 递归获取目录下所有文件（返回相对路径列表）
 */
function walkDir(dir, baseDir = dir) {
  const results = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push(relative(baseDir, fullPath).split(sep).join('/'));
    }
  }
  return results;
}

/**
 * 计算文件 MD5
 */
function md5File(filePath) {
  const content = readFileSync(filePath);
  return createHash('md5').update(content).digest('hex');
}

/**
 * 构建本地文件清单 Map<相对路径, { hash, size }>
 */
function buildLocalManifest(distDir) {
  const files = walkDir(distDir);
  const manifest = new Map();
  for (const f of files) {
    const absPath = resolve(distDir, f);
    const hash = md5File(absPath);
    manifest.set(f, { hash, size: statSync(absPath).size });
  }
  return manifest;
}

/**
 * 获取 COS 远程对象清单
 * ETag 格式: "abc123" (带双引号)，比较时去掉引号
 */
async function buildRemoteManifest(cos, bucket, region, prefix) {
  const manifest = new Map();
  let marker = undefined;

  while (true) {
    const params = {
      Bucket: bucket, Region: region,
      Prefix: prefix, MaxKeys: 1000,
    };
    if (marker) params.Marker = marker;

    const result = await new Promise((resolve, reject) => {
      cos.getBucket(params, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    if (result.Contents) {
      for (const obj of result.Contents) {
        const key = obj.Key;
        if (!key.startsWith(prefix)) continue;
        const relPath = key.slice(prefix.length);
        if (!relPath || relPath.endsWith('/')) continue;
        const etag = (obj.ETag || '').replace(/^"(.*)"$/, '$1').toLowerCase();
        manifest.set(relPath, { etag, size: parseInt(obj.Size, 10) });
      }
    }

    if (result.IsTruncated === 'true') {
      marker = result.NextMarker;
    } else {
      break;
    }
  }

  return manifest;
}

/**
 * 上传单个文件到 COS（带重试）
 */
function uploadFile(cos, bucket, region, key, localPath, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      cos.putObject({
        Bucket: bucket, Region: region,
        Key: key, Body: readFileSync(localPath),
      }, (err, data) => {
        if (err) {
          if (n < retries) setTimeout(() => attempt(n + 1), 1000 * (n + 1));
          else reject(err);
        } else resolve(data);
      });
    };
    attempt(0);
  });
}

/**
 * 删除 COS 远程文件（带重试）
 */
function deleteFile(cos, bucket, region, key, retries = 3) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      cos.deleteObject({
        Bucket: bucket, Region: region, Key: key,
      }, (err, data) => {
        if (err) {
          if (n < retries) setTimeout(() => attempt(n + 1), 1000 * (n + 1));
          else reject(err);
        } else resolve(data);
      });
    };
    attempt(0);
  });
}

/**
 * 并发控制工具
 */
async function withConcurrency(tasks, concurrency = 10) {
  const results = [];
  const executing = [];
  for (const task of tasks) {
    const p = Promise.resolve().then(() => task());
    results.push(p);
    if (concurrency <= tasks.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(results);
}

/**
 * 主部署入口
 * @param {object}   cosConfig   - { SecretId, SecretKey, Region, Bucket }
 * @param {string}   targetPath  - COS 前缀，如 /app/
 * @param {string}   distDir     - 本地构建产物目录
 * @param {object}   opts        - { dryRun?: boolean }
 */
export async function deployToCos(cosConfig, targetPath, distDir, { dryRun = false } = {}) {
  const { SecretId, SecretKey, Region, Bucket } = cosConfig;

  console.log('☁️  连接腾讯云 COS...');
  const cos = new COS({ SecretId, SecretKey });

  // COS Key 不以 / 开头
  const prefix = targetPath.replace(/^\/+/, '');

  console.log(`📊 扫描本地文件: ${distDir}`);
  const localManifest = buildLocalManifest(distDir);
  console.log(`  📁 本地文件: ${localManifest.size} 个`);

  console.log(`📊 获取远程对象列表: Bucket=${Bucket}, Prefix=${prefix}`);
  const remoteManifest = await buildRemoteManifest(cos, Bucket, Region, prefix);
  console.log(`  ☁️  远程对象: ${remoteManifest.size} 个`);

  // Diff
  const toUpload = [];
  const toDelete = [];
  const skipped = [];

  for (const [relPath, info] of localManifest) {
    const remote = remoteManifest.get(relPath);
    if (!remote) {
      toUpload.push({ relPath, hash: info.hash, size: info.size });
    } else if (remote.etag !== info.hash.toLowerCase()) {
      // ETag ≠ MD5 → 内容已变更，必须上传
      toUpload.push({ relPath, hash: info.hash, size: info.size });
    } else {
      skipped.push({ relPath });
    }
  }

  for (const relPath of remoteManifest.keys()) {
    if (!localManifest.has(relPath)) {
      toDelete.push({ relPath });
    }
  }

  // 输出 diff 摘要
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  📊 增量同步摘要');
  console.log(`    ⬆️  上传 (新增/变更): ${toUpload.length} 个`);
  console.log(`    🗑️  删除 (远程多余):  ${toDelete.length} 个`);
  console.log(`    ✅  跳过 (无变化):    ${skipped.length} 个`);
  console.log('═══════════════════════════════════════════');
  console.log('');

  if (toUpload.length > 0) {
    console.log('📤 将上传:');
    for (const f of toUpload) {
      console.log(`    + ${f.relPath}  (${(f.size / 1024).toFixed(1)} KB)`);
    }
    console.log('');
  }
  if (toDelete.length > 0) {
    console.log('🗑️  将删除:');
    for (const f of toDelete) {
      console.log(`    - ${f.relPath}`);
    }
    console.log('');
  }

  if (dryRun) {
    console.log('🔍 试运行模式 — 未执行实际同步');
    return { uploaded: toUpload.length, deleted: toDelete.length, skipped: skipped.length };
  }

  if (toUpload.length === 0 && toDelete.length === 0) {
    console.log('✅ 无变更，无需同步');
    return { uploaded: 0, deleted: 0, skipped: skipped.length };
  }

  // 执行上传
  if (toUpload.length > 0) {
    console.log(`⬆️  开始上传 ${toUpload.length} 个文件...`);
    let uploaded = 0;
    const uploadTasks = toUpload.map(({ relPath }) => async () => {
      const key = prefix + relPath;
      await uploadFile(cos, Bucket, Region, key, resolve(distDir, relPath));
      uploaded++;
      process.stdout.write(`\r  上传中... ${uploaded}/${toUpload.length}`);
    });
    await withConcurrency(uploadTasks, 10);
    console.log(`\n  ✅ 上传完成 (${uploaded} 个文件)`);
  }

  // 执行删除
  if (toDelete.length > 0) {
    console.log(`🗑️  开始清理 ${toDelete.length} 个远程多余文件...`);
    if (toDelete.length <= 5) {
      for (const { relPath } of toDelete) {
        await deleteFile(cos, Bucket, Region, prefix + relPath);
        console.log(`  已删除: ${relPath}`);
      }
    } else {
      const objects = toDelete.map(({ relPath }) => ({ Key: prefix + relPath }));
      for (let i = 0; i < objects.length; i += 1000) {
        const batch = objects.slice(i, i + 1000);
        await new Promise((res, rej) =>
          cos.deleteMultipleObject({
            Bucket, Region, Objects: batch,
          }, (e, d) => e ? rej(e) : res(d))
        );
      }
      console.log(`  ✅ 已删除 ${toDelete.length} 个文件`);
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  🎉 部署完成!');
  console.log(`    ⬆️  上传: ${toUpload.length} 个`);
  console.log(`    🗑️  删除: ${toDelete.length} 个`);
  console.log(`    ✅  跳过: ${skipped.length} 个`);
  console.log('═══════════════════════════════════════════');

  return { uploaded: toUpload.length, deleted: toDelete.length, skipped: skipped.length };
}