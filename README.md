# PyQuest — Python 星際探險 🚀

一個**純前端、免後端**的遊戲化 Python 學習平台。學生在瀏覽器裡扮演太空飛行員,
用 Python 程式碼修復每一顆星球的訊號站,一路從 `print()` 學到 FizzBuzz。

## 特色

- 🐍 **瀏覽器內執行 Python**:透過 [Pyodide](https://pyodide.org)(WebAssembly),
  程式碼在使用者自己的瀏覽器沙盒中執行,安全且不需要任何伺服器。
- 🎮 **遊戲化設計**:8 大章節星系、52 個關卡星球、XP 經驗值、8 級階級晉升、三星評價、關卡解鎖。
- 📚 **課程對應教材**:章節結構對應《Python 零基礎入門班》目錄 —
  變數與資料型態(含 input)→ 判斷式 → 迴圈 → 串列與元組 → 字典 → 函式與模組(含 random)→ 演算法(泡沫排序、循序/二分搜尋)→ 檔案與例外處理(try-except、assert)。
- 💡 **教學導向的回饋**:錯誤訊息翻譯成初學者看得懂的中文提示(含行號),
  每個測試失敗都有引導式訊息;卡關可以看提示(會扣一顆星)。
- 💾 **進度保存**:進度存在 localStorage,關掉瀏覽器再回來也不會消失。
- ⌨️ **CodeMirror 編輯器**:語法上色、行號、`Cmd/Ctrl + Enter` 快速執行。

## 執行方式

只要一個靜態檔案伺服器:

```bash
cd python-teach-system
python3 -m http.server 8765
```

然後打開 <http://localhost:8765>。

> 需要網路連線:Pyodide、CodeMirror 與字型由 CDN 載入。

## 專案結構

```
python-teach-system/
├── index.html          # 入口頁(星圖 + 挑戰畫面 + 彈窗)
├── css/
│   ├── tokens.css      # 設計代幣(色彩、字體、間距)
│   ├── global.css      # 全域基礎樣式與按鈕
│   └── game.css        # 遊戲介面元件(含章節區塊)
└── js/
    ├── challenges.js   # 課程總表(匯集章節、編號、階級門檻)
    ├── levels/         # 各章節關卡資料(對應教材章節)
    │   ├── ch02.js     # 變數與資料型態(12 關)
    │   ├── ch03.js     # 判斷式(5 關)
    │   ├── ch04.js     # 迴圈(7 關)
    │   ├── ch05.js     # 串列與元組(8 關)
    │   ├── ch06.js     # 字典(6 關)
    │   ├── ch07.js     # 函式與模組(7 關)
    │   ├── ch08.js     # 演算法(3 關)
    │   └── ch09.js     # 檔案與例外處理(4 關)
    ├── runner.js       # Pyodide 執行器(含 input() 模擬、友善錯誤訊息)
    ├── state.js        # 玩家進度(XP、星星、解鎖)localStorage
    └── main.js         # 畫面切換與流程控制
```

## 新增關卡

在對應章節檔(`js/levels/chXX.js`)的 `levels` 陣列加一個物件即可;
要新增整個章節,建立新的 `chXX.js` 後在 `js/challenges.js` 匯入:

```js
{
  id: "unique-id",        // 唯一識別碼(進度用)
  planet: "🪐",           // 星球 emoji
  title: "關卡標題",
  topic: "教學主題",
  story: "背景故事",
  instructions: ["目標一", "目標二"],   // 支援 <code> 標籤
  starter: "# 起始程式碼\n",
  hint: "卡關提示(使用會扣一顆星)",
  xp: 100,
  stdin: ["模擬輸入1", "模擬輸入2"],  // 選用:input() 會依序讀到這些字串
  tests: [
    {
      name: "測試名稱",
      // 測試碼可用 output(stdout 全文)、ns(使用者命名空間)、src(使用者原始碼)
      code: 'assert "答案" in output, "失敗時給玩家看的引導訊息"',
    },
  ],
}
```

關卡依章節與陣列順序解鎖(通過前一關才能玩下一關)。
