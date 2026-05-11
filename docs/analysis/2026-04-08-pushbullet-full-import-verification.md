# Pushbullet 全量导入隔离验证

日期：2026-04-08

## 验证目标

确认当前修复后的 Pushbullet 同步链路是否满足下面几点：

1. 能通过 API 拉取完整历史，而不是只取最近几十条
2. 首次全量导入时可以使用更大的分页上限
3. 不污染正式 `data/` 与正式 `config/pushbullet.json`
4. 新增的月归档镜像能按 `YYYY/YYYY-MM.jsonl` 生成

---

## 验证方式

本次没有直接写入正式收件箱，而是使用现有正式 token，复制一份临时配置到：

```text
tmp/pushbullet-bootstrap-verify-2026-04-07T23-44-03-912Z/
```

其中：

- 临时配置：`pushbullet.json`
- 临时事实流：`inbox_links.jsonl`
- 临时月归档：`inbox_archive/`

执行模式：

- `mode=bootstrap`
- `maxPages=200`

说明：

- 这是一次“隔离全量导入验证”
- 不会改动正式 `data/inbox_links.jsonl`
- 不会推进正式 `config/pushbullet.json` 中的 `lastModified`

---

## 验证结果

### 1. API 历史拉取结论

本次真实拉取结果：

- `total`: `2432`
- `added`: `2361`
- `skipped`: `71`
- `pagesFetched`: `134`
- `maxPages`: `200`
- `stateAdvanced`: `true`
- `truncated`: `false`

结论：

- Pushbullet API 侧历史数据确实可拉取
- 当前账号并不是“网页端看不到就 API 也没了”
- 之前看起来只能拿到最近几十条，根因是项目默认分页策略过保守

### 2. 时间跨度

最早一条：

- `timestamp`: `1394420663.64505`
- `url`: `http://www.appinn.com/rainy-mood-and-calm-website/`

最新一条：

- `timestamp`: `1775579619.335168`
- `url`: `https://github.com/ShaneZhong/autokaggle`

结论：

- 这次全量导入已经覆盖到 2014 年级别的历史
- 明显早于正式 `data/inbox_links.jsonl` 里原本只到 2019 年的最早记录

### 3. 为什么 `added` 小于 `total`

本次结果里：

- `total = 2432`
- `added = 2361`
- `skipped = 71`

原因是：

- 收件箱事实流仍按 `url` 去重
- Pushbullet 历史中存在重复 URL
- 同一 URL 的重复推送不会重复写入 inbox

这属于预期行为，不是导入失败。

---

## 月归档验证

本次临时月归档结果：

- 共生成 `58` 个月归档文件

示例前几项：

- `inbox_archive/2014/2014-03.jsonl`
- `inbox_archive/2014/2014-04.jsonl`
- `inbox_archive/2014/2014-06.jsonl`
- `inbox_archive/2014/2014-07.jsonl`
- `inbox_archive/2014/2014-08.jsonl`

示例后几项：

- `inbox_archive/2023/2023-08.jsonl`
- `inbox_archive/2023/2023-09.jsonl`
- `inbox_archive/2024/2024-07.jsonl`
- `inbox_archive/2026/2026-03.jsonl`
- `inbox_archive/2026/2026-04.jsonl`

结论：

- 月归档镜像逻辑已经生效
- 时间桶覆盖从早期历史一直到最近月份
- `事实流 + 月归档` 的双层结构可用

---

## 当前判断

这轮验证后，可以明确下结论：

1. Pushbullet 适合继续保留为入口
2. Pushbullet 不适合作为网页端长期回看总库
3. API 完整历史仍然可用，关键在于本地要做长期沉淀
4. 当前项目已经具备“首次全量导入 + 月归档镜像”的基础能力

---

## 建议的实际使用节奏

首次补历史：

```bash
npm run inbox:sync -- --mode bootstrap --max-pages 200
```

日常增量：

```bash
npm run inbox:sync -- --mode latest
```

最近核对：

```bash
npm run inbox:sync -- --mode recent --limit 50
npm run inbox:verify -- --limit 50
```

---

## 已知限制

### 1. 正式主数据还没自动迁移

本次验证用的是临时目录，不是正式 `data/`。

所以：

- 正式收件箱是否要立即补齐到 2014 年历史
- 是否要把正式历史补导入写进主目录

还需要单独决定。

### 2. 小红书正文与评论保存不在这次验证范围内

这次只验证了：

- Pushbullet 历史拉取
- inbox 事实流
- 月归档镜像

没有验证：

- 所有历史链接都还能成功保存成 Markdown
- 小红书历史短链是否都还能在当前环境下完整抓评论

这部分仍应由执行器链路单独验证。

---

## 下一步建议

最值得继续推进的是：

1. 把统一入口 task 元数据补齐
2. 定义 ingress payload 契约
3. 再进入本地 ingress API 与浏览器插件 MVP
