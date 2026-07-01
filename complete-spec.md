# 货运财务系统 · 完整数据库定义 + 页面说明

## 1. 数据库（SQLite WAL 模式，Drizzle ORM）

### customers（客户）
- id: integer primary key
- name: text not null
- contact: text
- price_matrix: text (JSON, 如 {"sea_regular":300,"sea_inspection":450,"sea_sensitive":600,"land_regular":400,"land_inspection":550,"land_sensitive":700})
- default_currency: text default 'CNY' (CNY/THB)
- remark: text

### suppliers（供应商）
- id: integer primary key
- name: text not null
- type: text (车队/报关行/仓库/船司/其他)
- contact: text
- default_currency: text default 'CNY'
- remark: text

### shipments（票货 — 核心表）
- id: integer primary key
- shipment_no: text unique not null (自动生成: SHIP-202607-0001)
- customer_id: integer references customers(id)
- shipment_type: text not null (sea/land)
- goods_type: text not null (regular/inspection/sensitive)
- volume: real not null (立方米)
- unit_price_cents: integer not null (实际单价，单位：分)
- total_receivable_cents: integer not null (volume * unit_price)
- currency: text default 'CNY' (收款币种)
- status: text default '运输中' (运输中/已到仓/已签收/已结算)
- month_tag: text not null (如 '2026-07')
- bl_no: text (提单号)
- container_no: text (柜号)
- etd: text (预计离港)
- eta_bkk: text (预计到曼谷)
- remark: text
- created_at: text default current_timestamp

### shipment_costs（票货成本明细）
- id: integer primary key
- shipment_id: integer references shipments(id)
- cost_type: text not null (国内拖车费/装柜费/报关费/海运费/清关费/THC/文件费/仓储费/派送费/杂费)
- amount_cents: integer not null
- currency: text default 'CNY' (CNY/THB)
- supplier_id: integer references suppliers(id) (nullable)
- remark: text

### payments_received（客户回款）
- id: integer primary key
- customer_id: integer references customers(id)
- amount_cents: integer not null
- currency: text default 'CNY'
- received_date: text not null
- remark: text

### payment_shipment_allocations（回款按票分摊）
- id: integer primary key
- payment_received_id: integer references payments_received(id)
- shipment_id: integer references shipments(id)
- amount_cents: integer not null
（一条回款可以分摊到多票，一票也可以被多次回款覆盖）

### payments_made（对供应商付款）
- id: integer primary key
- supplier_id: integer references suppliers(id)
- amount_cents: integer not null
- currency: text default 'CNY'
- paid_date: text not null
- shipment_id: integer references shipments(id) (nullable)
- cost_type: text (对应哪种费用)
- remark: text

### invoices（发票）
- id: integer primary key
- invoice_no: text unique not null
- customer_id: integer references customers(id)
- type: text (应收发票/应付发票)
- status: text default '待开' (待开/已开/已寄出/已收款/已作废)
- total_amount_cents: integer not null
- currency: text default 'CNY'
- issue_date: text
- due_date: text
- remark: text

### invoice_items（发票明细）
- id: integer primary key
- invoice_id: integer references invoices(id)
- shipment_id: integer references shipments(id)
- amount_cents: integer not null

### customer_metrics（客户统计 — 用于优质客户判断）
- id: integer primary key
- customer_id: integer references customers(id) unique
- avg_payment_days: integer (平均回款天数)
- monthly_volume: real (月均货量)
- monthly_shipments: integer (月均票数)
- overdue_count: integer (超期未付票数)
- overall_rating: text (A/B/C/D)
- last_updated: text

### 索引
- shipments(month_tag)
- shipments(customer_id)
- shipment_costs(shipment_id)
- payments_received(customer_id)
- payment_shipment_allocations(shipment_id)
- invoices(customer_id)

## 2. 核心业务逻辑

### 利润计算
单票利润 = total_receivable_cents - SUM(shipment_costs.amount_cents)
（按票实时计算，不额外存储）

### 客户账期查询
应收 = SUM(shipments.total_receivable_cents) WHERE status != '已结算'
已收 = SUM(payment_shipment_allocations.amount_cents) WHERE shipment_id IN (该客户所有票)
未收 = 应收 - 已收

### 回款自动分摊（FIFO）
当录入一笔客户回款时：
1. 获取该客户所有未结清的票（按 created_at 升序）
2. 从最早的票开始，依次扣减回款金额
3. 如果回款金额不够付完一票，该票标记为"部分已收"状态
4. 在 payment_shipment_allocations 中记录每条分摊记录
5. 同步更新客户的 customer_metrics

