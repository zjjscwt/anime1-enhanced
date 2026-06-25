# Anime1 Enhanced Database Schema Documentation

This document describes the compressed schema, property key abbreviations, and episode lists formatting used in `animelist-enhanced.json`. The compact database format is designed to minimize file size and reduce user bandwidth consumption on load, while preserving all fields (including `null` values) for ease of manual and automated maintenance.

---

## 1. Top-Level Structure (番剧对象字段说明)

The database consists of a JSON array where each object representing an anime category uses the following single-letter property mappings:

| Short Key | Original Key | Field Name | Data Type | Description / Example |
| :---: | :---: | :---: | :---: | :--- |
| **`id`** | `catId` | 分类 ID | `Number` | The unique category ID on Anime1 (e.g., `1879`). |
| **`n`** | `name` | 原始名称 | `String` | The raw Traditional Chinese title of the series (e.g., `"終末起點 第二季"`). |
| **`z`** | `nameZhHans` | 简体中文 | `String` | Simplified Chinese translation from TMDB/Bangumi (e.g., `"最强王者的第二人生 第二季"`). |
| **`t`** | `episodes` | 总集数 | `String` | Total number of episodes currently aired (e.g., `"1-12"` or `"連載中(11)"`). |
| **`y`** | `year` | 上映年份 | `String` | TMDB release/first-air year (e.g., `"2026"`). |
| **`s`** | `score` | 评分 | `Number` | Rating from Bangumi API (e.g., `4.5` or `null`). |
| **`c`** | `coverUrl` | 封面图片 | `String` | TMDB cover image path. Prefixes are stripped; starts with `/` (e.g., `"/gsVYwFXfWhevsg511zAnglxfW2U.jpg"`). |
| **`f`** | `cn-coverURL` | 简中封面 | `String` | TMDB Simplified Chinese cover image path. Starts with `/` or is `null`. |
| **`b`** | `backdropUrl` | 背景图 | `String` | TMDB backdrop image path. Starts with `/` or is `null`. |
| **`l`** | `episodesList` | 选集列表 | `String` | A compact, comma-separated string mapping `postId` and `epNum` (see formatting details below). |

---

## 2. Episodes List Formatting (选集列表 Option B 拼接格式说明)

The **`l`** property stores the entire episodes list as a single formatted string. 
* Episodes are separated by commas (`,`).
* Within each episode, the `postId` and `epNum` are separated by a colon (`:`).
* If the episode number (`epNum`) is `null` (e.g. for special movies or unnumbered specials), it is represented as an empty value after the colon (e.g., `postId:`).

### Format:
`"postId:epNum,postId:epNum,postId:epNum"`

### Example:
`"28525:1,28526:2,28757:"` (Episode 1 has post ID 28525, Episode 2 has post ID 28526, and a special episode with null index has post ID 28757).

---

## 3. Dynamic Reconstruction Example (数据编解码对比示例)

### Raw / Compressed Output (`animelist-enhanced.json`)
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

### Decompressed Object in Memory (`anime1.user.js` at runtime)
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
