# Job Tracker

一个用于记录求职投递进度的本地 Web App。它可以在电脑和手机上同时使用，由 Mac 作为轻量服务器保存数据，适合跟踪投递岗位、渠道、状态、日期区间和整体转化路径。

## 功能

- 记录公司、岗位、投递日期、投递渠道、状态、优先级、职位链接和备注
- 编辑、删除、快速更新投递状态
- 按关键词、状态、日期区间筛选
- 查看总投递、进行中、面试、有回应比例
- 生成投递路径图：投递 → 有回应 / 无回应 → 面试 → 被拒 / Offer / 放弃
- 下载路径图 SVG 和投递记录 CSV
- 手机和电脑访问同一台 Mac 服务，实现局域网同步

## 本地启动

需要 Mac 上有 Python 3。

```bash
python3 server.py 8092
```

然后在电脑浏览器打开：

```text
http://127.0.0.1:8092/index.html
```

也可以双击：

```text
start-job-tracker.command
```

## 手机上使用

确保 iPhone 和 Mac 连接同一个 Wi-Fi。

先查看 Mac 的局域网 IP，例如：

```bash
ipconfig getifaddr en0
```

如果输出是 `192.168.0.211`，就在 iPhone Safari 打开：

```text
http://192.168.0.211:8092/index.html
```

可以通过 Safari 的分享按钮添加到主屏幕，作为近似 App 的入口使用。

## 数据保存位置

投递数据保存在本机：

```text
data/applications.json
```

删除记录的防复活标记保存在：

```text
data/deleted-applications.json
```

这些文件默认不会提交到 GitHub，避免泄露个人求职记录。

## 项目结构

```text
index.html                 页面结构
styles.css                 视觉样式
app.js                     前端交互和图表生成
server.py                  本地轻后端和数据读写
start-job-tracker.command  一键启动脚本
```

## 隐私说明

这个项目默认只在局域网内使用，不需要账号，也不会把数据上传到第三方服务。GitHub 仓库只保存代码，真实投递数据请保留在本地。