### 客户评分（定时任务，也可以用手动触发刷新）
- avg_payment_days = AVG(发货日到回款日的天数)
- monthly_volume = AVG(近6个月月度货量)
- 评级规则:
  A: 回款<15天 且 月货量大
  B: 回款15-30天
  C: 回款30-60天
  D: 回款>60天 或 有超期未付

## 3. 页面说明

### 仪表盘 (/)
- 本月营收、本月支出、本月利润（三个卡片）
- 待收总额、待付总额（两个卡片）
- 近期回款记录表格
- 近6个月营收/利润趋势图（柱状图+折线图）
- 客户优质度排行（Top 5）

### 票货列表 (/shipments)
- 表格：票号、客户、体积、应收、成本、利润、状态
- 筛选项：月份、客户、状态、运输方式
- 每票有"详情"按钮

### 新建票货 (/shipments/new)
- 选择客户 → 自动带出该客户的价格矩阵
- 选运输方式（海运/陆运）和货物类型（普货/商检货/敏感货）→ 自动填入默认单价（可手动改）
- 填写体积 → 自动算出应收
- 动态添加各项成本（每项选类型、填金额、选币种、可选对应供应商）

### 票货详情 (/shipments/[id])
- 基本信息卡片
- 成本明细表格（含各项金额、币种、供应商）
- 利润汇总（应收 - 总成本 = 利润）
- 回款记录（该票被分摊到的所有回款）
- 操作：修改状态、修改成本

### 收入总表 (/revenue)
- 按客户或按月份分组汇总
- 表格：客户/月份、票数、总体积、应收、已收、未收
- 点击可下钻查看明细

### 支出总表 (/expenses)
- 按费用类型或按供应商分组汇总
- 表格：费用类型/供应商、金额、币种、票数
- 支持按月份筛选

### 客户账期 (/accounts/customers)
- 每个客户一行：应收、已收、未收、账龄分析
- 账龄：30天内/30-60天/60-90天/90天+ 分别多少钱
- 客户优质度评分卡片：评级、平均回款天数、月均货量
- 点击客户进入账期明细

### 回款录入（在客户账期页或独立入口）
- 选择客户 → 系统列出该客户所有未结清票
- 输入回款金额 → 系统自动按FIFO分摊（显示分摊预览）
- 也支持手动调整分摊
- 确认后写入 payments_received + payment_shipment_allocations

### 供应商应付 (/accounts/suppliers)
- 每个供应商一行：应付、已付、未付
- 支持按月份筛选
- 付款录入按钮

### 月度报表 (/reports/monthly)
- 选择一个月份
- 显示：该月营收（按客户列出）、支出（按费用类型列出）、利润
- 币种分别统计（CNY 一列、THB 一列）
- 导出功能（导出为 CSV/Excel）

### 发票管理 (/invoices)
- 列表：发票号、客户、金额、状态
- 新建发票：选择客户 → 勾选要开票的票货 → 生成发票
- 发票明细：每票一行金额
- 修改发票状态（已开→已寄出→已收款→已作废）

### 客户管理 (/customers)
- 增删改客户
- 编辑价格矩阵（6个价格输入框）

### 供应商管理 (/suppliers)
- 增删改供应商
- 每个供应商标注类型

## 4. 多用户与权限管理

### users 表
- id: integer primary key
- username: text unique not null
- password_hash: text not null
- display_name: text not null
- role: text not null (admin / finance / operator / viewer)
- active: integer default 1

### 角色权限

| 角色 | 可操作范围 |
|------|-----------|
| admin | 全部权限，包括管理用户、删除数据 |
| finance | 全部业务操作 + 财务报表查看，但不能管理用户 |
| operator | 增改票货、成本、回款录入，不能删除、不能看报表、不能管理用户 |
| viewer | 只看所有数据（仪表盘、票货列表、报表），不能增删改 |

### 认证方式
- Lucia Auth（推荐，轻量且 SQLite 友好）或 next-auth
- 密码用 bcrypt 加密
- session 存 cookies
- 前端通过 middleware 检查登录状态和角色权限

## 5. 技术栈要求
- Next.js (App Router)
- shadcn/ui (组件库)
- Tailwind CSS (样式)
- Drizzle ORM + better-sqlite3 (数据库)
- recharts (图表)
- lucide-react (图标)
- SQLite WAL mode 开启
- Lucia Auth（多用户登录）
