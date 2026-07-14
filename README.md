# 我的冰箱

一个自用的移动端冰箱管理 PWA，用来记录冰箱库存、安排每天早/中/晚做什么菜、自动沉淀菜谱，并统计食材消耗。

## 项目来源

本项目基于 `Next.js Native App Template` 改造而来。原模板是一个 Workout Tracker，提供了移动端原生感较强的基础设施：

- Next.js 16 App Router
- React 19 + TypeScript
- Tailwind CSS 4
- shadcn/ui 风格组件
- PWA / Add to Home Screen
- 横向滑动 Tab
- iOS PWA 底部导航和安全区适配

当前业务功能已替换为个人冰箱应用，但仍保留了模板里的移动端 AppShell、底部 Tab、PWA 布局和部分通用 UI 组件。

## 功能

- 冰箱库存：添加食材、单位、数量
- 库存编辑：修改数量和单位，左滑删除食材
- 做菜计划：点按食材安排做菜，长按进入多选食材
- 多食材用量：安排做菜时分别填写每个食材消耗量
- 日历：按周查看早上、中午、晚上安排的菜
- 日历详情：点进某餐查看完整菜品和食材消耗
- 菜谱：做过的菜自动加入菜谱
- 我的：查看食材总消耗量、做菜数目、菜谱数量
- 恢复记录：从消耗记录中提取，删除日历记录并恢复库存
- 数据库：通过 Neon PostgreSQL 保存数据

## 技术栈

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- lucide-react
- Neon PostgreSQL
- `@neondatabase/serverless`
- Vercel

## 本地安装

```bash
npm install
```

创建本地环境变量文件：

```bash
cp .env.example .env.local
```

在 `.env.local` 中填入 Neon 数据库连接串：

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

启动开发服务：

```bash
npm run dev
```

默认端口来自 `package.json`：

```text
http://localhost:3512
```

如果修改了 `.env.local`，需要重启 `npm run dev`，Next.js 才会重新读取环境变量。

## Neon 免费数据库配置

1. 打开 Neon 官网并注册账号：

   ```text
   https://neon.com
   ```

2. 创建一个免费项目。

3. 在 Neon 控制台中找到 `Connect`，复制 PostgreSQL 连接串。

4. 推荐创建两个分支：

   - `production`：线上 Vercel Production 使用
   - `develop`：本地开发和 Vercel Preview 使用

5. 本地 `.env.local` 使用 develop 分支连接串：

   ```env
   DATABASE_URL=postgresql://...develop-branch...?sslmode=require&channel_binding=require
   ```

6. 第一次访问应用时，服务端会自动创建表：

   ```sql
   CREATE TABLE IF NOT EXISTS fridge_state (
     id TEXT PRIMARY KEY,
     data JSONB NOT NULL,
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );
   ```

当前版本为了保持第一版简单，使用 PostgreSQL 的 `JSONB` 字段保存整份冰箱状态。数据库仍然是 PostgreSQL，不是单独的 JSON 数据库。后续如果需要复杂统计、多用户或共享冰箱，可以再拆成关系型表。

## 验证数据库写入

启动应用后，添加一个食材，然后在 Neon SQL Editor 执行：

```sql
select id, data, updated_at
from fridge_state;
```

如果看到 `id = default` 的记录，说明应用已经成功写入 Neon。

## 部署到 Vercel

1. 将代码推送到 GitHub。

2. 打开 Vercel：

   ```text
   https://vercel.com
   ```

3. `Add New...` -> `Project`，选择 GitHub 仓库并导入。

4. Framework Preset 选择或保持为：

   ```text
   Next.js
   ```

5. Build 设置通常不用改：

   ```text
   Install Command: npm install
   Build Command: npm run build
   Output Directory: 留空
   ```

6. 在 Vercel 项目中配置环境变量：

   `Settings` -> `Environment Variables`

   添加：

   ```text
   Name: DATABASE_URL
   Value: 你的 Neon PostgreSQL 连接串
   ```

7. 推荐环境变量分配：

   - Production：Neon production 分支连接串
   - Preview：Neon develop 分支连接串
   - Development：Neon develop 分支连接串

8. 点击 Deploy。

9. 部署后，在网页里添加一个食材，再去 Neon SQL Editor 查询 `fridge_state`，确认线上也能写入。

## 分支建议

推荐使用：

```text
main       -> Vercel Production -> Neon production
develop    -> Vercel Preview    -> Neon develop
```

如果现在只有 `develop` 分支，也可以先把 Vercel Production Branch 设置为 `develop`。等项目稳定后再拆出 `main`。

## 环境变量安全

不要提交真实数据库连接串。

本项目中：

- `.env.local`：本地真实配置，已被 `.gitignore` 忽略
- `.env.example`：示例配置，可以提交
- Vercel 环境变量：在 Vercel Dashboard 中配置

如果连接串或密码曾经公开过，建议在 Neon 控制台里重置密码，然后同步更新：

- 本地 `.env.local`
- Vercel 的 `DATABASE_URL`

## 常用命令

```bash
npm install
npm run dev
npm run build
npx eslint src/components/fridge/FridgeApp.tsx
```

## 目录结构

```text
src/
├── app/
│   ├── api/fridge/route.ts      # 冰箱数据 API，读写 Neon
│   ├── page.tsx                 # 主入口，四个底部 Tab
│   ├── layout.tsx               # metadata、PWA、字体和主题初始化
│   ├── calendar/page.tsx        # 日历 Tab 刷新重定向
│   ├── recipes/page.tsx         # 菜谱 Tab 刷新重定向
│   └── me/page.tsx              # 我的 Tab 刷新重定向
├── components/
│   ├── fridge/FridgeApp.tsx     # 冰箱业务 UI 和状态逻辑
│   ├── shared/AppShell.tsx      # 移动端外壳和底部导航
│   ├── shared/TabContext.tsx    # 横向 Tab 滑动和 URL 同步
│   └── ui/                      # 通用 UI 组件
└── lib/
    └── server/fridge-db.ts      # Neon PostgreSQL 连接和建表逻辑
```

## PWA 使用

在 iPhone 上：

1. 用 Safari 打开部署后的站点。
2. 点击分享按钮。
3. 选择 `Add to Home Screen`。
4. 从桌面图标打开后，会以接近原生 App 的全屏方式运行。

