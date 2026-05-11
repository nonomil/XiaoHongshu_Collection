# Chrome Extension MVP

## 目标

这个目录提供一个最小可加载的浏览器插件骨架，用于把当前页面发送到本地工作台：

- 立即保存到本地 ingress
- 加入本地收件箱
- 打开本地工作台

## 本地加载

1. 打开 Chrome 扩展管理页
2. 开启开发者模式
3. 选择“加载已解压的扩展程序”
4. 选择当前目录：

```text
G:\UserCode\XiaoHongshu_Collection\prj\chrome-extension
```

## 依赖

本插件依赖本地 UI 服务已启动：

```text
http://127.0.0.1:3030
```

## 当前状态

当前版本是 MVP：

- 支持读取当前活动标签页 URL
- 支持调用本地 ingress API
- 支持打开工作台

暂不包含：

- 云端目标切换
- 最近任务历史
- 图标资源
- 更复杂的页面解析
