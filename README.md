# 环球股票分析 GlobalStock

深市 / 沪市 / 港股 / 美股 行情与涨跌预测网站。Node.js + Express + MongoDB Atlas + ECharts，部署于 Render（免费套餐）。

## 在线访问

- 站点首页：https://global-stock-analyzer.onrender.com
- 健康检查：https://global-stock-analyzer.onrender.com/api/health
- 源码仓库：https://github.com/Farmersteve121/global-stock-analyzer

> Render 免费实例闲置约 15 分钟会休眠，休眠后首次访问需 30~60 秒冷启动唤醒。

### 当前部署信息

| 项目 | 值 |
| --- | --- |
| Render 服务名 / ID | `global-stock-analyzer` / `srv-db145jvavr4c73a648og` |
| 区域 / 套餐 | singapore / free |
| 仓库与分支 | `Farmersteve121/global-stock-analyzer` @ `main`（autoDeploy 已开启） |
| MongoDB Atlas | 免费 M0 集群，数据库 `stock_analyzer`（连接串仅通过 Render 环境变量 `MONGODB_URI` 注入，不入库） |
| 集合与索引 | `cache`（`updatedAt` TTL 3600s）、`favorites`（`clientId+symbol` 唯一索引） |

## 功能特性

- 全球指数行情：上证指数、深证成指、创业板指、科创50、恒生指数、恒生科技指数、道琼斯、标普500、纳斯达克
- 四大市场精选热门股票实时行情（腾讯行情源，约 15 分钟延迟），支持代码/名称搜索
- 个股详情：近 6 个月日K线（Yahoo Finance 主源，失败自动回退腾讯日K / Stooq）、成交量、MA5/10/20/60、MACD、RSI、BOLL
- AI 涨跌预测：多因子技术模型（趋势动量、MACD、RSI、均线位置、量能确认）输出下一交易日方向（上涨/下跌/震荡）+ 置信度 + 1日/5日参考区间 + 模型历史回测胜率
- 自选股收藏：localStorage clientId + MongoDB Atlas 持久化
- 行情缓存：MongoDB TTL 索引自动过期，降低上游请求压力

## 技术栈与目录结构

    stock-analyzer/
    ├── server.js            # Express 入口与全部 API
    ├── lib/
    │   ├── stocks.js        # 精选股票池（约 190 只）+ 指数 + 代码映射
    │   ├── yahoo.js         # Yahoo Finance 日K（含回退源）
    │   ├── tencent.js       # 腾讯批量实时行情（GBK 解码）
    │   ├── indicators.js    # 技术指标 + 多因子涨跌预测 + 回测
    │   └── db.js            # MongoDB Atlas（缓存/收藏，内存回退）
    ├── public/              # 前端静态页面（原生 JS + ECharts）
    ├── render.yaml          # Render Blueprint 部署配置
    └── package.json

## 本地运行

    npm install
    node server.js

打开 http://localhost:3000 。未配置 MONGODB_URI 时自动使用内存模式（收藏与缓存不持久化）。

## 部署到 Render + MongoDB Atlas

### 1. MongoDB Atlas：准备连接串（免费 M0 集群）

1. 打开 https://cloud.mongodb.com 并登录
2. 创建免费 M0 集群（区域任意，建议就近选择）
3. Database Access → Add New Database User → 设置用户名/密码（记好）
4. Network Access → Add IP Address → 选择 Allow Access from Anywhere（0.0.0.0/0）
5. 回到集群页 → Connect → Drivers → 复制连接串，形如：

    mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority

   注意：把 <user>/<password> 换成真实值；密码含特殊字符时需 URL 编码。

### 2. Render：一键部署

方式一（推荐）：点击下方按钮（替换为你自己的仓库地址）

    https://render.com/deploy?repo=https://github.com/Farmersteve121/global-stock-analyzer

方式二：Render 控制台 → New + → Blueprint → 连接 GitHub 选择本仓库 → 在环境变量页面填入 MONGODB_URI → Apply → 等待部署完成。

方式三（全自动 API 部署）：在 Render 控制台 → Account Settings → API Keys 创建 Key 后，本地运行：

    RENDER_API_KEY=rnd_你的Key MONGODB_URI=你的连接串 node scripts/deploy-render.js

脚本会创建服务、等待上线并输出服务地址（MONGODB_URI 可省略，稍后在控制台补填）。

### 3. 验证

- 访问 Render 分配的 https://xxx.onrender.com 即可看到网站
- 访问 https://xxx.onrender.com/api/health 应返回 {"ok":true,"db":"mongodb",...}，说明 Atlas 已连上
- 一键冒烟测试：node scripts/smoke.js https://xxx.onrender.com --require-mongo（全部 PASS 即部署成功）
- 免费实例闲置约 15 分钟会休眠，首次唤醒需 30~60 秒

## 环境变量

| 变量 | 说明 |
| --- | --- |
| MONGODB_URI | MongoDB Atlas 连接串（必填；缺省自动回退内存模式） |
| PORT | 端口（Render 自动注入，本地默认 3000） |

## 免责声明

本网站所有行情数据来自第三方公开接口，可能存在延迟或误差；涨跌预测为基于历史技术指标的统计模型输出，仅供研究参考，不构成任何投资建议。股市有风险，投资需谨慎。

## License

MIT
