# pg-mahjong

瀏覽器**台灣麻將**小品：十六張台規骨架、補花、吃碰槓胡、簡化台數、你＋三名啟發式 AI。純前端，無建置步驟；**mobile-first**。

名稱與介面為原創小品，致敬台灣十六張麻將玩法類型，**非**完整台麻計分／非日麻／非港麻。

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

點一下頁面後音效才會出聲。

## 操作

| 操作 | 說明 |
| --- | --- |
| **開局** | 發十六張、補花、莊家摸牌 |
| 點手牌 | 選取要打的牌 |
| **打牌** | 打出所選 |
| **吃／碰／槓／胡／略過** | 他家打牌後的叫牌窗 |
| **暗槓／加槓** | 輪到你且手牌允許時 |
| **重來** | 頁內確認後結束本局（保留累積分） |

## 規則摘要（簡化）

- 牌組：136 基礎＋8 花；手牌十六張，摸打循環
- 叫牌優先：胡 ＞ 槓／碰 ＞ 吃（僅下家）
- 胡牌：五組面子＋將（不開七對／十三么）
- **簡化台：** 莊家、連莊、自摸、門清、碰碰胡、混／清一色、三元刻、圈風／門風刻、花（每花 1）；分數＝`2^min(台,8)`（底 1）
- 自摸三家付；點炮由放槍者付

## 檔案

| 檔案 | 說明 |
| --- | --- |
| `index.html` | 結構 |
| `styles.css` | 手機優先／桌面遞增 |
| `app.js` | UI、叫牌、AI 節奏 |
| `game.js` | 規則、`applyAction`、計台 |
| `tiles.js` | 牌鍵與圖檔 |
| `ai.js` | 簡易人機 |
| `protocol.js` | 預留 `mahjong.v1`（無網路） |
| `audio.js` | Web Audio |
| `functions.js` | Playgrounds stub |
| `assets/tiles/` | 牌面（見 `ATTRIBUTION.md`） |

## License

MIT
