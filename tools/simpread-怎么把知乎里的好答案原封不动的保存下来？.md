> 本文由 [简悦 SimpRead](http://ksria.com/simpread/) 转码， 原文地址 [www.zhihu.com](https://www.zhihu.com/question/30693101/answer/2017164863709913682) ![](https://picx.zhimg.com/v2-bb422c33dff39fb6b86240c390f407fd_l.jpg?source=2c26e567)chouheiwa​

写在最前面:

目前所有的资源地址:

1.  Chrome 商店:(需要科学上网)

[https://chromewebstore.google.com/detail/mhcbgjkaeleolahjpjgbdjppnaimpaie?utm_source=item-share-cb](https://link.zhihu.com/?target=https%3A//chromewebstore.google.com/detail/mhcbgjkaeleolahjpjgbdjppnaimpaie%3Futm_source%3Ditem-share-cb)

2. Edge 商店:（目前最新版本仍在审核）

[知乎文章下载器 - Microsoft Edge Add-ons](https://link.zhihu.com/?target=https%3A//microsoftedge.microsoft.com/addons/detail/hancngfbcenkhbcabdgfkkhccbgfllpf)

3. Github 地址: （release 中包含最新版本的改动，可以导入到所有 chromium 内核的浏览器中）

[https://github.com/chouheiwa/download-zhihu](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu)

* * *

告别收藏吃灰：一键把知乎好文存成 Markdown
-------------------------

我写 iOS 写了快十年，[Obsidian](https://zhida.zhihu.com/search?content_id=773412127&content_type=Answer&match_order=1&q=Obsidian&zhida_source=entity) 是我这两年最离不开的工具之一。技术笔记、读书摘要、项目复盘，全部用 Markdown 管理。但有一个场景一直让我很烦：知乎上刷到一篇好文章，想存进知识库，手动复制粘贴过来，格式全崩了。代码块变成纯文本，表格直接消失，[LaTeX](https://zhida.zhihu.com/search?content_id=773412127&content_type=Answer&match_order=1&q=LaTeX&zhida_source=entity) 公式更别提了。更气人的是，有些文章收藏了半年再去看，作者把内容删了，连渣都不剩。

其实吧，我之前也试过一些浏览器端的剪藏工具，但对知乎的适配普遍不好。知乎的 DOM 结构有自己的一套逻辑，链接卡片、视频占位符、数学公式这些组件，通用的 [Web Clipper](https://zhida.zhihu.com/search?content_id=773412127&content_type=Answer&match_order=1&q=Web+Clipper&zhida_source=entity) 基本都搞不定。所以我干脆自己动手，写了一个 Chrome 扩展，专门解决这个问题。

它能干什么：一句话概括
-----------

**打开知乎页面，点一下按钮，整篇文章变成高质量 Markdown 文件下载到本地。** 不需要 API Key，不需要任何额外配置，只要你知乎是登录状态就行。

说白了，就是把你在知乎上看到的任何内容，变成你自己可控的本地文件。

![](https://picx.zhimg.com/50/v2-08aebf5b3fdf05ed811383dfdd2e1c0e_720w.jpg?source=2c26e567)

这个流程全部在浏览器本地完成，不经过任何服务器。扩展只申请了 **[activeTab](https://zhida.zhihu.com/search?content_id=773412127&content_type=Answer&match_order=1&q=activeTab&zhida_source=entity)** 权限，只在你主动点击时才读取当前页面，不会偷偷注入任何其他网站。作为一个开发者，我自己也很在意扩展的权限问题，所以从一开始就把隐私底线卡死了。

五种知乎内容，全部覆盖
-----------

知乎的内容形态其实挺碎的。专栏文章、问题回答、整个问题页、想法动态、收藏夹，这五种内容的 DOM 结构都不一样，解析逻辑也得分别写。通用剪藏工具搞不定知乎，很大程度上就是因为没有针对这些差异做适配。

![](https://picx.zhimg.com/50/v2-1ed03b1830396ee7fe588b3447b58823_720w.jpg?source=2c26e567)

你猜怎么着，用得最多的反而不是单篇文章导出，而是收藏夹的批量导出。这个后面单独说。

转换质量：不是简单的复制粘贴
--------------

我为什么要自己写而不用现成的工具？核心原因就是转换质量。把知乎文章复制到 Markdown 编辑器里，你会发现几个问题：LaTeX 公式丢了，代码块没有语言标记，表格变成一行纯文本，知乎特有的链接卡片直接消失。

这个扩展的解析器是针对知乎的 DOM 结构专门写的。它能完整保留 **LaTeX 数学公式**（行内 `$...$` 和块级 `$$... $$` 都支持）、**带语法高亮标记的代码块**、**完整的表格结构**、**脚注引用**，甚至知乎特有的链接卡片和视频占位符也会转换成合理的 Markdown 格式。说白了，导出的文件丢进 Obsidian 或 Typora，几乎不需要二次编辑就能直接用。

勾选**下载图片**选项后，工具会自动抓取文章里所有图片，和 Markdown 文件一起打包成 ZIP。图片链接会自动替换成本地相对路径，断网也能正常查看。这对我来说很重要，因为知乎的图片 CDN 链接是有时效性的，过段时间可能就 403 了。

![](https://pica.zhimg.com/50/v2-8cfd6047d70b03dacfd62bab89ab3da0_720w.jpg?source=2c26e567)![](https://picx.zhimg.com/v2-a9636a1364fc7d1f44fc8e5447e01227_r.jpg?source=2c26e567)

收藏夹批量导出：杀手级功能
-------------

其实吧，单篇导出只是基本功。真正让我自己用得最爽的是收藏夹批量导出。

我知乎收藏夹里躺了 **300 多篇** 技术文章，从 Go 调度器到 Redis 持久化到 TCP 底层原理，攒了两三年。一直想整理进 Obsidian 做系统化归档，但一篇篇手动复制，想想就放弃了。这个功能做出来之后，打开收藏夹页面，点一下，等它跑完，全部到手。

技术上这个功能倒是最复杂的。知乎收藏夹页面默认只加载前 20 条，剩下的靠滚动懒加载。扩展不走页面滚动这条路，而是直接调知乎的内容 API，通过分页参数逐页获取全部收藏条目，然后逐篇解析转换。

![](https://picx.zhimg.com/50/v2-f0ee5e74c4153fea14b3029e09a2a59e_720w.jpg?source=2c26e567)

导出的 ZIP 结构很清晰。每篇文章按编号命名，图片统一放在 images 文件夹里，最上面还有一份 **README.md** 做目录索引，按序号列出所有文章，点击就能跳转。

使用方式：三步搞定
---------

安装扩展之后（[Chrome Web Store 直接安装](https://link.zhihu.com/?target=https%3A//chromewebstore.google.com/detail/mhcbgjkaeleolahjpjgbdjppnaimpaie%3Futm_source%3Ditem-share-cb)，也可以开发者模式加载[源码](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu)），打开任意知乎页面，右下角会出现一个浮动按钮，位置可以自己拖。点击展开面板，确认内容信息没问题，按需勾选 **Front Matter** 和**下载图片**两个选项，点下载就完事了。没有注册流程，没有付费墙，没有使用次数限制。

整个扩展[完全开源](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu)，代码透明可审查。所有数据处理都在浏览器本地完成，不会上传到任何服务器。我自己作为用户也不想用一个不知道在后台干什么的扩展，所以权限做到了最小化：只在知乎域名下运行，只申请 **activeTab** 单一权限。

谁会需要这个工具
--------

我做这个扩展最初就是解决自己的问题。但做完之后发现，只要你符合下面任何一个场景，它大概率能帮到你：用 Obsidian、Logseq、[Notion](https://zhida.zhihu.com/search?content_id=773412127&content_type=Answer&match_order=1&q=Notion&zhida_source=entity) 建知识库，担心知乎内容被删想本地备份，需要离线阅读技术文章，写技术博客需要引用知乎内容做素材，或者像我一样收藏夹里堆了几百篇一直没整理。

说白了，知乎是中文互联网最大的技术知识沉淀池之一，但平台上的内容你并不真正拥有。作者可以删，平台可以调整可见性，CDN 链接会过期。**把内容变成本地 Markdown 文件，你才真正拥有这些知识。** 这个逻辑和我做 iOS 开发时的一个原则一样：核心数据一定要有本地兜底，不能完全依赖远端。

[Chrome Web Store 安装地址在这里](https://link.zhihu.com/?target=https%3A//chromewebstore.google.com/detail/mhcbgjkaeleolahjpjgbdjppnaimpaie%3Futm_source%3Ditem-share-cb)（注意需要科学上网），点一下就装好了。等不及的也可以直接下载[项目源码](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu)，在 `chrome://extensions/` 开启开发者模式加载。有任何问题或建议，评论区聊。

* * *

1.2.0 版本更新——直接[下载地址](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu/releases/download/v1.2.0/DownloadZhihu-v1.2.0.zip)
----------------------------------------------------------------------------------------------------------------------------------------------------

1.  新增下载评论
2.  优化下载收藏夹，所有文章会直接写入到本地文件中。

安装方法: 下载完 zip 包，直接拖入到 `chrome://extensions/` 即可。

* * *

2.0.0 版本更新——直接[下载地址](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu/releases/tag/v2.0.0)
----------------------------------------------------------------------------------------------------------------------

### 新功能

*   **导出管理器**：新增独立的 Extension Page，提供完整的收藏夹 / 专栏导出管理界面
*   **专栏支持**：新增专栏文章批量导出，与收藏夹共用导出管理器
*   **时间线导出**：按收藏时间从旧到新顺序导出，支持增量导出（只导新增内容）
*   **评论选择导出**：评论区改为文章列表勾选模式，显示作者、类型、收藏时间、评论数量，按需 选择导出
*   **进度持久化**：导出进度保存在文件夹中（export-progress-{id}.json），中断后可继续，多 收藏夹同目录互不冲突
*   **目录缓存**：收藏夹 / 专栏目录缓存到 chrome.storage，避免重复请求 API，支持手动刷新
*   **请求节流**：自动控制 API 请求频率（500ms 间隔），遇到 403 自动指数退避重试（30s/60s/120s）

### 改进

*   **文件命名优化**：文章直接用标题，回答用” 问题标题 - 作者的回答”，想法用” 内容前 30 字 - 作者 的想法”
*   **Front Matter 增强**：新增 id 字段，方便进度追踪和去重
*   **去掉 ZIP 导出模式**：收藏夹 / 专栏统一使用文件夹导出，更可靠
*   **去掉分批限制**：一次导出全部待导出内容，无需手动分批
*   **子评论完整获取**：有子评论就获取完整列表，日志中评论数包含子评论

2.0.1 版本更新——直接[下载地址](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu/releases/download/v2.0.1/DownloadZhihu-v2.0.1.zip)
----------------------------------------------------------------------------------------------------------------------------------------------------

*   **修复专栏 URL 识别**：支持任意格式的专栏 ID（如 `AndyLee`），不再限制为 `c_数字` 格式
*   **导出管理器改为流式处理**：逐页拉取逐页导出，无需等待全部目录加载完成
*   修复文件名含零宽字符（如零宽空格）导致文件写入失败的问题
*   移除目录缓存机制和刷新缓存按钮，简化导出流程

2.0.2 版本更新——直接[下载地址](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu/releases/download/v2.0.2/DownloadZhihu-v2.0.2.zip)
----------------------------------------------------------------------------------------------------------------------------------------------------

*   **新增” 保存到文件夹” 功能**：单篇导出时可直接写入指定文件夹（适配 Obsidian vault 等场景），文件夹路径自动记忆
*   **新增长文章内容补全**：收藏夹导出时自动检测截断内容，请求完整页面补全
*   **新增付费内容检测**：自动识别付费文章并检查购买状态，未购买内容使用截断版本
*   新增 `zhuanlan.zhihu.com/{id}` 格式专栏 URL 识别
*   内容提取改为 initialData + DOM 双源取长，解决部分长文章截断问题
*   代理请求改为逐标签页尝试，单个标签页失败不阻塞整体
*   收藏夹导出增加单篇失败容错和详细日志汇总
*   单篇导出面板增加调试日志区域

2.1.0 版本更新——直接[下载地址](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu/releases/download/v2.0.2/DownloadZhihu-v2.0.2.zip)
----------------------------------------------------------------------------------------------------------------------------------------------------

*   新增 Word (.docx) 导出格式，支持单篇和批量导出
*   支持图片嵌入或外部链接两种模式
*   数学公式导出为 Word 原生公式（OMML），转换失败时降级为 LaTeX 文本
*   评论可独立导出为 .docx 文件
*   docx 库按需加载，不影响普通页面性能

2.1.1 版本更新——直接下载地址: [https://github.com/chouheiwa/download-zhihu/releases/download/v2.1.1/DownloadZhihu-v2.1.1.zip](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu/releases/download/v2.1.1/DownloadZhihu-v2.1.1.zip)
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

*   升级 docx 库至 v9.6.1，引用改用尾注，减少页面空间占用
*   改进 Word 排版：标题加粗加大、引用块楷体灰色背景、正文 1.5 倍行距
*   跳过知乎目录导航区域的导出
*   改进评论区样式：增大字号、优化间距和背景色
*   插件更新后自动检测版本不匹配，提示刷新页面
*   已导出评论的文章允许重新导出，支持评论更新

2.1.2 版本更新——直接下载地址: [https://github.com/chouheiwa/download-zhihu/releases/download/v2.1.2/DownloadZhihu-v2.1.2.zip](https://link.zhihu.com/?target=https%3A//github.com/chouheiwa/download-zhihu/releases/download/v2.1.2/DownloadZhihu-v2.1.2.zip)
---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

*   修复 Markdown 导出公式丢失：兼容知乎新版 `<span data-eeimg>` 公式格式
*   提取共享 HTML 识别模块 `zhihu-html-utils.js`，统一公式、图片、脚注、视频、链接卡片的检测逻辑
*   Markdown 导出跳过知乎目录导航和参考文献列表
*   Front Matter 新增创建时间和修改时间，原日期字段改为下载日期
*   修复单篇导出时 id 和时间信息缺失的问题

![](https://pic1.zhimg.com/3b8679a01c5bd61f0e28974e98d6ca6e_l.jpg?source=1def8aca)肥肥猫​

Ctrl - P, save as PDF

保存的时候系统把标题和答主 id 都替你写好了，基本是一键保存，而且便于检索。

![](https://pica.zhimg.com/v2-33b5d9536e812a11ed9c9c061d098f5d_l.jpg?source=1def8aca)伊尔瓦旅人

推荐 Obsidian Web Clipper（浏览器插件） - Obsidian 剪藏插件

通过配置模板 可以一键提取复制文本 也可以一键创建 Obsidian 笔记

支持调用 AI 接口 处理剪藏内容

官网：[https://obsidian.md/clipper](https://link.zhihu.com/?target=https%3A//obsidian.md/clipper)

知乎剪藏模板参考：[https://forum-zh.obsidian.md/t/topic/48679](https://link.zhihu.com/?target=https%3A//forum-zh.obsidian.md/t/topic/48679)

![](https://pic1.zhimg.com/v2-fcdea4db206a332651102862995f55e1_r.jpg?source=1def8aca)

### 2026-03-17 更新 怎么使用这个提取语法提取更多网页的内容：

![](https://picx.zhimg.com/v2-983193303d7e9b30e6861ca6015794aa_r.jpg?source=1def8aca)

如图所示，这个语法是一个管道语法：`{{selectorHtml:.QuestionAnswer-content .RichText|replace:"href=\"https\://zhida":""|markdown}}`

1.  用 `{{}}` `包裹成一个内容，可以添加多个类似这样的语句，如果没有` `{{}}` 包裹就是原样内容输出
2.  `selectorHtml:.QuestionAnswer-content .RichText` 这是一个选择器语法，`.QuestionAnswer-content .RichText` 就是一个标准的 CSS 选择器格式
3.  `replace:"href=\"https\://zhida":""` 意思是将 `href=\"https\://zhida` 正则匹配内容 替换为空字符串
4.  `markdown` 意思是以 Markdown 格式输出

更多语法参考：[https://help.obsidian.md/web-clipper/filters](https://link.zhihu.com/?target=https%3A//help.obsidian.md/web-clipper/filters)（英语）

以下是 Grok 提供的语法大全：

**Obsidian Web Clipper**（官方浏览器扩展）使用强大的模板系统来提取、处理和格式化网页笔记内容。模板支持变量（Variables）、过滤器（Filters）和逻辑语法（Logic，包括条件、循环、赋值），基于类似 Twig/Liquid 的语法（从 1.0 版本起支持完整逻辑与校验）。

所有内容最终以 Markdown 保存到 Obsidian 笔记中，可用于 note name、note location、properties 和 note content 等部分。

### 1. 模板基本结构与创建

*   **创建 / 编辑**：在 Web Clipper 设置中点击 “New template” 或复制现有模板。变化自动保存。
*   **导入 / 导出**：支持 JSON 文件导入（拖拽或按钮），导出为 JSON。
*   **触发器（Triggers）**：自动匹配模板，根据 URL（前缀或 /regex/）或 [http://schema.org](https://link.zhihu.com/?target=http%3A//schema.org)（`schema:@Recipe` 等）匹配。第一匹配生效，可拖拽排序模板优先级。
*   **行为（Behavior）**：新建笔记、追加到现有笔记（顶部 / 底部）、追加到每日笔记（需 Periodic Notes 插件）。
*   **Interpreter（AI）**：启用后，可在模板中使用提示变量（prompt variables），并定义上下文（context，如 selectorHtml 限制范围）。

示例模板仓库（推荐参考）：

*   Kepano 的 clipper-templates：Recipes、Product、Arxiv、Goodreads、IMDB、YouTube 等。
*   Obsidian 社区模板仓库。

### 2. 变量（Variables）大全

变量用 `{{variable}}` 语法，可在模板任意部分使用。点击扩展中 `...` 图标查看当前页面可用变量。

### **预设变量（Preset Variables）**（适用于大多数网站）

<table data-draft-node="block" data-draft-type="table" data-size="normal"><tbody><tr><th>变量</th><th>描述</th></tr><tr><td>{{title}}</td><td>页面标题</td></tr><tr><td>{{content}}</td><td>主要文章内容（Markdown，默认智能提取正文）</td></tr><tr><td>{{contentHtml}}</td><td>主要文章内容（HTML）</td></tr><tr><td>{{author}}</td><td>作者</td></tr><tr><td>{{description}}</td><td>描述 / 摘要</td></tr><tr><td>{{site}}</td><td>站点名称 / 发布者</td></tr><tr><td>{{published}}</td><td>发布时间（可用 date 过滤器格式化）</td></tr><tr><td>{{date}}</td><td>当前日期（可用 date 过滤器格式化）</td></tr><tr><td>{{time}}</td><td>当前日期时间</td></tr><tr><td>{{url}}</td><td>当前 URL</td></tr><tr><td>{{domain}}</td><td>域名</td></tr><tr><td>{{image}}</td><td>社交分享图片 URL</td></tr><tr><td>{{favicon}}</td><td>Favicon URL</td></tr><tr><td>{{words}}</td><td>字数</td></tr><tr><td>{{selection}}</td><td>选中文本（Markdown）</td></tr><tr><td>{{selectionHtml}}</td><td>选中文本（HTML）</td></tr><tr><td>{{highlights}}</td><td>高亮内容（带文本和时间戳）</td></tr><tr><td>{{fullHtml}}</td><td>完整页面未处理 HTML</td></tr></tbody></table>

### **提示变量（Prompt Variables）**（需启用 Interpreter + AI 模型）

语法：`{{"你的自然语言提示"}}`（必须用双引号）。

*   用于 AI 总结、提取、翻译、生成 JSON 等。
*   示例：

*   `{{"a three bullet point summary, translated to French"}}`
*   `{{"本文的核心要点，用有序列表展示"}}`

*   可链式过滤器处理输出，如 `{{"summary"|blockquote}}`。
*   提示可在模板逻辑中动态构建，但提示结果不可用于条件 / 循环。

### **Meta 变量**

*   `{{meta:name:xxx}}` 或 `{{meta:property:og:title}}`（提取 meta 标签内容，如 Open Graph 数据）。

### **选择器变量（Selector Variables）**（CSS 选择器提取，适合固定结构站点）

*   `{{selector:cssSelector?attribute}}` — 默认取文本内容；`?attribute` 取属性（如 `?src`、`?href`）。
*   `{{selectorHtml:cssSelector}}` — 取 HTML 内容。
*   示例：

*   `{{selector:h1}}`
*   `{{selector:.author}}`
*   `{{selector:img.hero?src}}`
*   `{{selectorHtml:#main|markdown}}`（转 Markdown）

*   多匹配时返回数组，可用过滤器 / 循环处理。

### **[http://Schema.org](https://link.zhihu.com/?target=http%3A//Schema.org) 变量**

*   `{{schema:@Type:key}}` 或简写 `{{schema:key}}`。
*   支持嵌套、数组：`{{schema:author.name}}`、`{{schema:author[0].name}}`、`{{schema:author[*].name}}`。
*   可用于模板触发。

### 3. 过滤器（Filters）大全

过滤器用管道语法 `{{variable|filter}}`，支持链式（如 `|filter1|filter2`）。适用于所有变量类型。

### **日期相关**

*   `date:"格式"`（day.js 格式，如 `"YYYY-MM-DD"`）；可指定输入格式。
*   `date_modify:"+1 year"` 或 `"-2 months"`。
*   `duration:"HH:mm:ss"`（处理 ISO 8601 或秒数）。

### **文本转换 / 大小写**

*   `lower` / `upper`
*   `title`（Title Case）
*   `capitalize`
*   `camel` / `pascal` / `snake` / `kebab` / `uncamel`
*   `trim`
*   `safe_name`（文件名安全，可指定 OS）
*   `decode_uri`
*   `replace:"search":"replacement"`（支持多组或正则 `/pattern/g`）

### **Markdown 格式化**

*   `blockquote`（每行加 `>`）
*   `callout:("type", "title", fold?)`（如 `info`、`note`）
*   `list` / `list:task` / `list:numbered`
*   `table`（数组 / 对象转表格）
*   `link:"text"` / `image:"alt"`
*   `footnote`

### **数组 / 对象处理**（map、join、first、last、slice 等，具体以官方文档为准，常见包括 join、map、template 等）

*   示例：`{{array|join:"\n\n"}}`、`{{items|map:item => item.text}}`

更多过滤器（如 truncate 等）可在官方帮助中查看完整列表，实际使用时扩展会提示。

### 4. 逻辑语法（Logic）—— 1.0+ 版本支持

使用 `{% %}` 标签，类似 Twig/Liquid。

*   **条件（Conditionals）**：  
    {% if condition %} ... {% elseif other %} ... {% else %} ... {% endif %}  
    支持 `== != > < >= <= contains`、`and or not`（或 `&& || !`）、括号分组、真值判断（空字符串 / 数组 / 0/null 为 falsy）。
*   **循环（Loops）**：  
    {% for item in array %} {{loop.index}}. {{item}} {% endfor %}  
    支持 `loop.index`、`loop.first`、`loop.last` 等。数组可来自 selector/schema / 变量。
*   **赋值（Set）**：  
    {% set slug = title|lower|replace:"":"-" %}
*   **Fallback**：  
    {{title ?? "Untitled"}} // 或链式 {{title ?? headline ?? "No title"}}
*   **组合使用**：条件内嵌循环、用 selector 做循环源等。
*   **注意**：模板逻辑先执行，提示变量（AI）后处理。模板编辑器有语法校验。

### 5. 实用示例与提示

*   **默认内容**：`{{content}}` 或结合 selectorHtml 精细提取。
*   **高亮处理**：`{{highlights|map: item => item.text|join:"\n\n"}}`
*   **AI 总结**：在 note content 中加 `{{"用中文总结本文要点，用 bullet points"}}`
*   **文件名安全**：`{{title|safe_name}}`
*   **YouTube 等特定站点**：参考 Kepano 仓库模板，常结合 selector 提取 transcript、用 AI 总结。
*   **高级**：用 `{% set %}` 预处理数据，再循环输出；用 regex replace 清理 HTML。

**完整官方文档**（强烈推荐）：

*   Variables: [https://help.obsidian.md/web-clipper/variables](https://link.zhihu.com/?target=https%3A//help.obsidian.md/web-clipper/variables)
*   Filters: [https://help.obsidian.md/web-clipper/filters](https://link.zhihu.com/?target=https%3A//help.obsidian.md/web-clipper/filters)
*   Logic: [https://help.obsidian.md/web-clipper/logic](https://link.zhihu.com/?target=https%3A//help.obsidian.md/web-clipper/logic)
*   Templates: [https://help.obsidian.md/web-clipper/templates](https://link.zhihu.com/?target=https%3A//help.obsidian.md/web-clipper/templates)

实际操作时，在模板编辑器中预览变量和效果。社区模板 + AI Interpreter 结合，能实现自动提取标签、生成大纲、翻译等高级处理。

如果需要针对特定网站（如微信公众号、YouTube）的自定义模板示例，或帮助调试某个语法，随时提供更多细节，我可以进一步协助！