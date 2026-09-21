# 离心机转子配平工作台（Centrifuge Rotor Balancing Workbench）

一个用于离心机转子试管配平的 Web 工作台：选择 **8 / 12 / 24 孔** 等角环形转子，录入各槽试管重量、拖拽换位、锁定槽位；界面实时矢量合成显示失衡合力，超阈值时自动枚举**至多两次交换**并推荐最优方案，一键应用并重算。方案可保存在浏览器本地并随时载入。

技术栈：**React 18 + TypeScript + Vite** 前端，**Node.js + Express** 后端（配平计算 API + 静态托管），Docker 多阶段构建。

---

## 一条命令启动

```bash
docker compose up --build
```

启动后访问：

- **地址：** <http://localhost:8080>
- **端口：** `8080`（宿主机与容器一致；可在 `docker-compose.yml` 的 `ports` 中改为其他宿主端口）
- 健康检查：<http://localhost:8080/api/health>

依赖安装与前端构建均已纳入镜像启动流程（多阶段构建内自动 `npm ci` + `npm run build`），无需任何额外初始化步骤。后台运行可加 `-d`：`docker compose up --build -d`。

---

## 功能说明

### 槽位与录入

- 顶栏切换 **8 / 12 / 24 孔** 转子，槽位沿环形等角分布，**1 号槽在正上方（12 点方向），槽号顺时针递增**。
- 转盘下方网格逐槽录入试管重量（克 g），**空槽填 0（留空等同 0）**，不允许负数。
- 阈值可调（默认 1 g），用于判定失衡状态。

### 拖拽换位与锁定

- 在转盘上**按住未锁定槽位拖到另一槽位**即交换两支试管的位置；拖到已锁定槽位会提示拒绝。
- **单击槽位**（或网格中的🔓/🔒按钮）切换锁定；锁定槽位重量不可编辑、不参与任何交换推荐。
- 拖拽时有重量虚影跟随，操作结果以 Toast 反馈。

### 实时失衡显示

- 后端按矢量（力 = 重量 × 槽位方向单位矢量）实时求和，输入后约 150 ms 防抖自动重算。
- 转盘上：
  - **彩色箭头**：合力方向与相对大小（绿 = 完全平衡 / 黄 = 阈值内 / 红 = 超阈值）；
  - **虚线圆**：阈值边界（合力箭头伸出圆即超阈值）；
  - 细灰线为各槽重量矢量参考；红色虚线圈标记合力最接近的槽位。
- 右侧面板给出合力大小、阈值、**方向角（自正上方顺时针）**、最近槽号、x/y 分量与状态徽标。

### 推荐算法（至多两次交换）

仅在合力超过阈值时触发，枚举范围：

1. 单次交换：任意两个**未锁定**槽位之间的交换（无序对，同重量交换自动跳过）；
2. 两次交换：两个交换的**有序执行序列**（共享槽位的两种先后顺序也都会被计算）。

排序键依次为：

1. 交换后合力大小（升序，四舍五入到 1e-6 比较，消除浮点噪声）；
2. 交换次数（同合力时次数少者优先）；
3. 交换槽号序列字典序（按执行顺序展开为 `[槽号…]`，同值方案槽号小的排前）。

展示最佳方案及至多 5 个备选（悬停可预览涉及槽位），并给出枚举方案数与失衡降低量。点击 **「一键应用推荐并重算」** 后重量立即落位并重新发起计算。

### 方案保存 / 载入

- 「保存当前方案」把转子规格、重量、锁定状态、阈值存入浏览器 **localStorage**（可命名）；
- 当前编辑内容也会自动暂存，刷新页面后恢复；
- 已保存方案支持一键**载入**或**删除**。数据不经过任何外部服务。

---

## API

后端在同一端口托管 API 与前端静态文件。

### `POST /api/balance`

请求：

```json
{
  "holeCount": 12,
  "weights": [10, 0, 0, 10.2, 0, 0, 0, 0, 0, 0, 0, 0],
  "locked": [false, false, false, false, false, false, false, false, false, false, false, false],
  "threshold": 1
}
```

响应（超阈值时含 `recommendation` / `alternatives` / `enumeration`）：

```json
{
  "status": "over",
  "resultant": {
    "x": 5.1,
    "y": 18.833459,
    "magnitude": 19.51177,
    "directionDeg": 15.152,
    "nearestSlotIndex": 1
  },
  "enumeration": 442,
  "recommendation": {
    "swaps": [[0, 7]],
    "projectedMagnitude": 0.2,
    "finalWeights": [0, 10.2, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0],
    "improvement": 19.31177,
    "tuple": [1, 0, 7]
  },
  "alternatives": [ /* 最佳方案及至多 5 个备选，按排序键排列 */ ]
}
```

> 上例中把槽 1 的 10 g（而非 10.2 g）换到对侧槽 8，残差只有 0.2 g，优于直觉方案——这正是枚举推荐的意义。

`status` 取值：`balanced`（合力为 0）、`ok`（阈值内）、`over`（超阈值）。参数非法返回 `400` 与错误信息。

### `GET /api/health`

返回 `{ "ok": true }`，供容器健康检查使用。

---

## 本地开发（不使用 Docker）

要求 Node.js ≥ 18。

```bash
# 安装两端依赖
npm run install:all

# 终端 1：启动后端（http://localhost:8080）
npm run dev:server

# 终端 2：启动前端开发服务器（http://localhost:5173，/api 已代理到 8080）
npm run dev:web
```

生产式本地运行：

```bash
npm run install:all
npm run build:web      # 产物输出到 web/dist，由后端静态托管
npm start              # http://localhost:8080
```

## 项目结构

```
.
├── Dockerfile              # 多阶段构建：依赖解析 → 前端构建 → 生产依赖 → 运行
├── docker-compose.yml      # 单服务，映射 8080 端口，含健康检查
├── package.json            # 根级便捷脚本
├── server/                 # Node.js + Express
│   └── src/
│       ├── balancing.js    # 矢量合成与至多两次交换枚举（核心算法）
│       └── server.js       # API + 静态文件托管
└── web/                    # React + TypeScript + Vite
    └── src/
        ├── App.tsx         # 状态管理、防抖计算、保存/载入、一键应用
        ├── components/     # 转子图/状态/推荐/录入表格/方案管理
        ├── api/            # 后端调用封装
        └── lib/            # localStorage 与格式化工具
```

## 停止

```bash
docker compose down
```
