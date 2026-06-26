# Anime1 Enhanced Database (`animelist-enhanced.json`)

本文件 `animelist-enhanced.json` 是针对 Anime1 官方动画列表（`animelist.json`）进行丰富与优化后的增强版数据库。它为油猴脚本（如 `anime1.user.js`）或其它第三方客户端提供了更完整的番剧元数据支持。

## 🌟 增强特性

与官方的原始数据相比，增强版数据库增加了以下内容：
- **简体中文翻译**：整合自 TMDB 与 Bangumi，提供更符合阅读习惯的简体译名。
- **番剧评分**：接入 Bangumi API 获取的评分数据。
- **图片资源**：提供高质量的海报封面图（`coverUrl`）、简体中文定制封面（`cn-coverURL`）以及精美的背景图（`backdropUrl`）。
- **选集列表**：包含每集在 Anime1.me 上的文章 Post ID 与对应的集数映射，方便直接跳转播放。
- **高压缩率**：为了减少网络带宽消耗，所有字段均使用缩写键名，且选集列表经过扁平化拼接压缩。

---

## 📂 字段属性说明 (Top-Level Schema)

数据库以 JSON 数组形式存储，数组中的每个对象代表一部番剧，其属性键名映射如下：

| 缩写键名 | 原始字段名 | 字段名称 | 数据类型 | 说明 / 示例 |
| :---: | :---: | :---: | :---: | :--- |
| **`id`** | `catId` | 分类 ID | `Number` | Anime1 官方的分类 ID（例如：`1879`） |
| **`n`** | `name` | 原始名称 | `String` | 官方原始繁体名称（例如：`"終末起點 第二季"`） |
| **`z`** | `nameZhHans` | 简体中文 | `String` | 转换或查询到的简体中文名称（例如：`"最强王者的第二人生 第二季"`） |
| **`t`** | `episodes` | 总集数 | `String` | 当前已发布的总集数状态（例如：`"1-12"` 或 `"連載中(11)"`） |
| **`y`** | `year` | 上映年份 | `String` | 首播或上映年份（例如：`"2026"`） |
| **`s`** | `score` | 评分 | `Number` | 来自 Bangumi 的评分值（例如：`4.5`，若无评分则为 `null`） |
| **`c`** | `coverUrl` | 封面图片 | `String` | 海报图片路径（已去除前缀，如 `"/gsVYwFXfWhevsg511zAnglxfW2U.jpg"`） |
| **`f`** | `cn-coverURL` | 简中封面 | `String` | 简体中文版海报路径，无则为 `null` |
| **`b`** | `backdropUrl` | 背景图 | `String` | 宽屏背景图路径，无则为 `null` |
| **`l`** | `episodesList` | 选集列表 | `String` | 压缩的选集字符串，格式详见下方说明 |

---

## 🔗 选集列表格式说明

字段 **`l`**（`episodesList`）将整部番剧的所有分集信息压缩存储为一个逗号分隔的字符串：
- **分隔符**：集与集之间使用英文逗号（`,`）分隔。
- **单集格式**：每集格式为 `postId:epNum`，其中 `postId` 为 Anime1 文章 ID，`epNum` 为集数数字。
- **特殊情况**：如果集数为空（例如剧场版、SP等非数字编号的特殊单集），则保留冒号但省略集数部分（如 `postId:`）。

**示例值**：`"28525:1,28526:2,28757:"`
*(表示：第 1 集的 Post ID 为 28525，第 2 集的 Post ID 为 28526，还有一集无集数编号的特殊内容其 Post ID 为 28757)*

---

## 🔄 数据对比示例

### 压缩存储格式 (`animelist-enhanced.json`)
```json
[
  {
    "id": 1879,
    "n": "終末起點 第二季",
    "z": "最强王者的第二人生 第二季",
    "t": "1-12",
    "y": "2026",
    "s": 4.5,
    "c": "/gsVYwFXfWhevsg511zAnglxfW2U.jpg",
    "f": null,
    "b": "/epPoqwhas9lhZasJ9yVYJod2GQa.jpg",
    "l": "28525:1,28526:2,28641:3,28757:"
  }
]
```

### 客户端解压还原后的内存对象 (以 `anime1.user.js` 运作为例)
```javascript
{
  catId: 1879,
  name: "終末起點 第二季",
  nameZhHans: "最强王者的第二人生 第二季",
  episodes: "1-12",
  year: "2026",
  sub: "",
  score: 4.5,
  coverUrl: "https://image.tmdb.org/t/p/w500/gsVYwFXfWhevsg511zAnglxfW2U.jpg",
  "cn-coverURL": null,
  backdropUrl: "https://image.tmdb.org/t/p/w1280/epPoqwhas9lhZasJ9yVYJod2GQa.jpg",
  episodesList: [
    { postId: "28525", epNum: 1 },
    { postId: "28526", epNum: 2 },
    { postId: "28641", epNum: 3 },
    { postId: "28757", epNum: null }
  ]
}
```
