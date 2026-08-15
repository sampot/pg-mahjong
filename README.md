# pg-mahjong

瀏覽器**台灣麻將**：十六張常見可配家規、補花、吃碰槓胡、正花／拉莊／搶槓、你＋三名 AI（可託管）。純前端，無建置步驟；**mobile-first**。

名稱與介面為原創小品，致敬台灣十六張麻將玩法；家規預設見 [`RULES.md`](./RULES.md)。**非**單一官方競技規程。

也可當作 [Playgrounds（遊樂場）](https://play.samkuo.me/) 的 **SAM**（`index.html` 入口）。

## 一鍵開 SAM 小

**[一鍵開 SAM 小](https://play.samkuo.me/?open=sampot%2Fpg-mahjong&name=%E5%8F%B0%E7%81%A3%E9%BA%BB%E5%B0%87)**

```
https://play.samkuo.me/?open=sampot/pg-mahjong&name=台灣麻將
```

## 試玩（本機）

```bash
npx --yes serve .
# 或
python3 -m http.server 8080
```

測試（不提交 `node_modules`）：

```bash
npx --yes vitest@4 run
```

## 操作

| 操作 | 說明 |
| --- | --- |
| **開局** | 發十六張、補花、莊家摸牌（僅待機） |
| **家規** | 起胡、拉莊、搶槓、花牌、底／台金等 |
| **託管** | AI 代打；再按取消立刻接手 |
| 點手牌 → **打牌** | 打出所選 |
| **吃／碰／槓／胡／略過** | 叫牌窗（含搶槓胡） |
| **暗槓／加槓** | 多組時可選 |
| **重來** | 頁內確認；保留累積分與家規 |

## 規則摘要（預設）

- 牌組 144；死牆 16；槓／補花從死牆補
- 叫牌：胡 ＞ 碰／明槓 ＞ 吃（僅下家）；一炮一響
- 過水；加槓可解過水；加槓可被搶
- 流局臭莊連莊；拉莊 `2N+1`
- 計分：`底 + 台 × 台金`；自摸三家付、放槍一家付
- 詳見 [`RULES.md`](./RULES.md)

## 檔案

| 檔案 | 說明 |
| --- | --- |
| `index.html` / `styles.css` / `app.js` | UI、託管、家規面板 |
| `game.js` | 狀態機 |
| `ruleset.js` / `score.js` / `partition.js` | 家規、計台、牌型分割 |
| `ai.js` | 向聽啟發式（對手＋託管） |
| `tiles.js` / `tiles.css` / `assets/tiles/` | 牌面 |
| `*.test.js` | Vitest |

## License

MIT
