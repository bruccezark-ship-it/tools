# 文件保存技能 (file-saver)

## 简介

本技能用于将 TRAE 对话框中用户上传的文件和图片保存到当前项目目录中，使项目可以直接使用这些文件。

## 功能特性

- 自动识别用户上传的文件并保存到项目目录
- 按文件类型分类存储（图片、文档、其他）
- 支持文本文件直接保存
- 提供文件管理工具脚本
- 统一的目录结构规范

## 目录结构

```
项目根目录/
├── assets/
│   └── uploads/          # 上传文件保存根目录
│       ├── images/       # 图片文件 (jpg, png, gif, svg 等)
│       ├── docs/         # 文档文件 (pdf, doc, txt, md 等)
│       └── other/        # 其他类型文件
```

## 使用方法

### 方式一：通过对话自然语言调用

在对话中上传文件后，直接说：
- "帮我把这个文件保存到项目里"
- "把这张图片存起来"
- "保存这个配置文件"

AI 助手会自动调用本技能来处理文件保存。

### 方式二：使用管理脚本

在终端中运行辅助脚本：

```bash
# 初始化上传目录结构
node .trae/skills/file-saver/resources/file-manager.js init

# 列出已上传的文件
node .trae/skills/file-saver/resources/file-manager.js list

# 保存文本文件
node .trae/skills/file-saver/resources/file-manager.js save <文件名> <内容> [类型]
```

## 支持的文件类型

### 图片类
- jpg, jpeg, png, gif, svg, webp, bmp, ico

### 文档类
- pdf, doc, docx, txt, md, csv, xls, xlsx, json, yaml, yml, xml

### 代码类
- js, ts, py, java, go, rs, cpp, c, h, html, css

### 其他
- 所有其他类型文件

## 在项目中使用上传的文件

保存后的文件可以像普通项目文件一样使用：

### 在 HTML 中引用图片
```html
<img src="assets/uploads/images/logo.png" alt="Logo">
```

### 在 JavaScript 中导入配置
```javascript
import config from './assets/uploads/config.json';
```

### 在 CSS 中引用背景图
```css
.background {
  background-image: url('../assets/uploads/images/bg.jpg');
}
```

## 注意事项

1. **敏感信息**：请勿上传包含敏感信息（密码、密钥等）的文件
2. **文件大小**：建议不要上传过大的文件，以免影响项目体积
3. **版本控制**：根据需要决定是否将 `assets/uploads/` 添加到 `.gitignore`
4. **图片文件**：图片文件目前需要手动保存到对应目录

## 添加到 .gitignore（可选）

如果不希望上传文件被纳入版本控制，在 `.gitignore` 中添加：

```
assets/uploads/
```

## 故障排除

### 文件没有保存成功？
- 确认使用的是文本文件（图片等二进制文件需要手动保存）
- 检查是否有写入权限
- 确认路径在当前项目目录内

### 技能没有被触发？
- 检查技能是否已启用（设置 → 技能与命令）
- 尝试明确说"保存这个文件"来触发技能
- 确认文件已上传到对话框
