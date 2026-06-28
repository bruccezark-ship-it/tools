/**
 * 生成 .github/workflows/deploy-cos.yml 内容
 * @param {object} cfg - 用户配置 (来自 prompts)
 */
export function generateWorkflowYaml(cfg) {
  // 生成 sitemap 步骤中调用的脚本路径
  const sitemapScript = 'scripts/generate-sitemap.mjs';

  return `name: Deploy to Tencent COS

on:
  push:
    branches:
      - ${cfg.branch}
  workflow_dispatch:  # Allow manual trigger

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '${cfg.nodeVersion}'

      - name: Debug - list root files
        run: |
          echo "=== Root directory ==="
          ls -la
          echo "=== package files ==="
          ls -la package*.json 2>/dev/null || echo "No package files found!"

      - name: Install dependencies
        run: ${cfg.installCmd}

      - name: Build project
        run: ${cfg.buildCmd}

      - name: Generate sitemap and robots.txt
        env:
          SITE_URL: \${{ secrets.SITE_URL }}
        run: |
          if [ -z "\${SITE_URL}" ]; then
            echo "⚠️  WARNING: SITE_URL is not set, skipping sitemap generation"
            exit 0
          fi

          if [[ "\${SITE_URL}" =~ ^https?:// ]]; then
            FULL_URL="\${SITE_URL}"
          else
            FULL_URL="${cfg.protocol}://\${SITE_URL}"
          fi

          echo "🌐 Using site URL: \${FULL_URL}"

          FULL_URL="\${FULL_URL}" OUTPUT_DIR="./dist" node ${sitemapScript}

          echo "📄 sitemap.xml preview:"
          head -12 ./dist/sitemap.xml
          echo "📄 robots.txt:"
          cat ./dist/robots.txt

      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '${cfg.pythonVersion}'

      - name: Install coscmd
        run: pip install coscmd

      - name: Configure coscmd
        env:
          COS_SECRET_ID: \${{ secrets.COS_SECRET_ID }}
          COS_SECRET_KEY: \${{ secrets.COS_SECRET_KEY }}
          COS_BUCKET: \${{ secrets.COS_BUCKET }}
          COS_REGION: \${{ secrets.COS_REGION }}
        run: |
          echo "Checking COS configuration..."
          if [ -z "\${COS_SECRET_ID}" ]; then echo "ERROR: COS_SECRET_ID is empty!"; exit 1; fi
          if [ -z "\${COS_SECRET_KEY}" ]; then echo "ERROR: COS_SECRET_KEY is empty!"; exit 1; fi
          if [ -z "\${COS_BUCKET}" ]; then echo "ERROR: COS_BUCKET is empty!"; exit 1; fi
          if [ -z "\${COS_REGION}" ]; then echo "ERROR: COS_REGION is empty!"; exit 1; fi
          echo "All COS secrets are set (length: ID=\${#COS_SECRET_ID}, KEY=\${#COS_SECRET_KEY})"
          coscmd config -a "\${COS_SECRET_ID}" -s "\${COS_SECRET_KEY}" -b "\${COS_BUCKET}" -r "\${COS_REGION}"
          echo "coscmd config done"

      - name: Upload to COS (incremental + delete old files)
        env:
          COS_TARGET_PATH: \${{ secrets.COS_TARGET_PATH || 'Default' }}
        run: |
          coscmd upload -r ./dist/ "\${COS_TARGET_PATH}" --delete --force

      - name: Summary
        run: |
          echo "✅ Deployment completed!"
          echo "📦 Files uploaded from ./dist/ to COS path: \${{ secrets.COS_TARGET_PATH || 'Default' }}"
          echo "🗑️  Old files not present in the new build have been deleted"
          if [ -n "\${{ secrets.SITE_URL }}" ]; then
            SITE_URL="\${{ secrets.SITE_URL }}"
            if [[ "\${SITE_URL}" =~ ^https?:// ]]; then
              DISPLAY_URL="\${SITE_URL}"
            else
              DISPLAY_URL="${cfg.protocol}://\${SITE_URL}"
            fi
            echo "🌐 Site URL: \${DISPLAY_URL}"
            echo "📄 Sitemap: \${DISPLAY_URL}/sitemap.xml"
            echo "🤖 Robots: \${DISPLAY_URL}/robots.txt"
          fi
`;
}
