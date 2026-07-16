# 项目交接上下文 — 湘泰物流财务管理系统

## 项目目标
这是一个物流公司内部财务管理系统（xtcwxt），你担任的角色是**全栈开发 + 部署运维**。用于管理拼柜/装柜数据、生成客户账单（CNY / THB 双币种）、支出/收入记录、客户评级等。

## 当前进度

**已完成的：**
1. 全系统 `amountCents` → `amount` 字段重命名，去除误导性 `_cents` 后缀
2. 价格矩阵从单套 6 个价格改为 4 仓库 × 6 价格，支持按仓库取价（义乌/广州/东莞/深圳）
3. 新增 THB 泰铢币种全链路：客户管理 → 价格矩阵 → 账单生成 → 刷新/导出
4. 客户管理 / 账单管理 页面改为 CNY / THB 标签页切换模式
5. 支出总表、收入总表、仪表盘、月度报表、客户账期配套 CNY/THB 分版
6. 账单详情页明细表格加边框、运单号列、仓库列
7. 账单管理改为表格视图 + 按月分组 + 币种标签
8. 上传页加月份选择器
9. 账单编号 CNY：`唛头-年月`，THB：`唛头-年月-THB`
10. 生成账单合并逻辑：不删旧数据，累加金额；已付款/付过款的账单自动跳过
11. 多项安全/空指针/运行时修复（fetch try/catch、事务、鉴权）
12. 装柜上传功能（复用拼柜解析流程）
13. 删除批次级联删关联账单
14. login 页面 `credentials: 'include'` 修复 Cookie 存储问题

## 技术栈
- 前端：Next.js 16 (Turbopack), React, Tailwind, shadcn/ui (Base UI)
- 后端：Next.js API Routes (App Router)
- 数据库：SQLite (better-sqlite3 + Drizzle ORM)，文件路径 `data.db`
- 部署：Docker 容器 `caiwuxitong`，宿主机 43.152.224.122，端口 3005，nginx 反代 `xtcwxt.site`
- PM2 管理进程：`finance-system` (Next.js) + `table_parser` (Python)
- 构建命令：`npm run build && pm2 restart finance-system`

## 重要文件

| 文件 | 作用 |
|------|------|
| `src/app/api/ai/classify/route.ts` | 生成账单核心逻辑（按唛头分组、取价、合并、币种） |
| `src/app/api/bills/route.ts` | 账单 PATCH 重算、POST 生成 |
| `src/app/api/bills/refresh/route.ts` | 手动刷新账单金额 |
| `src/app/api/bills/export/route.ts` | 导出 Excel |
| `src/lib/generate-bill-xlsx.ts` | Excel 生成器（模板加载、数据写入、合并单元格） |
| `src/app/(main)/customers/customer-dialog.tsx` | 客户编辑弹窗（跟页面 tab 走，无币种切换） |
| `src/app/(main)/customers/page.tsx` | 客户列表（CNY/THB 标签切换，价格表格） |
| `src/app/(main)/bills/page.tsx` | 账单管理（表格视图，按月分组） |
| `src/app/(main)/bills/[billNo]/page.tsx` | 账单详情 |
| `src/db/schema.ts` | 数据库结构 |
| `src/lib/metrics.ts` | 客户评级计算 |
| `table_parser.py` | Python 表格解析服务（FastAPI，端口 8800） |
| `src/lib/format.ts` | `formatAmount()` 格式化函数 |

## 已经做过的关键决策
1. 金额全部按元存储，不做分÷100 转换
2. `enableMinVolume !== 0` 是关键判断，不要改成 `=== 1`
3. 生成账单合并逻辑：旧明细不删，新明细追加，金额累加
4. 已付款账单自动跳过，不追加新数据
5. 账单编号含币种后缀区分 CNY/THB
6. 价格矩阵格式：`{"义乌仓":{"sea_regular":550,...}, ...}`
7. 低消规则：海运 0.5 方 / 陆运 0.3 方，`enableMinVolume` 控制启停
8. 导入数据时 `customerId` 直接取 `mark.customerId`
9. `.env` 文件不在 git 中，部署后需手动创建，包含 `DEEPSEEK_API_KEY` 等
10. **绝不用 `git reset --hard` 覆盖服务器代码**
11. **用文件脚本（`/tmp/xxx.js`）上传修改，不要用 bash 内联 node/sed**——内联引号总是出错

## 当前问题
暂无阻塞问题。THB 全链路已打通。

## 注意事项
- 不要删除已有代码
- 不要重构无关文件
- 修改前先说明要改哪些文件
- 服务器容器内 `git pull` 可能失败（无 SSH 密钥），需上传文件脚本
- 远程改代码用文件脚本→上传→构建的流程，不要用 sed 内联
- `npm run build` 可能因内存不足导致服务器崩溃（注意观察 pm2 重启次数）
