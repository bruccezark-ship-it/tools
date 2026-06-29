#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const projectRoot = process.cwd();
const uploadDir = path.join(projectRoot, 'assets', 'uploads');
const subDirs = ['images', 'docs', 'other'];

function initUploadDirs() {
  console.log('初始化文件上传目录结构...');
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log(`✓ 创建目录: ${uploadDir}`);
  } else {
    console.log(`○ 目录已存在: ${uploadDir}`);
  }

  subDirs.forEach(dir => {
    const fullPath = path.join(uploadDir, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`✓ 创建目录: ${fullPath}`);
    } else {
      console.log(`○ 目录已存在: ${fullPath}`);
    }
  });

  const gitignorePath = path.join(uploadDir, '.gitkeep');
  if (!fs.existsSync(gitignorePath)) {
    fs.writeFileSync(gitignorePath, '');
    console.log('✓ 创建 .gitkeep 文件');
  }

  console.log('\n目录结构初始化完成！');
  console.log(`\n上传文件将保存在: ${uploadDir}`);
  console.log('  - images/  - 图片文件');
  console.log('  - docs/    - 文档文件');
  console.log('  - other/   - 其他类型文件');
}

function listUploadedFiles() {
  console.log('已上传的文件列表:\n');
  
  if (!fs.existsSync(uploadDir)) {
    console.log('上传目录不存在，请先运行 init 命令创建目录。');
    return;
  }

  let totalFiles = 0;
  
  subDirs.forEach(dir => {
    const dirPath = path.join(uploadDir, dir);
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath).filter(f => f !== '.gitkeep');
      if (files.length > 0) {
        console.log(`[${dir}/]`);
        files.forEach(file => {
          const filePath = path.join(dirPath, file);
          const stats = fs.statSync(filePath);
          const size = formatFileSize(stats.size);
          console.log(`  - ${file} (${size})`);
          totalFiles++;
        });
        console.log('');
      }
    }
  });

  if (totalFiles === 0) {
    console.log('暂无上传的文件。');
  } else {
    console.log(`共 ${totalFiles} 个文件`);
  }
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function saveTextFile(filename, content, type = 'other') {
  if (!subDirs.includes(type)) {
    type = 'other';
  }
  
  const targetDir = path.join(uploadDir, type);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  let targetPath = path.join(targetDir, filename);
  let counter = 1;
  const ext = path.extname(filename);
  const baseName = path.basename(filename, ext);

  while (fs.existsSync(targetPath)) {
    targetPath = path.join(targetDir, `${baseName}_${counter}${ext}`);
    counter++;
  }

  fs.writeFileSync(targetPath, content, 'utf-8');
  console.log(`✓ 文件已保存: ${targetPath}`);
  return targetPath;
}

const command = process.argv[2];

switch (command) {
  case 'init':
    initUploadDirs();
    break;
  case 'list':
    listUploadedFiles();
    break;
  case 'save':
    const filename = process.argv[3];
    const content = process.argv[4];
    const type = process.argv[5] || 'other';
    if (!filename || content === undefined) {
      console.log('用法: file-manager.js save <filename> <content> [type]');
      process.exit(1);
    }
    saveTextFile(filename, content, type);
    break;
  default:
    console.log('文件管理工具');
    console.log('');
    console.log('用法:');
    console.log('  file-manager.js init    - 初始化上传目录结构');
    console.log('  file-manager.js list    - 列出已上传的文件');
    console.log('  file-manager.js save <filename> <content> [type]  - 保存文本文件');
    console.log('');
    console.log('文件类型: images, docs, other');
}
